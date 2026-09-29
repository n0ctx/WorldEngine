import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MessageBubbles from '../../../components/chat/MessageBubbles.jsx';
import OptionCard from '../../../components/chat/OptionCard.jsx';
import SpeakerStage from '../../../components/chat/SpeakerStage.jsx';
import CodeBlock from '../../../components/motion/CodeBlock.jsx';
import Button from '../../../components/ui/Button.jsx';
import ChatErrorBubble from '../../ChatPage/components/ChatErrorBubble.jsx';
import { useMotion } from '../../../core/hooks/useMotion.js';
import SlotSection from '../SlotSection.jsx';
import { CARDS, CHAT, CODE, OPTIONS, SPEAKERS } from './fixtures.js';

const noop = () => {};

export function EnterListDemo() {
  const m = useMotion();
  const [count, setCount] = useState(2);
  return (
    <SlotSection
      id="enter-list"
      actions={(
        <>
          <Button variant="secondary" size="sm" onClick={() => setCount((n) => Math.min(CARDS.length, n + 1))}>加一条</Button>
          <Button variant="secondary" size="sm" onClick={() => setCount((n) => Math.max(0, n - 1))}>减一条</Button>
        </>
      )}
    >
      <div className="we-design-lab__cards">
        <AnimatePresence initial={false}>
          {CARDS.slice(0, count).map((card) => (
            <motion.div
              key={card}
              className="we-design-lab__card we-material"
              variants={m.variant('enter')}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={m.transition('enter')}
            >
              {card}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </SlotSection>
  );
}

export function MessageDemo() {
  const [count, setCount] = useState(2);
  return (
    <SlotSection
      id="message"
      actions={(
        <>
          <Button variant="secondary" size="sm" onClick={() => setCount((n) => Math.min(CHAT.length, n + 1))}>追加一条</Button>
          <Button variant="secondary" size="sm" onClick={() => setCount((n) => Math.max(0, n - 1))}>删除最后一条</Button>
        </>
      )}
    >
      <MessageBubbles
        messagesForDisplay={CHAT.slice(0, count)}
        character={{ name: '艾拉' }}
        persona={{ name: '玩家' }}
        options={[]}
      />
    </SlotSection>
  );
}

export function SpeakerDemo() {
  const [index, setIndex] = useState(0);
  return (
    <SlotSection
      id="speaker"
      actions={<Button variant="secondary" size="sm" onClick={() => setIndex((i) => (i + 1) % SPEAKERS.length)}>换人</Button>}
    >
      <SpeakerStage character={SPEAKERS[index]} />
    </SlotSection>
  );
}

export function ErrorBubbleDemo() {
  const motionPrefs = useMotion();
  const [shown, setShown] = useState(true);
  return (
    <SlotSection
      id="error-bubble"
      actions={<Button variant="secondary" size="sm" onClick={() => setShown((v) => !v)}>{shown ? '收起' : '出现'}</Button>}
    >
      <ChatErrorBubble
        character={SPEAKERS[0]}
        errorBubble={shown ? { partialContent: '灯泡在头顶晃，照得', errorMsg: '连接中断' } : null}
        generating={false}
        onRetry={noop}
        motionPrefs={motionPrefs}
      />
    </SlotSection>
  );
}

export function CodeBlockDemo() {
  const [run, setRun] = useState(0);
  return (
    <SlotSection
      id="code-block"
      actions={<Button variant="secondary" size="sm" onClick={() => setRun((n) => n + 1)}>重播</Button>}
    >
      <CodeBlock key={run} code={CODE} />
    </SlotSection>
  );
}

export function CssEnterDemo() {
  const [run, setRun] = useState(0);
  return (
    <SlotSection
      id="css-enter"
      actions={<Button variant="secondary" size="sm" onClick={() => setRun((n) => n + 1)}>重播</Button>}
    >
      <div key={run} className="we-design-lab__cards">
        {CARDS.slice(0, 3).map((card) => (
          <div key={card} className="we-design-lab__card we-design-lab__css-enter we-material">{card}</div>
        ))}
      </div>
    </SlotSection>
  );
}

export function OptionCardDemo() {
  const [run, setRun] = useState(0);
  return (
    <SlotSection
      id="option-card"
      actions={<Button variant="secondary" size="sm" onClick={() => setRun((n) => n + 1)}>重播</Button>}
    >
      <OptionCard key={run} options={OPTIONS} streaming={false} onSelect={noop} />
    </SlotSection>
  );
}
