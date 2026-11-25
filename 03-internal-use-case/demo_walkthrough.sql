-- =============================================================================
-- Applet 3 Live Demo Walkthrough: Internal Usage Auditor & All-5-Extension AI Brain
-- =============================================================================
-- Highlight ONE line at a time and press Cmd+Shift+E (Run Query) in VS Code.
-- Exercises ALL 5 HorizonDB AI extensions in one durable workflow:
--   pg_durable + azure_ai (embed/generate/rank) + pg_diskann (SQ) + pg_textsearch (BM25) + Apache AGE (Cypher)
-- =============================================================================

-- 0. (OPTIONAL) RESET FOR A FRESH LIVE RUN: Clear embeddings/KG so you can watch pg_durable rebuild everything from scratch.
SELECT durable_hack.demo_reset_ai_brain();

-- 1. SHOW RAW UNPROCESSED CUSTOMER NOTES: 6 real customer/hackathon notes with NULL embeddings and NULL KG extractions.
SELECT note_id, customer_hint, left(note_body, 90) AS preview, (embedding IS NOT NULL) AS embedded, processed_at FROM durable_hack.customer_ai_notes ORDER BY note_id;

-- 2. START THE ALL-5-EXTENSION PG_DURABLE WORKFLOW: Audits pg_durable -> embeds & extracts KG -> builds DiskANN SQ & BM25 -> runs bm25_force_merge -> syncs Apache AGE!
SELECT durable_hack.start_internal_ai_brain_workflow('hack-internal-5ext-demo-live');

-- 3. WATCH PG_DURABLE PROGRESS TO COMPLETED: Re-run until status = "completed" (~15-20s for 6 notes + indexes + AGE sync).
SELECT instance_id, label, status, created_at, completed_at FROM df.list_instances(NULL, 5, NULL, NULL) ORDER BY created_at DESC;

-- 4. INSPECT EVERY PG_DURABLE STEP: See self-audit -> LOOP(enrich_and_graph_note) -> DiskANN -> BM25 -> bm25_force_merge -> AGE Cypher sync.
SELECT * FROM durable_hack.demo_brain_nodes();

-- 5. SHOW INTERNAL PG_DURABLE USAGE AUDIT (SURFACES BUG-02): Compare cluster-wide df.metrics() vs caller-visible RLS rows!
SELECT snapshot_id, auditor_role, cluster_total_instances, cluster_completed, cluster_failed, caller_visible_instances, rls_visibility_gap FROM durable_hack.usage_audit_snapshots ORDER BY snapshot_id DESC LIMIT 3;

-- 6. SHOW EXTRACTED CUSTOMER KNOWLEDGE GRAPH (RELATIONAL): Customer -> USES -> Extension & BLOCKED_BY -> Blocker.
SELECT src.node_key AS customer, e.edge_type, dst.node_key AS target FROM durable_hack.kg_edges e JOIN durable_hack.kg_nodes src ON src.node_id = e.src_id JOIN durable_hack.kg_nodes dst ON dst.node_id = e.dst_id ORDER BY 1, 2, 3;

-- 7. QUERY THE LIVE APACHE AGE CYPHER GRAPH: Real Cypher MATCH (c:Customer)-[:USES]->(e:Extension) populated by pg_durable!
SELECT * FROM durable_hack.demo_age_cypher_graph();

-- 8. RUN UNIFIED HYBRID SEARCH (DiskANN SQ + BM25 RRF + Cohere v4 Reranker + KG): Ask a natural-language PM question!
SELECT final_rank, cohere_score, rrf_score, customer_name, journey_phase, extensions_used, blocker_summary FROM durable_hack.ask_ai_stack('Which customers need pg_durable with Azure Container Apps or enterprise governance blockers?', 4);

-- 9. TRY A SECOND HYBRID + RERANKED QUERY: Find who needs verify-before-apply SQL tuning and non-blocking indexes!
SELECT final_rank, cohere_score, rrf_score, customer_name, journey_phase, extensions_used, blocker_summary FROM durable_hack.ask_ai_stack('Which customer wants safe AI SQL tuning with DBA approval and CREATE INDEX CONCURRENTLY?', 4);
