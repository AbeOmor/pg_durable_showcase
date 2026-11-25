-- =============================================================================
-- Applet 2 Live Demo Walkthrough: Durable HTTPS Batch Scoring (df.http + FDW)
-- =============================================================================
-- Highlight ONE line at a time and press Cmd+Shift+E (Run Query) in VS Code.
-- Assumes setup (custom_endpoint_http_applet.sql) has already been executed.
-- Target: https://my-ai-foundry.openai.azure.com/ (gpt-5.4, Entra-only)
-- =============================================================================

-- 0a. RESET FOR A FRESH DEMO: Set all 12 supplier shipments back to "pending".
SELECT durable_hack.demo_reset_shipments();

-- 0b. INJECT EPHEMERAL ENTRA JWT (WORKAROUND FOR BUG-08 — no native Managed Identity in pg_durable_fdw yet):
--     In terminal run: az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv
--     Paste token below so it stays inside USER MAPPING and NEVER touches df.nodes!
ALTER USER MAPPING FOR CURRENT_USER SERVER abes_demo_aoai OPTIONS (SET token '<ENTRA_TOKEN>');

-- 1. SHOW PENDING DATA TO SCORE: 12 operational supplier shipments waiting for batch risk scoring.
SELECT shipment_id, supplier_code, origin_region, lead_time_days, order_value_usd, historical_late, scoring_status FROM durable_hack.supplier_shipments ORDER BY shipment_id;

-- 2. (OPTIONAL) SHOW BUG-01 LIVE: Calling *.azurecontainerapps.io fails immediately on HorizonDB's restricted allow-list.
SELECT df.start(df.http('https://ml-partner-tabular-model.eastus.azurecontainerapps.io/v1/predict', 'POST', '{"rows":[]}'), 'hack-probe-aca-live');
SELECT * FROM df.list_instances(NULL, 5, NULL, NULL) ORDER BY created_at DESC;

-- 3. START THE DURABLE HTTPS BATCH SCORER: pg_durable loops in batches of 4 -> calls gpt-5.4 via pg_durable_fdw -> writes back atomically.
SELECT durable_hack.start_ml_partner_scoring('abes_demo_aoai', '/openai/deployments/gpt-5.4/chat/completions?api-version=2025-01-01-preview', 'POST', 4, 'hack-aoai-demo-live');

-- 4. WATCH PG_DURABLE RUNNING / COMPLETED: Re-run every few seconds (~15s total for 3 batches of 4 rows).
SELECT instance_id, label, status, created_at, completed_at FROM df.list_instances(NULL, 5, NULL, NULL) ORDER BY created_at DESC;

-- 5. INSPECT EVERY PG_DURABLE NODE: See LOOP -> claim_shipment_batch -> IF_ROWS -> HTTP -> apply_scoring_response -> BREAK.
SELECT * FROM durable_hack.demo_scoring_nodes();

-- 6. SHOW DURABLE BATCH WATERMARK LOG: 3/3 batches returned HTTP 200 with real gpt-5.4 token counts.
SELECT batch_run_id, workflow_label, batch_size, http_status, http_ok, response_note, created_at FROM durable_hack.scoring_batches ORDER BY batch_run_id;

-- 7. SHOW ALL 12 SCORED SHIPMENTS: Risk scores + gpt-5.4 rationales persisted right back into Postgres!
SELECT shipment_id, supplier_code, scoring_status, risk_score, http_status, model_trace FROM durable_hack.supplier_shipments ORDER BY risk_score DESC NULLS LAST;

-- 8. PROVE ZERO SECRET LEAKS IN PG_DURABLE HISTORY: Verify leaked_token_rows = 0 across all df.instance_nodes().
SELECT * FROM durable_hack.demo_verify_zero_token_leak();

-- 9. SCRUB EPHEMERAL TOKEN AFTER DEMO: Never leave an Entra JWT sitting in USER MAPPING.
ALTER USER MAPPING FOR CURRENT_USER SERVER abes_demo_aoai OPTIONS (SET token 'SCRUBBED');
