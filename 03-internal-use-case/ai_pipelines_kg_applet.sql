-- =============================================================================
-- Applet 3 (Version A — Declarative AI Pipelines): Knowledge Graph on HorizonDB
-- =============================================================================
-- Side-by-side counterpart to `internal_applet.sql` (Version B — Custom pg_durable).
--
-- Why BOTH versions exist:
--   * AI Pipelines (`ai.create_graph` + `ai.create_pipeline` + `ai.extract_step`
--     + `ai.graph_sink`) is for WELL-KNOWN declarative AI workflows: minimal SQL,
--     ontology-enforced Apache AGE upserts, built-in incremental watermarks, and
--     zero hand-written Cypher MERGE loops (still powered by pg_durable under
--     the hood!).
--   * Custom `pg_durable` (`internal_applet.sql`) is OPEN SOURCE and lets you go
--     as custom as you want: strict JSON-schema enums, cluster self-auditing,
--     DiskANN SQ + BM25 + bm25_force_merge(), Cohere v4 reranking, human approval
--     gates, and arbitrary multi-extension orchestration in one durable DAG.
--
-- Uses the EXACT SAME 6 customer notes as `internal_applet.sql`, isolated in:
--   * Tables: durable_hack.ai_pipe_*
--   * AGE graph: horizondb_ai_kg_pipelines (does NOT touch horizondb_ai_kg)
--   * Pipelines: hack_kg_extract_pipeline, hack_kg_graph_pipeline
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS durable_hack;

-- -----------------------------------------------------------------------------
-- STEP 1: Register the Knowledge Graph Ontology (Apache AGE backed)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM ai.graphs WHERE name = 'horizondb_ai_kg_pipelines') THEN
        PERFORM ai.create_graph(
            name => 'horizondb_ai_kg_pipelines',
            ontology => '{
                "nodes": [
                    {
                        "label": "Customer",
                        "identity": "customer_name",
                        "properties": ["customer_name", "journey_phase", "sentiment", "disp_label"]
                    },
                    {
                        "label": "Extension",
                        "identity": "extension_name",
                        "properties": ["extension_name", "disp_label"]
                    },
                    {
                        "label": "Blocker",
                        "identity": "blocker_summary",
                        "properties": ["blocker_summary", "disp_label"]
                    }
                ],
                "edges": [
                    {
                        "label": "USES",
                        "from": "Customer",
                        "to": "Extension"
                    },
                    {
                        "label": "BLOCKED_BY",
                        "from": "Customer",
                        "to": "Blocker"
                    }
                ]
            }'::jsonb
        );
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- STEP 2: Source Table, Stage-1 Extraction Staging Table, & Stage-2 Fragments
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS durable_hack.ai_pipe_graph_fragments CASCADE;
DROP TABLE IF EXISTS durable_hack.ai_pipe_extracted_notes CASCADE;
DROP TABLE IF EXISTS durable_hack.ai_pipe_customer_notes CASCADE;

-- Monotonic BIGSERIAL watermark (`note_seq`) required for incremental AI Pipelines
CREATE TABLE durable_hack.ai_pipe_customer_notes (
    note_seq      BIGSERIAL PRIMARY KEY,
    source_ref    TEXT NOT NULL,
    customer_hint TEXT NOT NULL,
    note_body     TEXT NOT NULL
);

-- Seed with the EXACT SAME 6 customer/hackathon notes used in internal_applet.sql
INSERT INTO durable_hack.ai_pipe_customer_notes (source_ref, customer_hint, note_body)
SELECT source_ref, customer_hint, note_body
FROM durable_hack.customer_ai_notes
ORDER BY note_id;

-- Stage 1 sink: raw LLM extraction written by `ai.extract_step()`
CREATE TABLE durable_hack.ai_pipe_extracted_notes (
    note_seq      BIGINT PRIMARY KEY,
    source_ref    TEXT,
    customer_hint TEXT,
    note_body     TEXT,
    metadata      JSONB
);

