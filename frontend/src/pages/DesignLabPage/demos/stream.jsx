import { useEffect, useState } from 'react';
import MessageBubbles from '../../../components/chat/MessageBubbles.jsx';
import WritingMessageItem from '../../../components/writing/WritingMessageItem.jsx';
import { StateBusyOverlay } from '../../../components/state/panel-parts.jsx';
import StreamingMarkdown from '../../../components/message/StreamingMarkdown.jsx';
import MotionOrb from '../../../components/motion/MotionOrb.jsx';
import Button from '../../../components/ui/Button.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import SlotSection from '../SlotSection.jsx';
import { CHAT, PROSE, SPEAKERS } from './fixtures.js';

const noop = () => {};
const CHAT_REPLY = PROSE.slice(0, 60);
const WRITING_PASSAGE = '台下的人没有立刻回答。他把烟头按灭在栏杆上，朝场子另一头努了努嘴——那边的灯更暗，'
  + '一个光着膀子的人正在缠手带，缠得很慢，一圈压着一圈。\n\n「今晚你要是上，」他说，「就是跟他。」';
const WRITING_MORE = '你看着那人缠完最后一圈，用牙咬断了胶带。他抬起头，隔着半个场子和你对上了眼，什么也没说。';
const WRITING_BASE = [
  { id: 'lab-w1', role: 'assistant', content: PROSE },
  { id: 'lab-w2', role: 'user', content: '我把湿外套搭上栏杆，问台下的人今晚谁上场。' },
];
const TEXTS = { chat: CHAT_REPLY, write: WRITING_PASSAGE, more: WRITING_MORE };
// 本轮变化条的示例：与 useTurnChanges 产出的形状一致
const TURN_CHANGES = [
  { id: 'hp', label: '生命', text: '▼25', tone: 'down', target: { tab: 'player', fieldKeys: ['hp'] } },
  { id: 'favor', label: '好感度', text: '▲15', tone: 'up', target: { tab: 'character', fieldKeys: ['favor'] } },
  { id: 'place', label: '位置', text: '更新', tone: 'neutral', target: { tab: null, fieldKeys: ['place'] } },
];

// 一轮假的生成：等首字 → 逐字流式 → 定稿；写作页的续写接在上一段之后，同一个 key 从流式转为定稿
function useFakeTurn() {
  const [turn, setTurn] = useState({ id: 0, kind: null, phase: 'idle', text: '', reply: null, passage: null });
  const { id, kind } = turn;
  useEffect(() => {
    if (!id) return undefined;
    const full = TEXTS[kind];
    let pos = 0;
    let timer;
    const tick = () => {
      pos = Math.min(full.length, pos + 3);
      const done = pos >= full.length;
      setTurn((prev) => ({
        ...prev,
        phase: done ? 'done' : 'stream',
        text: full.slice(0, pos),
        reply: done && kind === 'chat' ? prev.id : prev.reply,
        passage: done && kind !== 'chat' ? writtenPassage(prev, full) : prev.passage,
      }));
      if (!done) timer = setTimeout(tick, 80);
    };
    timer = setTimeout(tick, 900);
    return () => clearTimeout(timer);
  }, [id, kind]);
  const start = (next) => setTurn((prev) => ({ ...prev, id: prev.id + 1, kind: next, phase: 'wait', text: '' }));
  return { turn, start };
}

function writtenPassage(turn, full) {
  if (turn.kind === 'more') return { ...turn.passage, content: `${turn.passage.content}\n\n${full}` };
  return { id: `lab-w-${turn.id}`, content: full };
}

// 对话页：生成中的回复与定稿后同一个 key；跑写作的一轮时，上一轮对话回复留在原处
function ChatSample({ turn }) {
  const generating = turn.kind === 'chat' && (turn.phase === 'wait' || turn.phase === 'stream');
  const replyId = generating ? turn.id : turn.reply;
  const reply = { id: `lab-reply-${replyId}`, _key: `lab-reply-${replyId}`, role: 'assistant', content: CHAT_REPLY, created_at: CHAT[1].created_at };
  const shown = !generating && turn.reply !== null;
  return (
    <div className="we-chat-center-pane we-design-lab__pane">
      <MessageBubbles
        messagesForDisplay={shown ? [CHAT[0], reply] : [CHAT[0]]}
        character={SPEAKERS[0]}
        persona={{ name: '玩家' }}
        options={[]}
        generating={generating}
        streamingKey={reply._key}
        streamingText={turn.text}
        onLastPage
        turnChanges={shown ? { messageId: reply.id, changes: TURN_CHANGES } : null}
        onEditMessage={noop}
        onRegenerateMessage={noop}
        onEditAssistantMessage={noop}
        onDeleteMessage={noop}
      />
    </div>
  );
}

// 写作页最后一段：新写的一段在生成中只有已到的字；续写时接在已定稿的那段后面
function lastPassage(turn) {
  const live = turn.phase === 'wait' || turn.phase === 'stream';
  if (live && turn.kind === 'write') return { id: `lab-w-${turn.id}`, content: turn.text, streaming: true };
  if (!turn.passage) return null;
  if (live && turn.kind === 'more') return { ...turn.passage, content: `${turn.passage.content}\n\n${turn.text}`, streaming: true };
  return { ...turn.passage, streaming: false };
}

function WritingSample({ turn }) {
  const passage = lastPassage(turn);
  const items = passage ? [...WRITING_BASE, { ...passage, role: 'assistant' }] : WRITING_BASE;
  return (
    <div className="we-chat-center-pane we-design-lab__pane">
      <div className="we-prose-message-list">
        <div className="we-chapter">
          {items.map((item) => (
            <WritingMessageItem
              key={item.id}
              message={item}
              isStreaming={!!item.streaming}
              turnChanges={item.id === passage?.id && !item.streaming ? TURN_CHANGES : undefined}
              onEdit={noop}
              onRegenerate={noop}
              onDelete={noop}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReplyMomentDemo() {
  const { turn, start } = useFakeTurn();
  const busy = turn.phase === 'wait' || turn.phase === 'stream';
  return (
    <SlotSection
      id="reply-moment"
      actions={(
        <>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => start('chat')}>对话：来一轮回复</Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => start('write')}>写作：写一段</Button>
          <Button variant="secondary" size="sm" disabled={busy || !turn.passage} onClick={() => start('more')}>写作：续写</Button>
        </>
      )}
    >
      <p className="we-design-lab__subheading">对话</p>
      <ChatSample turn={turn} />
      <p className="we-design-lab__subheading">写作</p>
      <WritingSample turn={turn} />
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
