export type LayerTag = 'pg_durable' | 'ai_pipelines' | 'ai_functions';

export interface WalkthroughStep {
  id: string;
  stepNumber: number;
  title: string;
  shortLabel: string;
  narration: string;
  sql: string;
  layer: LayerTag;
  layerTitle: string;
  layerExplanation: string;
  liveNote?: string;
}

export interface ShipmentRow {
  id: number;
  supplier: string;
  region: string;
  leadDays: number;
  valueUsd: number;
  lateHistory: number;
  batch: 1 | 2 | 3;
  riskScore: number;
  tier: 'LOW' | 'MEDIUM' | 'HIGH';
  rationale: string;
}

export interface CustomerNote {
  id: number;
  sourceRef: string;
  customer: string;
  journeyPhaseDurable: string;
  journeyPhasePipeline: string;
  sentiment: 'positive' | 'mixed' | 'blocked';
  extensions: string[];
  blocker: string;
  preview: string;
  cohereScores: Record<string, number>;
  rrfScores: Record<string, number>;
}

// =============================================================================
// APPLET 1: ai.tune_sql — Pure pg_durable (Super Custom DBA Verify-Before-Apply)
// Grounded 100% in 01-ai-tune-sql/demo_walkthrough.sql & live HorizonDB run
// =============================================================================
export const APPLET1_STEPS: WalkthroughStep[] = [
  {
    id: 'baseline',
    stepNumber: 1,
    title: 'Inspect the Slow Production Query',
    shortLabel: 'Baseline EXPLAIN (Seq Scan)',
    narration:
      'Start with a real 50,000-row orders table missing a composite index. PostgreSQL executes a Sequential Scan + Sort at cost 1,218.42.',
    sql: `EXPLAIN
SELECT order_id, amount_usd, created_at
FROM durable_hack.orders
WHERE customer_id = 42 AND status = 'pending'
ORDER BY created_at DESC
LIMIT 20;`,
    layer: 'pg_durable',
    layerTitle: 'Why pure pg_durable? (Beyond AI Functions)',
    layerExplanation:
      'An AI function can suggest SQL, but enterprise DBAs (like Mining Co.) refuse blind DDL execution. You need a stateful, crash-safe multi-step state machine that spans hours while waiting for human approval.',
  },
  {
    id: 'start',
    stepNumber: 2,
    title: 'Launch the Durable Optimizer Workflow',
    shortLabel: 'Start pg_durable workflow',
    narration:
      'One SQL call starts a durable workflow: it captures redacted EXPLAIN JSON (never EXPLAIN ANALYZE), validates with hypopg, asks gpt-5.4 for a structured proposal, and parks on df.wait_for_signal().',
    sql: `SELECT * FROM durable_hack.start_ai_tune_workflow();`,
    layer: 'pg_durable',
    layerTitle: 'pg_durable + azure_ai Managed Models',
    layerExplanation:
      'pg_durable orchestrates df.sql() steps sequentially and checkpoints every output in df.nodes. Inside Step 2, ai.generate() uses HorizonDB Managed Models (gpt-5.4) with a strict JSON Schema—zero external API keys.',
  },
  {
    id: 'paused',
    stepNumber: 3,
    title: 'Workflow Parks Mid-Flight on Human Signal',
    shortLabel: 'Parked on df.wait_for_signal',
    narration:
      'Notice status = "running". No connection is held open, no worker thread is blocked, and zero DDL has touched production. Even if the server restarts, pg_durable resumes right here.',
    sql: `SELECT instance_id, label, status, created_at
FROM df.list_instances(NULL, 5, NULL, NULL)
ORDER BY created_at DESC;

SELECT * FROM durable_hack.demo_latest_nodes();`,
    layer: 'pg_durable',
    layerTitle: 'Open-Source Durability Primitive: df.wait_for_signal()',
    layerExplanation:
      'AI Pipelines has no human-in-the-loop pause primitive. Open-source pg_durable persists workflow state to Postgres tables so an orchestration can pause for seconds or days awaiting a DBA signal.',
  },
  {
    id: 'review',
    stepNumber: 4,
    title: 'DBA Reviews GPT-5.4 Proposal & Rollback DDL',
    shortLabel: 'Review proposal + rollback',
    narration:
      'Before anything runs, the DBA inspects the exact proposed CREATE INDEX CONCURRENTLY statement, risk tier, hypopg estimate, and pre-generated rollback DDL.',
    sql: `SELECT proposal_id, status, risk_tier, baseline_cost,
       proposed_ddl, rollback_ddl
FROM durable_hack.tune_proposals
ORDER BY proposal_id DESC LIMIT 1;`,
    layer: 'ai_functions',
    layerTitle: 'Where AI Functions Fit: Structured Proposal Generation',
    layerExplanation:
      'ai.generate() with json_schema guarantees machine-parseable fields (proposed_ddl, rollback_ddl, risk_tier, rationale) that downstream pg_durable SQL nodes can safely validate and execute.',
  },
  {
    id: 'approve',
    stepNumber: 5,
    title: 'DBA Approves -> Non-Blocking Child Workflow',
    shortLabel: 'Signal approval & apply',
    narration:
      'Clicking Approve sends df.signal(instance_id, \'approve_tune\', ...). pg_durable wakes up and spawns a child workflow to run CREATE INDEX CONCURRENTLY outside any transaction block!',
    sql: `SELECT * FROM durable_hack.demo_approve_latest(
  'abe@contoso.com',
  'LGTM — approved live on demo'
);`,
    layer: 'pg_durable',
    layerTitle: 'Why a Child Workflow? (CREATE INDEX CONCURRENTLY)',
    layerExplanation:
      'PostgreSQL forbids CREATE INDEX CONCURRENTLY inside a multi-statement transaction block. pg_durable isolates it cleanly in its own df.sql() step inside a child workflow, followed by df.sleep(2) and verification.',
  },
  {
    id: 'verify',
    stepNumber: 6,
    title: 'Verify Savings (99.6% Drop) or Auto-Revert',
    shortLabel: 'Verify E3 & EXPLAIN proof',
    narration:
      'The child workflow runs df.sleep(2), re-captures EXPLAIN cost (1,218.42 -> 4.44, -99.6%, Evidence E3), and uses df.if() to auto-execute rollback_ddl if cost ever regressed.',
    sql: `SELECT proposal_id, status, evidence_level,
       baseline_cost, post_cost, cost_reduction_pct
FROM durable_hack.tune_proposals
ORDER BY proposal_id DESC LIMIT 1;

EXPLAIN SELECT order_id, amount_usd, created_at
FROM durable_hack.orders
WHERE customer_id = 42 AND status = 'pending'
ORDER BY created_at DESC LIMIT 20;`,
    layer: 'pg_durable',
    layerTitle: 'Closed-Loop Conditional Rollback with df.if()',
    layerExplanation:
      'Because pg_durable gives you full control flow (df.if, df.sleep, child workflows), the database itself verifies post-apply health and automatically reverts regressions without an external orchestrator.',
  },
];

