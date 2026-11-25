-- =============================================================================
-- Applet 2: Durable HTTPS Batch Scoring (df.http -> Azure OpenAI / ACA Pattern)
-- =============================================================================
-- Exercises: pg_durable (0.2.9) — df.http, df.endpoint, df.loop, df.if_rows,
--            pg_durable_fdw (auth_scheme 'bearer'), zero-leak token hygiene.
-- Target Endpoint: https://my-ai-foundry.openai.azure.com/ (gpt-5.4)
--                  (Substituted for Partner ACA *.azurecontainerapps.io
--                   due to BUG-01; exercises the exact same durable batched
--                   HTTPS scoring architecture against a real Azure AI model!)
-- Isolated schema: durable_hack.
--
-- LIVE HORIZONDB FINDINGS PROVED BY THIS SCRIPT:
--   1. BUG-01 (P1): *.azurecontainerapps.io and *.services.ai.azure.com are
--      BLOCKED on HorizonDB GA preview despite microsoft/pg_durable
--      docs/http-security.md §5.2 listing them in the Azure default allow-list.
--   2. BUG-08 (P1 — SFI / Enterprise Auth Blocker):
--      my-ai-foundry.openai.azure.com enforces Entra-ID-only auth
--      (disableLocalAuth = true). pg_durable_fdw ONLY supports static auth
--      schemes (none, bearer, header, query) — NO managed_identity / entra_id!
--      Furthermore, both IMDS (169.254.169.254) and login.microsoftonline.com
--      are blocked in restricted mode, so a long-running durable workflow
--      cannot mint or refresh Entra tokens on its own.
--      Demo workaround: inject an ephemeral Entra JWT into USER MAPPING
--      (never into SQL text or df.setvar), run scoring, and scrub after.
--   3. SKILL-01 (Security): Using pg_durable_fdw + USER MAPPING keeps bearer
--      tokens completely out of df.nodes and duroxide history.
--   4. DOC-01: df.http() does NOT auto-retry on 5xx/timeouts; durable batch
--      watermarking + explicit status tracking prevents lost or double-scored rows.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS durable_hack;

-- 1. Operational table to score in durable batches (supplier delivery risk)
DROP TABLE IF EXISTS durable_hack.supplier_shipments CASCADE;
CREATE TABLE durable_hack.supplier_shipments (
    shipment_id      BIGSERIAL PRIMARY KEY,
    supplier_code    TEXT NOT NULL,
    origin_region    TEXT NOT NULL,
    lead_time_days   INT NOT NULL,
    order_value_usd  NUMERIC(12, 2) NOT NULL,
    historical_late  NUMERIC(4, 3) NOT NULL,
    scoring_status   TEXT NOT NULL DEFAULT 'pending', -- pending | scored | error
    risk_score       NUMERIC(5, 4),
    http_status      INT,
    http_ok          BOOLEAN,
    model_trace      TEXT,
    scored_at        TIMESTAMPTZ
);

INSERT INTO durable_hack.supplier_shipments
    (supplier_code, origin_region, lead_time_days, order_value_usd, historical_late)
SELECT
    'SUP-' || lpad(((g % 5) + 1)::text, 3, '0'),
    (ARRAY['japaneast','eastus','westeurope','southeastasia'])[1 + (g % 4)],
    5 + (g * 3) % 25,
    round((1500 + g * 425.50)::numeric, 2),
    round(((g % 9) * 0.085)::numeric, 3)
FROM generate_series(1, 12) AS g;

