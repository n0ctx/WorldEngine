/**
 * 开发用设计实验室（/dev/design，仅 import.meta.env.DEV 注册路由）：
 * 顶部统一切换主题、动效与世界强调色（只是预览），下面分页看真实组件。
 * 这里的切换只是临时预览，不写配置；离开本页时恢复设置里选的主题和动效。
 */
import { useEffect, useState } from 'react';
import { getConfig } from '../../core/api/config.js';
import { DEFAULT_THEME_ID, listThemes, refreshThemeCss } from '../../core/api/themes.js';
import { useMotion } from '../../core/hooks/useMotion.js';
import { MOTION_PACKS, setMotionPack } from '../../core/motion/motionPack.js';
import './lab.css';
import './sketch/sketch.css';
import MotionTab from './MotionTab.jsx';
import VisualTab from './VisualTab.jsx';

const ACCENTS = [
  { name: '无限轮回', color: '#c9a063' },
  { name: '凡人修仙', color: '#7f9cff' },
  { name: '丧尸末日', color: '#d2583c' },
  { name: '纯爱', color: '#d46bb3' },
];

const TABS = [
  { key: 'motion', label: '动效', Content: MotionTab },
  { key: 'visual', label: '视觉', Content: VisualTab },
];

function ChipGroup({ label, items, isActive, onSelect }) {
  return (
    <div className="we-design-lab__chips" role="group" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="we-design-lab__chip"
          aria-pressed={isActive(item)}
          onClick={() => onSelect(item)}
        >
          {item.swatch && <span className="we-design-lab__swatch" style={{ '--swatch': item.swatch }} />}
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function DesignLabPage() {
  const { reduced, pack } = useMotion();
  const [tab, setTab] = useState(TABS[0].key);
  const [accent, setAccent] = useState(ACCENTS[0].color);
  const [themes, setThemes] = useState([]);
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);

  useEffect(() => {
    let configured = { theme: DEFAULT_THEME_ID, motion: undefined };
    let cancelled = false;
    Promise.all([listThemes(), getConfig()]).then(([data, config]) => {
      if (cancelled) return;
      configured = { theme: config.ui?.theme || DEFAULT_THEME_ID, motion: config.ui?.motion };
      setThemes(data.themes || []);
      setThemeId(configured.theme);
    }).catch(() => {});
    return () => {
      cancelled = true;
      setMotionPack(configured.motion);
      refreshThemeCss(configured.theme, { silent: true });
    };
  }, []);

  function previewTheme(id) {
    setThemeId(id);
    refreshThemeCss(id, { silent: true });
  }

  const { Content } = TABS.find((item) => item.key === tab);

  return (
    <div className="we-design-lab" style={{ '--we-color-accent': accent }}>
      <header className="we-design-lab__header">
        <h1 className="we-design-lab__title">设计实验室</h1>
        <p className="we-design-lab__hint">
          {reduced ? '系统已开启“减少动态效果”：只显示静态结果。' : '这里的切换只是临时预览，离开本页后回到设置里选的主题和动效。'}
        </p>
        <ChipGroup
          label="分页"
          items={TABS}
          isActive={(item) => tab === item.key}
          onSelect={(item) => setTab(item.key)}
        />
        <ChipGroup
          label="主题"
          items={themes.map((item) => ({ key: item.id, label: item.name }))}
          isActive={(item) => themeId === item.key}
          onSelect={(item) => previewTheme(item.key)}
        />
        <ChipGroup
          label="动效"
          items={Object.values(MOTION_PACKS).map((item) => ({ key: item.id, label: item.name }))}
          isActive={(item) => pack.id === item.key}
          onSelect={(item) => setMotionPack(item.key)}
        />
        <ChipGroup
          label="世界强调色"
          items={ACCENTS.map((item) => ({ key: item.color, label: item.name, swatch: item.color }))}
          isActive={(item) => accent === item.key}
          onSelect={(item) => setAccent(item.key)}
        />
      </header>

      <Content />
    </div>
  );
}
