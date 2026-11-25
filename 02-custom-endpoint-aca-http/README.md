# Applet 2: ML Partner / Azure OpenAI Durable HTTPS Scoring (`df.http` + `pg_durable_fdw`)

Demonstrates how **`pg_durable` (`0.2.9`)** orchestrates **durable, watermarked, secret-safe HTTPS inference calls** from Azure HorizonDB to an external model endpoint — using **`https://my-ai-foundry.openai.azure.com/`** (`gpt-5.4`, allow-listed via `*.openai.azure.com`) as the live scoring endpoint in place of ML Partner' Azure Container Apps endpoint (`*.azurecontainerapps.io`, currently blocked by `BUG-01`).

## Key Engineering & Security Patterns Tested

1. **Entra-ID-Only Auth Gap (`BUG-08`, P1 — SFI / Enterprise Blocker):**
   - `https://my-ai-foundry.openai.azure.com/` enforces **`disableLocalAuth = true`** (Entra ID required — standard Microsoft SFI / enterprise Azure AI policy).
   - **Live Finding (`BUG-08`, P1):** `pg_durable_fdw` only supports **static credentials** (`auth_scheme` allowed values: `none`, `bearer`, `header`, `query` — no `managed_identity` or `entra_id`!). Calling `my-ai-foundry.openai.azure.com` with a static `api-key` returns **HTTP 401**, AND a workflow **cannot self-mint or refresh an Entra JWT** because both IMDS (`http://169.254.169.254/...`) and `https://login.microsoftonline.com/...` are blocked in `restricted` mode!
   - **Demo Workaround Today:** Inject a short-lived Entra bearer JWT into `USER MAPPING FOR CURRENT_USER SERVER abes_demo_aoai OPTIONS (SET token '...')` immediately before running (and scrub after). Note that this breaks long-running workflows (>1 hour) once the JWT expires — making native Managed Identity / Entra ID auth in `pg_durable_fdw` a P1 enterprise requirement.
2. **Live Azure Container Apps (`*.azurecontainerapps.io`) Domain Allow-List Gap (`BUG-01`, P1):**
   - HorizonDB GA preview's `pg_durable.http_allowed_domains` omits `*.azurecontainerapps.io`, `*.azurecontainer.io`, `*.services.ai.azure.com`, and `*.ml.azure.com` (contradicting upstream `docs/http-security.md` §5.2), with no Parameter Group override.
   - `*.openai.azure.com` **is** allow-listed, making `https://my-ai-foundry.openai.azure.com/` an ideal live testbed for the exact same durable batched HTTPS scoring pattern.
3. **Secret Hygiene (`pg_durable_fdw` `auth_scheme 'bearer'` vs `df.setvar()`):**
   - Keeps the bearer token strictly inside PostgreSQL's `USER MAPPING` — verified via `df.instance_nodes()` that **zero token characters** leak into durable workflow history (`SKILL-01`).
4. **Explicit Batch Watermark Checkpointing (`df.loop` + `df.if_rows`):**
   - Because `df.http()` has no automatic retry on 5xx/timeouts (`DOC-01`), each batch of 4 rows is claimed, scored via structured JSON `gpt-5.4` output, and atomically written back (`risk_score`, `http_status`, `model_trace`, `scored_at`), with 4xx/401 responses cleanly dead-lettered.

## Running Against `https://my-ai-foundry.openai.azure.com/`

```bash
# 1. Mint a short-lived Entra ID token for Azure OpenAI (expires ~1h — see BUG-08)
AOAI_TOKEN=$(az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv)

# 2. Inject into USER MAPPING (never hardcoded in SQL or df.setvar) and run
ALTER USER MAPPING FOR CURRENT_USER SERVER abes_demo_aoai OPTIONS (SET token '<AOAI_TOKEN>');
SELECT durable_hack.start_ml_partner_scoring();

# 3. Scrub token when finished
ALTER USER MAPPING FOR CURRENT_USER SERVER abes_demo_aoai OPTIONS (SET token 'SCRUBBED');
```

## Customer Demo Story (What to Show Customers)

> **Title:** *"In-Database Tabular Foundation Models — Zero Python Glue, Zero Leaked Secrets"*
> **Target Audience:** Financial services, supply chain, and ML platform teams (e.g., **ML Partner / tabular model**, **Exchange Co.**, **Mining Co.**, **DocAI Startup**) running specialized ML models on Azure Container Apps / Azure ML that need continuous scoring on operational PostgreSQL rows.

### 5-Minute Live Demo Script

1. **The Pain (30 sec):** Today, teams running tabular model or custom Python ML models on Azure Container Apps have to deploy a separate orchestrator (Airflow, Celery, or Azure Functions) to poll Postgres, pull batches, inject API keys, handle partial crashes, and write predictions back — duplicating state and risking double-scored or dropped rows.
2. **Declare a Secret-Safe Endpoint Once in SQL (60 sec):** Show `CREATE SERVER ... FOREIGN DATA WRAPPER pg_durable_fdw` + `CREATE USER MAPPING ... OPTIONS ("secret.api_key" '...')`. Explain: *"Credentials live in PostgreSQL's own `USER MAPPING` — never inside workflow definitions, logs, or `duroxide` execution history."*
3. **Run the Durable Batched Watermark Scorer (90 sec):** Launch `SELECT durable_hack.start_ml_partner_scoring(...)`. Open **VS Code → Pipelines & Workflows → Workflows** and watch the `df.loop` + `df.if_rows` + `df.http(df.endpoint(...))` graph pull batches of `durable_hack.supplier_shipments`, invoke the HTTPS scoring endpoint, atomically persist predictions (`risk_score`, `http_status`, `scored_at`), and advance the watermark until zero pending rows remain.
4. **Show the Audit & Secret-Leak Proof (45 sec):** Query `df.instance_nodes('<instance_id>')` on screen — show that the full execution DAG, timing, HTTP status, and batch checkpoints are auditable, while the API key is **completely absent** from history.
5. **Show the HorizonDB Domain Policy & Enterprise Governance Story (45 sec):** Explain `pg_durable.http_security = 'restricted'` (SSRF protection by default, zero private-IP/IMDS access, allow-listed Azure domains — and call out our hackathon finding to add `*.azurecontainerapps.io` and `*.services.ai.azure.com` to HorizonDB's default allow-list).

## Files

- [`custom_endpoint_http_applet.sql`](./custom_endpoint_http_applet.sql) — Runnable script covering:
  - Probe 2A: Live `*.azurecontainerapps.io` allow-list test (reproduces `BUG-01`).
  - Probe 2B: `df.endpoint()` + `df.secret()` + `df.with_http_options()` secret-hygiene setup & zero-leak verification against live allow-listed HTTPS.
  - Probe 2C: Complete batched watermark scoring workflow (`df.loop` + `df.if_rows` + `df.http` + idempotent write-back) ready to point at a live ML Partner / tabular model ACA endpoint (or APIM `*.azure-api.net` facade today).

## Extensions Exercised

- `pg_durable` (`0.2.9`) — `df.http`, `df.endpoint`, `df.secret`, `df.with_http_options`, `df.loop`, `df.if_rows`, `df.if`, `df.sql`, `df.await_instance`, `df.instance_nodes`