// =============================================================================
// APPLET 2: ML Partner / tabular model Custom Endpoint Batch Scoring (df.http + FDW)
// Grounded 100% in 02-custom-endpoint-aca-http/demo_walkthrough.sql & live run e1cf3a9d
// =============================================================================
export const SHIPMENT_ROWS: ShipmentRow[] = [
  { id: 1, supplier: 'SUP-001', region: 'ap-east', leadDays: 28, valueUsd: 84200, lateHistory: 5, batch: 1, riskScore: 0.91, tier: 'HIGH', rationale: 'Long 28d lead time + 5 prior late deliveries on high-value order' },
  { id: 2, supplier: 'SUP-002', region: 'us-west', leadDays: 6, valueUsd: 12400, lateHistory: 0, batch: 1, riskScore: 0.14, tier: 'LOW', rationale: 'Short domestic lead time with zero historical delays' },
  { id: 3, supplier: 'SUP-003', region: 'eu-central', leadDays: 14, valueUsd: 45800, lateHistory: 2, batch: 1, riskScore: 0.56, tier: 'MEDIUM', rationale: 'Moderate cross-border lead time with 2 prior delays' },
  { id: 4, supplier: 'SUP-004', region: 'ap-south', leadDays: 34, valueUsd: 112000, lateHistory: 6, batch: 1, riskScore: 0.95, tier: 'HIGH', rationale: 'Severe 34d lead window and highest historical lateness' },
  { id: 5, supplier: 'SUP-005', region: 'us-east', leadDays: 5, valueUsd: 9800, lateHistory: 0, batch: 2, riskScore: 0.11, tier: 'LOW', rationale: 'Low-value domestic lane with reliable on-time record' },
  { id: 6, supplier: 'SUP-006', region: 'eu-west', leadDays: 18, valueUsd: 63500, lateHistory: 3, batch: 2, riskScore: 0.68, tier: 'MEDIUM', rationale: 'Elevated order value combined with 3 recent slippages' },
  { id: 7, supplier: 'SUP-007', region: 'latam-south', leadDays: 25, valueUsd: 71000, lateHistory: 4, batch: 2, riskScore: 0.84, tier: 'HIGH', rationale: 'Extended customs transit and recurring delay pattern' },
  { id: 8, supplier: 'SUP-008', region: 'us-central', leadDays: 7, valueUsd: 19200, lateHistory: 1, batch: 2, riskScore: 0.24, tier: 'LOW', rationale: 'Minor single historical delay; short transit window' },
  { id: 9, supplier: 'SUP-009', region: 'ap-northeast', leadDays: 12, valueUsd: 38900, lateHistory: 1, batch: 3, riskScore: 0.36, tier: 'LOW', rationale: 'Stable corridor with single minor past variance' },
  { id: 10, supplier: 'SUP-010', region: 'me-central', leadDays: 29, valueUsd: 96400, lateHistory: 5, batch: 3, riskScore: 0.89, tier: 'HIGH', rationale: 'High-value shipment on 29d route with 5 late occurrences' },
  { id: 11, supplier: 'SUP-011', region: 'eu-north', leadDays: 15, valueUsd: 52100, lateHistory: 2, batch: 3, riskScore: 0.52, tier: 'MEDIUM', rationale: 'Medium exposure; two prior schedule slips' },
  { id: 12, supplier: 'SUP-012', region: 'us-west', leadDays: 4, valueUsd: 7600, lateHistory: 0, batch: 3, riskScore: 0.09, tier: 'LOW', rationale: 'Fastest domestic corridor with clean SLA history' },
];

