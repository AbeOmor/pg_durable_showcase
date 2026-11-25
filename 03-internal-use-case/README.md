# Applet 3: Knowledge Graph & AI Brain — Side-by-Side (`AI Pipelines` vs. Custom `pg_durable`)

This applet ships **TWO complete, live-verified versions** on the **exact same 6 customer notes** so customers can see the exact architectural boundary:

| Dimension | **Version A: AI Pipelines** (`ai_pipelines_kg_applet.sql`) | **Version B: Custom `pg_durable`** (`internal_applet.sql`) |
|---|---|---|
| **When to choose** | **Well-known, repeatable AI workflows** (standard extraction + ontology-enforced Knowledge Graph) | **Open-source, arbitrarily custom workflows** (cross-extension orchestration, strict JSON schemas, self-auditing, custom search/rerank/maintenance) |
| **Live Demo Script** | [`demo_walkthrough_ai_pipelines.sql`](./demo_walkthrough_ai_pipelines.sql) | [`demo_walkthrough.sql`](./demo_walkthrough.sql) |
| **Apache AGE Graph** | `horizondb_ai_kg_pipelines` (`Customer`, `Extension`, `Blocker` + `USES` & `BLOCKED_BY`) | `horizondb_ai_kg` (`Customer` → `USES` → `Extension`) + relational `kg_nodes`/`kg_edges` |
| **Orchestration** | Declarative `ai.create_graph` + `ai.create_pipeline` (`ai.extract_step` + `ai.graph_sink`) — **still powered by `pg_durable` under the hood!** | Direct open-source `pg_durable` (`df.sql`, `df.loop`, `df.if_rows`, `df.start`) |
| **Extra capabilities** | Built-in ontology validation, `disp_label` for VS Code Graph Visualizer, zero hand-written Cypher `MERGE` | Cluster self-audit (`df.metrics` vs RLS), strict `json_schema` enums, DiskANN SQ (`sq_bits = 4`), BM25 + `bm25_force_merge()`, Cohere v4 hybrid rerank |

Run `SELECT * FROM durable_hack.demo_compare_kg_versions();` at the end of either walkthrough to display both Apache AGE graphs side-by-side!

---

## Deep Dive on Version B (Custom `pg_durable` — All-5-Extension AI Brain)

A hybrid internal-PM + multi-extension showcase applet proving how **one `pg_durable` workflow** can both:
1. **Audit how `pg_durable` itself is being used** (`df.metrics()`, `df.list_instances(..., label_filter, after_cursor)`, `df.instance_executions()`, status/error breakdown, and cross-role RLS visibility gap detection — directly exposing `BUG-02`), **and**
2. **Orchestrate the full HorizonDB AI extension stack** in a single durable pipeline:
   - **`pg_durable` (`0.2.9`)** — durable batched ingestion loop (`df.loop` + `df.if_rows`), usage self-audit, and post-batch index maintenance.
   - **`azure_ai` (`2.5.6`)** — Managed Models `default-embedding` (`text-embedding-3-small`), `default-chat` (`gpt-5.4` structured JSON entity/triple extraction), and `default-reranker` (`Cohere-rerank-v4.0-fast`).
   - **`pg_diskann` (`0.7.6`)** — ANN vector index using **Spherical Quantization** (`spherical_quantized = true, sq_bits = 4` — per HorizonDB best practice).
   - **`pg_textsearch` (`1.5.1`)** — BM25 full-text index (`USING bm25`), `<@>` + `to_bm25query()` inside PL/pgSQL, and durable post-batch `bm25_force_merge()` maintenance.
   - **Apache `AGE` (`1.8.0`)** — Graph model (`Customer -[USES]-> Extension`, `Customer -[BLOCKED_BY]-> Blocker`) with live relational-graph projection today AND a ready-to-enable `AGE` Cypher / `ai.create_graph` + `ai.graph_sink` module once `age` is added to `azure.extensions` + `shared_preload_libraries`.

## Customer Demo Story (What to Show Customers)

