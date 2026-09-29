import { useEffect, useState } from 'react';
import { StateBusyOverlay } from '../../../components/state/panel-parts.jsx';
import StreamingMarkdown from '../../../components/chat/StreamingMarkdown.jsx';
import MotionOrb from '../../../components/motion/MotionOrb.jsx';
import Button from '../../../components/ui/Button.jsx';
import SlotSection from '../SlotSection.jsx';
import { PROSE } from './fixtures.js';

// 假的流式到达：每 60–120ms 到 2–6 个字，模拟模型逐段吐字
export function StreamDemo() {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [run, setRun] = useState(0);

  function start() {
    setText('');
    setStreaming(true);
    setRun((n) => n + 1);
  }

  useEffect(() => {
    if (!run) return undefined;
    let pos = 0;
    let timer;
    const tick = () => {
      pos = Math.min(PROSE.length, pos + 2 + Math.floor(Math.random() * 5));
      setText(PROSE.slice(0, pos));
      if (pos < PROSE.length) timer = setTimeout(tick, 60 + Math.random() * 60);
      else setStreaming(false);
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [run]);

  return (
    <SlotSection
      id="stream"
      actions={<Button variant="secondary" size="sm" onClick={start}>{run ? '重播' : '开始'}</Button>}
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
          <div className="we-skel-stack">
            <span className="we-skel we-skel-line" />
            <span className="we-skel we-skel-line" />
            <span className="we-skel we-skel-line" />
          </div>
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
        <div className="we-skel-stack we-design-lab__loop-skel">
          <span className="we-skel we-skel-line" />
          <span className="we-skel we-skel-line" />
        </div>
        <span aria-label="打字三点">
          {[0, 1, 2].map((i) => <span key={i} className="typing-dot typing-dot-accent" />)}
        </span>
        <span className="we-asst-tool__spinner we-design-lab__spinner" aria-label="运行中" />
        <span className="we-asst-new-msg-arrow" aria-label="新消息">↓</span>
      </div>
    </SlotSection>
  );
}