-- Stage 2 source: validated, ontology-aligned JSONB fragments for `ai.graph_sink()`
CREATE TABLE durable_hack.ai_pipe_graph_fragments (
    fragment_id   BIGSERIAL PRIMARY KEY,
    note_seq      BIGINT UNIQUE NOT NULL,
    source_ref    TEXT NOT NULL,
    document      JSONB NOT NULL,
    validated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- STEP 3: Declarative AI Pipelines Registration Helper
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION durable_hack.register_ai_kg_pipelines()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    -- Drop existing definitions cleanly if re-registering (resets watermarks)
    IF EXISTS (SELECT 1 FROM ai.list_pipelines() WHERE name = 'hack_kg_extract_pipeline') THEN
        PERFORM ai.drop_pipeline('hack_kg_extract_pipeline');
    END IF;
    IF EXISTS (SELECT 1 FROM ai.list_pipelines() WHERE name = 'hack_kg_graph_pipeline') THEN
        PERFORM ai.drop_pipeline('hack_kg_graph_pipeline');
    END IF;

    -- Pipeline 1 (Unstructured Extraction — runs on pg_durable under the hood):
    -- Extracts customer_name, journey_phase, sentiment, extensions_used, blocker_summary
    PERFORM ai.create_pipeline(
        name => 'hack_kg_extract_pipeline',
        source => ai.table_source(
            table_name         => 'ai_pipe_customer_notes',
            incremental_column => 'note_seq',
            schema_name        => 'durable_hack'
        ),
        steps => ARRAY[
            ai.extract_step(
                input  => 'note_body',
                data   => ARRAY[
                    'customer_name: string - customer or project name',
                    'journey_phase: string - one of Education/POC, Building, Optimization, Enterprise Hardening',
                    'sentiment: string - one of positive, mixed, blocked',
                    'extensions_used: string - comma-separated canonical Postgres extension names like pg_durable, azure_ai, pg_diskann, pg_textsearch, age, hypopg',
                    'blocker_summary: string - concise one-sentence summary of the key blocker or requirement'
                ],
                model  => 'default-chat',
                output => 'metadata'
            )
        ],
        sink => ai.table_sink(
            table_name         => 'ai_pipe_extracted_notes',
            schema_name        => 'durable_hack',
            on_conflict        => ARRAY['note_seq'],
            on_conflict_action => 'DO UPDATE SET source_ref = EXCLUDED.source_ref, customer_hint = EXCLUDED.customer_hint, note_body = EXCLUDED.note_body, metadata = EXCLUDED.metadata'
        ),
        trigger => 'manual'
    );

    -- Pipeline 2 (Deterministic Graph Sink — idempotent Apache AGE upserts):
    -- Maps validated JSONB fragments into Customer, Extension, Blocker nodes & edges
    PERFORM ai.create_pipeline(
        name => 'hack_kg_graph_pipeline',
        source => ai.table_source(
            table_name         => 'ai_pipe_graph_fragments',
            incremental_column => 'fragment_id',
            schema_name        => 'durable_hack'
        ),
        steps => ARRAY[]::jsonb[],
        sink => ai.graph_sink(
            graph_name    => 'horizondb_ai_kg_pipelines',
            source_column => 'document',
            mappings      => '{
                "nodes": [
                    { "label": "Customer", "property": "customer_name",   "from": "$.customer_name" },
                    { "label": "Customer", "property": "journey_phase",   "from": "$.journey_phase" },
                    { "label": "Customer", "property": "sentiment",       "from": "$.sentiment" },
                    { "label": "Customer", "property": "disp_label",      "from": "$.customer_name" },
                    { "label": "Blocker",  "property": "blocker_summary", "from": "$.blocker_summary" },
                    { "label": "Blocker",  "property": "disp_label",      "from": "$.blocker_short" }
                ],
                "edges": [
                    {
                        "edge_label": "BLOCKED_BY",
                        "from_key":   "$.customer_name",
                        "to_key":     "$.blocker_summary"
                    }
                ],
                "each": [
                    {
                        "path": "extensions",
                        "nodes": [
                            { "label": "Extension", "property": "extension_name", "from": "@.extension_name" },
                            { "label": "Extension", "property": "disp_label",     "from": "@.extension_name" }
                        ],
                        "edges": [
                            {
                                "edge_label": "USES",
                                "from_key":   "$.customer_name",
                                "to_key":     "@.extension_name"
                            }
                        ]
                    }
                ]
            }'::jsonb
        ),
        trigger => 'manual'
    );

    RETURN 'Registered AI Pipelines: hack_kg_extract_pipeline (Stage 1) and hack_kg_graph_pipeline (Stage 2).';
END;
$$;

