import React, { useState } from 'react';

interface GraphNode {
  id: string;
  label: string;
  kind: 'Customer' | 'Extension' | 'Blocker';
  x: number;
  y: number;
  phaseDurable?: string;
  phasePipeline?: string;
  sentiment?: string;
  detail: string;
  onlyIn?: 'durable' | 'pipelines';
}

interface GraphEdge {
  from: string;
  to: string;
  type: 'USES' | 'BLOCKED_BY';
  onlyIn?: 'durable' | 'pipelines';
}

const NODES: GraphNode[] = [
  // Customers (left column)
  { id: 'c-partner', label: 'ML Partner', kind: 'Customer', x: 105, y: 46, phaseDurable: 'Building', phasePipeline: 'Building', sentiment: 'blocked', detail: 'tabular model container on ACA (*.azurecontainerapps.io); needs outbound HTTP domain allow-list.' },
  { id: 'c-mining', label: 'Mining Co.', kind: 'Customer', x: 105, y: 102, phaseDurable: 'Enterprise Hardening', phasePipeline: 'Enterprise Hardening', sentiment: 'blocked', detail: 'Enterprise DBAs requiring Verify-Before-Apply SQL tuning with human approval signals.' },
  { id: 'c-exchange', label: 'Exchange Co.', kind: 'Customer', x: 105, y: 158, phaseDurable: 'Building', phasePipeline: 'POC, Building', sentiment: 'positive', detail: 'Unified AI search combining DiskANN SQ, BM25, Cohere v4 rerank, and Apache AGE.' },
  { id: 'c-docai', label: 'DocAI Startup', kind: 'Customer', x: 105, y: 214, phaseDurable: 'Building', phasePipeline: 'Building', sentiment: 'blocked', detail: 'Crash-safe document batch enrichment with pg_durable_fdw and BM25 compaction.' },
  { id: 'c-bank', label: 'Global Bank', kind: 'Customer', x: 105, y: 270, phaseDurable: 'Enterprise Hardening', phasePipeline: 'Enterprise Hardening', sentiment: 'blocked', detail: 'Governance review flagging df.metrics() vs RLS visibility gap and strict allow-lists.' },
  { id: 'c-hdb', label: 'HorizonDB', kind: 'Customer', x: 105, y: 326, phaseDurable: 'Building', phasePipeline: 'Building', sentiment: 'mixed', detail: '5-extension GA preview interoperability validation (AGE 1.8.0 + DiskANN + BM25 + azure_ai + pg_durable).' },

  // Extensions (center column)
  { id: 'e-durable', label: 'pg_durable', kind: 'Extension', x: 345, y: 54, detail: 'Open-source Postgres durable workflows (0.2.9): df.sql, df.loop, df.http, df.wait_for_signal.' },
  { id: 'e-azureai', label: 'azure_ai', kind: 'Extension', x: 345, y: 112, detail: 'Managed Models (gpt-5.4, default-embedding, Cohere v4) + AI Pipelines (2.5.6).' },
  { id: 'e-diskann', label: 'pg_diskann', kind: 'Extension', x: 345, y: 170, detail: 'Vector indexing with Spherical Quantization (sq_bits=4) (0.7.6).' },
  { id: 'e-bm25', label: 'pg_textsearch', kind: 'Extension', x: 345, y: 228, detail: 'Native BM25 lexical search with bm25_force_merge() segment compaction (1.5.1).' },
  { id: 'e-age', label: 'age', kind: 'Extension', x: 345, y: 286, detail: 'Apache AGE 1.8.0 property graph engine with openCypher queries.' },
  { id: 'e-hypopg', label: 'hypopg', kind: 'Extension', x: 345, y: 340, detail: 'Hypothetical indexes for risk-free pre-apply EXPLAIN verification (1.4.1).' },

  // Blockers (right column)
  { id: 'b-aca', label: 'ACA HTTP allow-list', kind: 'Blocker', x: 585, y: 66, detail: 'BUG-01: pg_durable.http_allowed_domains omits *.azurecontainerapps.io.' },
  { id: 'b-vba', label: 'Verify-before-apply DDL', kind: 'Blocker', x: 585, y: 136, detail: 'DBAs need redacted EXPLAIN + hypopg + signal approval + auto-rollback.' },
  { id: 'b-rls', label: 'df.metrics() vs RLS gap', kind: 'Blocker', x: 585, y: 206, detail: 'BUG-02: df.metrics() counts 23 runs while caller RLS sees 14.' },
  { id: 'b-age', label: 'AGE allow-list config', kind: 'Blocker', x: 585, y: 276, detail: 'AGE requires azure.extensions + shared_preload_libraries before pipeline run.' },
];

const EDGES: GraphEdge[] = [
  { from: 'c-partner', to: 'e-durable', type: 'USES' },
  { from: 'c-partner', to: 'b-aca', type: 'BLOCKED_BY' },
  { from: 'c-mining', to: 'e-durable', type: 'USES' },
  { from: 'c-mining', to: 'e-azureai', type: 'USES' },
  { from: 'c-mining', to: 'e-hypopg', type: 'USES' },
  { from: 'c-mining', to: 'b-vba', type: 'BLOCKED_BY' },
  { from: 'c-exchange', to: 'e-diskann', type: 'USES' },
  { from: 'c-exchange', to: 'e-bm25', type: 'USES' },
  { from: 'c-exchange', to: 'e-azureai', type: 'USES' },
  { from: 'c-exchange', to: 'e-age', type: 'USES' },
  { from: 'c-docai', to: 'e-durable', type: 'USES' },
  { from: 'c-docai', to: 'e-azureai', type: 'USES' },
  { from: 'c-docai', to: 'e-bm25', type: 'USES' },
  { from: 'c-bank', to: 'e-durable', type: 'USES' },
  { from: 'c-bank', to: 'e-azureai', type: 'USES' },
  { from: 'c-bank', to: 'b-rls', type: 'BLOCKED_BY' },
  { from: 'c-hdb', to: 'e-age', type: 'USES' },
  { from: 'c-hdb', to: 'e-durable', type: 'USES' },
  { from: 'c-hdb', to: 'e-diskann', type: 'USES' },
  { from: 'c-hdb', to: 'e-bm25', type: 'USES' },
  { from: 'c-hdb', to: 'b-age', type: 'BLOCKED_BY' },
];

