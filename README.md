# `pg_durable` HorizonDB GA Hackathon Workspace

A self-contained VS Code workspace for end-to-end testing of **`pg_durable` (v0.2.9)** on **Azure HorizonDB (GA Preview)** — exploring multi-extension interoperability across `azure_ai`, `pg_diskann`, `pg_textsearch`, Apache `AGE`, `hypopg`, and `pg_hint_plan`, capturing **product bugs, doc bugs, and skill bugs**, and packaging **3 customer-ready applets with demo stories**.

## Open in VS Code

1. Open this folder in VS Code.
2. Install recommended extensions (prompted automatically from `.vscode/extensions.json`), especially **`ms-ossdata.vscode-pgsql`** (PostgreSQL extension for VS Code).
3. Connect to your HorizonDB ReadWrite endpoint via **Azure MFA** (add a connection profile for your cluster).
4. Open the **Pipelines & Workflows → Workflows** panel in the PostgreSQL sidebar to inspect **PG Durable Runs** visually (Execution Graph, Timing Waterfall, and Node Results) as you run each applet.

## Workspace Layout

| Folder / File | Purpose |
|---|---|
| [`HACKATHON_LOG.md`](./HACKATHON_LOG.md) | Master tracker: environment snapshot, extension interop matrix, exploration journal, ADO-ready Product Bugs, Doc Bugs, Skill Bugs, and Customer Demo Story index |
| [`00-preflight/extensions_and_http_preflight.sql`](./00-preflight/extensions_and_http_preflight.sql) | Read-only cluster preflight: extension versions, GUCs, `pg_durable` worker health, registered AI models, and HTTP domain allow-list audit |
| [`01-ai-tune-sql/`](./01-ai-tune-sql/README.md) | **Applet 1 — `ai.tune_sql` Durable Verify-Before-Apply Optimizer** (aligned with `microsoft/azure-ai#233`: safe redacted `EXPLAIN`, `ai.generate` JSONB proposal, `hypopg` / `E0–E3` evidence, `df.wait_for_signal` human approval, durable apply, monitor & auto-revert) |
| [`02-custom-endpoint-aca-http/`](./02-custom-endpoint-aca-http/README.md) | **Applet 2 — ML Partner / tabular model Durable HTTPS Scoring (`df.http` → ACA)** (batched watermark scoring, `df.endpoint()` + `df.secret()` + `df.with_http_options()` secret hygiene, explicit 5xx/retry handling, live `*.azurecontainerapps.io` allow-list probe & APIM workaround) |
| [`03-internal-use-case/`](./03-internal-use-case/README.md) | **Applet 3 — Internal `pg_durable` Usage Auditor & All-5-Extension AI Knowledge Graph** (`pg_durable` + `azure_ai` + `pg_diskann` SQ + `pg_textsearch` BM25 + Apache `AGE` graph blueprint, with hybrid RRF + Cohere reranking) |

## Quick Run via `psql` (Entra ID)

```bash
export HDB_HOST="<your-cluster>.rw.<cluster-id>.<region>.horizondb.azure.com"
export HDB_USER="you@example.com"
export PGPASSWORD="$(az account get-access-token --resource https://ossrdbms-aad.database.windows.net --query accessToken -o tsv)"

psql "host=$HDB_HOST port=5432 dbname=postgres user=$HDB_USER sslmode=require" \
  -f 00-preflight/extensions_and_http_preflight.sql
```

> All hackathon objects live in an isolated schema (`durable_hack`) so existing cluster schemas (such as `ignite_pipeline_demo`) remain untouched.

## Showcase site

An interactive walkthrough of all three applets lives in [`showcase-app/`](./showcase-app/README.md) and is deployed to **https://abeomor.github.io/pg_durable_showcase/**.

Customer names in this repository are anonymized.
