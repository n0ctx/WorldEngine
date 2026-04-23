// WorldTabNav — 世界页三标签导航 Block
// Props:
//   tabs: Array<{ key: string, label: string }>
//   activeTab: string（与 tab.key 比较）
//   onTabChange: (key: string) => void

export default function WorldTabNav({ tabs = [], activeTab, onTabChange }) {
  return (
    <div className="we-tab-nav">
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          className={[
            'we-tab-nav__item',
            activeTab === key ? 'we-tab-nav__item--active' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => onTabChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
