import React, { useState } from 'react';
import {
  ArrowRight,
  Cpu,
  Database,
  GitBranch,
  Globe,
  Layers,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { WindowFrame } from './WindowFrame';
import { HeroStage } from '../stages/HeroStage';
import { BatchTile, GraphTile, TuneTile } from '../stages/TileStages';

export type ActiveRoute = 'overview' | 'applet1' | 'applet2' | 'applet3';

interface OverviewPageProps {
  onNavigate: (route: ActiveRoute) => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ onNavigate }) => {
  const [heroTake, setHeroTake] = useState(0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      {/* HERO */}
      <section className="hero-block">
        <div className="hero-copy">
        <div className="hero-eyebrow">
          <Database size={13} color="#2563eb" />
          <span>Azure HorizonDB · pg_durable Applet Hackathon Showcase</span>
        </div>
        <h1>
          Declarative when it&apos;s standard.
          <br />
          Open-source <code className="mono" style={{ fontSize: '0.88em', color: 'var(--pg-accent)' }}>pg_durable</code> when it&apos;s custom.
        </h1>
        <p className="hero-lead">
          Three live-tested HorizonDB applets demonstrating where <strong>AI Functions</strong>,{' '}
          <strong>AI Pipelines</strong>, and open-source <strong>pg_durable</strong> each fit—complete with
          interactive sample apps, step-by-step SQL walkthroughs, and real telemetry from{' '}
          <code className="mono">demo-horizondb</code>.
        </p>
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={() => onNavigate('applet1')}>
            Try Demo <ArrowRight size={14} />
          </button>
          <a className="btn btn-secondary" href="#applets">
            See all 3 applets
          </a>
        </div>
        </div>

        <div className="hero-stage">
          <HeroStage key={heroTake} />
          <div className="replay-row">
            <button type="button" className="replay-btn" onClick={() => setHeroTake((t) => t + 1)}>
              <RotateCcw size={12} /> Replay
            </button>
          </div>
        </div>
      </section>

      {/* Spectrum strip */}
      <section className="spectrum-strip" aria-label="HorizonDB AI layers">
          <div className="spectrum-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="pill pill-warning">Layer 1 · AI Functions</span>
              <Cpu size={14} color="#b45309" />
            </div>
            <h3>Single-Call Managed Models</h3>
            <p>
              Invoke <code className="mono">ai.generate()</code>, <code className="mono">ai.embed()</code>, and{' '}
              <code className="mono">ai.rank()</code> directly inside SQL for managed models with zero API keys.
            </p>
          </div>
          <div className="spectrum-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="pill pill-success">Layer 2 · AI Pipelines</span>
              <Layers size={14} color="#15803d" />
            </div>
            <h3>Well-Known Declarative Workflows</h3>
            <p>
              Zero-boilerplate chunking, extraction, and Apache AGE graph loading (<code className="mono">ai.graph_sink</code>)—compiled
              automatically onto <code className="mono">pg_durable</code> under the hood.
            </p>
          </div>
          <div className="spectrum-card" style={{ borderColor: 'rgba(37,99,235,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="pill pill-accent">Layer 3 · Open-Source pg_durable</span>
              <GitBranch size={14} color="#2563eb" />
            </div>
            <h3>Super Custom Orchestration</h3>
            <p>
              Human approval signals, custom HTTPS endpoints (<code className="mono">df.http</code> +{' '}
              <code className="mono">pg_durable_fdw</code>), multi-extension DAGs, and conditional rollbacks.
            </p>
          </div>
      </section>

      {/* 3 APPLET STAGESHOW CARDS */}
      <section id="applets">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em' }}>
            Explore the 3 Hackathon Applets
          </h2>
          <span style={{ fontSize: 12.5, color: 'var(--pg-text-faint)' }}>
            Click <strong>Try Demo</strong> on any card to launch its interactive sample app &amp; SQL walkthrough
          </span>
        </div>

        <div className="applet-grid">
          {/* Card 1 */}
          <article className="applet-card">
            <div className="applet-card-picture">
              <TuneTile />
            </div>
            <div className="applet-card-body">
              <div className="applet-card-head">
                <span className="mono applet-card-name">01 · ai.tune_sql</span>
                <span className="pill pill-accent">Pure pg_durable</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--pg-text-faint)' }}>
                <ShieldCheck size={13} color="#2563eb" />
                <span>Mining Co. · DBA Verify-Before-Apply</span>
              </div>
              <h3 className="applet-card-title">Human-in-the-Loop SQL Index Optimizer</h3>
              <p className="applet-card-desc">
                Captures redacted EXPLAIN, validates with <code className="mono">hypopg</code>, drafts a{' '}
                <code className="mono">gpt-5.4</code> index proposal, parks on{' '}
                <code className="mono">df.wait_for_signal()</code>, applies{' '}
                <code className="mono">CONCURRENTLY</code> via child workflow, and auto-reverts regressions.
              </p>
              <div className="applet-card-footer">
                <span className="mono" style={{ fontSize: 11, color: 'var(--pg-text-faint)' }}>
                  6 demo steps · interactive signal
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onNavigate('applet1')}
                >
                  Try Demo <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </article>

          {/* Card 2 */}
          <article className="applet-card">
            <div className="applet-card-picture">
              <BatchTile />
            </div>
            <div className="applet-card-body">
              <div className="applet-card-head">
                <span className="mono applet-card-name">02 · Partner ACA HTTP</span>
                <span className="pill pill-accent">df.http + FDW</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--pg-text-faint)' }}>
                <Globe size={13} color="#2563eb" />
                <span>ML Partner · tabular model Custom Endpoints</span>
              </div>
              <h3 className="applet-card-title">Custom Endpoint Batch Scoring &amp; Vault</h3>
              <p className="applet-card-desc">
                AI Functions can&apos;t call custom ACA containers or Entra-ID-only APIs.{' '}
                <code className="mono">df.loop</code> + <code className="mono">df.http()</code> packs 12 shipments
                into 3 batches of 4 with zero leaked tokens via <code className="mono">pg_durable_fdw</code>.
              </p>
              <div className="applet-card-footer">
                <span className="mono" style={{ fontSize: 11, color: 'var(--pg-text-faint)' }}>
                  6 demo steps · payload inspector
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onNavigate('applet2')}
                >
                  Try Demo <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </article>

          {/* Card 3 */}
          <article className="applet-card">
            <div className="applet-card-picture">
              <GraphTile />
            </div>
            <div className="applet-card-body">
              <div className="applet-card-head">
                <span className="mono applet-card-name">03 · Knowledge Graph &amp; AI Brain</span>
                <span className="pill pill-success">A vs B Diff</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--pg-text-faint)' }}>
                <Layers size={13} color="#15803d" />
                <span>Side-by-Side: AI Pipelines vs Custom pg_durable</span>
              </div>
              <h3 className="applet-card-title">Customer Knowledge Graph &amp; Hybrid Search</h3>
              <p className="applet-card-desc">
                Run the exact same 6 customer notes through <strong>Version A (AI Pipelines)</strong> for fast
                declarative AGE graphs, and <strong>Version B (Custom pg_durable)</strong> stitching all 5 HorizonDB
                extensions + Cohere v4 reranking.
              </p>
              <div className="applet-card-footer">
                <span className="mono" style={{ fontSize: 11, color: 'var(--pg-text-faint)' }}>
                  Interactive graph + hybrid search
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onNavigate('applet3')}
                >
                  Try Demo <ArrowRight size={13} />
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* ARCHITECTURE MATRIX */}
      <section>
        <WindowFrame
          title="Architecture Decision Guide — How Each HorizonDB AI Layer Fits"
          urlPill="HorizonDB Public Preview · PostgreSQL 18"
        >
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Applet</th>
                  <th>Primary Engine</th>
                  <th>Where AI Functions / Pipelines Fit</th>
                  <th>Why Open-Source pg_durable Is Essential</th>
                  <th>Live Product Gaps Surfaced</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 600 }}>01 · ai.tune_sql</td>
                  <td><span className="pill pill-accent">Pure pg_durable</span></td>
                  <td><code className="mono">ai.generate()</code> drafts strict JSON DDL + rollback</td>
                  <td>Human DBA pause (<code className="mono">df.wait_for_signal</code>), child workflow for <code className="mono">CONCURRENTLY</code>, <code className="mono">df.if</code> rollback</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>hypopg allow-list · signal UX</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>02 · ML Partner HTTP</td>
                  <td><span className="pill pill-accent">pg_durable df.http</span></td>
                  <td>AI Functions cannot target custom ACA/tabular model or Entra-only endpoints</td>
                  <td>Custom mini-batch <code className="mono">df.loop</code> + <code className="mono">df.if_rows</code> + zero-leak <code className="mono">pg_durable_fdw</code> vault</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>BUG-01 (ACA domains) · BUG-08 (MI)</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>03 · Knowledge Graph</td>
                  <td><span className="pill pill-success">AI Pipelines + pg_durable</span></td>
                  <td><strong>Version A:</strong> declarative <code className="mono">ai.create_graph</code> + <code className="mono">ai.graph_sink</code> (0 Cypher)</td>
                  <td><strong>Version B:</strong> strict enum extraction, DiskANN SQ, <code className="mono">bm25_force_merge()</code>, <code className="mono">df.metrics()</code> self-audit</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>BUG-02 (RLS gap) · extract arrays</td>
                </tr>
              </tbody>
            </table>
          </div>
        </WindowFrame>
      </section>
    </div>
  );
};
