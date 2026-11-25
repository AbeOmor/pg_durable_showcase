-- =============================================================================
-- Applet 3: Internal pg_durable Usage Auditor & All-5-Extension AI Knowledge Graph
-- =============================================================================
-- Exercises ALL 5 HorizonDB AI extensions in one durable workflow:
--   1. pg_durable (0.2.9)    — self-auditing + durable loop/maintenance DAG
--   2. azure_ai (2.5.6)      — ai.embed, ai.generate (JSONB), ai.rank (Cohere v4)
--   3. pg_diskann (0.7.6)    — vector index with Spherical Quantization (sq_bits=4)
--   4. pg_textsearch (1.5.1) — BM25 index + to_bm25query() + durable bm25_force_merge()
--   5. age (1.8.0)           — guarded Cypher / ai.create_graph blueprint + live
--                              relational-graph projection when age isn't allow-listed
--
-- Isolated schema: durable_hack.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS durable_hack;

-- -----------------------------------------------------------------------------
-- PART A: Internal pg_durable Usage Auditor Tables & Views
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS durable_hack.usage_audit_snapshots CASCADE;
CREATE TABLE durable_hack.usage_audit_snapshots (
    snapshot_id              BIGSERIAL PRIMARY KEY,
    captured_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    auditor_role             TEXT NOT NULL DEFAULT current_user,
    cluster_total_instances  BIGINT NOT NULL,
    cluster_running          BIGINT NOT NULL,
    cluster_completed        BIGINT NOT NULL,
    cluster_failed           BIGINT NOT NULL,
    cluster_total_events     BIGINT NOT NULL,
    caller_visible_instances INT NOT NULL,
    rls_visibility_gap       BIGINT NOT NULL, -- flags BUG-02 when > 0
    by_label_prefix          JSONB NOT NULL
);

CREATE OR REPLACE FUNCTION durable_hack.capture_pg_durable_usage_snapshot()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_metrics       RECORD;
    v_visible_cnt   INT;
    v_by_prefix     JSONB;
    v_sid           BIGINT;
BEGIN
    SELECT * INTO v_metrics FROM df.metrics();

    -- Use 4-arg overload df.list_instances(status, limit, label, cursor) to get
    -- created_at & completed_at (2-arg overload omits timestamps!).
    WITH inst AS (
        SELECT
            instance_id,
            coalesce(label, '(unlabeled)') AS label,
            CASE
                WHEN label LIKE 'hack-ai-tune-%'    THEN 'applet-1-ai-tune'
                WHEN label LIKE 'hack-ml-partner-%' THEN 'applet-2-ml-partner-http'
                WHEN label LIKE 'hack-internal-%'   THEN 'applet-3-internal-brain'
                WHEN label LIKE 'hack-probe-%'      THEN 'hackathon-probes'
                ELSE split_part(coalesce(label, 'unlabeled'), '-', 1)
            END AS workflow_family,
            status,
            execution_count
        FROM df.list_instances(NULL, 100, NULL, NULL)
    ),
    grouped AS (
        SELECT
            workflow_family,
            count(*) AS total,
            count(*) FILTER (WHERE status = 'completed') AS completed,
            count(*) FILTER (WHERE status = 'failed')    AS failed,
            count(*) FILTER (WHERE status = 'running')   AS running
        FROM inst
        GROUP BY workflow_family
    )
    SELECT
        coalesce((SELECT count(*) FROM inst), 0),
        coalesce(
            jsonb_object_agg(
                workflow_family,
                jsonb_build_object(
                    'total', total,
                    'completed', completed,
                    'failed', failed,
                    'running', running
                )
            ),
            '{}'::jsonb
        )
    INTO v_visible_cnt, v_by_prefix
    FROM grouped;

    INSERT INTO durable_hack.usage_audit_snapshots (
        cluster_total_instances,
        cluster_running,
        cluster_completed,
        cluster_failed,
        cluster_total_events,
        caller_visible_instances,
        rls_visibility_gap,
        by_label_prefix
    ) VALUES (
        v_metrics.total_instances,
        v_metrics.running_instances,
        v_metrics.completed_instances,
        v_metrics.failed_instances,
        v_metrics.total_events,
        v_visible_cnt,
        greatest(0, v_metrics.total_instances - v_visible_cnt),
        v_by_prefix
    )
    RETURNING snapshot_id INTO v_sid;

    RETURN jsonb_build_object(
        'snapshot_id', v_sid,
        'cluster_total', v_metrics.total_instances,
        'caller_visible', v_visible_cnt,
        'rls_visibility_gap', greatest(0, v_metrics.total_instances - v_visible_cnt)
    )::text;
