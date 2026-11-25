-- =============================================================================
-- Applet 1: ai.tune_sql — Durable Verify-Before-Apply SQL Optimizer
-- =============================================================================
-- Grounded in microsoft/azure-ai#233 (Binnur Gorer's ai.tune_sql architecture).
-- Exercises: pg_durable (0.2.9) + azure_ai (2.5.6, Managed Model gpt-5.4).
-- Isolated schema: durable_hack (leaves existing schemas untouched).
--
-- IMPORTANT LIVE-DISCOVERED GOTCHAS HANDLED HERE:
--   1. ai.generate(..., json_schema => ...) requires the OpenAI wrapper shape:
--      {"name": "...", "strict": true, "schema": { ... }} (BUG-04).
--   2. Do NOT wait on a workflow that executes CREATE INDEX CONCURRENTLY using
--      df.await_instance() in a single blocking transaction — the open snapshot
--      deadlocks CONCURRENTLY Phase 2 until await_instance times out (BUG-03).
--      Poll via short df.status(instance_id) statements instead!
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS durable_hack;

-- 1. Sample workload table (50k orders, intentionally missing secondary index)
DROP TABLE IF EXISTS durable_hack.orders CASCADE;
CREATE TABLE durable_hack.orders (
    order_id    BIGSERIAL PRIMARY KEY,
    customer_id INT NOT NULL,
    status      TEXT NOT NULL,
    amount_usd  NUMERIC(10, 2) NOT NULL,
    region      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO durable_hack.orders (customer_id, status, amount_usd, region, created_at)
SELECT
    (g % 2500) + 1,
    CASE
        WHEN g % 20 = 0 THEN 'pending'
        WHEN g % 15 = 0 THEN 'disputed'
        ELSE 'completed'
    END,
    round(((g % 500) + 12.50)::numeric, 2),
    (ARRAY['eastus','westus2','japaneast','westeurope'])[1 + (g % 4)],
    now() - ((g % 365) || ' days')::interval
FROM generate_series(1, 50000) AS g;

ANALYZE durable_hack.orders;

-- 2. Audit & state table for verify-before-apply tuning runs (PR #233 schema)
DROP TABLE IF EXISTS durable_hack.tune_proposals CASCADE;
CREATE TABLE durable_hack.tune_proposals (
    proposal_id        BIGSERIAL PRIMARY KEY,
    workflow_id        TEXT,
    target_table       TEXT NOT NULL,
    target_sql         TEXT NOT NULL,
    hypopg_available   BOOLEAN NOT NULL DEFAULT false,
    evidence_level     TEXT NOT NULL DEFAULT 'E0',   -- E0..E3 per PR #233
    risk_tier          TEXT,                         -- R0..R2 per PR #233
    baseline_node_type TEXT,
    baseline_cost      NUMERIC(12, 2),
    baseline_plan      JSONB,
    action_type        TEXT,
    index_name         TEXT,
    proposed_ddl       TEXT,
    rollback_ddl       TEXT,
    rationale          TEXT,
    reviewer           TEXT,
    decision_note      TEXT,
    apply_workflow_id  TEXT,
    post_node_type     TEXT,
    post_cost          NUMERIC(12, 2),
    cost_reduction_pct NUMERIC(6, 2),
    status             TEXT NOT NULL DEFAULT 'observing',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Safe redacted EXPLAIN (FORMAT JSON) helper — NEVER runs EXPLAIN ANALYZE
CREATE OR REPLACE FUNCTION durable_hack.explain_plan_summary(p_sql TEXT)
RETURNS TABLE(node_type TEXT, total_cost NUMERIC, plan_json JSONB)
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan JSONB;
BEGIN
    -- Guardrail: only allow SELECT statements to be explained (\y is PostgreSQL word boundary)
    IF p_sql !~* '^\s*SELECT\y' THEN
        RAISE EXCEPTION 'Only SELECT statements are permitted for safe EXPLAIN';
    END IF;

    EXECUTE 'EXPLAIN (FORMAT JSON) ' || p_sql INTO v_plan;

    node_type  := v_plan->0->'Plan'->>'Node Type';
    total_cost := (v_plan->0->'Plan'->>'Total Cost')::numeric;
    plan_json  := v_plan;
    RETURN NEXT;
END;
$$;

-- 4. Step 1 helper: Observe baseline & record E1/E2 capability
CREATE OR REPLACE FUNCTION durable_hack.observe_baseline(p_proposal_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec       RECORD;
    v_exp       RECORD;
    v_has_hypo  BOOLEAN;
BEGIN
    SELECT * INTO v_rec FROM durable_hack.tune_proposals WHERE proposal_id = p_proposal_id;
    SELECT * INTO v_exp FROM durable_hack.explain_plan_summary(v_rec.target_sql);
    SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'hypopg') INTO v_has_hypo;

    UPDATE durable_hack.tune_proposals
    SET hypopg_available   = v_has_hypo,
        evidence_level     = CASE WHEN v_has_hypo THEN 'E2' ELSE 'E1' END,
        baseline_node_type = v_exp.node_type,
        baseline_cost      = v_exp.total_cost,
        baseline_plan      = v_exp.plan_json,
        status             = 'baseline_captured',
        updated_at         = now()
    WHERE proposal_id = p_proposal_id;

    RETURN jsonb_build_object(
        'proposal_id', p_proposal_id,
        'baseline_node_type', v_exp.node_type,
        'baseline_cost', v_exp.total_cost,
        'hypopg_available', v_has_hypo
    )::text;
END;
$$;

-- 5. Step 2 helper: Generate structured tuning recommendation via Managed Model gpt-5.4
CREATE OR REPLACE FUNCTION durable_hack.generate_tune_proposal(p_proposal_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec      RECORD;
    v_cols     TEXT;
    v_indexes  TEXT;
    v_resp     JSONB;
    v_ddl      TEXT;
    v_rollback TEXT;
BEGIN
    SELECT * INTO v_rec FROM durable_hack.tune_proposals WHERE proposal_id = p_proposal_id;

    SELECT string_agg(column_name || ' ' || data_type, ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = split_part(v_rec.target_table, '.', 1)
      AND table_name   = split_part(v_rec.target_table, '.', 2);

    SELECT coalesce(string_agg(indexdef, '; '), 'none')
    INTO v_indexes
    FROM pg_indexes
    WHERE schemaname = split_part(v_rec.target_table, '.', 1)
      AND tablename  = split_part(v_rec.target_table, '.', 2);

    -- Redacted prompt: NO table data, NO pg_stats MCV/histograms (per PR #233 privacy rules)
    SELECT ai.generate(
        prompt => format(
            'You are a PostgreSQL performance engineer following Verify-Before-Apply rules. ' ||
            'Target table: %s (columns: %s). Existing indexes: %s. ' ||
            'Slow query: %s. ' ||
            'Baseline EXPLAIN node: %s, total_cost: %s. ' ||
            'Propose ONE safe non-blocking B-tree index using CREATE INDEX CONCURRENTLY IF NOT EXISTS ' ||
            'whose name starts with idx_aitune_ (lowercase, <=50 chars), plus the exact DROP INDEX CONCURRENTLY IF EXISTS rollback DDL.',
            v_rec.target_table, v_cols, v_indexes, v_rec.target_sql,
            v_rec.baseline_node_type, v_rec.baseline_cost
        ),
        json_schema => '{
            "name": "ai_tune_sql_proposal",
            "strict": true,
            "schema": {
                "type": "object",
                "properties": {
                    "action_type":  {"type": "string", "enum": ["create_index_concurrently", "analyze_only"]},
                    "risk_tier":    {"type": "string", "enum": ["R0", "R1", "R2"]},
                    "index_name":   {"type": "string"},
                    "proposed_ddl": {"type": "string"},
                    "rollback_ddl": {"type": "string"},
                    "rationale":    {"type": "string"}
                },
                "required": ["action_type", "risk_tier", "index_name", "proposed_ddl", "rollback_ddl", "rationale"],
                "additionalProperties": false
            }
        }'::jsonb,
        model => 'default-chat',
        system_prompt => 'Return valid PostgreSQL 17 DDL targeting the exact schema-qualified table name provided. Never emit DROP TABLE, DELETE, UPDATE, or TRUNCATE.'
    ) INTO v_resp;

    v_ddl      := trim(trailing ';' FROM v_resp->>'proposed_ddl');
    v_rollback := trim(trailing ';' FROM v_resp->>'rollback_ddl');

    -- Safety validation before persisting DDL (\y is PostgreSQL POSIX word boundary)
    IF v_ddl !~* '^\s*CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_aitune_[a-z0-9_]+\s+ON\s+durable_hack\.orders\y' THEN
        RAISE EXCEPTION 'Safety guardrail rejected generated DDL: %', v_ddl;
    END IF;
    IF v_rollback !~* '^\s*DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+(durable_hack\.)?idx_aitune_[a-z0-9_]+\s*$' THEN
        RAISE EXCEPTION 'Safety guardrail rejected generated rollback DDL: %', v_rollback;
    END IF;

    UPDATE durable_hack.tune_proposals
    SET action_type  = v_resp->>'action_type',
        risk_tier    = v_resp->>'risk_tier',
        index_name   = v_resp->>'index_name',
        proposed_ddl = v_ddl,
        rollback_ddl = v_rollback,
        rationale    = v_resp->>'rationale',
        status       = 'awaiting_approval',
        updated_at   = now()
    WHERE proposal_id = p_proposal_id;

    RETURN v_resp::text;
END;
$$;

-- 6. Step 4a helper: Spawn a child pg_durable workflow for CREATE INDEX CONCURRENTLY + Verify + Auto-Revert
-- Why a child workflow?
--   1. pg_durable SQL-literal-quotes $var substitutions (good SQLi safety!), so
--      df.sql('$var') cannot execute dynamic DDL directly.
--   2. PostgreSQL forbids CREATE INDEX CONCURRENTLY inside PL/pgSQL EXECUTE
--      (which runs in a transaction block).
--   3. Spawning a child workflow via df.start(v_ddl ~> ..., transaction_mode => 'new')
--      passes the validated DDL as a top-level non-transactional SQL node, enabling
--      true zero-lock CREATE INDEX CONCURRENTLY plus durable post-apply verification!
CREATE OR REPLACE FUNCTION durable_hack.launch_apply_child_workflow(p_proposal_id BIGINT, p_signal_json TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_env       JSONB := coalesce(NULLIF(p_signal_json, '')::jsonb, '{}'::jsonb);
    v_sig       JSONB := coalesce(v_env->'data', v_env);
    v_ddl       TEXT;
    v_rollback  TEXT;
    v_child_id  TEXT;
    v_graph     TEXT;
BEGIN
    SELECT proposed_ddl, rollback_ddl
    INTO v_ddl, v_rollback
    FROM durable_hack.tune_proposals
    WHERE proposal_id = p_proposal_id;

    -- Re-validate DDL before passing into top-level SQL node
    IF v_ddl !~* '^\s*CREATE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+idx_aitune_[a-z0-9_]+\s+ON\s+durable_hack\.orders\y' THEN
        RAISE EXCEPTION 'Safety guardrail rejected DDL at apply time: %', v_ddl;
    END IF;
    IF v_rollback !~* '^\s*DROP\s+INDEX\s+CONCURRENTLY\s+IF\s+EXISTS\s+(durable_hack\.)?idx_aitune_[a-z0-9_]+\s*$' THEN
        RAISE EXCEPTION 'Safety guardrail rejected rollback DDL at apply time: %', v_rollback;
    END IF;

    v_graph :=
        df.sql(v_ddl)
        ~> df.sleep(2)
        ~> df.sql(format('SELECT durable_hack.verify_post_apply(%s) AS improved', p_proposal_id)) |=> 'verdict'
        ~> df.if(
            'SELECT ($verdict.improved)::boolean',
            df.sql(format('SELECT ''VERIFIED_APPLIED'' AS outcome, cost_reduction_pct FROM durable_hack.tune_proposals WHERE proposal_id = %s', p_proposal_id)),
            df.sql(v_rollback)
            ~> df.sql(format('UPDATE durable_hack.tune_proposals SET status = ''auto_reverted'', updated_at = now() WHERE proposal_id = %s', p_proposal_id))
        );

    -- Plain df.start() (default transaction_mode => 'caller') works directly inside
    -- a df.sql() workflow node; transaction_mode => 'new' is intentionally rejected
    -- inside workflows because each df.sql() node is already autocommitted.
    v_child_id := df.start(v_graph, 'hack-ai-tune-apply-' || p_proposal_id);

    UPDATE durable_hack.tune_proposals
    SET reviewer          = coalesce(v_sig->>'reviewer', 'unknown'),
        decision_note     = coalesce(v_sig->>'note', 'approved via df.signal'),
        apply_workflow_id = v_child_id,
        status            = 'applying',
        updated_at        = now()
    WHERE proposal_id = p_proposal_id;

    RETURN v_child_id;
END;
$$;

-- 7. Step 5 helper: Verify post-apply plan cost (E3) and signal if revert needed
CREATE OR REPLACE FUNCTION durable_hack.verify_post_apply(p_proposal_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_rec       RECORD;
    v_exp       RECORD;
    v_pct       NUMERIC(6, 2);
    v_improved  BOOLEAN;
BEGIN
    SELECT * INTO v_rec FROM durable_hack.tune_proposals WHERE proposal_id = p_proposal_id;
    EXECUTE format('ANALYZE %s', v_rec.target_table);
    SELECT * INTO v_exp FROM durable_hack.explain_plan_summary(v_rec.target_sql);

    v_pct := CASE
        WHEN v_rec.baseline_cost > 0
        THEN round(((v_rec.baseline_cost - v_exp.total_cost) / v_rec.baseline_cost) * 100.0, 2)
        ELSE 0
    END;
    v_improved := (v_exp.total_cost < v_rec.baseline_cost);

    UPDATE durable_hack.tune_proposals
    SET post_node_type     = v_exp.node_type,
        post_cost          = v_exp.total_cost,
        cost_reduction_pct = v_pct,
        evidence_level     = 'E3',
        status             = CASE WHEN v_improved THEN 'verified_applied' ELSE 'regression_detected' END,
        updated_at         = now()
    WHERE proposal_id = p_proposal_id;

    RETURN CASE WHEN v_improved THEN 'true' ELSE 'false' END;
END;
$$;

-- 8. Workflow launcher: Observe -> AI Propose -> Wait for Signal -> Apply -> Sleep -> Verify/Auto-Revert
CREATE OR REPLACE FUNCTION durable_hack.start_ai_tune_workflow(
    p_target_table TEXT DEFAULT 'durable_hack.orders',
    p_target_sql   TEXT DEFAULT 'SELECT order_id, amount_usd, created_at FROM durable_hack.orders WHERE customer_id = 42 AND status = ''pending'' ORDER BY created_at DESC LIMIT 20',
    p_approval_timeout_sec INT DEFAULT 3600
)
RETURNS TABLE(proposal_id BIGINT, instance_id TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_pid BIGINT;
    v_iid TEXT;
    v_graph TEXT;
BEGIN
    INSERT INTO durable_hack.tune_proposals (target_table, target_sql)
    VALUES (p_target_table, p_target_sql)
    RETURNING durable_hack.tune_proposals.proposal_id INTO v_pid;

    -- Build the durable execution graph
    -- Note: CREATE INDEX CONCURRENTLY must run as a standalone top-level SQL node
    -- (not inside a DO/PLpgSQL transaction), so we generate the proposal, await approval,
    -- fetch the validated DDL via scalar capture, and run it in its own SQL activity!
    v_graph :=
        df.sql(format('SELECT durable_hack.observe_baseline(%s)', v_pid))
        ~> df.sql(format('SELECT durable_hack.generate_tune_proposal(%s)', v_pid)) |=> 'ai_proposal'
        ~> df.wait_for_signal('approve_tune', p_approval_timeout_sec) |=> 'approval'
        ~> df.if(
            'SELECT coalesce(($approval::jsonb->''data''->>''approved'')::boolean, false) AND NOT coalesce(($approval::jsonb->>''timed_out'')::boolean, true)',
            -- APPROVED PATH: spawn child durable workflow for zero-lock CREATE INDEX CONCURRENTLY + verify/auto-revert
            df.sql(format(
                'SELECT durable_hack.launch_apply_child_workflow(%s, $approval::text) AS apply_workflow_id',
                v_pid
            )),
            -- REJECTED / TIMED OUT PATH: zero schema changes
            df.sql(format(
                'UPDATE durable_hack.tune_proposals SET status = ''rejected'', reviewer = coalesce(($approval::jsonb->''data''->>''reviewer''), CASE WHEN coalesce(($approval::jsonb->>''timed_out'')::boolean, false) THEN ''timeout'' ELSE ''unknown'' END), decision_note = coalesce(($approval::jsonb->''data''->>''note''), ''rejected or timed out''), updated_at = now() WHERE proposal_id = %s',
                v_pid
            ))
        );

    v_iid := df.start(v_graph, 'hack-ai-tune-' || v_pid);

    UPDATE durable_hack.tune_proposals
    SET workflow_id = v_iid
    WHERE durable_hack.tune_proposals.proposal_id = v_pid;

    proposal_id := v_pid;
    instance_id := v_iid;
    RETURN NEXT;
END;
$$;

-- 9. One-liner live demo helpers (used by demo_walkthrough.sql in VS Code)
CREATE OR REPLACE FUNCTION durable_hack.demo_reset_ai_tune()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_idx RECORD;
    v_cnt INT := 0;
BEGIN
    FOR v_idx IN
        SELECT schemaname, indexname
        FROM pg_indexes
        WHERE schemaname = 'durable_hack'
          AND tablename  = 'orders'
          AND indexname LIKE 'idx_aitune_%'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I.%I', v_idx.schemaname, v_idx.indexname);
        v_cnt := v_cnt + 1;
    END LOOP;
    ANALYZE durable_hack.orders;
    RETURN format('Reset complete: dropped %s AI index(es). durable_hack.orders is slow again!', v_cnt);
END;
$$;

CREATE OR REPLACE FUNCTION durable_hack.demo_latest_nodes()
RETURNS TABLE(node_id TEXT, node_type TEXT, status TEXT, step_query TEXT, step_result TEXT, updated_at TIMESTAMPTZ)
LANGUAGE sql
AS $$
    SELECT n.node_id, n.node_type, n.status, left(n.query, 80), left(n.result, 100), n.updated_at
    FROM (SELECT workflow_id FROM durable_hack.tune_proposals ORDER BY proposal_id DESC LIMIT 1) p,
         LATERAL df.instance_nodes(p.workflow_id) n
    WHERE n.node_type <> 'THEN'
    ORDER BY n.updated_at NULLS LAST, n.node_id;
$$;

CREATE OR REPLACE FUNCTION durable_hack.demo_approve_latest(
    p_reviewer TEXT DEFAULT 'abe@contoso.com',
    p_note     TEXT DEFAULT 'Approved live on demo'
)
RETURNS TABLE(proposal_id BIGINT, workflow_id TEXT, signal_result TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_pid BIGINT;
    v_wid TEXT;
    v_res TEXT;
BEGIN
    SELECT tp.proposal_id, tp.workflow_id
    INTO v_pid, v_wid
    FROM durable_hack.tune_proposals tp
    ORDER BY tp.proposal_id DESC
    LIMIT 1;

    SELECT df.signal(
        v_wid,
        'approve_tune',
        jsonb_build_object('approved', true, 'reviewer', p_reviewer, 'note', p_note)::text
    ) INTO v_res;

    proposal_id   := v_pid;
    workflow_id   := v_wid;
    signal_result := v_res;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION durable_hack.demo_latest_apply_nodes()
RETURNS TABLE(node_id TEXT, node_type TEXT, status TEXT, step_query TEXT, step_result TEXT, updated_at TIMESTAMPTZ)
LANGUAGE sql
AS $$
    SELECT n.node_id, n.node_type, n.status, left(n.query, 80), left(n.result, 100), n.updated_at
    FROM (SELECT apply_workflow_id FROM durable_hack.tune_proposals WHERE apply_workflow_id IS NOT NULL ORDER BY proposal_id DESC LIMIT 1) p,
         LATERAL df.instance_nodes(p.apply_workflow_id) n
    WHERE n.node_type <> 'THEN'
    ORDER BY n.updated_at NULLS LAST, n.node_id;
$$;

