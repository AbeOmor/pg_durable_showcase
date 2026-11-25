import React, { useEffect, useId, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { Meter } from '../kit';
import type { LayerTag, WalkthroughStep } from '../data/hackathonData';
import { shortPath, sourceUrl } from '../data/repo';

interface DemoWalkthroughRailProps {
  /** Repo-relative path of the walkthrough script, linked to GitHub. */
  scriptPath: string;
  /** Repo-relative path of the applet definition the walkthrough runs. */
  appletPath?: string;
  steps: WalkthroughStep[];
  currentIndex: number;
  onSelectStep: (idx: number) => void;
  onReset: () => void;
  autoPlaying: boolean;
  onToggleAutoPlay: () => void;
  extraAction?: React.ReactNode;
}

const LAYER_META: Record<LayerTag, { label: string; pillClass: string; boxClass: string }> = {
  pg_durable: {
    label: 'pg_durable (Open Source)',
    pillClass: 'pill-accent',
    boxClass: 'layer-durable',
  },
  ai_pipelines: {
    label: 'AI Pipelines (Declarative)',
    pillClass: 'pill-success',
    boxClass: 'layer-pipelines',
  },
  ai_functions: {
    label: 'AI Functions (Managed Models)',
    pillClass: 'pill-warning',
    boxClass: 'layer-functions',
  },
};

export const DemoWalkthroughRail: React.FC<DemoWalkthroughRailProps> = ({
  scriptPath,
  appletPath,
  steps,
  currentIndex,
  onSelectStep,
  onReset,
  autoPlaying,
  onToggleAutoPlay,
  extraAction,
}) => {
  const [copied, setCopied] = useState(false);
  const [sqlOpen, setSqlOpen] = useState(false);
  const sqlId = useId();
  const step = steps[currentIndex];
  const layer = LAYER_META[step.layer];
  const progress = (currentIndex + 1) / steps.length;
  const sqlLines = step.sql.trim().split('\n').length;

  // Each step starts with its SQL tucked away so the presenter can reveal it on cue.
  useEffect(() => {
    setSqlOpen(false);
    setCopied(false);
  }, [currentIndex]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(step.sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  };

  return (
    <aside className="walkthrough-panel" aria-label="Interactive Demo Walkthrough">
      <div className="walkthrough-controls">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <a
            className="pill pill-neutral mono source-link"
            style={{ fontSize: 11 }}
            href={sourceUrl(scriptPath)}
            target="_blank"
            rel="noreferrer"
            title={`Open ${scriptPath} on GitHub`}
          >
            {shortPath(scriptPath)} <ExternalLink size={10} />
          </a>
          <span style={{ fontSize: 12, color: 'var(--pg-text-faint)' }}>
            Step {currentIndex + 1} / {steps.length}
          </span>
          {appletPath && (
            <a
              className="source-text-link mono"
              href={sourceUrl(appletPath)}
              target="_blank"
              rel="noreferrer"
              title={`Open ${appletPath} on GitHub`}
            >
              applet source <ExternalLink size={10} />
            </a>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onToggleAutoPlay}
            title={autoPlaying ? 'Pause walkthrough' : 'Auto-play walkthrough'}
          >
            {autoPlaying ? <Pause size={13} /> : <Play size={13} />}
            {autoPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onReset}
            title="Reset demo to Step 1"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      <Meter value={progress} className="step-progress" />

      <div className="active-step-card">
        <div className="step-title-row">
          <h3 className="step-title">
            {step.stepNumber}. {step.title}
          </h3>
        </div>

        <p className="step-narration">{step.narration}</p>

        <div className={`sql-reveal${sqlOpen ? ' is-open' : ''}`}>
          <button
            type="button"
            className="sql-toggle"
            aria-expanded={sqlOpen}
            aria-controls={sqlId}
            onClick={() => setSqlOpen((open) => !open)}
          >
            <Code2 size={13} />
            <span>{sqlOpen ? 'Hide SQL' : 'Show SQL'}</span>
            <span className="sql-toggle-meta">{sqlLines} {sqlLines === 1 ? 'line' : 'lines'}</span>
            <ChevronDown size={14} className="sql-toggle-chevron" />
          </button>
          {sqlOpen && (
            <div className="sql-box" id={sqlId}>
              <div className="sql-box-head">
                <span className="mono">PostgreSQL · HorizonDB</span>
                <button type="button" className="copy-btn" onClick={handleCopy}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied' : 'Copy SQL'}
                </button>
              </div>
              <pre>
                <code>{step.sql}</code>
              </pre>
            </div>
          )}
        </div>

        <div className={`arch-callout ${layer.boxClass}`}>
          <div className="arch-callout-head">
            <span>{step.layerTitle}</span>
            <span className={`pill ${layer.pillClass}`}>{layer.label}</span>
          </div>
          <div>{step.layerExplanation}</div>
        </div>

        {extraAction}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 2 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={currentIndex === 0}
            onClick={() => onSelectStep(Math.max(0, currentIndex - 1))}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={currentIndex === steps.length - 1}
            onClick={() => onSelectStep(Math.min(steps.length - 1, currentIndex + 1))}
          >
            Next Step <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="step-list" role="list">
        {steps.map((s, idx) => {
          const isActive = idx === currentIndex;
          const isDone = idx < currentIndex;
          return (
            <button
              key={s.id}
              type="button"
              className={`step-row${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
              onClick={() => onSelectStep(idx)}
            >
              <span className="step-num">
                {isDone ? <Check size={11} /> : s.stepNumber}
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.shortLabel}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