END;
$$;

-- -----------------------------------------------------------------------------
-- PART B: Customer & AI Knowledge Base + Knowledge Graph Tables
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS durable_hack.kg_edges CASCADE;
DROP TABLE IF EXISTS durable_hack.kg_nodes CASCADE;
DROP TABLE IF EXISTS durable_hack.customer_ai_notes CASCADE;

CREATE TABLE durable_hack.customer_ai_notes (
    note_id         BIGSERIAL PRIMARY KEY,
    source_ref      TEXT NOT NULL,
    customer_hint   TEXT NOT NULL,
    note_body       TEXT NOT NULL,
    embedding       vector(1536),
    extracted_json  JSONB,
    processed_at    TIMESTAMPTZ
);

CREATE TABLE durable_hack.kg_nodes (
    node_id    BIGSERIAL PRIMARY KEY,
    node_type  TEXT NOT NULL, -- Customer | Extension | Blocker
    node_key   TEXT NOT NULL,
    props      JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (node_type, node_key)
);

CREATE TABLE durable_hack.kg_edges (
    edge_id    BIGSERIAL PRIMARY KEY,
    src_id     BIGINT NOT NULL REFERENCES durable_hack.kg_nodes(node_id) ON DELETE CASCADE,
    edge_type  TEXT NOT NULL, -- USES | BLOCKED_BY
    dst_id     BIGINT NOT NULL REFERENCES durable_hack.kg_nodes(node_id) ON DELETE CASCADE,
    source_note_id BIGINT REFERENCES durable_hack.customer_ai_notes(note_id) ON DELETE CASCADE,
    UNIQUE (src_id, edge_type, dst_id, source_note_id)
);

-- Seed grounded customer/hackathon intelligence notes
INSERT INTO durable_hack.customer_ai_notes (source_ref, customer_hint, note_body) VALUES
(
    'hackathon/ml-partner-aca',
    'ML Partner',
    'ML Partner wants to run tabular foundation model inference from HorizonDB via pg_durable df.http() calling an Azure Container Apps endpoint (*.azurecontainerapps.io). Blocked on HorizonDB GA preview because pg_durable.http_allowed_domains omits *.azurecontainerapps.io and *.services.ai.azure.com while exposing no parameter group override. Workaround is fronting ACA behind Azure API Management (*.azure-api.net) with pg_durable_fdw secret bindings.'
),
(
    'customer-calls/mining-co',
    'Mining Co.',
    'Mining Co. enterprise DBAs want AI-assisted SQL query tuning (ai.tune_sql) orchestrated with pg_durable and azure_ai Managed Models, but strictly require Verify-Before-Apply guardrails: safe redacted EXPLAIN without EXPLAIN ANALYZE, hypopg cost validation, human DBA approval via df.wait_for_signal, non-blocking CREATE INDEX CONCURRENTLY, and automatic rollback if latency regresses.'
),
(
    'customer-calls/exchange-co',
    'Exchange Co.',
    'Exchange Co. is evaluating HorizonDB unified AI search combining pg_diskann with spherical quantization (sq_bits = 4) for fast low-memory ANN vector search, pg_textsearch BM25 for exact financial ticker and regulatory keyword matching, azure_ai Cohere reranking, and Apache AGE knowledge graphs for entity relationship traversal inside a single PostgreSQL database.'
),
(
    'customer-calls/docai-startup',
    'DocAI Startup',
    'DocAI Startup runs long-running document ingestion and agentic enrichment workflows in PostgreSQL using pg_durable and azure_ai pipelines. They need crash-safe batch checkpointing with df.loop and df.if_rows, secure credential storage via pg_durable_fdw user mappings instead of plaintext variables, and periodic BM25 index compaction via bm25_force_merge.'
),
(
    'customer-calls/global-bank',
    'Global Bank',
    'Global Bank Enterprise Hardening review flagged governance and observability requirements for pg_durable and azure_ai: auditors need accurate cross-role workflow visibility without df.metrics() diverging from df.list_instances() RLS, strict outbound HTTP domain allow-lists, and clear structured error messages from ai.generate when json_schema envelopes are malformed.'
),
(
    'hackathon/age-interop',
    'HorizonDB AI Stack',
    'Apache AGE 1.8.0 is available on HorizonDB GA preview clusters alongside pg_durable 0.2.9, azure_ai 2.5.6, pg_diskann 0.7.6, and pg_textsearch 1.5.1, enabling azure_ai ai.create_graph and ai.graph_sink pipelines once age is allow-listed in azure.extensions and preloaded via shared_preload_libraries (without calling LOAD age).'
);