export const APPLET2_STEPS: WalkthroughStep[] = [
  {
    id: 'pending',
    stepNumber: 1,
    title: 'Inspect 12 Unscored Operational Shipments',
    shortLabel: '12 pending shipments',
    narration:
      'Start with 12 operational supply-chain rows waiting in Postgres. Instead of exporting CSVs to Python or hitting a single managed LLM, we want to batch-score them against a custom external inference endpoint.',
    sql: `SELECT shipment_id, supplier_code, origin_region,
       lead_time_days, order_value_usd, historical_late,
       scoring_status
FROM durable_hack.supplier_shipments
ORDER BY shipment_id;`,
    layer: 'pg_durable',
    layerTitle: 'Why pg_durable instead of AI Functions?',
    layerExplanation:
      'AI Functions only invoke built-in Managed Models. Customers like ML Partner run custom tabular model containers on ACA or Entra-ID-only inference endpoints. pg_durable df.http() lets Postgres call ANY custom HTTPS endpoint durably.',
  },
  {
    id: 'fdw',
    stepNumber: 2,
    title: 'Bind Secrets via pg_durable_fdw (Zero History Leak)',
    shortLabel: 'pg_durable_fdw vault',
    narration:
      'Credentials NEVER go into df.http() headers or df.setvar() because pg_durable persists every node input in df.nodes. Instead, auth headers live inside a PostgreSQL FOREIGN SERVER + USER MAPPING.',
    sql: `CREATE SERVER abes_demo_aoai
  FOREIGN DATA WRAPPER pg_durable_fdw
  OPTIONS (base_url 'https://my-ai-foundry.openai.azure.com',
           auth_type 'bearer');

ALTER USER MAPPING FOR CURRENT_USER
  SERVER abes_demo_aoai
  OPTIONS (SET token '<EPHEMERAL_ENTRA_JWT>');`,
    layer: 'pg_durable',
    layerTitle: 'Security Architecture: Why Foreign Data Wrapper?',
    layerExplanation:
      'The pg_durable Rust worker resolves the USER MAPPING at request time right before sending the HTTP request. Plaintext Bearer tokens and API keys never appear in SQL workflow definitions or df.instance_nodes().',
  },
  {
    id: 'batch1',
    stepNumber: 3,
    title: 'Launch Durable Loop -> Batch 1 of 3 (Rows 1-4)',
    shortLabel: 'df.loop -> Batch 1/3',
    narration:
      'claim_shipment_batch(4) packs 4 pending rows into ONE JSON payload via jsonb_agg(). df.if_rows() checks if rows exist, sends ONE df.http() call, and persists Batch 1 (HTTP 200) atomically.',
    sql: `SELECT durable_hack.start_ml_partner_scoring(
  'abes_demo_aoai',
  '/openai/deployments/gpt-5.4/chat/completions?api-version=2025-01-01-preview',
  'POST', 4, 'hack-aoai-demo-live'
);`,
    layer: 'pg_durable',
    layerTitle: 'Why Mini-Batching (4 rows/call) + Watermark?',
    layerExplanation:
      '12 rows = 3 HTTP calls instead of 12 (4x lower latency, avoids request timeouts). Each batch commits pending -> scored in Postgres, so if Batch 2 crashes on a 503, pg_durable resumes from Batch 2—never re-billing Batch 1.',
  },
  {
    id: 'batch2',
    stepNumber: 4,
    title: 'Durable Loop Continues -> Batch 2 of 3 (Rows 5-8)',
    shortLabel: 'df.loop -> Batch 2/3',
    narration:
      'On iteration 2, claim_shipment_batch(4) skips rows 1-4 (already scored) and claims rows 5-8. df.http() scores them with gpt-5.4 and records HTTP 200 + token counts in scoring_batches.',
    sql: `SELECT * FROM durable_hack.demo_scoring_nodes();

SELECT batch_run_id, batch_size, http_status, http_ok, response_note
FROM durable_hack.scoring_batches
ORDER BY batch_run_id;`,
    layer: 'pg_durable',
    layerTitle: 'How df.if_rows() Controls the Loop',
    layerExplanation:
      'df.if_rows(\'batch\', then_branch, else_branch) inspects the preceding SQL node: if rows > 0 it executes HTTP + write-back; when 0 pending rows remain, it runs df.break() to terminate the loop cleanly.',
  },
  {
    id: 'batch3',
    stepNumber: 5,
    title: 'Final Batch 3 of 3 (Rows 9-12) -> df.break()',
    shortLabel: 'Batch 3/3 -> df.break()',
    narration:
      'Batch 3 scores the remaining 4 rows (HTTP 200). On iteration 4, claim_shipment_batch(4) returns 0 rows, df.if_rows() triggers df.break(\'ALL_SCORED\'), and all 12 rows now hold risk scores and rationales.',
    sql: `SELECT shipment_id, supplier_code, scoring_status,
       risk_score, http_status, model_trace
FROM durable_hack.supplier_shipments
ORDER BY risk_score DESC NULLS LAST;`,
    layer: 'pg_durable',
    layerTitle: 'Zero External Orchestrator Needed',
    layerExplanation:
      'All 12 shipments were batched, scored over HTTPS with Entra-ID Bearer auth, and written back to Postgres with durable checkpointing—zero Airflow, zero Python workers, zero Kafka.',
  },
  {
    id: 'audit',
    stepNumber: 6,
    title: 'Prove Zero Secret Leaks & Scrub Ephemeral Token',
    shortLabel: 'Zero-leak audit (0 rows)',
    narration:
      'Audit every row of df.instance_nodes() to prove leaked_token_rows = 0, then scrub the ephemeral Entra JWT from USER MAPPING until native Managed Identity lands in pg_durable_fdw (BUG-08).',
    sql: `SELECT * FROM durable_hack.demo_verify_zero_token_leak();

ALTER USER MAPPING FOR CURRENT_USER
  SERVER abes_demo_aoai OPTIONS (SET token 'SCRUBBED');`,
    layer: 'pg_durable',
    layerTitle: 'Enterprise Secret Hygiene Verified',
    layerExplanation:
      'Scanning every persisted pg_durable node query and result confirms 0 leaked Bearer tokens. We also filed BUG-01 (ACA domain allow-list) and BUG-08 (native Managed Identity auth_type in pg_durable_fdw).',
  },
];

