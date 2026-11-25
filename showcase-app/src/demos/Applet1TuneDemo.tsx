import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  XCircle,
} from 'lucide-react';
import { APPLET1_STEPS } from '../data/hackathonData';
import { DemoWalkthroughRail } from '../components/DemoWalkthroughRail';
import { WindowFrame } from '../components/WindowFrame';

type TuneOutcome = 'pending' | 'approved' | 'rejected' | 'rolled_back';

export const Applet1TuneDemo: React.FC = () => {
  const [stepIdx, setStepIdx] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [outcome, setOutcome] = useState<TuneOutcome>('pending');

  useEffect(() => {
    if (!autoPlaying) return;
    if (stepIdx >= APPLET1_STEPS.length - 1) {
      setAutoPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setStepIdx((prev) => {
        const next = Math.min(APPLET1_STEPS.length - 1, prev + 1);
        if (next >= 4 && outcome === 'pending') setOutcome('approved');
        return next;
      });
    }, 3400);
    return () => clearTimeout(timer);
  }, [autoPlaying, stepIdx, outcome]);

  const handleSelectStep = (idx: number) => {
    setAutoPlaying(false);
    setStepIdx(idx);
    if (idx < 4) {
      setOutcome('pending');
    } else if (outcome === 'pending') {
      setOutcome('approved');
    }
  };

  const handleReset = () => {
    setAutoPlaying(false);
    setStepIdx(0);
    setOutcome('pending');
  };

  const handleApprove = () => {
    setOutcome('approved');
    setStepIdx(5);
  };

  const handleReject = () => {
    setOutcome('rejected');
    setStepIdx(4);
  };

  const handleSimulateRegression = () => {
    setOutcome('rolled_back');
    setStepIdx(5);
  };

  const instanceStarted = stepIdx >= 1;
  const pausedForSignal = stepIdx >= 2 && stepIdx <= 3;
  const completedApproved = stepIdx >= 4 && outcome === 'approved';
  const completedRejected = stepIdx >= 4 && outcome === 'rejected';
  const completedRolledBack = stepIdx >= 5 && outcome === 'rolled_back';

  const statusBadge = () => {
    if (!instanceStarted) return <span className="pill pill-neutral">Idle · Baseline Only</span>;
    if (pausedForSignal) return <span className="pill pill-warning">running · Parked on df.wait_for_signal</span>;
    if (completedRejected) return <span className="pill pill-neutral">completed · Rejected (No DDL Applied)</span>;
    if (completedRolledBack) return <span className="pill pill-danger">completed · Auto-Rolled Back (df.if)</span>;
    return <span className="pill pill-success">completed · Verified E3 (−99.6% Cost)</span>;
  };

  const dagNodes = [
    {
      name: '1. capture_baseline',
      type: 'SQL',
      state: stepIdx >= 1 ? 'done' : 'pending',
    },
    {
      name: '2. propose_fix (gpt-5.4)',
      type: 'AI_FN',
      state: stepIdx >= 1 ? 'done' : 'pending',
    },
    {
      name: '3. wait_for_signal',
      type: 'SIGNAL',
      state: stepIdx < 1 ? 'pending' : stepIdx <= 3 ? 'paused' : 'done',
    },
    {
      name: '4. apply_concurrently',
      type: 'CHILD_WF',
      state:
        completedRejected
          ? 'skipped'
          : stepIdx >= 4
          ? 'done'
          : 'pending',
    },
    {
      name: '5. verify_or_rollback',
      type: 'DF.IF',
      state:
        completedRejected
          ? 'skipped'
          : stepIdx >= 5
          ? completedRolledBack
            ? 'warn'
            : 'done'
          : 'pending',
    },
  ];

  const postCost =
    completedApproved ? '4.44' : completedRolledBack ? '1,218.42' : completedRejected ? '1,218.42' : '—';
  const savingsText =
    completedApproved ? '−99.6%' : completedRolledBack ? '0.0% (reverted)' : completedRejected ? 'No change' : 'Pending';

  return (
    <div className="workspace-split">
      {/* LEFT: Stageshow Sample App */}
      <div>
        <WindowFrame
          title="DBA Query Tuning Studio — ai.tune_sql"
          urlPill="horizondb://durable_hack.orders"
          rightSlot={statusBadge()}
          hero
        >
          <div className="demo-app-body">
            {/* Top summary + direct interactive controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--pg-text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Applet 1 · Pure pg_durable (Super Custom State Machine)
                </div>
                <h2 style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 650, letterSpacing: '-0.02em' }}>
                  Verify-Before-Apply Index Optimizer
                </h2>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {!instanceStarted && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setStepIdx(2)}
                  >
                    <Play size={13} /> Run ai.tune_sql Workflow
                  </button>
                )}
                {instanceStarted && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleReset}
                  >
                    <RotateCcw size={13} /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* KPI Strip */}
            <div className="kpi-strip">
              <div className="kpi-card">
                <div className="kpi-label">Baseline Cost (Seq Scan)</div>
                <div className="kpi-value">1,218.42</div>
                <div className="kpi-sub">50,000 rows · no composite index</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Post-Apply Cost</div>
                <div
                  className="kpi-value"
                  style={{
                    color: completedApproved
                      ? 'var(--pg-success)'
                      : completedRolledBack
                      ? 'var(--pg-danger)'
                      : 'var(--pg-text)',
                  }}
                >
                  {postCost}
                </div>
                <div className="kpi-sub">
                  {completedApproved ? 'Index Scan · Evidence E3' : 'Awaiting verified apply'}
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Cost Reduction</div>
                <div
                  className="kpi-value"
                  style={{ color: completedApproved ? 'var(--pg-success)' : 'var(--pg-text)' }}
                >
                  {savingsText}
                </div>
                <div className="kpi-sub">hypopg predicted −99.6%</div>
              </div>
            </div>

            {/* Live pg_durable DAG Tracker */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  pg_durable Workflow Execution Graph
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--pg-text-faint)' }}>
                  instance_id: {instanceStarted ? '819f4c2a' : 'not started'}
                </span>
              </div>
              <div className="dag-row">
                {dagNodes.map((n) => (
                  <div
                    key={n.name}
                    className={`dag-node${
                      n.state === 'done'
                        ? ' is-done'
                        : n.state === 'paused'
                        ? ' is-paused'
                        : ''
                    }`}
                    style={
                      n.state === 'warn'
                        ? { borderColor: 'rgba(220,38,38,0.45)', background: 'var(--pg-danger-soft)' }
                        : n.state === 'skipped'
                        ? { opacity: 0.48 }
                        : undefined
                    }
                  >
                    <div className="dag-node-type">{n.type}</div>
                    <div className="dag-node-name">{n.name}</div>
                    <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--pg-text-muted)' }}>
                      {n.state === 'done' && '✓ succeeded'}
                      {n.state === 'paused' && '⏸ waiting signal'}
                      {n.state === 'warn' && '↩ reverted'}
                      {n.state === 'skipped' && '— skipped'}
                      {n.state === 'pending' && '· queued'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Interactive DBA Approval Gate Card */}
            {instanceStarted && (
              <div
                style={{
                  border: pausedForSignal
                    ? '1px solid rgba(180,83,9,0.4)'
                    : '1px solid var(--pg-border)',
                  background: pausedForSignal ? '#fffbeb' : 'var(--pg-surface-muted)',
                  borderRadius: 'var(--pg-radius-md)',
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {pausedForSignal ? (
                      <Clock size={16} color="#b45309" />
                    ) : completedApproved ? (
                      <ShieldCheck size={16} color="#15803d" />
                    ) : completedRolledBack ? (
                      <ShieldAlert size={16} color="#b91c1c" />
                    ) : (
                      <XCircle size={16} color="#52525b" />
                    )}
                    <strong style={{ fontSize: 13 }}>
                      {pausedForSignal
                        ? 'DBA Human-in-the-Loop Gate — Action Required'
                        : completedApproved
                        ? 'Approved by abe@contoso.com · Applied via Child Workflow'
                        : completedRolledBack
                        ? 'Regression Detected · df.if() Executed Auto-Rollback DDL'
                        : 'Proposal Rejected · Production Untouched'}
                    </strong>
                  </div>
                  <span className="pill pill-accent">risk_tier: LOW · hypopg verified</span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 10,
                  }}
                >
                  <div className="sql-box">
                    <div className="sql-box-head">
                      <span>PROPOSED DDL (gpt-5.4 · NON-BLOCKING)</span>
                    </div>
                    <pre>
                      <code>{`CREATE INDEX CONCURRENTLY IF NOT EXISTS
  idx_orders_cust_status_created
ON durable_hack.orders
  (customer_id, status, created_at DESC);`}</code>
                    </pre>
                  </div>
                  <div className="sql-box">
                    <div className="sql-box-head">
                      <span>PRE-GENERATED ROLLBACK DDL</span>
                    </div>
                    <pre>
                      <code>{`DROP INDEX CONCURRENTLY IF EXISTS
  durable_hack.idx_orders_cust_status_created;`}</code>
                    </pre>
                  </div>
                </div>

                {/* Live Interactive Signal Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleApprove}
                  >
                    <CheckCircle2 size={14} /> Approve &amp; Signal df.signal(&apos;approve_tune&apos;)
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleReject}
                  >
                    <XCircle size={14} /> Reject Proposal
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleSimulateRegression}
                    title="Test df.if() conditional auto-rollback path"
                  >
                    <Undo2 size={14} /> Simulate Regression -&gt; Auto-Rollback
                  </button>
                </div>
              </div>
            )}

            {/* EXPLAIN Plan Before vs After */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div className="sql-box">
                <div className="sql-box-head">
                  <span>BEFORE · SEQ SCAN (COST 1,218.42)</span>
                  <span style={{ color: '#f87171', fontSize: 10.5 }}>SLOW</span>
                </div>
                <pre>
                  <code>{`Limit  (cost=1218.37..1218.42 rows=20)
  -> Sort  (cost=1218.37..1218.49 rows=48)
       Sort Key: created_at DESC
       -> Seq Scan on orders  (cost=0.00..1217.00)
            Filter: (customer_id = 42 AND status = 'pending')`}</code>
                </pre>
              </div>
              <div className="sql-box">
                <div className="sql-box-head">
                  <span>
                    {completedApproved
                      ? 'AFTER · INDEX SCAN (COST 4.44 · −99.6%)'
                      : 'AFTER · AWAITING APPROVED INDEX'}
                  </span>
                  {completedApproved && <span style={{ color: '#4ade80', fontSize: 10.5 }}>VERIFIED E3</span>}
                </div>
                <pre>
                  <code>
                    {completedApproved
                      ? `Limit  (cost=0.29..4.44 rows=20)
  -> Index Scan using idx_orders_cust_status_created
       on orders  (cost=0.29..10.22 rows=48)
       Index Cond: (customer_id = 42 AND status = 'pending')`
                      : completedRolledBack
                      ? `-- Simulated post_cost > baseline_cost
-- df.if() auto-executed DROP INDEX CONCURRENTLY
-- Plan safely restored to baseline (1,218.42)`
                      : `-- No DDL has touched production yet.
-- Click "Approve & Signal" above or advance to Step 5.`}
                  </code>
                </pre>
              </div>
            </div>
          </div>
        </WindowFrame>
      </div>

      {/* RIGHT: Walkthrough Rail */}
      <DemoWalkthroughRail
        scriptName="01/demo_walkthrough.sql"
        steps={APPLET1_STEPS}
        currentIndex={stepIdx}
        onSelectStep={handleSelectStep}
        onReset={handleReset}
        autoPlaying={autoPlaying}
        onToggleAutoPlay={() => setAutoPlaying((v) => !v)}
      />
    </div>
  );
};
