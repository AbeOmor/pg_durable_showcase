-- =============================================================================
-- Applet 1 Live Demo Walkthrough: ai.tune_sql ("Self-Healing Postgres")
-- =============================================================================
-- Highlight ONE line at a time and press Cmd+Shift+E (Run Query) in VS Code.
-- Assumes setup (ai_tune_applet.sql) has already been executed on this cluster.
-- =============================================================================

-- 0. RESET FOR A FRESH DEMO: Drop any prior AI-created index so the orders query is slow again.
SELECT durable_hack.demo_reset_ai_tune();

-- 1. SHOW THE SLOW QUERY: Baseline EXPLAIN on 50k orders (notice Seq Scan / Sort, cost ~1,218).
EXPLAIN SELECT order_id, amount_usd, created_at FROM durable_hack.orders WHERE customer_id = 42 AND status = 'pending' ORDER BY created_at DESC LIMIT 20;

-- 2. START THE PG_DURABLE WORKFLOW: Captures baseline -> calls gpt-5.4 -> pauses durably for DBA approval.
SELECT * FROM durable_hack.start_ai_tune_workflow();

-- 3. SHOW PG_DURABLE PAUSED MID-FLIGHT: Workflow stays "running" while parked on df.wait_for_signal('approve_tune').
SELECT instance_id, label, status, created_at FROM df.list_instances(NULL, 5, NULL, NULL) ORDER BY created_at DESC;

-- 4. INSPECT EVERY PG_DURABLE NODE SO FAR: See observe_baseline & generate_tune_proposal completed, parked on SIGNAL.
SELECT * FROM durable_hack.demo_latest_nodes();

-- 5. REVIEW GPT-5.4'S PROPOSAL: Zero DDL executed yet — DBA inspects risk tier, proposed index DDL, and rollback DDL.
SELECT proposal_id, status, risk_tier, baseline_cost, proposed_ddl, rollback_ddl FROM durable_hack.tune_proposals ORDER BY proposal_id DESC LIMIT 1;

-- 6. APPROVE VIA PG_DURABLE SIGNAL: Wakes the parked workflow and launches a zero-lock CREATE INDEX CONCURRENTLY child.
SELECT * FROM durable_hack.demo_approve_latest('abe@contoso.com', 'LGTM — approved live on demo');

-- 7. SHOW BOTH PARENT & CHILD PG_DURABLE WORKFLOWS: Wait ~10s, then run to see both reach "completed".
SELECT instance_id, label, status, created_at, completed_at FROM df.list_instances(NULL, 5, NULL, NULL) ORDER BY created_at DESC;

-- 8. INSPECT THE CHILD WORKFLOW'S NODES: CREATE INDEX CONCURRENTLY -> df.sleep(2) -> verify_post_apply -> df.if.
SELECT * FROM durable_hack.demo_latest_apply_nodes();

-- 9. SHOW BEFORE vs AFTER SAVINGS: Baseline cost ~1,218 -> Post cost ~4.4 (~99.6% reduction, Evidence E3).
SELECT proposal_id, status, evidence_level, baseline_node_type, baseline_cost, post_node_type, post_cost, cost_reduction_pct FROM durable_hack.tune_proposals ORDER BY proposal_id DESC LIMIT 1;

-- 10. PROVE IT LIVE WITH EXPLAIN: PostgreSQL now uses the AI-created covering index!
EXPLAIN SELECT order_id, amount_usd, created_at FROM durable_hack.orders WHERE customer_id = 42 AND status = 'pending' ORDER BY created_at DESC LIMIT 20;
