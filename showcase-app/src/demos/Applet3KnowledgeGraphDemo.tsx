import React, { useEffect, useMemo, useState } from 'react';
import {
  GitCompare,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  APPLET3_DURABLE_STEPS,
  APPLET3_PIPELINE_STEPS,
  CUSTOMER_NOTES,
} from '../data/hackathonData';
import { DemoWalkthroughRail } from '../components/DemoWalkthroughRail';
import { KnowledgeGraphSvg } from '../components/KnowledgeGraphSvg';
import { WindowFrame } from '../components/WindowFrame';

type Applet3View = 'pipelines' | 'durable' | 'compare';

export const Applet3KnowledgeGraphDemo: React.FC = () => {
  const [view, setView] = useState<Applet3View>('pipelines');
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState(
    'Which customers need pg_durable with Azure Container Apps or enterprise governance blockers?'
  );

  const steps = view === 'durable' ? APPLET3_DURABLE_STEPS : APPLET3_PIPELINE_STEPS;

  useEffect(() => {
    setStepIdx(0);
    setAutoPlaying(false);
  }, [view]);

  useEffect(() => {
    if (!autoPlaying || view === 'compare') return;
    if (stepIdx >= steps.length - 1) {
      setAutoPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setStepIdx((prev) => Math.min(steps.length - 1, prev + 1));
    }, 3400);
    return () => clearTimeout(timer);
  }, [autoPlaying, stepIdx, steps.length, view]);

  const rankedNotes = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const isTuneQuery =
      q.includes('tune') || q.includes('explain') || q.includes('hypopg') || q.includes('mining co');
    const key = isTuneQuery ? 'tune' : 'aca';
    return [...CUSTOMER_NOTES]
      .map((n) => {
        const keywordBoost =
          q.includes(n.customer.toLowerCase()) ||
          n.extensions.some((ext) => q.includes(ext.toLowerCase()))
            ? 0.08
            : 0;
        const score = Math.min(0.999, (n.cohereScores[key] || 0.2) + keywordBoost);
        return { ...n, score, rrf: n.rrfScores[key] || 0.0156 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [searchQuery]);

  const handleReset = () => {
    setAutoPlaying(false);
    setStepIdx(0);
  };

  if (view === 'compare') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <WindowFrame
          title="Applet 3 Comparison — AI Pipelines vs Open-Source pg_durable"
          urlPill="SELECT * FROM durable_hack.demo_compare_kg_versions();"
          rightSlot={
            <div className="segmented" role="tablist">
              <button type="button" onClick={() => setView('pipelines')}>
                Version A · AI Pipelines
              </button>
              <button type="button" onClick={() => setView('durable')}>
                Version B · Custom pg_durable
              </button>
              <button type="button" className="active" onClick={() => setView('compare')}>
                Side-by-Side Diff
              </button>
            </div>
          }
          hero
        >
          <div className="demo-app-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Live Telemetry from demo-horizondb · Same 6 Customer Notes
                </div>
                <h2 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em' }}>
                  When to Choose AI Pipelines vs Open-Source pg_durable
                </h2>
              </div>
              <span className="pill pill-accent">
                <GitCompare size={12} /> Both run on pg_durable under the hood!
              </span>
            </div>

            <div className="compare-grid">
              <div className="compare-card" style={{ borderColor: 'rgba(21,128,61,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>
                    Version A: Declarative AI Pipelines
                  </h3>
                  <span className="pill pill-success">Best for Well-Known Workflows</span>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--pg-text-muted)', lineHeight: 1.5 }}>
                  High-level <code className="mono">ai.create_graph()</code> + <code className="mono">ai.extract_step()</code> +{' '}
                  <code className="mono">ai.graph_sink()</code>. Compiles down to <code className="mono">pg_durable</code> instances{' '}
                  (<code className="mono">302fede6</code> &amp; <code className="mono">3a1b27da</code>) automatically with zero hand-written Cypher.
                </p>
                <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div className="kpi-card">
                    <div className="kpi-label">Customers</div>
                    <div className="kpi-value">6</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">Extensions</div>
                    <div className="kpi-value">6</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">AGE Edges</div>
                    <div className="kpi-value">23</div>
                  </div>
                </div>
                <ul style={{ margin: '12px 0 14px', paddingLeft: 18, fontSize: 12.5, color: 'var(--pg-text-muted)', lineHeight: 1.65 }}>
                  <li>Zero Cypher <code className="mono">MERGE</code> statements to write or debug</li>
                  <li>Ontology-validated labels + <code className="mono">disp_label</code> ready for VS Code Visualizer</li>
                  <li>Limitation: loose string extraction (Exchange Co. got <code className="mono">&quot;POC, Building&quot;</code>) &amp; no DiskANN/BM25/audit steps</li>
                </ul>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setView('pipelines')}>
                  <Play size={13} /> Walk Through Version A
                </button>
              </div>

              <div className="compare-card" style={{ borderColor: 'rgba(37,99,235,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 650 }}>
                    Version B: Custom Open-Source pg_durable
                  </h3>
                  <span className="pill pill-accent">Unlimited Customization</span>
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--pg-text-muted)', lineHeight: 1.5 }}>
                  One end-to-end durable DAG (<code className="mono">b52adb98</code>) combining all 5 HorizonDB extensions:
                  cluster self-audit, strict JSON-schema extraction, DiskANN SQ, BM25 compaction, AGE graph, and Cohere v4 reranking.
                </p>
                <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div className="kpi-card">
                    <div className="kpi-label">Extensions</div>
                    <div className="kpi-value">5</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">AGE Edges</div>
                    <div className="kpi-value">24</div>
                  </div>
                  <div className="kpi-card">
                    <div className="kpi-label">RLS Audit Gap</div>
                    <div className="kpi-value" style={{ color: 'var(--pg-danger)' }}>9</div>
                  </div>
                </div>
                <ul style={{ margin: '12px 0 14px', paddingLeft: 18, fontSize: 12.5, color: 'var(--pg-text-muted)', lineHeight: 1.65 }}>
                  <li>Strict JSON-schema enums (<code className="mono">ai.generate</code>) guarantee clean <code className="mono">&quot;Building&quot;</code> labels</li>
                  <li>Stitches DiskANN SQ (<code className="mono">sq_bits=4</code>), <code className="mono">bm25_force_merge()</code>, and <code className="mono">df.metrics()</code> governance audit in one workflow</li>
                  <li>100% open-source SQL orchestration portable to any custom step or external endpoint</li>
                </ul>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setView('durable')}>
                  <Play size={13} /> Walk Through Version B
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto', border: '1px solid var(--pg-border)', borderRadius: 'var(--pg-radius-md)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Dimension</th>
                    <th>Version A: AI Pipelines (horizondb_ai_kg_pipelines)</th>
                    <th>Version B: Custom pg_durable (horizondb_ai_kg)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Best For</td>
                    <td>Standard, well-known document -&gt; KG pipelines</td>
                    <td>Super-custom multi-extension DAGs, audits &amp; business rules</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Graph Authoring</td>
                    <td>Declarative <code className="mono">ai.create_graph</code> + <code className="mono">ai.graph_sink</code> (0 Cypher)</td>
                    <td>Custom SQL/Cypher + relational tables + vector/BM25 sync</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Schema Strictness</td>
                    <td>Natural-language prompt (<code className="mono">&quot;POC, Building&quot;</code> drift possible)</td>
                    <td>Strict JSON Schema enum via <code className="mono">ai.generate()</code></td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>DiskANN + BM25 + Audit</td>
                    <td>Not included (separate workflows needed)</td>
                    <td>Orchestrated atomically in the exact same durable DAG</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Under the Hood</td>
                    <td>Compiles to <code className="mono">pg_durable</code> (<code className="mono">302fede6</code>, <code className="mono">3a1b27da</code>)</td>
                    <td>Direct open-source <code className="mono">pg_durable</code> (<code className="mono">b52adb98</code>)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </WindowFrame>
      </div>
    );
  }

  const isPipelines = view === 'pipelines';
  const graphBuilt = isPipelines ? stepIdx >= 3 : stepIdx >= 2;

  return (
    <div className="workspace-split">
      {/* LEFT: Sample App */}
      <div>
        <WindowFrame
          title={
            isPipelines
              ? 'Knowledge Graph Studio — Version A (AI Pipelines)'
              : 'HorizonDB AI Brain — Version B (Custom pg_durable · 5 Extensions)'
          }
          urlPill={
            isPipelines
              ? 'ai.run(hack_kg_graph_pipeline) -> instance 3a1b27da'
              : 'pg_durable + azure_ai + pg_diskann + pg_textsearch + age'
          }
          rightSlot={
            <div className="segmented" role="tablist">
              <button
                type="button"
                className={view === 'pipelines' ? 'active' : ''}
                onClick={() => setView('pipelines')}
              >
                A · AI Pipelines
              </button>
              <button
                type="button"
                className={view === 'durable' ? 'active' : ''}
                onClick={() => setView('durable')}
              >
                B · pg_durable
              </button>
              <button
                type="button"
                onClick={() => setView('compare')}
              >
                Compare
              </button>
            </div>
          }
          hero
        >
          <div className="demo-app-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {isPipelines
                    ? 'Applet 3 · Version A · Declarative AI Pipelines (Well-Known Workflow)'
                    : 'Applet 3 · Version B · Open-Source pg_durable (Full 5-Extension Stack)'}
                </div>
                <h2 style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 650, letterSpacing: '-0.02em' }}>
                  {isPipelines
                    ? '2-Stage Declarative Knowledge Graph Pipeline'
                    : 'Unified Knowledge Graph, Hybrid Search & Self-Audit'}
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {stepIdx < steps.length - 1 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setStepIdx(stepIdx + 1)}
                  >
                    <Play size={13} /> Run Step {stepIdx + 2}
                  </button>
                )}
                {stepIdx > 0 && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>
                    <RotateCcw size={13} /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* Stage Progress Strip */}
            {isPipelines ? (
              <div className="dag-row">
                {[
                  { name: '1. ai.create_graph', sub: 'Ontology JSONB', done: stepIdx >= 0 },
                  { name: '2. Stage 1 Extract', sub: 'inst: 302fede6 (6/6)', done: stepIdx >= 1 },
                  { name: '3. SQL Gate', sub: '6 valid fragments', done: stepIdx >= 2 },
                  { name: '4. ai.graph_sink', sub: 'inst: 3a1b27da (23 edges)', done: stepIdx >= 3 },
                ].map((s) => (
                  <div key={s.name} className={`dag-node${s.done ? ' is-done' : ''}`}>
                    <div className="dag-node-type">{s.done ? 'READY' : 'PENDING'}</div>
                    <div className="dag-node-name">{s.name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--pg-text-muted)', marginTop: 3 }}>
                      {s.sub}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dag-row">
                {[
                  { name: '1. df.metrics Audit', sub: '23 vs 14 (BUG-02)', done: stepIdx >= 0 },
                  { name: '2. df.loop Enrich', sub: 'embed + strict schema', done: stepIdx >= 1 },
                  { name: '3. DiskANN+BM25+AGE', sub: 'sq_bits=4 + merge', done: stepIdx >= 2 },
                  { name: '4. ask_ai_stack()', sub: 'RRF + Cohere v4', done: stepIdx >= 3 },
                ].map((s) => (
                  <div key={s.name} className={`dag-node${s.done ? ' is-done' : ''}`}>
                    <div className="dag-node-type">{s.done ? 'DONE' : 'QUEUED'}</div>
                    <div className="dag-node-name">{s.name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--pg-text-muted)', marginTop: 3 }}>
                      {s.sub}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Version B Self-Audit Banner on Step 0+ */}
            {!isPipelines && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '10px 12px',
                  borderRadius: 'var(--pg-radius-md)',
                  border: '1px solid rgba(180,83,9,0.3)',
                  background: '#fffbeb',
                  fontSize: 12.5,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={16} color="#b45309" />
                  <span>
                    <strong>Self-Audit Snapshot (BUG-02):</strong> Cluster{' '}
                    <code className="mono">df.metrics()</code> = <strong>23</strong> runs vs caller RLS{' '}
                    <code className="mono">df.list_instances()</code> = <strong>14</strong> runs.
                  </span>
                </div>
                <span className="pill pill-warning mono">rls_visibility_gap: 9</span>
              </div>
            )}

            {/* Interactive Apache AGE Knowledge Graph */}
            <KnowledgeGraphSvg mode={isPipelines ? 'pipelines' : 'durable'} built={graphBuilt} />

            {/* Version B: Live Hybrid Search Playground */}
            {!isPipelines && (
              <div
                style={{
                  border: '1px solid var(--pg-border)',
                  borderRadius: 'var(--pg-radius-md)',
                  padding: 14,
                  background: 'var(--pg-surface-muted)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Search size={14} color="#2563eb" />
                    <strong style={{ fontSize: 13 }}>
                      Live Hybrid Search Playground — durable_hack.ask_ai_stack()
                    </strong>
                  </div>
                  <span className="pill pill-accent mono" style={{ fontSize: 10.5 }}>
                    DiskANN SQ (sq_bits=4) + BM25 + Cohere v4
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Hybrid search query"
                    style={{
                      flex: 1,
                      minWidth: 220,
                      padding: '8px 11px',
                      borderRadius: 'var(--pg-radius-sm)',
                      border: '1px solid var(--pg-border-strong)',
                      background: '#fff',
                      fontSize: 13,
                      fontFamily: 'var(--pg-font-sans)',
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setSearchQuery('Mining Co. SQL tuning hypopg verify before apply')
                    }
                  >
                    Try: SQL Tuning
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setSearchQuery('Which customers need pg_durable with Azure Container Apps or enterprise governance blockers?')
                    }
                  >
                    Try: ACA + Governance
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {rankedNotes.map((item, idx) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '8px 10px',
                        borderRadius: 'var(--pg-radius-sm)',
                        background: '#fff',
                        border: '1px solid var(--pg-border)',
                        fontSize: 12.5,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="mono" style={{ fontWeight: 700, color: 'var(--pg-accent)' }}>
                            #{idx + 1}
                          </span>
                          <strong>{item.customer}</strong>
                          <span className="pill pill-neutral" style={{ fontSize: 10.5 }}>
                            {item.journeyPhaseDurable}
                          </span>
                          <span className="mono" style={{ fontSize: 11, color: 'var(--pg-text-faint)' }}>
                            [{item.extensions.join(', ')}]
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--pg-text-muted)', marginTop: 2 }}>
                          {item.blocker}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flex: 'none' }}>
                        <div className="mono" style={{ fontSize: 12, fontWeight: 650, color: 'var(--pg-success)' }}>
                          {item.score.toFixed(4)}
                        </div>
                        <div className="mono" style={{ fontSize: 10.5, color: 'var(--pg-text-faint)' }}>
                          RRF {item.rrf.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Version A: Validation Gate Preview */}
            {isPipelines && stepIdx >= 2 && (
              <div
                style={{
                  border: '1px solid var(--pg-border)',
                  borderRadius: 'var(--pg-radius-md)',
                  padding: 12,
                  background: '#fff',
                  fontSize: 12.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={15} color="#15803d" />
                  <span>
                    <strong>Live Discovery:</strong> Notice Exchange Co. extracted{' '}
                    <code className="mono">&quot;POC, Building&quot;</code> in Version A (natural-language prompt) vs strict{' '}
                    <code className="mono">&quot;Building&quot;</code> in Version B. Click <strong>Compare</strong> to inspect the full diff!
                  </span>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setView('compare')}>
                  Open Side-by-Side Diff
                </button>
              </div>
            )}
          </div>
        </WindowFrame>
      </div>

      {/* RIGHT: Walkthrough Rail */}
      <DemoWalkthroughRail
        scriptName={
          isPipelines ? '03/demo_walkthrough_ai_pipelines.sql' : '03/demo_walkthrough.sql'
        }
        steps={steps}
        currentIndex={stepIdx}
        onSelectStep={(idx) => {
          setAutoPlaying(false);
          setStepIdx(idx);
        }}
        onReset={handleReset}
        autoPlaying={autoPlaying}
        onToggleAutoPlay={() => setAutoPlaying((v) => !v)}
      />
    </div>
  );
};
