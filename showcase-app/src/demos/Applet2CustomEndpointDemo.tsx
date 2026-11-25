import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Layers,
  Play,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { APPLET2_STEPS, SHIPMENT_ROWS } from '../data/hackathonData';
import { DemoWalkthroughRail } from '../components/DemoWalkthroughRail';
import { WindowFrame } from '../components/WindowFrame';

export const Applet2CustomEndpointDemo: React.FC = () => {
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [showPayloadBatch, setShowPayloadBatch] = useState<1 | 2 | 3 | null>(null);
  const [showAcaProbe, setShowAcaProbe] = useState(false);

  useEffect(() => {
    if (!autoPlaying) return;
    if (stepIdx >= APPLET2_STEPS.length - 1) {
      setAutoPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setStepIdx((prev) => Math.min(APPLET2_STEPS.length - 1, prev + 1));
    }, 3400);
    return () => clearTimeout(timer);
  }, [autoPlaying, stepIdx]);

  // Determine how many batches are completed from stepIdx
  // Step 0: 0 batches, Step 1: FDW bound (0 batches), Step 2: Batch 1, Step 3: Batch 2, Step 4+: Batch 3
  const completedBatches = stepIdx <= 1 ? 0 : stepIdx === 2 ? 1 : stepIdx === 3 ? 2 : 3;
  const fdwBound = stepIdx >= 1;
  const tokenScrubbed = stepIdx >= 5;
  const scoredCount = completedBatches * 4;

  const handleReset = () => {
    setAutoPlaying(false);
    setStepIdx(0);
    setShowPayloadBatch(null);
    setShowAcaProbe(false);
  };

  const payloadRows = showPayloadBatch
    ? SHIPMENT_ROWS.filter((r) => r.batch === showPayloadBatch)
    : [];

  return (
    <div className="workspace-split">
      {/* LEFT: Interactive Sample App */}
      <div>
        <WindowFrame
          title="Custom Endpoint Batch Scorer — ML Partner / tabular model"
          urlPill="df.http() -> my-ai-foundry.openai.azure.com"
          rightSlot={
            <span className={`pill ${completedBatches === 3 ? 'pill-success' : completedBatches > 0 ? 'pill-accent' : 'pill-neutral'}`}>
              {scoredCount} / 12 scored · {completedBatches} / 3 HTTP calls
            </span>
          }
          hero
        >
          <div className="demo-app-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Applet 2 · pg_durable df.http() + pg_durable_fdw (Custom Endpoints)
                </div>
                <h2 style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 650, letterSpacing: '-0.02em' }}>
                  Supplier Risk Batch Scoring Console
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {completedBatches < 3 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setStepIdx(Math.min(4, Math.max(2, stepIdx + 1)))}
                  >
                    <Play size={13} />
                    {completedBatches === 0 ? 'Score Batch 1 (Rows 1-4)' : `Score Batch ${completedBatches + 1}`}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowAcaProbe((v) => !v)}
                >
                  <AlertTriangle size={13} /> {showAcaProbe ? 'Hide' : 'Test'} ACA Probe (BUG-01)
                </button>
                {stepIdx > 0 && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleReset}>
                    <RotateCcw size={13} /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* Security & Vault Strip */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                padding: '10px 12px',
                borderRadius: 'var(--pg-radius-md)',
                border: '1px solid var(--pg-border)',
                background: tokenScrubbed ? 'var(--pg-success-soft)' : 'var(--pg-surface-muted)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {tokenScrubbed ? (
                  <ShieldCheck size={16} color="#15803d" />
                ) : (
                  <KeyRound size={16} color={fdwBound ? '#2563eb' : '#6b7280'} />
                )}
                <div style={{ fontSize: 12.5 }}>
                  <strong>pg_durable_fdw Vault:</strong>{' '}
                  <span style={{ color: 'var(--pg-text-muted)' }}>
                    {!fdwBound && 'Pending USER MAPPING binding'}
                    {fdwBound && !tokenScrubbed && 'Entra-ID JWT bound in USER MAPPING (resolved at runtime by Rust worker)'}
                    {tokenScrubbed && 'Audit passed: leaked_token_rows = 0 · Ephemeral JWT scrubbed'}
                  </span>
                </div>
              </div>
              <span className="pill pill-success mono">leaked_token_rows: 0</span>
            </div>

            {/* Optional BUG-01 ACA Domain Allow-List Probe */}
            {showAcaProbe && (
              <div
                style={{
                  border: '1px solid rgba(220,38,38,0.35)',
                  background: 'var(--pg-danger-soft)',
                  borderRadius: 'var(--pg-radius-md)',
                  padding: 12,
                  fontSize: 12.5,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--pg-danger)' }}>
                    Live HorizonDB Discovery (BUG-01): ACA Domain Blocked by Allow-List
                  </strong>
                  <span className="pill pill-danger mono">HTTP_NOT_ALLOWED</span>
                </div>
                <div style={{ color: '#7f1d1d', lineHeight: 1.5 }}>
                  Direct <code className="mono">df.http()</code> calls to{' '}
                  <code className="mono">*.azurecontainerapps.io</code> (ML Partner tabular model) are currently blocked because{' '}
                  <code className="mono">pg_durable.http_allowed_domains</code> defaults to{' '}
                  <code className="mono">*.openai.azure.com, *.cognitiveservices.azure.com</code> and is superuser-only.
                  We filed <strong>BUG-01</strong> to allowlist ACA/Foundry domains and <strong>BUG-08</strong> for native Managed Identity in <code className="mono">pg_durable_fdw</code>.
                </div>
              </div>
            )}

            {/* 3 Mini-Batch Cards */}
            <div className="kpi-strip">
              {([1, 2, 3] as const).map((b) => {
                const done = completedBatches >= b;
                const startRow = (b - 1) * 4 + 1;
                const endRow = b * 4;
                return (
                  <div
                    key={b}
                    className="kpi-card"
                    style={{
                      borderColor: done ? 'rgba(21,128,61,0.35)' : undefined,
                      background: done ? '#f8fffb' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="kpi-label">Batch {b} · Rows {startRow}–{endRow}</span>
                      {done ? (
                        <span className="pill pill-success mono" style={{ fontSize: 10 }}>HTTP 200</span>
                      ) : (
                        <span className="pill pill-neutral mono" style={{ fontSize: 10 }}>pending</span>
                      )}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'var(--pg-text-muted)' }}>
                        4 rows -&gt; 1 POST
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '3px 8px', fontSize: 11 }}
                        onClick={() => setShowPayloadBatch(showPayloadBatch === b ? null : b)}
                      >
                        <Layers size={11} /> {showPayloadBatch === b ? 'Hide' : 'JSON'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Optional JSON Payload Inspector */}
            {showPayloadBatch && (
              <div className="sql-box">
                <div className="sql-box-head">
                  <span>claim_shipment_batch(4) -&gt; SINGLE REQUEST PAYLOAD (BATCH {showPayloadBatch})</span>
                  <span>4 rows packed via jsonb_agg()</span>
                </div>
                <pre>
                  <code>
                    {JSON.stringify(
                      {
                        model: 'gpt-5.4',
                        batch: showPayloadBatch,
                        shipments: payloadRows.map((r) => ({
                          shipment_id: r.id,
                          supplier: r.supplier,
                          region: r.region,
                          lead_days: r.leadDays,
                          value_usd: r.valueUsd,
                          late_history: r.lateHistory,
                        })),
                      },
                      null,
                      2
                    )}
                  </code>
                </pre>
              </div>
            )}

            {/* 12-Row Operational Table */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--pg-border)', borderRadius: 'var(--pg-radius-md)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Supplier</th>
                    <th>Region</th>
                    <th>Lead</th>
                    <th>Order USD</th>
                    <th>Batch</th>
                    <th>Status</th>
                    <th>Risk Score</th>
                  </tr>
                </thead>
                <tbody>
                  {SHIPMENT_ROWS.map((row) => {
                    const isScored = completedBatches >= row.batch;
                    const tierClass =
                      row.tier === 'HIGH'
                        ? 'pill-danger'
                        : row.tier === 'MEDIUM'
                        ? 'pill-warning'
                        : 'pill-success';
                    return (
                      <tr key={row.id}>
                        <td className="mono">{row.id}</td>
                        <td className="mono" style={{ fontWeight: 600 }}>{row.supplier}</td>
                        <td className="mono" style={{ color: 'var(--pg-text-muted)' }}>{row.region}</td>
                        <td className="mono">{row.leadDays}d</td>
                        <td className="mono">${row.valueUsd.toLocaleString()}</td>
                        <td className="mono">B{row.batch}</td>
                        <td>
                          {isScored ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--pg-success)', fontWeight: 600, fontSize: 12 }}>
                              <CheckCircle2 size={13} /> scored
                            </span>
                          ) : (
                            <span style={{ color: 'var(--pg-text-faint)', fontSize: 12 }}>pending</span>
                          )}
                        </td>
                        <td>
                          {isScored ? (
                            <span className={`pill ${tierClass} mono`}>
                              {row.riskScore.toFixed(2)} · {row.tier}
                            </span>
                          ) : (
                            <span className="mono" style={{ color: 'var(--pg-text-faint)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </WindowFrame>
      </div>

      {/* RIGHT: Walkthrough Rail */}
      <DemoWalkthroughRail
        scriptName="02/demo_walkthrough.sql"
        steps={APPLET2_STEPS}
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
