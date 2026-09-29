/**
 * 开发用动效实验室（/dev/motion，仅 import.meta.env.DEV 注册路由）：
 * 把每个动效位的真实组件放在一页，逐块重播；顶部切换动效包（临时预览，不写配置）与世界强调色。
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Button from '../components/ui/Button.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import SectionTabs from '../components/ui/SectionTabs.jsx';
import StatusSection from '../components/state/StatusSection.jsx';
import { StateBusyOverlay } from '../components/state/panel-parts.jsx';
import ChapterDivider from '../components/chat/ChapterDivider.jsx';
import StreamingMarkdown from '../components/chat/StreamingMarkdown.jsx';
import BounceRail from '../components/motion/BounceRail.jsx';
import CodeBlock from '../components/motion/CodeBlock.jsx';
import DeleteButton from '../components/motion/DeleteButton.jsx';
import Folder from '../components/motion/Folder.jsx';
import MotionOrb from '../components/motion/MotionOrb.jsx';
import StepTrack from '../components/motion/StepTrack.jsx';
import TaskList from '../components/motion/TaskList.jsx';
import DoneConfirm from './CharacterEditPage/components/DoneConfirm.jsx';
import { useMotion } from '../core/hooks/useMotion.js';
import { MOTION_PACKS, setMotionPack } from '../core/motion/motionPack.js';
import { log } from '../core/utils/logger.js';

const ACCENTS = [
  { name: '无限轮回', color: '#c9a063' },
  { name: '凡人修仙', color: '#7f9cff' },
  { name: '丧尸末日', color: '#d2583c' },
  { name: '纯爱', color: '#d46bb3' },
];

const PROSE = '雨从傍晚一直下到后半夜。你推开拳场的铁门，潮气和汗味一起涌出来，'
  + '灯泡在头顶晃，照得围栏上的血迹时明时暗。台下有人认出了你，低声报出一个数字——'
  + '那是上一场你输掉的赔率。你没有停，径直走到场边，把湿透的外套搭在栏杆上。';

const TURNS = [
  { hp: 87, favor: 40, gold: 1200, place: '贫民区' },
  { hp: 62, favor: 55, gold: 1200, place: '地下拳场，灯光昏暗，四周站满下注的人' },
  { hp: 91, favor: 48, gold: 850, place: '诊所后巷' },
];

const TOASTS = ['设置已保存', '已保存为角色卡', '标题已更新：雨夜里的拳场'];
const NAV = ['世界规则', '状态字段', '开场白', '写作风格'];
const CARDS = ['艾拉推开了门', '雨声忽然变大', '台下有人喊你的名字', '灯灭了一瞬'];
const CODE = JSON.stringify({ category: 'violence', severity: 'medium', filtered: false }, null, 2);

function toRows(turn) {
  return [
    { field_key: 'hp', label: '生命', type: 'number', max_value: 100, effective_value_json: JSON.stringify(turn.hp) },
    { field_key: 'favor', label: '好感度', type: 'number', effective_value_json: JSON.stringify(turn.favor) },
    { field_key: 'gold', label: '金钱', type: 'number', unit: '元', effective_value_json: JSON.stringify(turn.gold) },
    { field_key: 'place', label: '位置', type: 'text', effective_value_json: JSON.stringify(turn.place) },
  ];
}

function changedKeysBetween(prev, next) {
  return new Set(Object.keys(next).filter((key) => prev[key] !== next[key]));
}

function Section({ id, title, actions, children, stageClassName = '' }) {
  return (
    <section className="we-motion-lab__section" aria-labelledby={id}>
      <div className="we-motion-lab__bar">
        <h2 id={id} className="we-motion-lab__heading">{title}</h2>
        {actions}
      </div>
      {children && <div className={`we-motion-lab__stage ${stageClassName}`}>{children}</div>}
    </section>
  );
}

// 假的流式到达：每 60–120ms 到 2–6 个字，模拟模型逐段吐字
function StreamSection() {
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
    <Section
      id="motion-lab-stream"
      title="流式输出"
      actions={<Button variant="secondary" size="sm" onClick={start}>{run ? '重播' : '开始'}</Button>}
    >
      <div className="we-motion-lab__prose">
        <StreamingMarkdown streaming={streaming} caret>{text}</StreamingMarkdown>
      </div>
    </Section>
  );
}

function EnterSection() {
  const m = useMotion();
  const [count, setCount] = useState(2);
  const [confirming, setConfirming] = useState(false);
  return (
    <Section
      id="motion-lab-enter"
      title="出现与消失"
      actions={(
        <>
          <Button variant="secondary" size="sm" onClick={() => setCount((n) => Math.min(CARDS.length, n + 1))}>加一条</Button>
          <Button variant="secondary" size="sm" onClick={() => setCount((n) => Math.max(0, n - 1))}>减一条</Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>打开弹窗</Button>
        </>
      )}
    >
      <div className="we-motion-lab__cards">
        <AnimatePresence initial={false}>
          {CARDS.slice(0, count).map((card) => (
            <motion.div
              key={card}
              className="we-motion-lab__card we-material"
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
      <AnimatePresence>
        {confirming && (
          <ConfirmModal
            title="删除这条消息？"
            message="删除后，后面的剧情会从上一条继续。"
            confirmText="删除"
            danger
            onConfirm={() => setConfirming(false)}
            onClose={() => setConfirming(false)}
          />
        )}
      </AnimatePresence>
    </Section>
  );
}

function PressSection() {
  const m = useMotion();
  return (
    <Section id="motion-lab-press" title="按压与悬停">
      <div className="we-motion-lab__row">
        <Button>继续写</Button>
        <Button variant="secondary">存为草稿</Button>
        <motion.button type="button" className="we-motion-lab__card we-material" {...m.gesture('portal')}>进入世界</motion.button>
        <motion.button type="button" className="we-motion-lab__send" aria-label="发送" {...m.gesture('sink')}>↑</motion.button>
      </div>
    </Section>
  );
}

function MoveSection() {
  const navRef = useRef(null);
  const [nav, setNav] = useState(0);
  const [step, setStep] = useState(1);
  const tabs = NAV.map((label) => ({ key: label, label, content: <p className="we-motion-lab__note">{label}的内容</p> }));
  return (
    <Section
      id="motion-lab-move"
      title="换位"
      actions={<Button variant="secondary" size="sm" onClick={() => setStep((s) => (s + 1) % 4)}>下一步</Button>}
    >
      <div className="we-motion-lab__grid">
        <SectionTabs sections={tabs} />
        <SectionTabs sections={tabs} variant="gooey" />
        <StepTrack steps={4} current={step} />
        <div ref={navRef} className="we-motion-lab__nav">
          <BounceRail containerRef={navRef} activeKey={nav} />
          {NAV.map((label, i) => (
            <button
              key={label}
              type="button"
              data-bounce-item
              aria-current={nav === i ? 'page' : undefined}
              className="we-motion-lab__nav-item"
              onClick={() => setNav(i)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

function StateSection() {
  const [turn, setTurn] = useState(0);
  const current = TURNS[turn % TURNS.length];
  const previous = turn === 0 ? current : TURNS[(turn - 1) % TURNS.length];
  return (
    <Section
      id="motion-lab-state"
      title="状态数值变化"
      stageClassName="we-state-panel"
      actions={<Button variant="secondary" size="sm" onClick={() => setTurn((t) => t + 1)}>推进一轮</Button>}
    >
      <StatusSection headerless gridLayout rows={toRows(current)} changedKeys={changedKeysBetween(previous, current)} />
    </Section>
  );
}

function ChapterSection() {
  const [replay, setReplay] = useState(0);
  return (
    <Section
      id="motion-lab-chapter"
      title="写作章节开场"
      actions={<Button variant="secondary" size="sm" onClick={() => setReplay((n) => n + 1)}>重播</Button>}
    >
      <ChapterDivider key={replay} chapterIndex={3} title="雨夜里的拳场" />
    </Section>
  );
}

function ConfirmSection() {
  const [toastIndex, setToastIndex] = useState(0);
  const [doneKey, setDoneKey] = useState(0);
  function sendToast() {
    log.success('motion-lab.toast', null, { toast: TOASTS[toastIndex % TOASTS.length] });
    setToastIndex((i) => i + 1);
  }
  return (
    <>
      <Section
        id="motion-lab-done"
        title="提示与完成确认"
        actions={(
          <>
            <Button variant="secondary" size="sm" onClick={sendToast}>发送成功提示</Button>
            <Button variant="secondary" size="sm" onClick={() => setDoneKey((n) => n + 1)}>弹出完成确认</Button>
          </>
        )}
      />
      <DoneConfirm trigger={doneKey} label="已导出" />
    </>
  );
}

function WaitSection() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  function run() {
    setBusy(true);
    setTimeout(() => { setBusy(false); setDone(true); }, 2400);
    setTimeout(() => setDone(false), 3600);
  }
  return (
    <Section
      id="motion-lab-wait"
      title="等待"
      actions={<Button variant="secondary" size="sm" onClick={run}>整理一次状态</Button>}
    >
      <div className="we-motion-lab__wait">
        <div className="we-motion-lab__busy">
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
        <div className="we-motion-lab__orbs">
          <MotionOrb size={16} />
          <MotionOrb size={56} />
        </div>
      </div>
    </Section>
  );
}

function WidgetSection() {
  const [tasks, setTasks] = useState([
    { id: 'rules', title: '写下世界规则', done: true },
    { id: 'fields', title: '定义状态字段', done: false },
    { id: 'opening', title: '写开场白', done: false },
  ]);
  const [folder, setFolder] = useState('rest');
  const toggle = (id) => setTasks((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  return (
    <Section id="motion-lab-widgets" title="小组件">
      <div className="we-motion-lab__grid">
        <TaskList tasks={tasks.map((t) => ({ ...t, onClick: () => toggle(t.id) }))} />
        <div className="we-motion-lab__row">
          <button
            type="button"
            className="we-motion-lab__folder"
            onMouseEnter={() => setFolder('hover')}
            onMouseLeave={() => setFolder('rest')}
            onClick={() => setFolder((s) => (s === 'open' ? 'hover' : 'open'))}
          >
            <Folder state={folder} width={72} />
          </button>
          <DeleteButton label="删除这条规则" onConfirm={() => {}} />
        </div>
        <CodeBlock code={CODE} />
      </div>
    </Section>
  );
}

export default function MotionLabPage() {
  const { reduced, pack } = useMotion();
  const [accent, setAccent] = useState(ACCENTS[0].color);

  return (
    <div className="we-motion-lab" style={{ '--we-color-accent': accent }}>
      <header className="we-motion-lab__header">
        <h1 className="we-motion-lab__title">动效实验室</h1>
        <p className="we-motion-lab__hint">
          {reduced ? '系统已开启“减少动态效果”：只显示静态结果。' : '这里切换动效包只是临时预览，刷新后回到设置里选的动效。'}
        </p>
        <div className="we-motion-lab__chips" role="group" aria-label="动效包">
          {Object.values(MOTION_PACKS).map((item) => (
            <button
              key={item.id}
              type="button"
              className="we-motion-lab__chip"
              aria-pressed={pack.id === item.id}
              onClick={() => setMotionPack(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="we-motion-lab__chips" role="group" aria-label="世界强调色">
          {ACCENTS.map((item) => (
            <button
              key={item.color}
              type="button"
              className="we-motion-lab__chip"
              aria-pressed={accent === item.color}
              onClick={() => setAccent(item.color)}
            >
              <span className="we-motion-lab__swatch" style={{ '--swatch': item.color }} />
              {item.name}
            </button>
          ))}
        </div>
      </header>

      <StreamSection />
      <StateSection />
      <ChapterSection />
      <EnterSection />
      <PressSection />
      <MoveSection />
      <WaitSection />
      <ConfirmSection />
      <WidgetSection />
    </div>
  );
}
