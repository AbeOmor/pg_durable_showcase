# pg_durable HorizonDB Applet Hackathon Showcase

Interactive web showcase wrapping all three live-verified `pg_durable` Azure HorizonDB applets, styled with the **[stageshow](https://github.com/benjitaylor/skills)** kit: scripted product stages, window chrome and motion parts.

## What's Inside

- **Overview & Architecture Spectrum** — Explains when to use **AI Functions** (single-call managed models), **AI Pipelines** (well-known declarative workflows), and open-source **`pg_durable`** (unlimited custom orchestration).
- **01 · `ai.tune_sql` (Pure `pg_durable`)** — Interactive Verify-Before-Apply DBA Studio with live `df.wait_for_signal()` Approve/Reject/Auto-Rollback controls, live DAG visualization, EXPLAIN cost diff (`1,218.42 -> 4.44`, −99.6%, `E3`), and the 6-step SQL walkthrough.
- **02 · ML Partner / tabular model Custom Endpoint (`df.http` + `pg_durable_fdw`)** — Interactive 12-shipment batch scorer (`3` mini-batches of `4`), live JSON batch payload inspector, `pg_durable_fdw` zero-leak vault audit (`leaked_token_rows = 0`), and interactive `BUG-01` ACA allow-list probe.
- **03 · Knowledge Graph & AI Brain (Version A vs. Version B)** — Side-by-side interactive comparison of **Version A (Declarative AI Pipelines: `ai.create_graph` + `ai.graph_sink`)** vs. **Version B (Custom Open-Source `pg_durable` stitching all 5 HorizonDB extensions)**, with a clickable Apache AGE graph visualizer, live hybrid search playground (DiskANN SQ + BM25 + Cohere v4), and `df.metrics()` vs. RLS self-audit (`BUG-02`).

## Run Locally

```bash
cd playground/pg_durable-hackathon/showcase-app
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

## Stageshow kit

`src/kit/` is the stageshow kit vendored unmodified from [`benjitaylor/skills`](https://github.com/benjitaylor/skills) (MIT, see `src/kit/LICENSE` and `src/kit/NOTICE.md`). Never edit it; restyle from `src/styles/site.css` (kit CSS lives in `@layer stageshow`, so unlayered host CSS wins).

- `src/stages/HeroStage.tsx`: the overview hero, Applet 1's workflow in five beats (baseline → fix → DBA approval → apply → verify), with a compact layout below 600px.
- `src/stages/TileStages.tsx`: one scripted tile per applet card (cost drop, three `df.http` batches, A vs B graph edges).
- `src/styles/kit-tokens.css`: the kit's `--ss-*` tokens scoped to `.pg-kit`, so kit parts (`Meter`, `Badge`, `Window`) work outside a stage.

Each walkthrough step hides its SQL behind a **Show SQL** toggle that re-collapses on every step change, so a presenter can reveal it on cue.

### Filming the stages

With `npm run dev` running and the stageshow skill checked out:

```bash
node scripts/film.mjs http://localhost:5173 --gate
node scripts/film.mjs http://localhost:5173 --gate --width 390 --states
```

Both must end with `rehearsal passed`. See `src/stages/REHEARSAL.md` for the last run.

## Deploy

`npm run build` writes a static site to `dist/` with a relative base, so it can be served from any path (GitHub Pages included). The SQL shown is real; the site itself makes no database calls.
