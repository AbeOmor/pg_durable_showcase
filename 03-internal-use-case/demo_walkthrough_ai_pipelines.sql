-- =============================================================================
-- Applet 3 (Version A) Live Demo Walkthrough: Declarative AI Pipelines Knowledge Graph
-- =============================================================================
-- Highlight ONE line at a time and press Cmd+Shift+E (Run Query) in VS Code.
--
-- Compare this side-by-side with `demo_walkthrough.sql` (Version B — Custom pg_durable):
--   * THIS FILE (AI Pipelines): Well-known declarative workflow using `ai.create_graph()`,
--     `ai.extract_step()`, and `ai.graph_sink()`. Minimal SQL, ontology validation,
--     disp_label for VS Code Graph Visualizer, zero Cypher MERGE loops — AND still
--     powered by `pg_durable` under the hood!
--   * `demo_walkthrough.sql` (Custom pg_durable): Open-source `pg_durable` when you want
--     full custom control (strict JSON-schema enums, df.metrics self-audit, DiskANN SQ,
--     BM25 + bm25_force_merge, Cohere v4 reranking, custom graph logic).
-- =============================================================================

-- 0. (OPTIONAL) RESET FOR A FRESH LIVE RUN: Clears staging/fragments and re-registers both pipelines.
SELECT durable_hack.demo_reset_ai_pipelines_kg();

-- 1. INSPECT THE REGISTERED ONTOLOGY & PIPELINES: Zero hand-written Cypher MERGE — pure declarative metadata.
SELECT name, jsonb_pretty(ontology) AS ontology FROM ai.graphs WHERE name = 'horizondb_ai_kg_pipelines';

-- 2. INSPECT THE COMPILED PIPELINE PLAN: See how AI Pipelines wires source -> ai.extract_step -> sink.
SELECT ai.explain('hack_kg_extract_pipeline');

-- 3. RUN STAGE 1 (UNSTRUCTURED EXTRACTION PIPELINE): Notice it returns a real pg_durable instance ID!
SELECT ai.run('hack_kg_extract_pipeline');

-- 4. WATCH STAGE 1 COMPLETE & SEE PG_DURABLE UNDER THE HOOD: Re-run until last_run_status = 'completed' (~12s).
SELECT name, last_run_status, total_processed, last_run_instance_id, last_run_failed_nodes FROM ai.status('hack_kg_extract_pipeline');

-- 5. INSPECT THE RAW LLM EXTRACTIONS IN STAGING: See the JSONB metadata written by ai.extract_step().
SELECT note_seq, customer_hint, metadata FROM durable_hack.ai_pipe_extracted_notes ORDER BY note_seq;

-- 6. VALIDATE & NORMALIZE INTO ONTOLOGY-ALIGNED FRAGMENTS: Safety gate between LLM extraction and Apache AGE load.
SELECT * FROM durable_hack.build_ai_pipeline_graph_fragments();

-- 7. RUN STAGE 2 (DETERMINISTIC GRAPH SINK PIPELINE): Idempotent Apache AGE upserts into horizondb_ai_kg_pipelines!
SELECT ai.run('hack_kg_graph_pipeline');

-- 8. CONFIRM STAGE 2 COMPLETED (~1-2s): Also exposes last_run_instance_id on pg_durable!
SELECT name, last_run_status, total_processed, last_run_instance_id, last_run_failed_nodes FROM ai.status('hack_kg_graph_pipeline');

-- 9. QUERY THE LIVE APACHE AGE GRAPH POPULATED BY AI PIPELINES: Real Cypher across USES + BLOCKED_BY edges!
SELECT * FROM durable_hack.demo_ai_pipelines_age_graph();

-- 10. SIDE-BY-SIDE COMPARISON (AI PIPELINES vs. CUSTOM PG_DURABLE): Same 6 notes, two architectural tiers!
SELECT * FROM durable_hack.demo_compare_kg_versions();
