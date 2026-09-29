/**
 * 开发用动效实验室（/dev/motion，仅 import.meta.env.DEV 注册路由）：
 * 把信号故障的四个真实落点放在一页，逐个重播，并切换世界强调色看错位配色。
 */
import { useState } from 'react';
import Button from '../components/ui/Button.jsx';
import StatusSection from '../components/state/StatusSection.jsx';
import ChapterDivider from '../components/chat/ChapterDivider.jsx';
import DoneSignal from './CharacterEditPage/components/DoneSignal.jsx';
import { useMotion } from '../core/hooks/useMotion.js';
import { log } from '../core/utils/logger.js';

const ACCENTS = [
  { name: '无限轮回', color: '#c9a063' },
  { name: '凡人修仙', color: '#7f9cff' },
  { name: '丧尸末日', color: '#d2583c' },
  { name: '纯爱', color: '#d46bb3' },
];

const TURNS = [
  { hp: 87, favor: 40, gold: 1200, place: '贫民区' },
  { hp: 62, favor: 55, gold: 1200, place: '地下拳场，灯光昏暗，四周站满下注的人' },
  { hp: 91, favor: 48, gold: 850, place: '诊所后巷' },
];

const TOASTS = ['设置已保存', '已保存为角色卡', '标题已更新：雨夜里的拳场'];

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

export default function MotionLabPage() {
  const reduced = useMotion().reduced;
  const [accent, setAccent] = useState(ACCENTS[0].color);
  const [turn, setTurn] = useState(0);
  const [chapterReplay, setChapterReplay] = useState(0);
  const [toastIndex, setToastIndex] = useState(0);
  const [doneKey, setDoneKey] = useState(0);

  const current = TURNS[turn % TURNS.length];
  const previous = turn === 0 ? current : TURNS[(turn - 1) % TURNS.length];

  function sendToast() {
    log.success('motion-lab.toast', null, { toast: TOASTS[toastIndex % TOASTS.length] });
    setToastIndex((i) => i + 1);
  }

  return (
    <div className="we-motion-lab" style={{ '--we-color-accent': accent }}>
      <header className="we-motion-lab__header">
        <h1 className="we-motion-lab__title">动效实验室</h1>
        <p className="we-motion-lab__hint">
          {reduced ? '系统已开启“减少动态效果”：只显示静态结果，不播放故障动效。' : '每个落点都可以单独重播。'}
        </p>
        <div className="we-motion-lab__accents" role="group" aria-label="世界强调色">
          {ACCENTS.map((item) => (
            <button
              key={item.color}
              type="button"
              className="we-motion-lab__accent"
              aria-pressed={accent === item.color}
              onClick={() => setAccent(item.color)}
            >
              <span className="we-motion-lab__swatch" style={{ '--swatch': item.color }} />
              {item.name}
            </button>
          ))}
        </div>
      </header>

      <section className="we-motion-lab__section" aria-labelledby="motion-lab-state">
        <div className="we-motion-lab__bar">
          <h2 id="motion-lab-state" className="we-motion-lab__heading">状态数值变化</h2>
          <Button variant="secondary" size="sm" onClick={() => setTurn((t) => t + 1)}>推进一轮</Button>
        </div>
        <div className="we-motion-lab__stage we-state-panel">
          <StatusSection
            headerless
            gridLayout
            rows={toRows(current)}
            changedKeys={changedKeysBetween(previous, current)}
          />
        </div>
      </section>

      <section className="we-motion-lab__section" aria-labelledby="motion-lab-chapter">
        <div className="we-motion-lab__bar">
          <h2 id="motion-lab-chapter" className="we-motion-lab__heading">写作章节开场</h2>
          <Button variant="secondary" size="sm" onClick={() => setChapterReplay((n) => n + 1)}>重播</Button>
        </div>
        <div className="we-motion-lab__stage">
          <ChapterDivider key={chapterReplay} chapterIndex={3} title="雨夜里的拳场" />
        </div>
      </section>

      <section className="we-motion-lab__section" aria-labelledby="motion-lab-done">
        <div className="we-motion-lab__bar">
          <h2 id="motion-lab-done" className="we-motion-lab__heading">成功提示与完成确认</h2>
          <Button variant="secondary" size="sm" onClick={sendToast}>发送成功提示</Button>
          <Button variant="secondary" size="sm" onClick={() => setDoneKey((n) => n + 1)}>弹出完成确认</Button>
        </div>
      </section>

      <DoneSignal trigger={doneKey} label="已导出" />
    </div>
  );
}
