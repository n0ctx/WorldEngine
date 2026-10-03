import { useEffect, useState } from 'react';
import MessageBubbles from '../../../components/chat/MessageBubbles.jsx';
import { StateBusyOverlay } from '../../../components/state/panel-parts.jsx';
import StreamingMarkdown from '../../../components/message/StreamingMarkdown.jsx';
import MotionOrb from '../../../components/motion/MotionOrb.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import SlotSection from '../SlotSection.jsx';
import { CHAT, PROSE, SPEAKERS } from './fixtures.js';

const noop = () => {};
const REPLY_TEXT = PROSE.slice(0, 60);
// 本轮变化条的示例：与 useTurnChanges 产出的形状一致
const TURN_CHANGES = [
  { id: 'hp', label: '生命', text: '▼25', tone: 'down', target: { tab: 'player', fieldKeys: ['hp'] } },
  { id: 'favor', label: '好感度', text: '▲15', tone: 'up', target: { tab: 'character', fieldKeys: ['favor'] } },
  { id: 'place', label: '位置', text: '更新', tone: 'neutral', target: { tab: null, fieldKeys: ['place'] } },
];

// 一轮假的回复：等首字 → 逐字流式 → 定稿（同一个 key，和正式页面一样从流式转为定稿）
function useFakeReply() {
  const [turn, setTurn] = useState({ id: 0, phase: 'idle', text: '' });
  const { id } = turn;
  useEffect(() => {
    if (!id) return undefined;
    let pos = 0;
    let timer;
    const tick = () => {
      pos = Math.min(REPLY_TEXT.length, pos + 3);
      const done = pos >= REPLY_TEXT.length;
      setTurn((prev) => ({ ...prev, phase: done ? 'done' : 'stream', text: REPLY_TEXT.slice(0, pos) }));
      if (!done) timer = setTimeout(tick, 80);
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [id]);
  return { turn, run: () => setTurn((prev) => ({ id: prev.id + 1, phase: 'wait', text: '' })) };
}

export function ReplyMomentDemo() {
  const { turn, run } = useFakeReply();
  const reply = { id: `lab-reply-${turn.id}`, _key: `lab-reply-${turn.id}`, role: 'assistant', content: REPLY_TEXT, created_at: CHAT[1].created_at };
  const generating = turn.phase === 'wait' || turn.phase === 'stream';
  return (
    <SlotSection
      id="reply-moment"
      actions={<Button variant="secondary" size="sm" onClick={run}>{turn.id ? '再来一轮' : '来一轮回复'}</Button>}
    >
      <MessageBubbles
        messagesForDisplay={turn.phase === 'done' ? [CHAT[0], reply] : [CHAT[0]]}
        character={SPEAKERS[0]}
        persona={{ name: '玩家' }}
        options={[]}
        generating={generating}
        streamingKey={reply._key}
        streamingText={turn.text}
        onLastPage
        turnChanges={turn.phase === 'done' ? { messageId: reply.id, changes: TURN_CHANGES } : null}
        onEditMessage={noop}
        onRegenerateMessage={noop}
        onEditAssistantMessage={noop}
        onDeleteMessage={noop}
      />
    </SlotSection>
  );
}

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
