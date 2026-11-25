-- =============================================================================
-- 00-preflight: HorizonDB GA Preview — Extension, Model & pg_durable Preflight
-- =============================================================================
-- Run against the ReadWrite endpoint of your HorizonDB cluster (database: postgres).
-- Safe & read-only until Section 5 (optional live HTTP allow-list probe).
--
-- Recommended VS Code flow:
--   1. Open this repository folder in VS Code
--   2. Connect using PostgreSQL extension (ms-ossdata.vscode-pgsql) via Azure MFA
--   3. Open Pipelines & Workflows -> Workflows tab to watch PG Durable Runs live
-- =============================================================================

\echo '=== 1. SERVER VERSION & IDENTITY ==='
SELECT version(), current_database(), current_user, inet_server_addr();

\echo '=== 2. INSTALLED & AVAILABLE TARGET EXTENSIONS ==='
SELECT
    a.name,
    a.default_version,
    e.extversion AS installed_version,
    CASE WHEN e.extname IS NOT NULL THEN 'INSTALLED' ELSE 'AVAILABLE (NOT INSTALLED)' END AS status
FROM pg_available_extensions a
LEFT JOIN pg_extension e ON e.extname = a.name
WHERE a.name IN (
    'pg_durable',
    'azure_ai',
    'pg_diskann',
    'pg_textsearch',
    'age',
    'vector',
    'hypopg',
    'pg_hint_plan',
    'pg_stat_statements',
    'pg_qs'
)
ORDER BY a.name;

\echo '=== 3. KEY GUCs (PRELOAD, ALLOW-LISTS, PG_DURABLE, PG_HINT_PLAN) ==='
SELECT name, setting, context
FROM pg_settings
WHERE name IN (
    'shared_preload_libraries',
    'azure.extensions',
    'pg_durable.database',
    'pg_durable.http_security',
    'pg_durable.http_allowed_domains',
    'pg_durable.retention_days',
    'pg_durable.max_duroxide_connections',
    'pg_durable.max_new_transaction_starts',
    'pg_hint_plan.enable_hint_table'
)
ORDER BY name;

\echo '=== 4. PG_DURABLE WORKER HEALTH & METRICS ==='
SELECT df.version() AS pg_durable_version, df.validate_installation() AS worker_healthy;
SELECT * FROM df.metrics();

\echo '=== 5. REGISTERED AI MODELS (MANAGED & BYOM) ==='
SELECT alias, model_name, registry_type, status, auth_type
FROM model_registry.model_list_all()
ORDER BY registry_type, alias;

\echo '=== 6. HTTP ALLOW-LIST AUDIT FOR ML PARTNER / AI FOUNDRY / ACA ==='
WITH domains AS (
    SELECT trim(d) AS pattern
    FROM unnest(string_to_array(current_setting('pg_durable.http_allowed_domains', true), ',')) AS d
),
required_domains(domain_pattern, why_needed) AS (
    VALUES
        ('*.azurecontainerapps.io',   'ML Partner / tabular model / custom ML inference on Azure Container Apps'),
        ('*.azurecontainer.io',       'Azure Container Instances'),
        ('*.services.ai.azure.com',   'Azure AI Foundry project endpoints'),
        ('*.ml.azure.com',            'Azure Machine Learning online endpoints'),
        ('*.openai.azure.com',        'Azure OpenAI Service'),
        ('*.azure-api.net',           'Azure API Management (APIM) gateway / workaround'),
        ('*.azurewebsites.net',       'Azure App Service / Functions'),
        ('api.github.com',            'GitHub REST API (public allow-list sanity probe)')
)
SELECT
    r.domain_pattern,
    CASE WHEN d.pattern IS NOT NULL THEN 'ALLOWED' ELSE 'MISSING (BLOCKED)' END AS cluster_status,
    r.why_needed
FROM required_domains r
LEFT JOIN domains d ON d.pattern = r.domain_pattern
ORDER BY cluster_status, r.domain_pattern;