SELECT durable_hack.register_ai_kg_pipelines();

-- -----------------------------------------------------------------------------
-- STEP 4: SQL Validation & Normalization Gate (Between Stage 1 & Stage 2)
-- -----------------------------------------------------------------------------
-- Per the HorizonDB Learn guide: validate LLM output and reshape `metadata`
-- into clean ontology-aligned JSONB fragments before loading Apache AGE.
CREATE OR REPLACE FUNCTION durable_hack.build_ai_pipeline_graph_fragments()
RETURNS TABLE(validated_fragments INT, skipped_rows INT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_inserted INT := 0;
    v_total    INT := 0;
BEGIN
    SELECT count(*) INTO v_total FROM durable_hack.ai_pipe_extracted_notes;

    WITH parsed AS (
        SELECT
            e.note_seq,
            e.source_ref,
            coalesce(nullif(trim(e.metadata->>'customer_name'), ''), e.customer_hint) AS customer_name,
            coalesce(nullif(trim(e.metadata->>'journey_phase'), ''), 'Building')      AS journey_phase,
            coalesce(nullif(trim(e.metadata->>'sentiment'), ''), 'mixed')             AS sentiment,
            coalesce(
                nullif(trim(e.metadata->>'blocker_summary'), ''),
                'None reported'
            ) AS blocker_summary,
            -- ai.extract_step may return extensions_used as a JSON array OR comma-separated string
            CASE
                WHEN jsonb_typeof(e.metadata->'extensions_used') = 'array' THEN
                    (
                        SELECT coalesce(
                            jsonb_agg(
                                jsonb_build_object('extension_name', lower(trim(x)))
                                ORDER BY lower(trim(x))
                            ),
                            '[]'::jsonb
                        )
                        FROM (
                            SELECT DISTINCT trim(val) AS x
                            FROM jsonb_array_elements_text(e.metadata->'extensions_used') AS val
                            WHERE length(trim(val)) > 0
                        ) d
                    )
                WHEN length(coalesce(e.metadata->>'extensions_used', '')) > 0 THEN
                    (
                        SELECT coalesce(
                            jsonb_agg(
                                jsonb_build_object('extension_name', lower(trim(x)))
                                ORDER BY lower(trim(x))
                            ),
                            '[]'::jsonb
                        )
                        FROM (
                            SELECT DISTINCT trim(val) AS x
                            FROM unnest(string_to_array(e.metadata->>'extensions_used', ',')) AS val
                            WHERE length(trim(val)) > 0
                        ) d
                    )
                ELSE '[]'::jsonb
            END AS extensions_arr
        FROM durable_hack.ai_pipe_extracted_notes e
        WHERE e.metadata IS NOT NULL
    )
    INSERT INTO durable_hack.ai_pipe_graph_fragments (note_seq, source_ref, document)
    SELECT
        p.note_seq,
        p.source_ref,
        jsonb_build_object(
            'customer_name',   p.customer_name,
            'journey_phase',   p.journey_phase,
            'sentiment',       p.sentiment,
            'blocker_summary', left(p.blocker_summary, 140),
            'blocker_short',   left(p.blocker_summary, 48),
            'extensions',      p.extensions_arr,
            '_source',         jsonb_build_object('note_seq', p.note_seq, 'source_ref', p.source_ref)
        )
    FROM parsed p
    WHERE length(p.customer_name) > 0
    ON CONFLICT (note_seq) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN QUERY SELECT v_inserted, greatest(0, v_total - v_inserted);
END;
$$;

-- -----------------------------------------------------------------------------
-- STEP 5: Stage-Ready Demo Helpers (Reset, Cypher Query, & Side-by-Side Diff)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION durable_hack.demo_reset_ai_pipelines_kg()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    TRUNCATE durable_hack.ai_pipe_extracted_notes;
    TRUNCATE durable_hack.ai_pipe_graph_fragments RESTART IDENTITY;
    PERFORM durable_hack.register_ai_kg_pipelines();
    RETURN 'Reset complete: cleared staging/fragments and re-registered hack_kg_extract_pipeline & hack_kg_graph_pipeline.';
END;
$$;

CREATE OR REPLACE FUNCTION durable_hack.demo_ai_pipelines_age_graph()
RETURNS TABLE(customer TEXT, relationship TEXT, target TEXT)
LANGUAGE plpgsql
SET search_path = ag_catalog, "$user", public
AS $fn$
BEGIN
    RETURN QUERY
    SELECT
        trim(both '"' FROM c::text) AS customer,
        trim(both '"' FROM r::text) AS relationship,
        trim(both '"' FROM t::text) AS target
    FROM ag_catalog.cypher('horizondb_ai_kg_pipelines', $$
        MATCH (c:Customer)-[r]->(t)
        RETURN c.customer_name, type(r), coalesce(t.extension_name, t.blocker_summary)
    $$) AS (c ag_catalog.agtype, r ag_catalog.agtype, t ag_catalog.agtype)
    ORDER BY 1, 2, 3;
END;
$fn$;

CREATE OR REPLACE FUNCTION durable_hack.demo_compare_kg_versions()
RETURNS TABLE(
    approach          TEXT,
    graph_name        TEXT,
    orchestrator      TEXT,
    customer_nodes    BIGINT,
    extension_nodes   BIGINT,
    blocker_nodes     BIGINT,
    total_edges       BIGINT,
    extras_included   TEXT
)
LANGUAGE plpgsql
SET search_path = ag_catalog, "$user", public
AS $fn$
DECLARE
    v_pipe_cust BIGINT := 0;
    v_pipe_ext  BIGINT := 0;
    v_pipe_blk  BIGINT := 0;
    v_pipe_edge BIGINT := 0;
    v_dur_cust  BIGINT := 0;
    v_dur_ext   BIGINT := 0;
    v_dur_blk   BIGINT := 0;
    v_dur_edge  BIGINT := 0;
BEGIN
    SELECT cnt::text::bigint INTO v_pipe_cust FROM ag_catalog.cypher('horizondb_ai_kg_pipelines', $$ MATCH (n:Customer) RETURN count(n) $$) AS (cnt ag_catalog.agtype);
    SELECT cnt::text::bigint INTO v_pipe_ext  FROM ag_catalog.cypher('horizondb_ai_kg_pipelines', $$ MATCH (n:Extension) RETURN count(n) $$) AS (cnt ag_catalog.agtype);
    SELECT cnt::text::bigint INTO v_pipe_blk  FROM ag_catalog.cypher('horizondb_ai_kg_pipelines', $$ MATCH (n:Blocker) RETURN count(n) $$) AS (cnt ag_catalog.agtype);
    SELECT cnt::text::bigint INTO v_pipe_edge FROM ag_catalog.cypher('horizondb_ai_kg_pipelines', $$ MATCH ()-[r]->() RETURN count(r) $$) AS (cnt ag_catalog.agtype);

    SELECT cnt::text::bigint INTO v_dur_cust  FROM ag_catalog.cypher('horizondb_ai_kg', $$ MATCH (n:Customer) RETURN count(n) $$) AS (cnt ag_catalog.agtype);
    SELECT cnt::text::bigint INTO v_dur_ext   FROM ag_catalog.cypher('horizondb_ai_kg', $$ MATCH (n:Extension) RETURN count(n) $$) AS (cnt ag_catalog.agtype);
    SELECT count(*)          INTO v_dur_blk   FROM durable_hack.kg_nodes WHERE node_type = 'Blocker';
    SELECT cnt::text::bigint INTO v_dur_edge  FROM ag_catalog.cypher('horizondb_ai_kg', $$ MATCH ()-[r]->() RETURN count(r) $$) AS (cnt ag_catalog.agtype);

    RETURN QUERY
    SELECT
        'Version A: AI Pipelines (Declarative)'::text,
        'horizondb_ai_kg_pipelines'::text,
        'ai.create_graph + ai.create_pipeline (pg_durable under the hood)'::text,
        v_pipe_cust, v_pipe_ext, v_pipe_blk, v_pipe_edge,
        'Ontology validation, disp_label for Graph Visualizer, idempotent AGE upserts, zero Cypher MERGE code'::text
    UNION ALL
    SELECT
        'Version B: Custom pg_durable (Open Source)'::text,
        'horizondb_ai_kg'::text,
        'Direct df.sql + df.loop + df.if_rows'::text,
        v_dur_cust, v_dur_ext, v_dur_blk, v_dur_edge,
        'Strict JSON-schema enums + self-audit (df.metrics) + DiskANN SQ + BM25 + bm25_force_merge + Cohere v4 rerank'::text;
END;
$fn$;