DROP TABLE IF EXISTS durable_hack.scoring_batches CASCADE;
CREATE TABLE durable_hack.scoring_batches (
    batch_run_id   BIGSERIAL PRIMARY KEY,
    workflow_label TEXT NOT NULL,
    batch_size     INT NOT NULL,
    http_status    INT,
    http_ok        BOOLEAN,
    response_note  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Secret-safe endpoint setup via pg_durable_fdw (v0.2.9)
--    Targets Abe's Entra-only Azure OpenAI resource (*.openai.azure.com IS allow-listed!).
--    NOTE (BUG-08): pg_durable_fdw does NOT support auth_scheme 'managed_identity'
--    or 'entra_id' yet (only: none, bearer, header, query). Inject a fresh short-lived
--    Entra bearer token right before launching:
--      az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv
--      ALTER USER MAPPING FOR CURRENT_USER SERVER abes_demo_aoai OPTIONS (SET token '<ENTRA_JWT>');
DROP SERVER IF EXISTS abes_demo_aoai CASCADE;
CREATE SERVER abes_demo_aoai
    FOREIGN DATA WRAPPER pg_durable_fdw
    OPTIONS (
        base_url    'https://my-ai-foundry.openai.azure.com',
        auth_scheme 'bearer'
    );

CREATE USER MAPPING FOR CURRENT_USER
    SERVER abes_demo_aoai
    OPTIONS (token 'REPLACE_WITH_EPHEMERAL_ENTRA_JWT_BEFORE_RUN');

-- Secondary server preserved to reproduce BUG-01 (*.azurecontainerapps.io blocked)
DROP SERVER IF EXISTS ml_partner_aca_target CASCADE;
CREATE SERVER ml_partner_aca_target
    FOREIGN DATA WRAPPER pg_durable_fdw
    OPTIONS (base_url 'https://ml-partner-tabular-model.eastus.azurecontainerapps.io', auth_scheme 'none');

CREATE USER MAPPING FOR CURRENT_USER
    SERVER ml_partner_aca_target
    OPTIONS ("secret.api_key" 'tabular-model-aca-secret-NEVER-LEAK-9999');

-- 3. Batch claim helper: builds an Azure OpenAI Chat Completions JSON request
--    for the next N pending shipments (returns 0 rows when done -> breaks df.loop!)
CREATE OR REPLACE FUNCTION durable_hack.claim_shipment_batch(p_batch_size INT DEFAULT 4)
RETURNS TABLE(batch_ids TEXT, row_count INT, payload_json TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_ids  BIGINT[];
    v_rows JSONB;
BEGIN
    SELECT array_agg(shipment_id ORDER BY shipment_id),
           jsonb_agg(
               jsonb_build_object(
                   'shipment_id', shipment_id,
                   'supplier_code', supplier_code,
                   'origin_region', origin_region,
                   'lead_time_days', lead_time_days,
                   'order_value_usd', order_value_usd,
                   'historical_late', historical_late
               ) ORDER BY shipment_id
           )
    INTO v_ids, v_rows
    FROM (
        SELECT *
        FROM durable_hack.supplier_shipments
        WHERE scoring_status = 'pending'
        ORDER BY shipment_id
        LIMIT p_batch_size
    ) sub;

    IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
        RETURN; -- 0 rows triggers df.if_rows() ELSE branch -> df.break()!
    END IF;

    batch_ids    := array_to_string(v_ids, ',');
    row_count    := array_length(v_ids, 1);
    payload_json := jsonb_build_object(
        'response_format', jsonb_build_object(
            'type', 'json_schema',
            'json_schema', jsonb_build_object(
                'name', 'shipment_risk_batch',
                'strict', true,
                'schema', jsonb_build_object(
                    'type', 'object',
                    'additionalProperties', false,
                    'required', jsonb_build_array('predictions'),
                    'properties', jsonb_build_object(
                        'predictions', jsonb_build_object(
                            'type', 'array',
                            'items', jsonb_build_object(
                                'type', 'object',
                                'additionalProperties', false,
                                'required', jsonb_build_array('shipment_id', 'risk_score', 'reason'),
                                'properties', jsonb_build_object(
                                    'shipment_id', jsonb_build_object('type', 'integer'),
                                    'risk_score',  jsonb_build_object('type', 'number'),
                                    'reason',      jsonb_build_object('type', 'string')
                                )
                            )
                        )
                    )
                )
            )
        ),
        'messages', jsonb_build_array(
            jsonb_build_object(
                'role', 'system',
                'content', 'You are a tabular delivery-risk scorer (tabular model stand-in). For every input shipment, return risk_score in [0.0, 1.0] (higher = higher late-delivery risk based on historical_late, lead_time_days, and order_value_usd) and a concise <=10-word reason.'
            ),
            jsonb_build_object(
                'role', 'user',
                'content', 'Score these shipments: ' || v_rows::text
            )
        ),
        'max_completion_tokens', 400
    )::text;
    RETURN NEXT;
END;
$$;

-- 4. Atomic batch write-back helper: unpacks real Azure OpenAI JSON predictions
--    or dead-letters 4xx errors cleanly (e.g. 401 when Entra JWT expires — BUG-08!)
CREATE OR REPLACE FUNCTION durable_hack.apply_scoring_response(
    p_batch_ids  TEXT,
    p_http_json  TEXT,
    p_label      TEXT DEFAULT 'hack-aoai-http-batch'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_ids      BIGINT[] := string_to_array(p_batch_ids, ',')::bigint[];
    v_resp     JSONB    := p_http_json::jsonb;
    v_status   INT      := coalesce((v_resp->>'status')::int, 0);
    v_ok       BOOLEAN  := coalesce((v_resp->>'ok')::boolean, false);
    v_raw_body TEXT     := coalesce(v_resp->>'body', '');
    v_body_js  JSONB;
    v_content  JSONB;
    v_model    TEXT;
    v_updated  INT      := 0;
BEGIN
    IF v_ok THEN
        v_body_js := v_raw_body::jsonb;
        v_model   := coalesce(v_body_js->>'model', 'azure-openai');
        v_content := (v_body_js->'choices'->0->'message'->>'content')::jsonb;

        INSERT INTO durable_hack.scoring_batches (workflow_label, batch_size, http_status, http_ok, response_note)
        VALUES (
            p_label,
            array_length(v_ids, 1),
            v_status,
            true,
            format('model=%s total_tokens=%s', v_model, coalesce(v_body_js->'usage'->>'total_tokens', '?'))
        );

        WITH preds AS (
            SELECT
                (p->>'shipment_id')::bigint AS shipment_id,
                least(1.0, greatest(0.0, round((p->>'risk_score')::numeric, 4))) AS risk_score,
                left(v_model || ': ' || coalesce(p->>'reason', ''), 160) AS reason
            FROM jsonb_array_elements(v_content->'predictions') AS p
        )
        UPDATE durable_hack.supplier_shipments s
        SET scoring_status = 'scored',
            risk_score     = preds.risk_score,
            http_status    = v_status,
            http_ok        = true,
            model_trace    = preds.reason,
            scored_at      = now()
        FROM preds
        WHERE s.shipment_id = preds.shipment_id
          AND s.shipment_id = ANY(v_ids);

        GET DIAGNOSTICS v_updated = ROW_COUNT;
        RETURN format('scored:%s/%s:http_%s:%s', v_updated, array_length(v_ids, 1), v_status, v_model);
    ELSE
        -- 4xx (including 401 when Entra JWT is missing/expired!) dead-lettered cleanly
        INSERT INTO durable_hack.scoring_batches (workflow_label, batch_size, http_status, http_ok, response_note)
        VALUES (p_label, array_length(v_ids, 1), v_status, false, left(v_raw_body, 180));

        UPDATE durable_hack.supplier_shipments
        SET scoring_status = 'error',
            http_status    = v_status,
            http_ok        = false,
            model_trace    = left(v_raw_body, 160),
            scored_at      = now()
        WHERE shipment_id = ANY(v_ids);
        RETURN format('error:%s:http_%s', array_length(v_ids, 1), v_status);
    END IF;
END;
$$;

-- 5. Batched watermark durable scorer launcher
--    Uses df.loop + df.if_rows + df.http(df.endpoint('abes_demo_aoai', ...))
CREATE OR REPLACE FUNCTION durable_hack.start_ml_partner_scoring(
    p_server_name TEXT DEFAULT 'abes_demo_aoai',
    p_path        TEXT DEFAULT '/openai/deployments/gpt-5.4/chat/completions?api-version=2025-01-01-preview',
    p_method      TEXT DEFAULT 'POST',
    p_batch_size  INT  DEFAULT 4,
    p_label       TEXT DEFAULT 'hack-aoai-durable-scorer'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_http_node TEXT;
    v_graph     TEXT;
BEGIN
    -- Endpoint auth_scheme = 'bearer' resolves Authorization: Bearer <token>
    -- from USER MAPPING inside the HTTP worker — never stored in df.nodes!
    v_http_node := df.http(
        df.endpoint(p_server_name, p_path),
        upper(p_method),
        '$batch.payload_json',
        '{"Content-Type":"application/json"}'::jsonb,
        30
    );

    v_graph := df.loop(
        df.sql(format('SELECT batch_ids, row_count, payload_json FROM durable_hack.claim_shipment_batch(%s)', p_batch_size)) |=> 'batch'
        ~> df.if_rows(
            'batch',
            v_http_node |=> 'http_res'
            ~> df.sql(format(
                'SELECT durable_hack.apply_scoring_response($batch.batch_ids, $http_res::text, %L)',
                p_label
            )),
            df.break('ALL_BATCHES_SCORED')
        )
    );

    RETURN df.start(v_graph, p_label);
END;
$$;

-- 6. Stage-ready demo helper functions (used by demo_walkthrough.sql)
CREATE OR REPLACE FUNCTION durable_hack.demo_reset_shipments()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE durable_hack.supplier_shipments
    SET scoring_status = 'pending',
        risk_score     = NULL,
        http_status    = NULL,
        http_ok        = NULL,
        model_trace    = NULL,
        scored_at      = NULL;
    DELETE FROM durable_hack.scoring_batches;
    RETURN 'Reset complete: 12 shipments back to pending, scoring_batches cleared.';
END;
$$;

CREATE OR REPLACE FUNCTION durable_hack.demo_scoring_nodes()
RETURNS TABLE(node_id TEXT, node_type TEXT, status TEXT, step_query TEXT, step_result TEXT, updated_at TIMESTAMPTZ)
LANGUAGE sql
AS $$
    SELECT n.node_id, n.node_type, n.status, left(n.query, 85), left(n.result, 110), n.updated_at
    FROM (
        SELECT instance_id
        FROM df.list_instances(NULL, 50, NULL, NULL)
        WHERE label LIKE 'hack-aoai-%'
        ORDER BY created_at DESC
        LIMIT 1
    ) p,
    LATERAL df.instance_nodes(p.instance_id) n
    WHERE n.node_type <> 'THEN'
    ORDER BY n.updated_at NULLS LAST, n.node_id;
$$;

CREATE OR REPLACE FUNCTION durable_hack.demo_verify_zero_token_leak()
RETURNS TABLE(instance_id TEXT, total_nodes BIGINT, http_nodes BIGINT, leaked_token_rows BIGINT)
LANGUAGE sql
AS $$
    WITH latest AS (
        SELECT li.instance_id
        FROM df.list_instances(NULL, 50, NULL, NULL) li
        WHERE li.label LIKE 'hack-aoai-%'
        ORDER BY li.created_at DESC
        LIMIT 1
    ),
    nodes AS (
        SELECT latest.instance_id, n.*
        FROM latest, LATERAL df.instance_nodes(latest.instance_id) n
    )
    SELECT
        max(n.instance_id) AS instance_id,
        count(*) AS total_nodes,
        count(*) FILTER (WHERE n.node_type = 'HTTP') AS http_nodes,
        count(*) FILTER (
            WHERE coalesce(n.query, '') ILIKE '%eyJ0eX%'
               OR coalesce(n.result, '') ILIKE '%eyJ0eX%'
               OR coalesce(n.query, '') ILIKE '%Bearer %'
        ) AS leaked_token_rows
    FROM nodes n;
$$;
