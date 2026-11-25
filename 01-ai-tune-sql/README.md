# Applet 1: `ai.tune_sql` — Durable Verify-Before-Apply SQL Optimizer

Grounded in **Binnur Gorer's `ai.tune_sql` design (`microsoft/azure-ai#233`)**, this applet demonstrates how **`pg_durable`** serves as the durable execution backbone for **safe, human-gated, verify-before-apply SQL performance tuning** inside Azure HorizonDB.

## Why `pg_durable` Is Essential for `ai.tune_sql`

Per `microsoft/azure-ai#233`, automated database tuning cannot be a reckless one-shot LLM call:
- **Safe observation:** Never run `EXPLAIN ANALYZE` on arbitrary slow queries by default; use redacted `EXPLAIN (FORMAT JSON)` and exclude sensitive `pg_stats` (`most_common_vals`, `histogram_bounds`).
- **Structured recommendations:** Use `ai.generate(..., json_schema => ...)` on Managed Model `default-chat` (`gpt-5.4`) to emit strict JSON (`action_type`, `ddl`, `rollback_ddl`, `risk_tier`, `rationale`).
- **Evidence ladder (`E0`–`E3`) & Risk tiers (`R0`–`R2`):** Prefer deterministic `hypopg` plan-cost proof (`E2`) before touching real indexes (gracefully recording `E1` when `hypopg` is not allow-listed in `azure.extensions`).
- **Consent gate:** Pause durably with **`df.wait_for_signal('approve_tune', ...)`** until a DBA approves or rejects the proposal — surviving hours, days, or server restarts with zero held connections.
- **Durable apply, monitor & auto-revert:** Execute DDL (probing `CREATE INDEX CONCURRENTLY`), wait through a durable observation window (`df.sleep` / `df.wait_for_schedule`), compare post-apply cost/latency (`E3`), and **automatically drop/revert** the change if cost regresses.

## Customer Demo Story (What to Show Customers)

> **Title:** *"Self-Healing Postgres — Without Blind Auto-DDL"*
> **Target Audience:** Enterprise DBAs, Platform Engineers, and FinOps teams (e.g., Mining Co., Exchange Co., Global Bank) who want AI-assisted tuning but refuse to let an LLM run unverified `CREATE INDEX` statements in production.

### 5-Minute Live Demo Script

1. **The Pain (30 sec):** Show a realistic `durable_hack.orders` table (50,000 rows) where an enterprise reporting query (`WHERE customer_id = 42 AND status = 'pending' ORDER BY created_at DESC LIMIT 20`) does a full **Sequential Scan** (`cost ~ 1,200+`).
2. **Kick Off Durable Tuning (45 sec):** Run `SELECT durable_hack.start_ai_tune_workflow(...)`. Open the **VS Code PostgreSQL extension → Pipelines & Workflows → Workflows** panel and click the live **PG Durable Run**. Show the visual DAG executing:
   - Node 1: Capture redacted `EXPLAIN (FORMAT JSON)` baseline (no PII, no `EXPLAIN ANALYZE`).
   - Node 2: Call Managed Model `default-chat` (`gpt-5.4`) via `ai.generate(..., json_schema => ...)` — zero external Python glue, zero API keys to manage.
   - Node 3: Persist proposal + evidence level (`E2` via `hypopg` when enabled, or `E1` planner cost estimate) in `durable_hack.tune_proposals`.
3. **The Enterprise Trust Moment — Durable Human Gate (60 sec):** Point to the workflow **paused in `running` state at `wait_for_signal('approve_tune')`**. Explain: *"The workflow is durably checkpointed in Postgres. Zero connections are held. The DBA can review the proposed DDL in Slack, Teams, or VS Code hours later — even across a primary failover."*
4. **Approve & Watch Verify-After-Apply (60 sec):** Send the approval signal (`SELECT df.signal('<instance_id>', 'approve_tune', '{"approved":true,"reviewer":"abe"}')`). Watch the workflow resume in VS Code:
   - Applies the index (non-blocking `CREATE INDEX CONCURRENTLY` or fallback if constrained — see live probe results in `HACKATHON_LOG.md`).
   - Waits through the durable observation window (`df.sleep`), runs post-apply `EXPLAIN (FORMAT JSON)`, computes exact cost reduction (`%` improvement), marks evidence `E3`, and logs the verified win — or **auto-reverts** if cost didn't improve!
5. **The Punchline (30 sec):** *"One SQL workflow combined `pg_durable` + `azure_ai` Managed Models + PostgreSQL's own planner to turn an AI suggestion into an auditable, restart-safe, human-approved change — all inside HorizonDB."*

## Files

- [`ai_tune_applet.sql`](./ai_tune_applet.sql) — Complete runnable script: workload setup, helper functions, durable verify-before-apply workflow, approval signal walkthrough, and post-apply audit queries.

## Extensions Exercised

- `pg_durable` (`0.2.9`) — `df.sql`, `|=>`, `~>`, `df.if`, `df.wait_for_signal`, `df.signal`, `df.sleep`, `df.await_instance`, `df.instance_nodes`
- `azure_ai` (`2.5.6`) — `ai.generate(prompt => ..., json_schema => ..., model => 'default-chat')`
- Optional / parameter-group gated: `hypopg` (`1.4.1`), `pg_hint_plan` (`1.7.0`), `pg_stat_statements` (`1.11`)