interface KnowledgeGraphSvgProps {
  mode: 'pipelines' | 'durable';
  built: boolean;
}

export const KnowledgeGraphSvg: React.FC<KnowledgeGraphSvgProps> = ({ mode, built }) => {
  const [selectedId, setSelectedId] = useState<string>('c-exchange');

  const nodeMap = new Map(NODES.map((n) => [n.id, n]));
  const selected = nodeMap.get(selectedId) || NODES[0];

  const isConnected = (nId: string) => {
    if (nId === selectedId) return true;
    return EDGES.some(
      (e) =>
        (e.from === selectedId && e.to === nId) ||
        (e.to === selectedId && e.from === nId)
    );
  };

  const nodeColor = (kind: GraphNode['kind']) => {
    if (kind === 'Customer') return { fill: '#eff6ff', stroke: '#2563eb', text: '#1d4ed8' };
    if (kind === 'Extension') return { fill: '#ecfdf5', stroke: '#15803d', text: '#166534' };
    return { fill: '#fef2f2', stroke: '#dc2626', text: '#b91c1c' };
  };

  return (
    <div>
      <div className="graph-canvas-wrap">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid var(--pg-border)',
            background: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
              {mode === 'pipelines' ? 'horizondb_ai_kg_pipelines' : 'horizondb_ai_kg'}
            </span>
            <span className={`pill ${mode === 'pipelines' ? 'pill-success' : 'pill-accent'}`}>
              {mode === 'pipelines' ? 'ai.graph_sink() · AGE 1.8.0' : 'Custom Cypher MERGE · AGE 1.8.0'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--pg-text-faint)' }}>
            <span>
              <strong style={{ color: '#2563eb' }}>●</strong> Customer
            </span>
            <span>
              <strong style={{ color: '#15803d' }}>●</strong> Extension
            </span>
            <span>
              <strong style={{ color: '#dc2626' }}>●</strong> Blocker
            </span>
          </div>
        </div>

        <svg
          viewBox="0 0 700 375"
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            opacity: built ? 1 : 0.28,
            transition: 'opacity 220ms ease',
          }}
          role="img"
          aria-label="Apache AGE Knowledge Graph Visualization"
        >
          {/* Column headers */}
          <text x="105" y="18" textAnchor="middle" fill="#6b7280" fontSize="10" fontWeight="600" letterSpacing="0.06em">
            CUSTOMERS (6)
          </text>
          <text x="345" y="18" textAnchor="middle" fill="#6b7280" fontSize="10" fontWeight="600" letterSpacing="0.06em">
            HORIZONDB EXTENSIONS (6)
          </text>
          <text x="585" y="18" textAnchor="middle" fill="#6b7280" fontSize="10" fontWeight="600" letterSpacing="0.06em">
            BLOCKERS (4)
          </text>

          {/* Edges */}
          {EDGES.map((edge, idx) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (!from || !to) return null;
            const highlighted = edge.from === selectedId || edge.to === selectedId;
            const stroke =
              edge.type === 'BLOCKED_BY'
                ? highlighted
                  ? '#dc2626'
                  : 'rgba(220,38,38,0.2)'
                : highlighted
                ? '#2563eb'
                : 'rgba(17,17,19,0.12)';
            const x1 = from.x + 76;
            const x2 = to.x - 76;
            const mx = (x1 + x2) / 2;
            const d = `M ${x1} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${x2} ${to.y}`;
            return (
              <path
                key={idx}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={highlighted ? 2.1 : 1.1}
                strokeDasharray={edge.type === 'BLOCKED_BY' ? '4 3' : undefined}
              />
            );
          })}

          {/* Nodes */}
          {NODES.map((node) => {
            const c = nodeColor(node.kind);
            const active = node.id === selectedId;
            const related = isConnected(node.id);
            return (
              <g
                key={node.id}
                onClick={() => setSelectedId(node.id)}
                style={{ cursor: 'pointer', opacity: related ? 1 : 0.35, transition: 'opacity 140ms ease' }}
              >
                <rect
                  x={node.x - 76}
                  y={node.y - 17}
                  width={152}
                  height={34}
                  rx={8}
                  fill={c.fill}
                  stroke={c.stroke}
                  strokeWidth={active ? 2.2 : 1.1}
                />
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  fill={c.text}
                  fontSize="11.5"
                  fontWeight={active ? 700 : 600}
                  fontFamily="Inter, sans-serif"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Inspector footer */}
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--pg-border)',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="pill pill-neutral">{selected.kind}</span>
            <strong style={{ fontSize: 13 }}>{selected.label}</strong>
            {selected.kind === 'Customer' && (
              <span
                className={`pill ${
                  mode === 'pipelines' && selected.id === 'c-exchange' ? 'pill-warning' : 'pill-accent'
                }`}
              >
                journey_phase: {mode === 'pipelines' ? selected.phasePipeline : selected.phaseDurable}
              </span>
            )}
            {mode === 'pipelines' && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--pg-text-faint)' }}>
                disp_label: &quot;{selected.label}&quot;
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--pg-text-muted)' }}>{selected.detail}</div>
        </div>
      </div>
    </div>
  );
};