-- -----------------------------------------------------------------------------
-- PART C: Durable Note Enrichment Helper (ai.embed + ai.generate + KG Upsert)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION durable_hack.claim_next_unprocessed_note()
RETURNS TABLE(note_id BIGINT)
LANGUAGE sql
AS $$
    SELECT note_id
    FROM durable_hack.customer_ai_notes
    WHERE processed_at IS NULL
    ORDER BY note_id
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION durable_hack.enrich_and_graph_note(p_note_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_note         RECORD;
    v_vec          vector(1536);
    v_kg           JSONB;
    v_cust_id      BIGINT;
    v_ext_id       BIGINT;
    v_blk_id       BIGINT;
    v_ext_name     TEXT;
BEGIN
    SELECT * INTO v_note FROM durable_hack.customer_ai_notes WHERE note_id = p_note_id;

    -- 1. Embed with Managed Model text-embedding-3-small (note: ai.embed returns real[], cast to vector(1536))
    v_vec := ai.embed(text => v_note.note_body, model => 'default-embedding')::vector(1536);

    -- 2. Extract structured Knowledge Graph triples using Managed Model gpt-5.4
    SELECT ai.generate(
        prompt => format(
            'Extract a concise Knowledge Graph record from this PostgreSQL/HorizonDB note: %s',
            v_note.note_body
        ),
        json_schema => '{
            "name": "customer_ai_kg_extraction",
            "strict": true,
            "schema": {
                "type": "object",
                "properties": {
                    "customer_name":   {"type": "string"},
                    "journey_phase":   {"type": "string", "enum": ["Education/POC", "Building", "Optimization", "Enterprise Hardening"]},
                    "extensions_used": {"type": "array", "items": {"type": "string"}},
                    "blocker_summary": {"type": "string"},
                    "sentiment":       {"type": "string", "enum": ["positive", "mixed", "blocked"]}
                },
                "required": ["customer_name", "journey_phase", "extensions_used", "blocker_summary", "sentiment"],
                "additionalProperties": false
            }
        }'::jsonb,
        model => 'default-chat',
        system_prompt => 'Normalize extension names to canonical Postgres names such as pg_durable, azure_ai, pg_diskann, pg_textsearch, age, hypopg.'
    ) INTO v_kg;

    UPDATE durable_hack.customer_ai_notes
    SET embedding      = v_vec,
        extracted_json = v_kg,
        processed_at   = now()
    WHERE note_id = p_note_id;

    -- 3. Upsert Knowledge Graph nodes & edges
    INSERT INTO durable_hack.kg_nodes (node_type, node_key, props)
    VALUES ('Customer', v_kg->>'customer_name', jsonb_build_object('journey_phase', v_kg->>'journey_phase', 'sentiment', v_kg->>'sentiment'))
    ON CONFLICT (node_type, node_key) DO UPDATE SET props = EXCLUDED.props
    RETURNING node_id INTO v_cust_id;

    FOR v_ext_name IN SELECT jsonb_array_elements_text(v_kg->'extensions_used') LOOP
        INSERT INTO durable_hack.kg_nodes (node_type, node_key)
        VALUES ('Extension', lower(trim(v_ext_name)))
        ON CONFLICT (node_type, node_key) DO UPDATE SET node_key = EXCLUDED.node_key
        RETURNING node_id INTO v_ext_id;

        INSERT INTO durable_hack.kg_edges (src_id, edge_type, dst_id, source_note_id)
        VALUES (v_cust_id, 'USES', v_ext_id, p_note_id)
        ON CONFLICT DO NOTHING;
    END LOOP;

    IF length(coalesce(v_kg->>'blocker_summary', '')) > 0 THEN
        INSERT INTO durable_hack.kg_nodes (node_type, node_key)
        VALUES ('Blocker', left(v_kg->>'blocker_summary', 140))
        ON CONFLICT (node_type, node_key) DO UPDATE SET node_key = EXCLUDED.node_key
        RETURNING node_id INTO v_blk_id;

        INSERT INTO durable_hack.kg_edges (src_id, edge_type, dst_id, source_note_id)
        VALUES (v_cust_id, 'BLOCKED_BY', v_blk_id, p_note_id)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN jsonb_build_object('note_id', p_note_id, 'customer', v_kg->>'customer_name', 'extensions', v_kg->'extensions_used')::text;
