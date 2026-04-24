// frontend/src/components/state/VisualizationPanel.jsx
import { useState } from 'react';

const TRIGGER_TYPE_LABEL = {
  always: '常驻',
  keyword: '关键词触发',
  llm: 'AI召回',
};

export default function VisualizationPanel({ entries = [], triggers = [] }) {
  const [expanded, setExpanded] = useState({});

  const alwaysCount  = entries.filter((e) => e.trigger_type === 'always').length;
  const keywordCount = entries.filter((e) => e.trigger_type === 'keyword').length;
  const llmCount     = entries.filter((e) => e.trigger_type === 'llm').length;
  const enabledCount = triggers.filter((t) => t.enabled).length;

  const entryMap = Object.fromEntries(entries.map((e) => [e.id, e]));

  function toggleExpanded(id) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function getLinkedEntries(trigger) {
    return (trigger.actions ?? [])
      .filter((a) => a.action_type === 'activate_entry')
      .map((a) => {
        const params = typeof a.params === 'string' ? JSON.parse(a.params) : a.params;
        return entryMap[params?.entry_id];
      })
      .filter(Boolean);
  }

  return (
    <div className="we-viz-panel">
      {/* 上半：条目概况 */}
      <div className="we-viz-summary">
        <div className="we-viz-section-title">条目概况</div>
        <div className="we-viz-summary-grid">
          <div className="we-viz-summary-item">
            <span className="we-viz-summary-num">{alwaysCount}</span>
            <span className="we-viz-summary-label">常驻</span>
          </div>
          <div className="we-viz-summary-item">
            <span className="we-viz-summary-num">{keywordCount}</span>
            <span className="we-viz-summary-label">关键词</span>
          </div>
          <div className="we-viz-summary-item">
            <span className="we-viz-summary-num">{llmCount}</span>
            <span className="we-viz-summary-label">AI召回</span>
          </div>
          <div className="we-viz-summary-item we-viz-summary-item--trigger">
            <span className="we-viz-summary-num">{enabledCount}</span>
            <span className="we-viz-summary-label">触发器↑</span>
          </div>
        </div>
      </div>

      {/* 下半：触发器→条目关系 */}
      <div className="we-viz-relations">
        <div className="we-viz-section-title">触发器 → 条目 关联</div>
        {triggers.length === 0 ? (
          <div className="we-viz-empty">暂无触发器</div>
        ) : (
          triggers.map((trigger) => {
            const linked = getLinkedEntries(trigger);
            const isOpen = !!expanded[trigger.id];
            return (
              <div key={trigger.id} className="we-viz-trigger-row">
                <button
                  className={`we-viz-trigger-header${trigger.enabled ? ' we-viz-trigger-header--enabled' : ''}`}
                  onClick={() => toggleExpanded(trigger.id)}
                >
                  <span className="we-viz-trigger-arrow">{isOpen ? '▾' : '▸'}</span>
                  <span className="we-viz-trigger-name">{trigger.name}</span>
                  <span className={`we-viz-trigger-badge${trigger.enabled ? ' we-viz-trigger-badge--on' : ''}`}>
                    {trigger.enabled ? '启用' : '禁用'}
                  </span>
                  <span className="we-viz-trigger-count">{linked.length} 个条目</span>
                </button>
                {isOpen && (
                  <div className="we-viz-trigger-entries">
                    {linked.length === 0 ? (
                      <span className="we-viz-entry-empty">无关联条目</span>
                    ) : (
                      linked.map((entry) => (
                        <div key={entry.id} className="we-viz-entry-row">
                          <span className="we-viz-entry-arrow">→</span>
                          <span className="we-viz-entry-name">{entry.title}</span>
                          <span className="we-viz-entry-type">
                            {TRIGGER_TYPE_LABEL[entry.trigger_type] ?? entry.trigger_type}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
