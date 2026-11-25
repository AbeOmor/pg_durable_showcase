# `pg_durable` HorizonDB GA Hackathon — Master Exploration & Bug Log

> **Owner:** Abe Omorogbe (PM, AI + PostgreSQL)
> **Workspace:** this repository, opened as a VS Code folder
> **Target Environment:** Azure HorizonDB GA Preview (`demo-horizondb`, `japaneast`, PostgreSQL `17.11`)
> **Isolated Schema:** `durable_hack` (zero impact on existing `ignite_pipeline_demo` / `public` objects)

---

## 1. Environment Snapshot (Verified Live)

| Property | Live Value |
|---|---|
| Cluster | `demo-horizondb` (RG: `<resource-group>`, Region: `japaneast`, 2 vCores, ZoneRedundant) |
| RW Endpoint | `<your-cluster>.rw.<cluster-id>.<region>.horizondb.azure.com` |
| Server Version | `PostgreSQL 17.11 (Azure HorizonDB (532bbf654b7)(release))` |
| Parameter Group | `hdb-nov11-2026-textsearch` |
| `shared_preload_libraries` | `pg_durable,pg_textsearch,age,pg_stat_statements,azure,orion_storage,pg_availability,pg_qs,pgms_stats,pgms_wait_sampling,pgaadauth,horizondb_ext` |
| `azure.extensions` | `azure_ai,pg_diskann,pg_durable,vector,pg_textsearch,age,pg_hint_plan,pg_stat_statements` |
| Installed AI & Tuning Extensions | `pg_durable 0.2.9` (built `2026-11-02T23:23:59Z`), `azure_ai 2.5.6`, `pg_diskann 0.7.6`, `pg_textsearch 1.5.1`, `vector 0.8.7`, `age 1.8.0`, `pg_hint_plan 1.7.0`, `pg_stat_statements 1.11` |
| Available on Cluster but NOT in `azure.extensions` `allowedValues` | `hypopg 1.4.1`, `pg_qs 2.9` |
| Managed Models (`model_registry`) | `default-chat` (`gpt-5.4`), `default-embedding` (`text-embedding-3-small`), `default-reranker` (`Cohere-rerank-v4.0-fast`) |
| `pg_durable.http_security` | `restricted` (`context = postmaster`) |
| `pg_durable.http_allowed_domains` | `*.blob.core.windows.net`, `*.blob.storage.azure.net`, `*.queue.core.windows.net`, `*.table.core.windows.net`, `*.file.core.windows.net`, `*.azurewebsites.net`, `*.azure-api.net`, `*.documents.azure.com`, `*.servicebus.windows.net`, `*.openai.azure.com`, `*.cognitiveservices.azure.com`, `*.vault.azure.net`, `*.redis.cache.windows.net`, `*.database.windows.net`, `*.kusto.windows.net`, `*.azurefd.net`, `*.azureedge.net`, `*.azure-devices.net`, `*.trafficmanager.net`, `*.cloudapp.azure.com`, `api.github.com` |
| `df.validate_installation()` | `t` (healthy) |

---

## 2. Multi-Extension Interoperability Matrix