// =============================================================================
// APPLET 3: Knowledge Graph & AI Brain — Side-by-Side (AI Pipelines vs pg_durable)
// Grounded 100% in live runs 302fede6, 3a1b27da (AI Pipelines) & b52adb98 (pg_durable)
// =============================================================================
export const CUSTOMER_NOTES: CustomerNote[] = [
  {
    id: 1,
    sourceRef: 'hackathon/ml-partner-aca',
    customer: 'ML Partner',
    journeyPhaseDurable: 'Building',
    journeyPhasePipeline: 'Building',
    sentiment: 'blocked',
    extensions: ['pg_durable'],
    blocker: 'pg_durable.http_allowed_domains omits *.azurecontainerapps.io and *.services.ai.azure.com with no override.',
    preview: 'tabular model tabular inference via pg_durable df.http() calling Azure Container Apps (*.azurecontainerapps.io); APIM workaround with pg_durable_fdw.',
    cohereScores: { aca: 0.9841, tune: 0.142 },
    rrfScores: { aca: 0.032787, tune: 0.015625 },
  },
  {
    id: 2,
    sourceRef: 'customer-calls/mining-co',
    customer: 'Mining Co.',
    journeyPhaseDurable: 'Enterprise Hardening',
    journeyPhasePipeline: 'Enterprise Hardening',
    sentiment: 'blocked',
    extensions: ['pg_durable', 'azure_ai', 'hypopg'],
    blocker: 'Requires Verify-Before-Apply SQL tuning: redacted EXPLAIN, hypopg, DBA approval signal, CONCURRENTLY index, auto-rollback.',
    preview: 'Enterprise DBAs want ai.tune_sql orchestrated with pg_durable and Managed Models with human DBA approval via df.wait_for_signal.',
    cohereScores: { aca: 0.2104, tune: 0.9912 },
    rrfScores: { aca: 0.015873, tune: 0.032787 },
  },
  {
    id: 3,
    sourceRef: 'customer-calls/exchange-co',
    customer: 'Exchange Co.',
    journeyPhaseDurable: 'Building',
    journeyPhasePipeline: 'POC, Building',
    sentiment: 'positive',
    extensions: ['pg_diskann', 'pg_textsearch', 'azure_ai', 'age'],
    blocker: 'Evaluating unified Postgres AI search combining DiskANN SQ, BM25, Cohere rerank, and AGE knowledge graphs.',
    preview: 'Unified AI search combining pg_diskann spherical quantization (sq_bits=4), pg_textsearch BM25, Cohere v4 rerank, and Apache AGE.',
    cohereScores: { aca: 0.1932, tune: 0.2418 },
    rrfScores: { aca: 0.015625, tune: 0.016129 },
  },
  {
    id: 4,
    sourceRef: 'customer-calls/docai-startup',
    customer: 'DocAI Startup',
    journeyPhaseDurable: 'Building',
    journeyPhasePipeline: 'Building',
    sentiment: 'blocked',
    extensions: ['pg_durable', 'azure_ai'],
    blocker: 'Needs crash-safe batch checkpointing, pg_durable_fdw credential hygiene, and periodic bm25_force_merge compaction.',
    preview: 'Long-running document ingestion and agentic enrichment using pg_durable df.loop, pg_durable_fdw user mappings, and bm25_force_merge.',
    cohereScores: { aca: 0.6145, tune: 0.3125 },
    rrfScores: { aca: 0.031746, tune: 0.015873 },
  },
  {
    id: 5,
    sourceRef: 'customer-calls/global-bank',
    customer: 'Global Bank',
    journeyPhaseDurable: 'Enterprise Hardening',
    journeyPhasePipeline: 'Enterprise Hardening',
    sentiment: 'blocked',
    extensions: ['pg_durable', 'azure_ai'],
    blocker: 'Governance review flagged df.metrics() vs RLS visibility gap, outbound HTTP allow-lists, and clearer ai.generate errors.',
    preview: 'Enterprise Hardening governance review for pg_durable & azure_ai: auditor cross-role visibility, strict HTTP allow-lists, schema errors.',
    cohereScores: { aca: 0.8762, tune: 0.189 },
    rrfScores: { aca: 0.032258, tune: 0.015385 },
  },
  {
    id: 6,
    sourceRef: 'hackathon/age-interop',
    customer: 'HorizonDB',
    journeyPhaseDurable: 'Building',
    journeyPhasePipeline: 'Building',
    sentiment: 'mixed',
    extensions: ['age', 'pg_durable', 'azure_ai', 'pg_diskann', 'pg_textsearch'],
    blocker: 'AGE 1.8.0 requires azure.extensions allow-list + shared_preload_libraries (without calling LOAD age) before graph pipelines run.',
    preview: 'All 5 extensions live together on HorizonDB GA preview: pg_durable 0.2.9, azure_ai 2.5.6, pg_diskann 0.7.6, pg_textsearch 1.5.1, age 1.8.0.',
    cohereScores: { aca: 0.421, tune: 0.2284 },
    rrfScores: { aca: 0.016129, tune: 0.015625 },
  },
];

