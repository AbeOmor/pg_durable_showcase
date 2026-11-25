import { Badge, Check, Connector, Meter, Stage, States, type Act } from '../kit';
import './stages.css';

/* ---------- Applet 1 tile: one number, the cost drop ---------- */

type Tune = { indexed: boolean };

async function tuneScript(a: Act<Tune>) {
  await a.wait(900);
  await a.set({ indexed: true });
  a.mark('indexed');
  await a.wait(1600);
}

export function TuneTile() {
  return (
    <Stage<Tune> width={400} height={190} initial={{ indexed: false }} poster={{ indexed: true }} play="once" script={tuneScript} className="tile">
      {(s) => (
        <div className="tt">
          <span className="tt-label">EXPLAIN cost · orders</span>
          <States className="tt-value" align="start" value={s.indexed ? 'after' : 'before'} states={{ before: '1,218.42', after: '4.44' }} />
          <States
            className="tt-plan"
            align="start"
            value={s.indexed ? 'after' : 'before'}
            states={{
              before: (
                <span className="tt-badges">
                  <Badge tone="warning">Seq Scan</Badge>
                  <Badge tone="neutral">Awaiting DBA</Badge>
                </span>
              ),
              after: (
                <span className="tt-badges">
                  <Badge tone="success">Index Scan</Badge>
                  <Badge tone="success">Verified · −99.6%</Badge>
                </span>
              ),
            }}
          />
        </div>
      )}
    </Stage>
  );
}

/* ---------- Applet 2 tile: three batches of four, zero leaked tokens ---------- */

type Batch = { sent: number };

async function batchScript(a: Act<Batch>) {
  await a.wait(600);
  for (const sent of [1, 2, 3]) {
    await a.set({ sent });
    a.mark(`batch-${sent}`);
    await a.wait(750);
  }
  await a.wait(1400);
}

export function BatchTile() {
  return (
    <Stage<Batch> width={400} height={190} initial={{ sent: 0 }} poster={{ sent: 3 }} play="once" script={batchScript} className="tile">
      {(s) => (
        <div className="bt">
          {[1, 2, 3].map((n) => (
            <div key={n} className="bt-row" data-on={s.sent >= n || undefined}>
              <span className="bt-name">df.http batch {n}</span>
              <Meter value={s.sent >= n ? 1 : 0} tone={s.sent >= n ? 'success' : 'accent'} className="bt-meter" />
              <Check on={s.sent >= n} size={15} />
            </div>
          ))}
          <div className="bt-foot">
            <States
              className="bt-rows"
              align="start"
              value={String(s.sent)}
              states={{ '0': '0 of 12 rows scored', '1': '4 of 12 rows scored', '2': '8 of 12 rows scored', '3': '12 of 12 rows scored' }}
            />
            <Badge tone="success">0 leaked tokens</Badge>
          </div>
        </div>
      )}
    </Stage>
  );
}

/* ---------- Applet 3 tile: customers linked to features, 23 → 24 edges ---------- */

type Graph = { linked: number; custom: boolean };

const CUSTOMERS = ['Mining Co.', 'Exchange Co.', 'Global Bank'];
const FEATURES = ['pg_durable', 'azure_ai', 'DiskANN'];
const ROW_Y = [32, 74, 116];
const LEFT_EDGE = 136;
const RIGHT_EDGE = 266;

async function graphScript(a: Act<Graph>) {
  await a.wait(500);
  for (const linked of [1, 2, 3]) {
    await a.set({ linked });
    await a.wait(420);
  }
  a.mark('pipeline');
  await a.wait(700);
  await a.set({ custom: true });
  a.mark('custom');
  await a.wait(1600);
}

export function GraphTile() {
  return (
    <Stage<Graph> width={400} height={190} initial={{ linked: 0, custom: false }} poster={{ linked: 3, custom: true }} play="once" script={graphScript} className="tile">
      {(s) => (
        <div className="gt">
          {CUSTOMERS.map((c, i) => (
            <span key={c} className="gt-chip gt-chip--left" style={{ top: ROW_Y[i] - 13 }}>
              {c}
            </span>
          ))}
          {FEATURES.map((f, i) => (
            <span key={f} className="gt-chip gt-chip--right" style={{ top: ROW_Y[i] - 13 }}>
              {f}
            </span>
          ))}
          {[0, 1, 2].map((i) => (
            <Connector key={i} from={{ x: LEFT_EDGE, y: ROW_Y[i] }} to={{ x: RIGHT_EDGE, y: ROW_Y[(i + 1) % 3] }} route="curve" show={s.linked > i} dots="both" />
          ))}
          <Connector from={{ x: LEFT_EDGE, y: ROW_Y[2] }} to={{ x: RIGHT_EDGE, y: ROW_Y[2] }} route="curve" show={s.custom} dots="both" />
          <span className="gt-foot">
            <States
              align="start"
              value={s.custom ? 'b' : 'a'}
              states={{ a: <Badge tone="neutral">A · AI Pipelines</Badge>, b: <Badge tone="accent">B · pg_durable</Badge> }}
            />
            <States className="gt-edges" align="end" value={s.custom ? 'b' : 'a'} states={{ a: '23 edges', b: '24 edges' }} />
          </span>
        </div>
      )}
    </Stage>
  );
}
