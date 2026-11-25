import { Badge, Check, Stage, States, Window, type Act } from '../kit';
import './stages.css';

// Applet 1 in five beats: the workflow captures a baseline, drafts a fix,
// parks for a human, applies on approval, and proves the cost drop.
type S = {
  done: number;
  waiting: boolean;
  approved: boolean;
  indexed: boolean;
};

const NODES = [
  { name: 'capture_baseline', meta: 'EXPLAIN · hypopg' },
  { name: 'propose_fix', meta: 'ai.generate · gpt-5.4' },
  { name: 'wait_for_signal', meta: 'DBA approval' },
  { name: 'apply_concurrently', meta: 'child workflow' },
  { name: 'verify_or_rollback', meta: 'df.if' },
];

const initial: S = { done: 0, waiting: false, approved: false, indexed: false };
const poster: S = { done: 5, waiting: false, approved: true, indexed: true };

async function script(a: Act<S>) {
  await a.wait(700);
  await a.set({ done: 1 });
  await a.wait(650);
  await a.set({ done: 2 });
  await a.wait(500);
  await a.set({ waiting: true });
  a.mark('waiting');
  await a.wait(500);
  const btn = a.rect('approve');
  await a.move({ x: btn.x + btn.width - 10, y: btn.y + btn.height - 6 });
  await a.wait(250);
  await a.click();
  await a.set({ waiting: false, approved: true, done: 3 });
  a.mark('approved');
  await a.wait(450);
  await a.move('rest');
  await a.set({ done: 4, indexed: true });
  await a.wait(900);
  await a.set({ done: 5 });
  a.mark('verified');
  await a.wait(1800);
}

function NodeRow({ i, s }: { i: number; s: S }) {
  const node = NODES[i];
  const isDone = s.done > i;
  const isActive = !isDone && s.done === i && (i !== 2 || s.waiting);
  return (
    <div className="hs-node" data-done={isDone || undefined} data-active={isActive || undefined}>
      <span className="hs-node-status">
        <Check on={isDone} pending={isActive} size={16} />
      </span>
      <span className="hs-node-text">
        <span className="hs-node-name">{node.name}</span>
        <span className="hs-node-meta">{node.meta}</span>
      </span>
      {i === 2 && (
        <span className="hs-node-end">
          <States
            align="end"
            value={s.approved ? 'approved' : 'ask'}
            states={{
              ask: (
                <span className="hs-approve" data-target="approve" data-live={s.waiting || undefined}>
                  Approve
                </span>
              ),
              approved: <Badge tone="success">Approved</Badge>,
            }}
          />
        </span>
      )}
    </div>
  );
}

export function HeroStage() {
  return (
    <Stage<S>
      width={720}
      height={380}
      compact={{ below: 600, width: 358, height: 330 }}
      initial={initial}
      poster={poster}
      play="once"
      script={script}
      cursor={{ at: { wide: { x: 640, y: 330 }, compact: { x: 300, y: 300 } } }}
      className="hs"
    >
      {(s, _rect, layout) => (
        <>
          <Window
            title={layout === 'compact' ? 'ai.tune_sql' : 'ai.tune_sql · durable_hack.orders'}
            toolbar={layout === 'compact' ? <Badge tone="accent">df.start</Badge> : undefined}
            className={`hs-window hs-window--${layout}`}
          >
            <div className="hs-body" data-layout={layout}>
              <div className="hs-flow">
                <span className="hs-call">SELECT df.start('durable_hack.ai_tune_sql', …)</span>
                {NODES.map((_, i) => (
                  <NodeRow key={i} i={i} s={s} />
                ))}
              </div>
              <div className="hs-cost">
                {layout === 'wide' && <span className="hs-cost-label">EXPLAIN cost</span>}
                <States
                  className="hs-cost-value"
                  align="start"
                  value={s.indexed ? 'after' : 'before'}
                  states={{ before: '1,218.42', after: '4.44' }}
                />
                <States
                  className="hs-cost-plan"
                  align={layout === 'compact' ? 'end' : 'start'}
                  value={s.indexed ? 'after' : 'before'}
                  states={{
                    before: <Badge tone="warning">Seq Scan</Badge>,
                    after: (
                      <span className="hs-badges">
                        <Badge tone="success">Index Scan</Badge>
                        <Badge tone="success">−99.6%</Badge>
                      </span>
                    ),
                  }}
                />
              </div>
            </div>
          </Window>
          <span className="hs-rest" data-target="rest" />
        </>
      )}
    </Stage>
  );
}