| Combination | Tested Live? | Result | Live Instance / Evidence | Notes & Gotchas |
|---|---|---|---|---|
| `pg_durable` + `azure_ai` (`ai.generate` JSONB, `ai.embed`, `ai.rank`) | Yes | **PASS (with gotcha)** | `338b4d30`, `e1fe9d69` | Managed Models (`gpt-5.4`, `text-embedding-3-small`, `Cohere-rerank-v4.0-fast`) work cleanly inside `pg_durable` workers. **Gotchas:** `ai.generate(json_schema)` requires OpenAI wrapper `{"name":...,"schema":...}` (`BUG-04`), and `ai.embed()` returns `real[]` (cast `::vector(1536)`). |
| `pg_durable` + `CREATE INDEX CONCURRENTLY` + child `df.start()` | Yes | **PASS (with gotcha)** | `aeafff72`, `338b4d30` → `dce3cd2f` | Top-level `df.sql()` runs autocommitted so `CREATE INDEX CONCURRENTLY` succeeds (cost dropped **1218.02 → 4.43, -99.64%**!). **Gotchas:** (1) `df.await_instance()` deadlocks `CONCURRENTLY` until timeout (`BUG-03`); (2) `$var` is always SQL-quoted, so dynamic DDL requires spawning a child `df.start(v_ddl)` (`BUG-06`). |
| `pg_durable` + `df.http` + `pg_durable_fdw` (`df.endpoint` + `df.secret` + `df.with_http_options`) | Yes | **PASS on allowed domains; BLOCKED on ACA/Foundry & Entra-ID-only auth** | `0fe27c77` (real `gpt-5.4` via `my-ai-foundry.openai.azure.com`, 12/12 rows, 0 token leaks); `a9a0d10d` (PASS); `b8f2e371`, `ff17d78d`, `87272559` (ACA/Foundry BLOCKED); `3a2c9cf7` (HTTP 401 on Entra-only AOAI) | Secret-safe `pg_durable_fdw` + `df.loop` + `df.if_rows` batched 12/12 rows cleanly against `my-ai-foundry.openai.azure.com` with **0 leaked tokens** in `df.instance_nodes()`. **P1 Blockers:** (1) `*.azurecontainerapps.io` & `*.services.ai.azure.com` are blocked (`BUG-01`); (2) **NO native Entra ID / Managed Identity auth** in `pg_durable_fdw`, and IMDS + `login.microsoftonline.com` are blocked (`BUG-08`). |
| `pg_durable` + `pg_diskann` (`0.7.6`, Spherical Quantization) | Yes | **PASS** | `e1fe9d69` | Creating `USING diskann (embedding vector_cosine_ops) WITH (spherical_quantized = true, sq_bits = 4)` inside `pg_durable` succeeded cleanly and accelerated hybrid ANN retrieval. |
| `pg_durable` + `pg_textsearch` (`1.5.1`, BM25 + `bm25_force_merge`) | Yes | **PASS** | `e1fe9d69` | Creating `USING bm25`, invoking `public.bm25_force_merge('durable_hack.idx_notes_bm25')` inside `pg_durable`, and querying `<@>` with `to_bm25query(query, index_name)` inside PL/pgSQL all succeeded cleanly. |
| `pg_durable` + `age` (`1.8.0`) | Yes | **PASS (with `search_path` gotcha)** | `02eaeed0` (`age_graph_ready: horizondb_ai_kg`), `0295e0cd` (18 Cypher `MERGE` + `MATCH` edges inside `pg_durable`), `873daafd` (raw `df.sql` fail) | Once `age` is enabled in `azure.extensions` + `shared_preload_libraries`, `pg_durable` creates AGE graphs and runs Cypher `MERGE`/`MATCH` cleanly. **Gotcha:** Raw `df.sql('... ag_catalog.cypher(...)')` fails (`operator class "graphid_ops" does not exist`) because `pg_durable` workers omit `ag_catalog` from `search_path`. **Fix:** Wrap Cypher in a function with `SET search_path = ag_catalog, "$user", public`. |
| `pg_durable` + `hypopg` (`1.4.1`) / `pg_hint_plan` (`1.7.0`) / `pg_stat_statements` (`1.11`) | Yes | **PARTIAL (`pg_stat_statements` PASS; `hypopg` BLOCKED; `pg_hint_plan` NO-OP)** | `c9d80189` (`completed`: `hint_took_effect = false`, `pgss_track = none`, `pgss_rows = 0`) | **3 real HorizonDB platform gaps uncovered live:** (1) `hypopg 1.4.1` is missing from Parameter Group `azure.extensions` `allowedValues` completely (`BUG-07`); (2) `pg_hint_plan 1.7.0` installs via `CREATE EXTENSION` but is missing from `shared_preload_libraries` `allowedValues` and `LOAD 'pg_hint_plan'` is forbidden, so hints are **silently ignored** (`BUG-09`); (3) `pg_stat_statements` works inside `pg_durable` once preloaded, but defaults `pg_stat_statements.track = none` (0 rows until also set to `top`/`all`). |

---

## 3. Applet Exploration Journal & Customer Demo Story Index