export const APPLET3_PIPELINE_STEPS: WalkthroughStep[] = [
  {
    id: 'ontology',
    stepNumber: 1,
    title: 'Register Graph Ontology with ai.create_graph()',
    shortLabel: 'ai.create_graph() ontology',
    narration:
      'Declare allowed node labels (Customer, Extension, Blocker), identity keys, disp_label (for VS Code Graph Visualizer), and edge types in one JSONB ontology—no manual Cypher DDL needed.',
    sql: `SELECT ai.create_graph(
  name => 'horizondb_ai_kg_pipelines',
  ontology => '{
    "nodes": [
      {"label": "Customer",  "identity": "customer_name",   "properties": ["customer_name","journey_phase","sentiment","disp_label"]},
      {"label": "Extension", "identity": "extension_name",  "properties": ["extension_name","disp_label"]},
      {"label": "Blocker",   "identity": "blocker_summary", "properties": ["blocker_summary","disp_label"]}
    ],
    "edges": [
      {"label": "USES",       "from": "Customer", "to": "Extension"},
      {"label": "BLOCKED_BY", "from": "Customer", "to": "Blocker"}
    ]
  }'::jsonb
);`,
    layer: 'ai_pipelines',
    layerTitle: 'AI Pipelines: Declarative Ontology-First Graph',
    layerExplanation:
      'For well-known knowledge graph patterns, AI Pipelines enforces your schema upfront in ai.graphs and auto-creates Apache AGE vertex labels—eliminating hand-written Cypher MERGE scripts.',
  },
  {
    id: 'extract',
    stepNumber: 2,
    title: 'Run Stage 1: ai.extract_step() Pipeline',
    shortLabel: 'Stage 1: ai.run(extract)',
    narration:
      'Call ai.run(\'hack_kg_extract_pipeline\'). Look closely at the return message: "started durably (instance: 302fede6)"—AI Pipelines compiles directly down to pg_durable under the hood!',
    sql: `SELECT ai.run('hack_kg_extract_pipeline');
-- -> Pipeline 'hack_kg_extract_pipeline' started durably (instance: 302fede6)

SELECT name, last_run_status, total_processed,
       last_run_instance_id, last_run_failed_nodes
FROM ai.status('hack_kg_extract_pipeline');`,
    layer: 'ai_pipelines',
    layerTitle: 'Powered by pg_durable Under the Hood!',
    layerExplanation:
      'Inspecting df.instance_nodes(\'302fede6\') reveals that AI Pipelines automatically generated batch tables, ai.extract() calls, ON CONFLICT upserts, and watermark checkpoints on pg_durable for you.',
  },
  {
    id: 'validate',
    stepNumber: 3,
    title: 'SQL Validation Gate Before Graph Load',
    shortLabel: 'Validate & reshape JSONB',
    narration:
      'Per Microsoft Learn guidance, validate extracted metadata and reshape comma-separated extensions into ontology-aligned JSONB fragments before loading Apache AGE. Notice Exchange Co. extracted "POC, Building" (loose string vs strict enum).',
    sql: `SELECT * FROM durable_hack.build_ai_pipeline_graph_fragments();
-- -> validated_fragments: 6, skipped_rows: 0`,
    layer: 'ai_pipelines',
    layerTitle: 'Where AI Pipelines Leaves Room for Custom Glue',
    layerExplanation:
      'ai.extract_step() is fast and declarative, but doesn\'t enforce strict JSON Schema enums or stitch Stage 1 -> SQL validation -> Stage 2 automatically. That boundary is exactly where custom pg_durable shines.',
  },
  {
    id: 'graphsink',
    stepNumber: 4,
    title: 'Run Stage 2: Declarative ai.graph_sink() -> Apache AGE',
    shortLabel: 'Stage 2: ai.graph_sink()',
    narration:
      'One call to ai.run(\'hack_kg_graph_pipeline\') idempotently upserts 6 Customers, 6 Extensions, 6 Blockers, and 23 USES/BLOCKED_BY edges into horizondb_ai_kg_pipelines in ~1.2 seconds!',
    sql: `SELECT ai.run('hack_kg_graph_pipeline');
-- -> Pipeline 'hack_kg_graph_pipeline' started durably (instance: 3a1b27da)

SELECT * FROM durable_hack.demo_ai_pipelines_age_graph();`,
    layer: 'ai_pipelines',
    layerTitle: 'Idempotent Replay + Incremental Watermarks Built In',
    layerExplanation:
      'Re-running hack_kg_graph_pipeline never duplicates nodes or edges, tracks fragment_id watermarks automatically, and sets disp_label so VS Code Graph Visualizer renders clean labels immediately.',
  },
];

