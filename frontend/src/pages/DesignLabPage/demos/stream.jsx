import { useEffect, useState } from 'react';
import { StateBusyOverlay } from '../../../components/state/panel-parts.jsx';
import StreamingMarkdown from '../../../components/message/StreamingMarkdown.jsx';
import MotionOrb from '../../../components/motion/MotionOrb.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import SlotSection from '../SlotSection.jsx';
import { PROSE } from './fixtures.js';

// 两种假的流式到达：逐字（每 60–120ms 到 2–6 个字）、大块（每秒到一整段，模拟整段整段返回的供应商）
const ARRIVALS = {
  steady: { text: PROSE, size: () => 2 + Math.floor(Math.random() * 5), gap: () => 60 + Math.random() * 60 },
  bulk: { text: PROSE.repeat(6), size: () => 160, gap: () => 1000 },
};

export function StreamDemo() {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [run, setRun] = useState({ id: 0, mode: 'steady' });

  function start(mode) {
    setText('');
    setStreaming(true);
    setRun((prev) => ({ id: prev.id + 1, mode }));
  }

  useEffect(() => {
    if (!run.id) return undefined;
    const arrival = ARRIVALS[run.mode];
    let pos = 0;
    let timer;
    const tick = () => {
      pos = Math.min(arrival.text.length, pos + arrival.size());
      setText(arrival.text.slice(0, pos));
      if (pos < arrival.text.length) timer = setTimeout(tick, arrival.gap());
      else setStreaming(false);
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [run]);

  return (
    <SlotSection
      id="stream"
      actions={(
        <>
          <Button variant="secondary" size="sm" onClick={() => start('steady')}>{run.id ? '重播' : '开始'}</Button>
          <Button variant="secondary" size="sm" onClick={() => start('bulk')}>大块到达</Button>
        </>
      )}
    >
      <div className="we-design-lab__prose">
        <StreamingMarkdown streaming={streaming} caret>{text}</StreamingMarkdown>
      </div>
    </SlotSection>
  );
}

export function BusyDemo() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  function run() {
    setBusy(true);
    setTimeout(() => { setBusy(false); setDone(true); }, 2400);
    setTimeout(() => setDone(false), 3600);
  }
  return (
    <SlotSection
      id="busy"
      actions={<Button variant="secondary" size="sm" onClick={run}>整理一次状态</Button>}
    >
      <div className="we-design-lab__wait">
        <div className="we-design-lab__busy">
          <Skeleton />
          <StateBusyOverlay
            isUpdating={busy}
            justChanged={done}
            overlayKey="lab-overlay"
            overlayClassName="we-state-change-overlay"
            chipClassName="we-state-change-chip"
            textClassName="we-state-change-text"
          />
        </div>
        <div className="we-design-lab__orbs">
          <MotionOrb size={16} />
          <MotionOrb size={56} />
        </div>
      </div>
    </SlotSection>
  );
}

export function LoopsDemo() {
  return (
    <SlotSection id="loops">
      <div className="we-design-lab__row">
        <Skeleton lines={[100, 70]} className="we-design-lab__loop-skel" />
        <Skeleton block className="we-design-lab__loop-skel" />
        <span aria-label="打字三点">
          {[0, 1, 2].map((i) => <span key={i} className="typing-dot typing-dot-accent" />)}
        </span>
        <span className="we-asst-tool__spinner we-design-lab__spinner" aria-label="运行中" />
        <span className="we-asst-new-msg-arrow" aria-label="新消息">↓</span>
      </div>
    </SlotSection>
  );
}