| # | Applet | Folder | Live Verified Run(s) | Key Result | Customer Demo Story Title |
|---|---|---|---|---|---|
| 1 | **`ai.tune_sql` Verify-Before-Apply Optimizer** (grounded in `microsoft/azure-ai#233`) | [`01-ai-tune-sql/`](./01-ai-tune-sql/README.md) | Parent `338b4d30` → Child `dce3cd2f` (`completed`) | `gpt-5.4` proposed covering `CREATE INDEX CONCURRENTLY`; paused durably at `df.wait_for_signal('approve_tune')`; resumed on `df.signal()`; dropped query cost **1218.02 → 4.43 (-99.64%)** and recorded `E3`. | *"Self-Healing Postgres — Without Blind Auto-DDL"* (DBAs / Mining Co. / Exchange Co. / Global Bank) |
| 2 | **ML Partner / Azure OpenAI Durable HTTPS Scoring (`df.http` + `pg_durable_fdw`)** | [`02-custom-endpoint-aca-http/`](./02-custom-endpoint-aca-http/README.md) | `0fe27c77` (live `gpt-5.4` via `my-ai-foundry.openai.azure.com`), `a9a0d10d`, `3a2c9cf7` (`BUG-08` 401 repro), `b8f2e371`/`ff17d78d` (`BUG-01` repro) | Scored 12/12 shipments in 3 durable watermark batches against **`https://my-ai-foundry.openai.azure.com/`** (`gpt-5.4`, HTTP 200, ~473 tokens/batch) via `df.loop` + `df.if_rows` + `pg_durable_fdw` `auth_scheme 'bearer'` with **0 leaked tokens** in `df.instance_nodes()`. Proved both `BUG-01` (ACA domain blocked) and `BUG-08` (no native Entra ID / Managed Identity auth in `pg_durable_fdw`). | *"In-Database Tabular Foundation Models — Zero Python Glue, Zero Leaked Secrets"* (ML Partner / tabular model / ML Platform Teams) |
| 3 | **Internal `pg_durable` Usage Auditor & All-5-Extension AI Knowledge Graph** | [`03-internal-use-case/`](./03-internal-use-case/README.md) | `e1fe9d69` (`completed`) | Self-audited `pg_durable` usage (surfacing `rls_visibility_gap = 9` from `BUG-02`), durably embedded & extracted 23 KG edges across 6 notes (`gpt-5.4` + `text-embedding-3-small`), built DiskANN SQ + BM25 indexes + `bm25_force_merge()`, and served unified hybrid + Cohere v4 reranked + KG search (`ML Partner` #1 at `0.6166`, `Mining Co.` #2 at `0.3290`). | *"One Database, Five AI Engines — Orchestrated Durably in Pure SQL"* (AI Architects / CTOs / Internal PM Telemetry) |

---

## 4. Product Bugs & Platform Gaps (ADO-Ready)

> Default ADO target: Project `Database Systems`, Area Path `Database Systems\Azure PG\Orion\AI\Durable`, Iteration `Database Systems\Rubidium`. Tag: pg_durable-Hackathon

### `BUG-01` (P1 — Blocker for ML Partner / ACA & AI Foundry)
- **Title:** HorizonDB GA `pg_durable.http_allowed_domains` omits `*.azurecontainerapps.io`, `*.azurecontainer.io`, `*.services.ai.azure.com`, and `*.ml.azure.com` — and provides no customer override
- **Status:** Verified live (`b8f2e371`, `ff17d78d`, `87272559`)
- **Repro SQL:**
  ```sql
  SELECT df.start(
      df.http('https://ml-partner-tabular-model.eastus.azurecontainerapps.io/v1/predict', 'POST', '{"rows":[]}'),
      'hack-probe-aca-domain-policy'
  );
  ```
- **Actual Behavior:** Fails immediately with:
  `Blocked: 'ml-partner-tabular-model.eastus.azurecontainerapps.io' is not in the allowed endpoint list. Configure pg_durable.http_allowed_domains to allow this hostname.`
  Same failure for `*.services.ai.azure.com` (`87272559`). Worse, the error message instructs the customer to *"Configure `pg_durable.http_allowed_domains`"*, but that GUC has `context = postmaster` and is **not exposed in HorizonDB Parameter Groups**.
- **Expected Behavior:** Align HorizonDB's managed `pg_durable.http_allowed_domains` with `microsoft/pg_durable/docs/http-security.md` §5.2 (which already includes `*.azurecontainerapps.io`, `*.azurecontainer.io`, `*.services.ai.azure.com`, `*.ml.azure.com`, `*.azure-automation.net`), AND either expose a safe customer-configurable allow-list parameter or update the error message to state how HorizonDB customers request/configure allowed domains.
- **Workaround:** Front Azure Container Apps with Azure API Management (`*.azure-api.net`), Azure Front Door (`*.azurefd.net`), or App Service (`*.azurewebsites.net`).

### `BUG-02` (P2 — Observability & Isolation Consistency)
- **Title:** `df.metrics()` returns cluster-wide counts across all roles while `df.list_instances()` / `df.instances` enforce per-role RLS (`instances_user_isolation`), causing confusing 0-row admin views
- **Status:** Verified live on `demo-horizondb` (captured in `durable_hack.usage_audit_snapshots`: `cluster_total_instances = 23`, `caller_visible_instances = 14`, `rls_visibility_gap = 9`)
- **Repro:** Connect as an Entra admin (`you@example.com`) on a cluster where another role (`other_role`) previously ran 9 workflows. Run `SELECT * FROM df.metrics();` (shows `9` total instances) followed by `SELECT * FROM df.list_instances(NULL, 10, NULL, NULL);` (returns `0 rows`).
- **Expected Behavior:** Either (a) scope `df.metrics()` consistently with `instances_user_isolation` for non-privileged roles AND provide a documented `pg_monitor` / admin audit view for cluster operators, or (b) clearly document that `df.metrics()` is cluster-wide while `df.list_instances()` is per-`CURRENT_USER`.

### `BUG-03` (P1/High — Self-Deadlock Trap with `CONCURRENTLY` DDL)
- **Title:** `df.await_instance()` holds an open MVCC transaction snapshot that deadlocks `CREATE INDEX CONCURRENTLY` inside a `pg_durable` activity until `await_instance` times out
- **Status:** Verified live (`aeafff72` — 5,000-row table stalled for **30,161 ms** on a 30s timeout, then finished in ~161 ms the instant `df.await_instance()` timed out and released its snapshot)
- **Repro:**
  ```sql
  SELECT df.start(df.sql('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cic ON durable_hack.cic_probe (customer_id, status)'), 'cic-test') AS id \gset
  SELECT df.await_instance(:'id', 30); -- times out after 30s; df.instance_info(:'id') immediately shows completed!
  ```
- **Expected Behavior:** Document prominently in `df.await_instance()` docs/warning (and consider snapshot-free polling or advisory note) that workflows containing `CREATE/DROP INDEX CONCURRENTLY`, `REINDEX CONCURRENTLY`, or `VACUUM` must be polled via separate short `df.status()` transactions — critical for `ai.tune_sql` (`microsoft/azure-ai#233`)!

### `BUG-04` (P1 — `azure_ai 2.5.6` UX Bug)
- **Title:** `ai.generate(..., json_schema => ...)` returns opaque `400 Bad Request` (`SQLSTATE 58000`) when passed a standard JSON Schema without OpenAI's `{"name":..., "schema":...}` wrapper
- **Status:** Verified live on `default-chat` (`gpt-5.4`), instance `808a6d36` + direct PL/pgSQL repro
- **Repro:**
  ```sql
  -- FAILS with opaque: Request failed with status 400 Bad Request (58000)
  SELECT ai.generate(
      prompt => 'Return JSON',
      json_schema => '{"type":"object","properties":{"a":{"type":"string"}},"required":["a"],"additionalProperties":false}'::jsonb,
      model => 'default-chat'
  );
  -- SUCCEEDS when wrapped:
  SELECT ai.generate(
      prompt => 'Return JSON',
      json_schema => '{"name":"resp","strict":true,"schema":{"type":"object","properties":{"a":{"type":"string"}},"required":["a"],"additionalProperties":false}}'::jsonb,
      model => 'default-chat'
  );
  ```
- **Expected Behavior:** Either automatically wrap raw JSON Schemas (`{"type":"object",...}`) into OpenAI's `{"name":"response","strict":true,"schema":...}` envelope inside `ai_generate_structured_wrapper`, OR raise a clear client-side validation error before calling Azure OpenAI (and include the upstream 400 error details in the PostgreSQL `DETAIL`).

### `BUG-05` (P2 — Silent Success on Terminal Instances)
- **Title:** `df.signal()` returns `'OK'` when signaling an instance already in terminal `failed` state
- **Status:** Verified live (`9d0dc497` — already `failed`, yet `SELECT df.signal('9d0dc497', 'approve_tune', ...)` returned `'OK'`)
- **Expected Behavior:** Return a clear error or warning (or boolean `false` / status message) when signaling an instance that is already `completed`, `failed`, or `cancelled`, so callers (like DBA approval UIs) don't falsely believe an approval was delivered.

### `BUG-06` (P2 — Product Design Gap for `ai.tune_sql` / Dynamic DDL Workflows)
- **Title:** `pg_durable` cannot execute dynamic `CREATE INDEX CONCURRENTLY` inside a single workflow because `$var` is always SQL-literal-quoted and PL/pgSQL `EXECUTE` forbids `CONCURRENTLY`
- **Status:** Verified live (`9411a956` failed with `syntax error at or near "'CREATE INDEX CONCURRENTLY ...'"`)
- **Workaround Validated:** Spawn a child workflow via plain `df.start(v_ddl ~> ..., label)` from a PL/pgSQL approval helper (`338b4d30` → `dce3cd2f`, works cleanly!). (Note: `df.start(..., transaction_mode => 'new')` inside a workflow returns a helpful error explaining plain `df.start()` is already independent.)
- **Recommendation:** Document the parent-to-child `df.start()` pattern for `ai.tune_sql` (`microsoft/azure-ai#233`) and dynamic DDL workflows.

### `BUG-07` (P1/P2 — `hypopg` Missing from HorizonDB `azure.extensions` `allowedValues`, Blocking `ai.tune_sql` `E2`)
- **Title:** HorizonDB GA ships `hypopg 1.4.1` in `pg_available_extensions`, but omits `hypopg` from Parameter Group `azure.extensions` `allowedValues` completely (cannot be enabled even by admins)
- **Status:** Verified live after enabling `age`, `pg_hint_plan`, `pg_stat_statements` (`SQLSTATE 0A000`: `extension "hypopg" is not allow-listed for "azure_pg_admin" users in Azure Database for PostgreSQL`; confirmed absent from `hdb-nov11-2026-textsearch` `azure.extensions.allowedValues`)
- **Impact:** `ai.tune_sql` (`microsoft/azure-ai#233`) cannot run `hypopg` `E2` hypothetical-index verification on HorizonDB until `hypopg` is added to `azure.extensions` `allowedValues`. (Also note: `pg_stat_statements.track` defaults to `none` even after preloading `pg_stat_statements`, returning 0 rows until explicitly set to `top`/`all`.)

### `BUG-08` (P1 — SFI / Enterprise Blocker: No Native Microsoft Entra ID / Managed Identity Auth in `pg_durable` `df.http()`)
- **Title:** `pg_durable_fdw` / `df.http()` has no native Microsoft Entra ID / Managed Identity `auth_scheme`, and HorizonDB's restricted HTTP mode also blocks IMDS and `login.microsoftonline.com` — making long-running durable workflows impossible against Entra-ID-only (`disableLocalAuth = true`) Azure resources
- **Status:** Verified live against `https://my-ai-foundry.openai.azure.com/` (`disableLocalAuth = True`) — validator error + `3a2c9cf7` (HTTP 401) + `hack-probe-entra-token-endpoint` (`failed`) + IMDS blocked at `df.start()`
- **Repro SQL:**
  ```sql
  -- 1. pg_durable_fdw rejects any Entra / Managed Identity auth_scheme:
  CREATE SERVER probe_mi FOREIGN DATA WRAPPER pg_durable_fdw
      OPTIONS (base_url 'https://my-ai-foundry.openai.azure.com', auth_scheme 'managed_identity');
  -- ERROR: Unsupported endpoint auth_scheme; allowed: none, bearer, header, query

  -- 2. Calling Entra-only Azure OpenAI with static api-key returns HTTP 401 (3a2c9cf7):
  --    "Access denied due to invalid subscription key..."

  -- 3. Workflow cannot even self-refresh an Entra token:
  --    a) IMDS (http://169.254.169.254/...) -> ERROR: Blocked: plaintext HTTP is not permitted in restricted mode.
  --    b) https://login.microsoftonline.com/... -> failed (not in pg_durable.http_allowed_domains).
  ```
- **Impact:** Virtually all Microsoft SFI-compliant and enterprise Azure resources (Azure OpenAI, AI Foundry, Storage, Service Bus, Key Vault, Cosmos DB, Kusto) enforce `disableLocalAuth = true` (Entra ID only). Meanwhile, `azure_ai` on the exact same HorizonDB cluster **already** supports User-Assigned Managed Identity (`INFO: Using user-assigned managed identity authentication method.`). Without native Managed Identity / Entra token acquisition in `pg_durable_fdw`, users can only inject a short-lived (~1 hour) Entra bearer JWT manually into `USER MAPPING OPTIONS (token '...')` — which **expires mid-flight** during any long-running durable workflow (`df.sleep`, `df.wait_for_signal`, multi-hour batch scoring).
- **Expected Behavior:** Add a native `auth_scheme 'managed_identity'` (or `'entra_id'`) option to `pg_durable_fdw` (taking `resource` / `scope` + optional `client_id` for UAMI) so the `pg_durable` HTTP worker acquires and refreshes Entra ID tokens cleanly via the cluster's Managed Identity — matching `azure_ai` parity!
- **Demo Workaround:** For short (<1 hr) hackathon demos (`0fe27c77`), inject an ephemeral Entra JWT via `ALTER USER MAPPING FOR CURRENT_USER SERVER abes_demo_aoai OPTIONS (SET token '...')` right before starting the workflow and scrub it afterward.

### `BUG-09` (P1/P2 — `pg_hint_plan` Installs Cleanly on HorizonDB but Is Silently a No-Op)
- **Title:** `pg_hint_plan` is in HorizonDB `azure.extensions` `allowedValues` (`CREATE EXTENSION pg_hint_plan` succeeds), but is omitted from `shared_preload_libraries` `allowedValues` and `LOAD 'pg_hint_plan'` is disallowed — so all query hints are silently ignored
- **Status:** Verified live (`c9d80189`: `hint_took_effect = false`, `SELECT count(*) FROM pg_settings WHERE name LIKE 'pg_hint_plan%'` = `0`, `LOAD 'pg_hint_plan'` → `ERROR: access to library "pg_hint_plan" is not allowed`; confirmed absent from `shared_preload_libraries.allowedValues`)
- **Repro SQL:**
  ```sql
  CREATE EXTENSION IF NOT EXISTS pg_hint_plan; -- succeeds!
  SELECT count(*) FROM pg_settings WHERE name LIKE 'pg_hint_plan%'; -- returns 0!
  LOAD 'pg_hint_plan'; -- ERROR: access to library "pg_hint_plan" is not allowed
  -- Any /*+ SeqScan(...) */ hint is silently ignored by the planner.
  ```
- **Expected Behavior:** Add `pg_hint_plan` to HorizonDB Parameter Group `shared_preload_libraries` `allowedValues` (or `session_preload_libraries`) so installing the extension actually activates planner hints (required by `ai.tune_sql` plan-forcing / regression-testing workflows and Oracle migration customers).

### `BUG-10` (P1 — VS Code PostgreSQL Extension "Pipelines & Workflows (Preview)" Completely Broken on Remote HorizonDB)
- **Title:** VS Code `ms-ossdata.vscode-pgsql` (`v1.33.1`, `pgsqltoolsservice v3.8.2` commit `eaf8ff52`) Durable Workbench / AI Pipelines view fails with `"Couldn't check server capabilities — Durable Workbench capability request timed out after 15 seconds"`
- **Status:** Verified live in VS Code against `demo-horizondb` (`japaneast`, `pg_durable 0.2.9`, `azure_ai 2.5.6`) + confirmed in VS Code extension & `pgsql-tools.log`
- **Repro Steps:**
  1. Connect to a remote Azure HorizonDB cluster (`demo-horizondb`, `japaneast`, ~126–200ms WAN RTT from US West) in VS Code with `ms-ossdata.vscode-pgsql` `v1.33.1`.
  2. Open **Pipelines & Workflows (Preview)** → **AI Pipelines** tab on database `postgres`.
  3. Observe initial failure after 10s (`Durable capability probe timed out`), and clicking **Retry** fails repeatedly with:
     `Couldn't check server capabilities — The capability probe failed. Check the connection and try again. Durable Workbench capability request timed out after 15 seconds.`
- **Root Cause (Captured from Live `pgsql-tools.log` & `12-PostgreSQL (Microsoft).log`):**
  1. **Chatty sequential capability probe (`durable/getCapabilities` / `composed_probe_v1`):** Each single `durable/getCapabilities` RPC holds a pooled DB connection for **8.4–10.7 seconds** over ~130ms WAN RTT (`id=13`: `10.39s`; `id=27`: `9.96s`; `id=28`: `8.39s`; `id=29`: `8.78s`; `id=30`: `8.40s`; `id=31`: `10.66s`; `id=34`: `8.44s`), right at/above the **10-second backend probe timeout** (`Durable capability probe timed out`).
  2. **Un-deduplicated serialized request queue causes cascading 15s client timeouts & blocks SQL editors:** `pgsqltoolsservice` executes `durable/getCapabilities` serially on the RPC worker without cancelling or coalescing in-flight probes. When the user clicks **Retry** (or tabs refresh), requests queue up (`id=27`..`id=34` running back-to-back for 56 seconds), blowing past the frontend's hardcoded **15-second timeout** (`withDurableRequestTimeout`, `OO = 15000ms` in `dist/extension.js`). Worse, queued `durable/getCapabilities` calls even stalled a normal SQL editor query (`extensions_and_http_preflight.sql`) for **10 seconds** (`12:41:52` → `12:42:02`).
- **Expected Behavior:**
  1. Consolidate `durable/getCapabilities` (`composed_probe_v1`) into **1–2 single-round-trip SQL queries** (checking `pg_extension`, `ai.*` tables/columns/functions, and `df.*` readiness in one CTE query) so it completes in `< 500ms` even over cross-region WAN.
  2. Coalesce/deduplicate concurrent `durable/getCapabilities` calls on both the extension (`DurableWorkbenchController.refreshCapabilities`) and `pgsqltoolsservice` sides, and cancel/abort timed-out backend probes so they don't pile up and starve regular SQL query execution.

---

## 5. Documentation Bugs & Missing Docs (`DOC-01` .. `DOC-10`)

| ID | Severity | Source Location | What the Doc Says | Actual Verified Behavior | Recommended Fix |
|---|---|---|---|---|---|
| `DOC-01` | **High** | Microsoft Learn `azure/horizondb/development/durable-functions#program-model` & in-repo `documents/specs/AI_Pipelines/docs/pg_durable/USER_GUIDE.md:679` | Learn: *"5xx responses, network errors, and timeouts are retried automatically."* In-repo `USER_GUIDE.md`: *"5xx responses: Activity fails and may be retried."* | Verified in `microsoft/pg_durable` `src/orchestrations/execute_function_graph.rs:2030`: `execute_http_node` calls `ctx.schedule_activity(...)` **without** any retry policy. 5xx fails the node immediately on attempt 1 (`execute_http.rs:401`). | Remove the automatic-retry claim from Learn & `USER_GUIDE.md` until `schedule_activity_with_retry` is actually wired up (or implement retry policy in `execute_http_node`). |
| `DOC-02` | **High** | Microsoft Learn `azure/horizondb/development/durable-functions#program-model` (Operators table) | Unescaped Markdown pipe breaks `\|=>` into `\| =>` (with a space): `'SELECT id FROM users LIMIT 1' \| => 'user_id'`. Race operator `\|` cell is also broken. | Copy-pasting produces a PostgreSQL syntax error; the operator is `\|=>` (no space). | Escape `\|` (`\\|`) in the Markdown table so `\|=>` and `\|` render intact. |
| `DOC-03` | **Medium** | Microsoft Learn `azure/horizondb/development/durable-functions#program-model` | Uses `df.http('https://api.example.com/users/123', 'GET')` with no allow-list caveat; also typo `"stop this job, You can run..."`. | HorizonDB defaults to `pg_durable.http_security = 'restricted'`, so `api.example.com` fails immediately with `Blocked: ... is not in the allowed endpoint list`. | Use an allow-listed example (e.g., `https://api.github.com/...` or `df.endpoint(...)`) and document HorizonDB's restricted HTTP policy; fix `You` → `you`. |
| `DOC-04` | **Medium** | Microsoft Learn `azure/horizondb/ai/vector-index-diskann` & `concepts-extensions-versions` | `vector-index-diskann` claims version `0.7.3` (and misses trailing `;` on `CREATE INDEX ON demo USING diskann ...`); `concepts-extensions-versions` lists `vector 0.8.0` and `pg_qs 2.8`. | Live HorizonDB GA cluster runs **`pg_diskann 0.7.6`**, **`vector 0.8.7`**, and **`pg_qs 2.9`**. | Update version numbers across both Learn articles and add the missing semicolon in the DiskANN example. |
| `DOC-05` | **Medium** | In-repo `documents/specs/AI_Pipelines/docs/pg_durable/USER_GUIDE.md` & `playground/horizon-ai-features-testing/pg_durable/pg_durable_domain_policy_test.sql` | In-repo `USER_GUIDE.md` predates v0.2.9 (missing `pg_durable_fdw`, `df.endpoint`, `df.secret`, `df.with_http_options`, `df.http_multipart`, `df.if_rows`, `df.await_instance`, `pg_durable.http_security`). Domain policy test script predates v0.2.9 `docs/http-security.md` §5.2. | Upstream `microsoft/pg_durable` `USER_GUIDE.md` already documents these v0.2.9 APIs, while live HorizonDB GA lags upstream's §5.2 allow-list (`BUG-01`). | Sync in-repo `USER_GUIDE.md` from upstream `microsoft/pg_durable` and update `pg_durable_domain_policy_test.sql` to assert §5.2 compliance once `BUG-01` lands. |
| `DOC-06` | **Medium** | Microsoft Learn `azure/horizondb/development/durable-functions` & in-repo `USER_GUIDE.md` | Examples teach `df.wait_for_completion(...)`. | Live v0.2.9 emits `WARNING: df.wait_for_completion() is deprecated; use df.await_instance() instead`. | Replace `df.wait_for_completion()` with `df.await_instance()` in all Learn and repo examples. |
| `DOC-07` | **Medium** | Microsoft Learn `azure/horizondb/ai/ai-functions` / `ai-pipelines` | Does not prominently highlight that `ai.embed()` returns `real[]` (requiring `::vector(N)` cast for `pg_diskann`/`pgvector` operators) or that `ai.generate(json_schema)` requires the OpenAI `{"name":...,"schema":...}` wrapper (`BUG-04`). | Live tests failed on `vector_dims(ai.embed(...))` (`function vector_dims(real[]) does not exist`) and unwrapped `json_schema` (`400 Bad Request`). | Document both return/input shapes with copy-pasteable SQL examples. |
| `DOC-08` | **Low** | Microsoft Learn `azure/horizondb/development/durable-functions` | Does not document the exact `df.wait_for_signal()` JSON envelope (`{"data": {...}, "timed_out": false, "signal_name": "..."}`) or the column difference between 2-arg vs 4-arg `df.list_instances()` (`created_at`/`completed_at` only on 4-arg overload). | Verified live (`e0f8b3cb` and `\df df.list_instances`). | Add a short schema reference for `df.wait_for_signal()` result JSON and `df.list_instances()` overloads. |
| `DOC-09` | **High (Missing Doc)** | Microsoft Learn `azure/horizondb/development/durable-functions` & `USER_GUIDE.md` | **No documentation** for calling Entra-ID-only Azure endpoints (`disableLocalAuth = true`, e.g., Azure OpenAI / Azure AI Foundry with API keys disabled) from `pg_durable`. | Related to `BUG-08`: `pg_durable_fdw` v0.2.9 only supports static auth schemes (`none`, `bearer`, `header`, `query`) — no native `managed_identity` / `entra_id` yet, and HorizonDB blocks IMDS (`169.254.169.254`) and `login.microsoftonline.com`. | Add a dedicated **"Calling Entra-ID-Only Endpoints (Current Workaround & Limitations)"** section: (1) show the ephemeral JWT workaround (`az account get-access-token --resource https://cognitiveservices.azure.com` → `CREATE SERVER ... auth_scheme 'bearer'` + `ALTER USER MAPPING ... OPTIONS (SET token '...')` → scrub token after run), (2) explicitly list current limitations (~1 hr token TTL breaks long-running workflows, manual rotation required, no IMDS/Entra refresh inside `df.http`), and (3) note that native Managed Identity support in `pg_durable_fdw` is planned. |
| `DOC-10` | **High (Missing Doc / Security)** | Microsoft Learn `azure/horizondb/development/durable-functions` & `USER_GUIDE.md` | Does not clearly explain **why** `pg_durable_fdw` (Foreign Data Wrapper + `CREATE SERVER` / `CREATE USER MAPPING`) must be used for HTTP secrets instead of inline headers or `df.setvar()`. | `pg_durable` persists workflow definitions, variables, and node payloads in `df.nodes` / `duroxide` execution history. Inlining API keys or `Bearer` tokens in `df.http()` or `df.setvar()` stores secrets in **plaintext** in workflow history (see `SKILL-01`). `pg_durable_fdw` resolves credentials from `pg_user_mappings` inside the HTTP worker at request time so zero secrets appear in `df.nodes`. | Add a **"Secret Hygiene: Why `pg_durable_fdw` Is Required for Auth"** section explaining the plaintext-history risk of inline headers/`df.setvar()`, showing the `CREATE SERVER ... FOREIGN DATA WRAPPER pg_durable_fdw` + `USER MAPPING` + `df.endpoint()` / `df.secret()` pattern, and including the zero-leak verification query against `df.instance_nodes()`. |

---

## 6. Skill Bugs (`SKILL-01` .. `SKILL-02`)

| ID | Severity | Skill File | Defect | Recommended Fix |
|---|---|---|---|---|
| `SKILL-01` | **High (Security)** | `microsoft/pg_durable/.agents/skills/pg-durable-sql/SKILL.md` | Explicitly instructs AI agents to store API keys in `df.setvar('api_key', 'secret123')` and inline `{api_key}` into `df.http()` headers — persisting plaintext credentials in `df.nodes` / `duroxide` execution history. Completely omits v0.2.9 `pg_durable_fdw`, `df.endpoint()`, `df.secret()`, `df.with_http_options(..., secret_bindings)`, `df.http_multipart()`, and `pg_durable.http_security`. | Remove the `df.setvar` secret example immediately; teach `CREATE SERVER ... FOREIGN DATA WRAPPER pg_durable_fdw` + `USER MAPPING` + `df.secret()` + `df.with_http_options()` and document HorizonDB's `restricted` HTTP allow-list. |
| `SKILL-02` | **Medium** | `microsoft/pg_durable/.agents/skills/pg-durable-sql/SKILL.md` | Teaches deprecated `df.wait_for_completion()` instead of `df.await_instance()`, omits `df.if_rows()`, omits the `df.wait_for_signal()` `{"data": ..., "timed_out": ...}` envelope, and does not warn against combining `df.await_instance()` with `CREATE INDEX CONCURRENTLY` (`BUG-03`). | Update `SKILL.md` to v0.2.9 idioms (`df.await_instance`, `df.if_rows`, signal envelope, and `CONCURRENTLY` polling guidance). |