export const APPLET3_DURABLE_STEPS: WalkthroughStep[] = [
  {
    id: 'audit',
    stepNumber: 1,
    title: 'Step 1 of DAG: Self-Audit pg_durable Usage (BUG-02)',
    shortLabel: 'Self-audit df.metrics()',
    narration:
      'Because this is custom open-source pg_durable, we start the workflow by auditing pg_durable itself—comparing cluster-wide df.metrics() (23 runs) vs caller-visible RLS rows (14 runs) to surface BUG-02.',
    sql: `SELECT durable_hack.start_internal_ai_brain_workflow(
  'hack-internal-5ext-demo-live'
);

SELECT auditor_role, cluster_total_instances,
       caller_visible_instances, rls_visibility_gap
FROM durable_hack.usage_audit_snapshots
ORDER BY snapshot_id DESC LIMIT 1;`,
    layer: 'pg_durable',
    layerTitle: 'Open-Source pg_durable: Arbitrary Custom Steps',
    layerExplanation:
      'AI Pipelines only runs predefined step types (chunk, embed, extract, rank, graph_sink). With pg_durable, any SQL function—including governance audits or cross-extension maintenance—becomes a durable node.',
  },
  {
    id: 'enrich',
    stepNumber: 2,
    title: 'Step 2: Durable Loop (Embed + Strict JSON Schema KG)',
    shortLabel: 'df.loop: embed + extract',
    narration:
      'df.loop + df.if_rows processes each unprocessed note: generates 1536-dim vectors (default-embedding) AND calls ai.generate() with strict json_schema enums (guaranteed valid journey_phase & arrays).',
    sql: `SELECT * FROM durable_hack.demo_brain_nodes();
-- LOOP: claim_next_unprocessed_note() -> IF_ROWS
--   -> enrich_and_graph_note(note_id)  [ai.embed + ai.generate strict]
--   -> BREAK('ALL_NOTES_ENRICHED')`,
    layer: 'pg_durable',
    layerTitle: 'Full Control Over Extraction Schema & Checkpoints',
    layerExplanation:
      'Unlike ai.extract_step(), direct ai.generate() inside a pg_durable loop enforces strict JSON Schema enums ("Building", "Enterprise Hardening") and updates embeddings + relational KG tables in one atomic transaction.',
  },
  {
    id: 'indexes',
    stepNumber: 3,
    title: 'Step 3: Build DiskANN SQ + BM25 + bm25_force_merge() + AGE',
    shortLabel: 'DiskANN SQ + BM25 + AGE',
    narration:
      'After the loop completes, the SAME durable workflow builds pg_diskann (Spherical Quantization sq_bits=4), builds pg_textsearch BM25, runs bm25_force_merge(), and syncs Apache AGE Cypher edges!',
    sql: `CREATE INDEX IF NOT EXISTS idx_notes_diskann
  ON durable_hack.customer_ai_notes
  USING diskann (embedding vector_cosine_ops)
  WITH (spherical_quantized = true, sq_bits = 4);

SELECT public.bm25_force_merge('durable_hack.idx_notes_bm25');
SELECT durable_hack.sync_kg_to_age_if_enabled();`,
    layer: 'pg_durable',
    layerTitle: 'All 5 HorizonDB AI Extensions in ONE Durable DAG',
    layerExplanation:
      'AI Pipelines does not orchestrate DiskANN Spherical Quantization index builds, BM25 segment compaction (bm25_force_merge), or custom multi-sink pipelines. Open-source pg_durable stitches all 5 extensions together.',
  },
  {
    id: 'hybrid',
    stepNumber: 4,
    title: 'Step 4: Unified Hybrid Search (DiskANN + BM25 + Cohere v4)',
    shortLabel: 'Hybrid RRF + Cohere v4',
    narration:
      'Query everything from a single SQL call: DiskANN vector similarity + BM25 lexical rank fused via RRF, semantically reranked with Cohere v4 (ai.rank), and enriched with KG edges.',
    sql: `SELECT final_rank, cohere_score, rrf_score,
       customer_name, journey_phase, extensions_used
FROM durable_hack.ask_ai_stack(
  'Which customers need pg_durable with Azure Container Apps or enterprise governance blockers?', 4
);`,
    layer: 'ai_functions',
    layerTitle: 'All 3 Layers Working Together in Postgres',
    layerExplanation:
      'Zero external vector DBs, zero Elasticsearch, zero Neo4j, zero Airflow. pg_durable handles custom durable orchestration, DiskANN + BM25 + AGE store and index, and AI Functions power live retrieval & reranking.',
  },
];
