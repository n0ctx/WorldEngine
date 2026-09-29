import { useState } from 'react';
import StatusSection from '../../../components/state/StatusSection.jsx';
import ChapterDivider from '../../../components/chat/ChapterDivider.jsx';
import Button from '../../../components/ui/Button.jsx';
import DoneConfirm from '../../CharacterEditPage/components/DoneConfirm.jsx';
import SlotSection from '../SlotSection.jsx';
import { TURNS, changedKeysBetween, toRows } from './fixtures.js';

export function StateValuesDemo() {
  const [turn, setTurn] = useState(0);
  const current = TURNS[turn % TURNS.length];
  const previous = turn === 0 ? current : TURNS[(turn - 1) % TURNS.length];
  return (
    <SlotSection
      id="state-values"
      stageClassName="we-state-panel"
      actions={<Button variant="secondary" size="sm" onClick={() => setTurn((t) => t + 1)}>推进一轮</Button>}
    >
      <StatusSection headerless gridLayout rows={toRows(current)} changedKeys={changedKeysBetween(previous, current)} />
    </SlotSection>
  );
}

export function ChapterDemo() {
  const [replay, setReplay] = useState(0);
  return (
    <SlotSection
      id="chapter"
      actions={<Button variant="secondary" size="sm" onClick={() => setReplay((n) => n + 1)}>重播</Button>}
    >
      <ChapterDivider key={replay} chapterIndex={3} title="雨夜里的拳场" />
    </SlotSection>
  );
}

export function DoneConfirmDemo() {
  const [doneKey, setDoneKey] = useState(0);
  return (
    <>
      <SlotSection
        id="done-confirm"
        actions={<Button variant="secondary" size="sm" onClick={() => setDoneKey((n) => n + 1)}>弹出完成确认</Button>}
      />
      <DoneConfirm trigger={doneKey} label="已导出" />
    </>
  );
}
