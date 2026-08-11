/**
 * StateChangeCard —— 「情境卡」：状态区块默认只显示这一轮变了什么。
 *
 * 默认态：只列出本轮变化的字段（旧值 → 新值），没有变化就给一句「本轮没有变化」。
 * 「看全部」展开后渲染既有的 StatusSection（保留查看/编辑/表格字段/重置等全部
 * 既有能力），折叠时不丢任何功能，只是不再默认铺开。
 *
 * hasBaseline=false（刚加载/刚切换会话，前端本地 diff 还没有"上一次"可比，见
 * useStateDiff）时不展示「本轮没有变化」——那是把"不知道"说成"确认没变"，
 * 会误导用户；这种情况下默认直接展开显示完整状态。
 */
import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import StatusSection from './StatusSection.jsx';
import { formatFieldValue, stateRowKey } from './state-value-format.js';
import { applyTemplateVars } from '../../core/utils/template-vars.js';

function ChangeValue({ row, effectiveValueJson, templateCtx }) {
  const type = row.field_type ?? row.type;
  const display = formatFieldValue(effectiveValueJson, type, row.prefix);
  if (display == null) return <span className="we-state-change-value we-status-null">—</span>;
  // 有上限的数值要带上 / 上限：光看「71 → 62」不知道掉了多少算严重，
  // 「71 / 100 → 62 / 100」才有语境。完整表格里本来就是这么显示的，
  // 情境卡不该把这个语境丢掉。
  const max = type === 'number' ? (row.max_value ?? row.max ?? null) : null;
  const text = applyTemplateVars(max == null ? display : `${display} / ${max}`, templateCtx);
  return (
    <span className={`we-state-change-value${type === 'number' ? ' we-status-value--number' : ''}`}>
      {text}
    </span>
  );
}

function ChangeRow({ change, templateCtx }) {
  const { row, prevRow } = change;
  const type = row.field_type ?? row.type;
  if (type === 'table') {
    return (
      <div className="we-state-change-row" key={stateRowKey(row)}>
        <span className="we-state-change-label">{row.label}</span>
        <span className="we-state-change-value">表格已更新</span>
      </div>
    );
  }
  return (
    <div className="we-state-change-row">
      <span className="we-state-change-label">{row.label}</span>
      <span className="we-state-change-diff">
        <ChangeValue row={prevRow} effectiveValueJson={prevRow.effective_value_json} templateCtx={templateCtx} />
        <Icon size={16} viewBox="0 0 16 16" strokeWidth="2" className="we-state-change-arrow">
          <path d="M3 8h9" />
          <path d="M8 4l4 4-4 4" />
        </Icon>
        <ChangeValue row={row} effectiveValueJson={row.effective_value_json} templateCtx={templateCtx} />
      </span>
    </div>
  );
}

export default function StateChangeCard({
  rows,
  changes,
  hasBaseline = true,
  onSave,
  templateCtx,
  emptyContent,
  className,
  gridLayout = true,
  headerless = true,
}) {
  // 没有比较基线（刚加载/刚切换会话，还没有"上一次"可比）时，默认展开显示
  // 完整状态——绝不能默认收起并显示"本轮没有变化"，那是把"不知道"说成"确认
  // 没变"，会误导用户以为上一轮真的什么都没发生。
  const [expanded, setExpanded] = useState(!hasBaseline);

  const isLoading = rows === null;
  const hasRows = Array.isArray(rows) && rows.length > 0;

  if (isLoading || !hasRows) {
    return (
      <div className={`we-state-change-card ${className || ''}`}>
        <StatusSection
          headerless={headerless}
          gridLayout={gridLayout}
          className={className}
          rows={rows}
          onSave={onSave}
          templateCtx={templateCtx}
          emptyContent={emptyContent}
        />
      </div>
    );
  }

  const changedKeys = new Set(changes.map((c) => stateRowKey(c.row)));
  const unchangedCount = rows.length - changedKeys.size;

  return (
    <div className={`we-state-change-card ${className || ''}`}>
      {!hasBaseline ? (
        <p className="we-state-change-empty">已加载当前状态，本轮变化将在下一次回复后显示</p>
      ) : changes.length === 0 ? (
        <p className="we-state-change-empty">本轮没有变化</p>
      ) : (
        <div className="we-state-change-list">
          {changes.map((c) => (
            <ChangeRow key={stateRowKey(c.row)} change={c} templateCtx={templateCtx} />
          ))}
        </div>
      )}

      <button
        type="button"
        className="we-state-change-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <Icon
          size={16}
          viewBox="0 0 10 10"
          strokeWidth="2.5"
          className="we-status-chevron"
          style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          <polyline points="2,3.5 5,6.5 8,3.5" />
        </Icon>
        <span>
          {expanded
            ? '收起'
            : (!hasBaseline
                ? '查看全部字段'
                : (unchangedCount > 0 ? `其余 ${unchangedCount} 个字段没有变化，查看全部` : '查看全部字段'))}
        </span>
      </button>

      {expanded && (
        <div className="we-state-change-full">
          <StatusSection
            headerless={headerless}
            gridLayout={gridLayout}
            className={className}
            rows={rows}
            onSave={onSave}
            templateCtx={templateCtx}
            emptyContent={emptyContent}
          />
        </div>
      )}
    </div>
  );
}