END;
$$;

-- -----------------------------------------------------------------------------
-- PART D: Apache AGE Cypher Sync (Auto-Activates When `age` Extension Is Installed)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION durable_hack.sync_kg_to_age_if_enabled()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = ag_catalog, "$user", public
AS $$
DECLARE
    v_age_installed BOOLEAN;
    v_rec           RECORD;
    v_cypher        TEXT;
    v_edges         INT := 0;
BEGIN
    SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'age') INTO v_age_installed;
    IF NOT v_age_installed THEN
        RETURN 'age_not_installed: relational KG active in durable_hack.kg_nodes/kg_edges';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'horizondb_ai_kg') THEN
        PERFORM ag_catalog.create_graph('horizondb_ai_kg');
    END IF;

    FOR v_rec IN
        SELECT
            replace(src.node_key, '''', '') AS cust,
            replace(dst.node_key, '''', '') AS ext
        FROM durable_hack.kg_edges e
        JOIN durable_hack.kg_nodes src ON src.node_id = e.src_id
        JOIN durable_hack.kg_nodes dst ON dst.node_id = e.dst_id
        WHERE e.edge_type = 'USES'
    LOOP
        v_cypher := format(
            'MERGE (c:Customer {name: %L}) MERGE (e:Extension {name: %L}) MERGE (c)-[:USES]->(e) RETURN c.name',
            v_rec.cust, v_rec.ext
        );
        EXECUTE format('SELECT * FROM ag_catalog.cypher(''horizondb_ai_kg'', $q$ %s $q$) AS (v ag_catalog.agtype)', v_cypher);
        v_edges := v_edges + 1;
    END LOOP;

    RETURN format('age_graph_synced: horizondb_ai_kg (%s USES edges)', v_edges);
END;
$$;

-- -----------------------------------------------------------------------------
-- PART E: Durable Workflow Launcher (Self-Audit -> Enrich Loop -> DiskANN SQ + BM25 + Force Merge + AGE Check)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION durable_hack.start_internal_ai_brain_workflow(
    p_label TEXT DEFAULT 'hack-internal-5ext-brain'
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_graph TEXT;
BEGIN
    v_graph :=
        -- Step 1: Self-audit pg_durable usage across the cluster
        df.sql('SELECT durable_hack.capture_pg_durable_usage_snapshot()')
        -- Step 2: Durable incremental AI enrichment + KG extraction loop
        ~> df.loop(
            df.sql('SELECT note_id FROM durable_hack.claim_next_unprocessed_note()') |=> 'next_note'
            ~> df.if_rows(
                'next_note',
                df.sql('SELECT durable_hack.enrich_and_graph_note(($next_note.note_id)::bigint)'),
                df.break('ALL_NOTES_ENRICHED')
            )
        )
        -- Step 3: Build/maintain pg_diskann (Spherical Quantization) & pg_textsearch BM25 indexes
        ~> df.sql('CREATE INDEX IF NOT EXISTS idx_notes_diskann ON durable_hack.customer_ai_notes USING diskann (embedding vector_cosine_ops) WITH (spherical_quantized = true, sq_bits = 4)')
        ~> df.sql('CREATE INDEX IF NOT EXISTS idx_notes_bm25 ON durable_hack.customer_ai_notes USING bm25 (note_body) WITH (text_config = ''english'')')
        -- Step 4: Durable BM25 segment merge + optional Apache AGE graph check
        ~> df.sql('SELECT public.bm25_force_merge(''durable_hack.idx_notes_bm25'')')
        ~> df.sql('SELECT durable_hack.sync_kg_to_age_if_enabled() AS age_status');

    RETURN df.start(v_graph, p_label);
END;
$$;

-- -----------------------------------------------------------------------------
-- PART F: Unified Hybrid (DiskANN + BM25 RRF) + Cohere Rerank + Graph Search
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION durable_hack.ask_ai_stack(
    p_query TEXT,
    p_top_k INT DEFAULT 4
)
RETURNS TABLE(
    final_rank      INT,
    cohere_score    DOUBLE PRECISION,
    rrf_score       NUMERIC,
    customer_name   TEXT,
    journey_phase   TEXT,
    extensions_used TEXT,
    blocker_summary TEXT,
    source_ref      TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_qvec vector(1536);
BEGIN
    v_qvec := ai.embed(text => p_query, model => 'default-embedding')::vector(1536);

    RETURN QUERY
    WITH vec_hits AS (
        SELECT
            note_id,
            row_number() OVER (ORDER BY embedding <=> v_qvec) AS vec_rank
        FROM durable_hack.customer_ai_notes
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> v_qvec
        LIMIT 10
    ),
    bm25_hits AS (
        -- Per pg_textsearch best practice: use explicit to_bm25query(query, index_name) inside PL/pgSQL
        SELECT
            note_id,
            row_number() OVER (
                ORDER BY note_body <@> public.to_bm25query(p_query, 'durable_hack.idx_notes_bm25')
            ) AS bm25_rank
        FROM durable_hack.customer_ai_notes
        ORDER BY note_body <@> public.to_bm25query(p_query, 'durable_hack.idx_notes_bm25')
        LIMIT 10
    ),
    fused AS (
        SELECT
            n.note_id,
            n.source_ref,
            n.note_body,
            n.extracted_json,
            round(
                coalesce(1.0 / (60 + v.vec_rank), 0) + coalesce(1.0 / (60 + b.bm25_rank), 0),
                6
            ) AS fused_rrf_score
        FROM durable_hack.customer_ai_notes n
        LEFT JOIN vec_hits v ON v.note_id = n.note_id
        LEFT JOIN bm25_hits b ON b.note_id = n.note_id
        WHERE v.note_id IS NOT NULL OR b.note_id IS NOT NULL
        ORDER BY 5 DESC
        LIMIT 6
    ),
    candidates AS (
        SELECT
            array_agg(f_in.note_id ORDER BY f_in.fused_rrf_score DESC)   AS ids,
            array_agg(f_in.note_body ORDER BY f_in.fused_rrf_score DESC) AS docs
        FROM fused f_in
    ),
    reranked AS (
        SELECT r.id AS note_id, r.rank AS cohere_rank, r.score AS cohere_score
        FROM candidates c,
             LATERAL ai.rank(
                 query => p_query,
                 data  => c.docs,
                 ids   => c.ids,
                 top_n => p_top_k,
                 model => 'default-reranker'
             ) r
    ),
    kg_summary AS (
        SELECT
            e.source_note_id,
            string_agg(DISTINCT dst.node_key, ', ' ORDER BY dst.node_key)
                FILTER (WHERE e.edge_type = 'USES') AS extensions_list
        FROM durable_hack.kg_edges e
        JOIN durable_hack.kg_nodes dst ON dst.node_id = e.dst_id
        GROUP BY e.source_note_id
    )
    SELECT
        rr.cohere_rank::int                              AS final_rank,
        round(rr.cohere_score::numeric, 4)::double precision AS cohere_score,
        f.fused_rrf_score                                    AS rrf_score,
        f.extracted_json->>'customer_name'                   AS customer_name,
        f.extracted_json->>'journey_phase'               AS journey_phase,
        coalesce(kg.extensions_list, '')                 AS extensions_used,
        f.extracted_json->>'blocker_summary'             AS blocker_summary,
        f.source_ref
    FROM reranked rr
    JOIN fused f ON f.note_id = rr.note_id
    LEFT JOIN kg_summary kg ON kg.source_note_id = rr.note_id
    ORDER BY rr.cohere_rank;
END;
$$;

-- -----------------------------------------------------------------------------
-- PART G: Stage-Ready Demo Helper Functions (used by demo_walkthrough.sql)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION durable_hack.demo_reset_ai_brain()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE durable_hack.customer_ai_notes
    SET embedding      = NULL,
        extracted_json = NULL,
        processed_at   = NULL;
    DELETE FROM durable_hack.kg_edges;
    DELETE FROM durable_hack.kg_nodes;
    RETURN 'Reset complete: 6 customer notes cleared and ready for durable 5-extension enrichment.';
END;
$$;

CREATE OR REPLACE FUNCTION durable_hack.demo_brain_nodes()
RETURNS TABLE(node_id TEXT, node_type TEXT, status TEXT, step_query TEXT, step_result TEXT, updated_at TIMESTAMPTZ)
LANGUAGE sql
AS $$
    SELECT n.node_id, n.node_type, n.status, left(n.query, 85), left(n.result, 110), n.updated_at
    FROM (
        SELECT instance_id
        FROM df.list_instances(NULL, 50, NULL, NULL)
        WHERE label LIKE 'hack-internal-%'
        ORDER BY created_at DESC
        LIMIT 1
    ) p,
    LATERAL df.instance_nodes(p.instance_id) n
    WHERE n.node_type <> 'THEN'
    ORDER BY n.updated_at NULLS LAST, n.node_id;
$$;

CREATE OR REPLACE FUNCTION durable_hack.demo_age_cypher_graph()
RETURNS TABLE(customer TEXT, relationship TEXT, extension TEXT)
LANGUAGE plpgsql
SET search_path = ag_catalog, "$user", public
AS $fn$
BEGIN
    RETURN QUERY
    SELECT
        trim(both '"' FROM c::text) AS customer,
        'USES'::text                AS relationship,
        trim(both '"' FROM e::text) AS extension
    FROM ag_catalog.cypher('horizondb_ai_kg', $$
        MATCH (c:Customer)-[:USES]->(e:Extension)
        RETURN c.name, e.name
    $$) AS (c ag_catalog.agtype, e ag_catalog.agtype)
    ORDER BY 1, 3;
END;
$fn$;
