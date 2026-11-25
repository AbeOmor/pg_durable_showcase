import React, { useCallback, useEffect, useState } from 'react';
import { Database, Github } from 'lucide-react';
import { REPO_URL } from './data/repo';
import { OverviewPage, type ActiveRoute } from './components/OverviewPage';
import { Applet1TuneDemo } from './demos/Applet1TuneDemo';
import { Applet2CustomEndpointDemo } from './demos/Applet2CustomEndpointDemo';
import { Applet3KnowledgeGraphDemo } from './demos/Applet3KnowledgeGraphDemo';

const ROUTES: ActiveRoute[] = ['overview', 'applet1', 'applet2', 'applet3'];

// Hash routes keep deep links working on static hosting such as GitHub Pages.
const routeFromHash = (): ActiveRoute => {
  const hash = window.location.hash.replace(/^#\/?/, '') as ActiveRoute;
  return ROUTES.includes(hash) ? hash : 'overview';
};

export const App: React.FC = () => {
  const [route, setRouteState] = useState<ActiveRoute>(routeFromHash);

  useEffect(() => {
    const onHashChange = () => setRouteState(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setRoute = useCallback((next: ActiveRoute) => {
    window.location.hash = next === 'overview' ? '' : `/${next}`;
    setRouteState(next);
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="app-shell pg-kit">
      <header className="top-nav">
        <div className="top-nav-inner">
          <button
            type="button"
            className="brand"
            onClick={() => setRoute('overview')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span className="brand-mark" aria-hidden="true">
              <Database size={15} />
            </span>
            <span>pg_durable Hackathon</span>
            <span className="pill pill-neutral mono" style={{ fontSize: 10.5 }}>
              HorizonDB
            </span>
          </button>

          <nav className="nav-tabs" aria-label="Applet Navigation">
            <button
              type="button"
              className={`nav-tab${route === 'overview' ? ' active' : ''}`}
              onClick={() => setRoute('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`nav-tab${route === 'applet1' ? ' active' : ''}`}
              onClick={() => setRoute('applet1')}
            >
              01 · ai.tune_sql
            </button>
            <button
              type="button"
              className={`nav-tab${route === 'applet2' ? ' active' : ''}`}
              onClick={() => setRoute('applet2')}
            >
              02 · ML Partner HTTP
            </button>
            <button
              type="button"
              className={`nav-tab${route === 'applet3' ? ' active' : ''}`}
              onClick={() => setRoute('applet3')}
            >
              03 · Knowledge Graph
            </button>
          </nav>

          <div className="nav-meta">
            <span className="status-dot" />
            <span>Live-verified telemetry</span>
            <a className="nav-repo-link" href={REPO_URL} target="_blank" rel="noreferrer" title="Source code on GitHub">
              <Github size={14} /> Source
            </a>
          </div>
        </div>
      </header>

      <main className="page-container">
        {route === 'overview' && <OverviewPage onNavigate={setRoute} />}
        {route === 'applet1' && <Applet1TuneDemo />}
        {route === 'applet2' && <Applet2CustomEndpointDemo />}
        {route === 'applet3' && <Applet3KnowledgeGraphDemo />}
      </main>
    </div>
  );
};