> **Title:** *"One Database, Five AI Engines — Orchestrated Durably in Pure SQL"*
> **Target Audience:** AI Architects, CTOs, and Platform PMs evaluating HorizonDB against fragmented "vector DB + search engine + graph DB + workflow orchestrator" stacks (e.g., **Exchange Co.**, **DocAI Startup**, **Mining Co.**, **Global Bank**).

### 5-Minute Live Demo Script

1. **The Pain (30 sec):** Today, building an enterprise knowledge assistant (or internal product telemetry brain) forces teams to stitch together 5 separate services: Pinecone/Qdrant for vectors, Elasticsearch for BM25, Neo4j for entity graphs, Temporal/Airflow for durable ingestion & maintenance, and a Python worker to call LLMs and rerankers.
2. **Kick Off One Durable Multi-Extension Workflow (60 sec):** Run `SELECT durable_hack.start_internal_ai_brain_workflow()`. Open **VS Code → Pipelines & Workflows → Workflows** and trace the single visual DAG:
   - **Node 1 (Self-Audit):** Captures a live `pg_durable` usage telemetry snapshot (workflows by label, success/failure counts, avg execution duration, plus role-visibility delta).
   - **Node 2 (Durable AI Enrichment Loop):** `df.loop` + `df.if_rows` processes every new customer/product note — generating 1536-dim embeddings (`default-embedding`) AND extracting structured `(Customer, Extensions, Blocker, Journey Phase)` graph triples via `gpt-5.4` (`default-chat`).
   - **Node 3 (Durable Search & Vector Index Maintenance):** Builds/maintains the **`pg_diskann` (Spherical Quantization)** vector index + **`pg_textsearch` BM25** index and invokes durable BM25 segment merge (`bm25_force_merge`) inside the workflow.
3. **Run One Unified Hybrid + Reranked + Graph-Enriched Query (90 sec):** Execute:
   ```sql
   SELECT * FROM durable_hack.ask_ai_stack('Which customers are blocked by Azure Container Apps HTTP allow-list or need safe SQL tuning?');
   ```
   Show the returned ranked rows combining **DiskANN vector similarity + BM25 lexical score + RRF fusion + Cohere v4 semantic rerank score + extracted Knowledge Graph edges (`Customer -> Extension -> Blocker`)** — all from **one SQL function call**.
4. **Show the Self-Auditing Telemetry View (45 sec):** Query `durable_hack.usage_audit_snapshots` and `durable_hack.v_workflow_usage_summary` to show internal PMs/operators exactly which `pg_durable` applets are running, how many executions succeeded/failed, and where workflow bottlenecks sit.
5. **The Punchline (30 sec):** *"Zero ETL pipelines, zero external vector/search/graph databases, zero API keys in code — `pg_durable` turns HorizonDB's AI extensions into one cohesive, crash-proof AI application platform."*

## Files

- [`internal_applet.sql`](./internal_applet.sql) — Complete runnable script: usage auditor, customer/AI knowledge base, durable 5-extension enrichment & maintenance workflow, hybrid RRF + Cohere rerank + graph search function, and optional Apache `AGE` Cypher sync module.

## Extensions Exercised

- `pg_durable` (`0.2.9`) — `df.loop`, `df.if_rows`, `df.sql`, `df.metrics`, `df.list_instances`, `df.instance_executions`, `df.await_instance`
- `azure_ai` (`2.5.6`) — `ai.embed`, `ai.generate` (structured JSON), `ai.rank` (Cohere rerank v4)
- `pg_diskann` (`0.7.6`) — `USING diskann (embedding vector_cosine_ops) WITH (spherical_quantized = true, sq_bits = 4)`
- `pg_textsearch` (`1.5.1`) — `USING bm25`, `<@>`, `to_bm25query`, `bm25_force_merge`
- `age` (`1.8.0`) — guarded Cypher / `ai.create_graph` + `ai.graph_sink` blueprint (auto-activates when `age` is enabled in `azure.extensions` + `shared_preload_libraries`)
