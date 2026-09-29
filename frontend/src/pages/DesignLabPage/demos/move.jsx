import { useRef, useState } from 'react';
import BounceRail from '../../../components/motion/BounceRail.jsx';
import Folder from '../../../components/motion/Folder.jsx';
import StepTrack from '../../../components/motion/StepTrack.jsx';
import TaskList from '../../../components/motion/TaskList.jsx';
import Button from '../../../components/ui/Button.jsx';
import SectionTabs from '../../../components/ui/SectionTabs.jsx';
import SlotSection from '../SlotSection.jsx';
import { NAV } from './fixtures.js';

export function TabsDemo() {
  const tabs = NAV.map((label) => ({ key: label, label, content: <p className="we-design-lab__note">{label}的内容</p> }));
  return (
    <SlotSection id="tabs">
      <div className="we-design-lab__grid">
        <SectionTabs sections={tabs} />
        <SectionTabs sections={tabs} variant="gooey" />
      </div>
    </SlotSection>
  );
}

export function StepTrackDemo() {
  const [step, setStep] = useState(1);
  return (
    <SlotSection
      id="step-track"
      actions={<Button variant="secondary" size="sm" onClick={() => setStep((s) => (s + 1) % 4)}>下一步</Button>}
    >
      <StepTrack steps={4} current={step} />
    </SlotSection>
  );
}

export function BounceRailDemo() {
  const navRef = useRef(null);
  const [nav, setNav] = useState(0);
  return (
    <SlotSection id="bounce-rail">
      <div ref={navRef} className="we-design-lab__nav">
        <BounceRail containerRef={navRef} activeKey={nav} />
        {NAV.map((label, i) => (
          <button
            key={label}
            type="button"
            data-bounce-item
            aria-current={nav === i ? 'page' : undefined}
            className="we-design-lab__nav-item"
            onClick={() => setNav(i)}
          >
            {label}
          </button>
        ))}
      </div>
    </SlotSection>
  );
}

export function TaskListDemo() {
  const [tasks, setTasks] = useState([
    { id: 'rules', title: '写下世界规则', done: true },
    { id: 'fields', title: '定义状态字段', done: false },
    { id: 'opening', title: '写开场白', done: false },
  ]);
  const toggle = (id) => setTasks((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  return (
    <SlotSection id="task-list">
      <TaskList tasks={tasks.map((t) => ({ ...t, onClick: () => toggle(t.id) }))} />
    </SlotSection>
  );
}

export function FolderDemo() {
  const [folder, setFolder] = useState('rest');
  return (
    <SlotSection id="folder">
      <button
        type="button"
        className="we-design-lab__folder"
        onMouseEnter={() => setFolder('hover')}
        onMouseLeave={() => setFolder('rest')}
        onClick={() => setFolder((s) => (s === 'open' ? 'hover' : 'open'))}
      >
        <Folder state={folder} width={72} />
      </button>
    </SlotSection>
  );
}
