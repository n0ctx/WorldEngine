import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ISO_DATETIME_RE, formatBooleanDisplay, formatDatetimeChinese, parseLooseJson } from './state-value-format';

const EMPTY_DISPLAY = '（未设置）';

/**
 * 按字段类型把 value_json（可能是合法 JSON 也可能是裸字符串）渲染为可读文本；返回 null 表示"未设置"。
 *
 * 注意：list/table 类型解析出的空容器（'[]' / '{}'）不能返回 null——它们代表"已存值但内容为空"
 * （例如用户手动清空过列表），与"从未设置"（current_value_json 为 null/''）语义不同。上层用
 * `currentDisplay != null` 判定是否为"覆盖"，一旦这里把空容器误判为 null，会导致真实存在的空
 * 列表/空表格被当成"新增"，默认勾选后静默覆盖。
 */
function formatDisplayValue(rawJson, type) {
  if (rawJson == null || rawJson === '') return null;
  const v = parseLooseJson(rawJson);
  switch (type) {
    case 'boolean':
      return formatBooleanDisplay(v);
    case 'list': {
      if (!Array.isArray(v)) return String(v);
      return v.length === 0 ? '（空列表）' : v.join('、');
    }
    case 'table': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return String(v);
      const entries = Object.entries(v);
      return entries.length === 0 ? '（空表格）' : entries.map(([k, val]) => `${k}: ${val}`).join('、');
    }
    case 'datetime': {
      if (typeof v === 'string' && ISO_DATETIME_RE.test(v)) return formatDatetimeChinese(v);
      return String(v);
    }
    default:
      return v === '' || v == null ? null : String(v);
  }
}

/**
 * StateExtractPreviewModal — AI 提取状态字段建议值的预览/勾选确认弹窗
 *
 * 复用 StateFieldEditor.jsx 的 we-dialog-* 弹窗结构与 createPortal 挂载方式，不自创样式。
 *
 * Props:
 *   onExtract() → Promise<Array<{ field_key, label, type, current_value_json, suggested_value_json }>>
 *     父组件负责调具体的 extractCharacterStateValues / extractPersonaStateValues
 *   onConfirm(selectedItems) → Promise<void>
 *     父组件负责逐条写入（复用既有的 updateXxxStateValue），并在成功后刷新页面显示的状态值
 *   onClose()
 */
export default function StateExtractPreviewModal({ onExtract, onConfirm, onClose }) {
  const [suggestions, setSuggestions] = useState(null); // null=加载中；[]=无建议；array=有建议
  const [fetchError, setFetchError] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  useEffect(() => {
    let cancelled = false;
    onExtract()
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        // 默认勾选策略：新增（当前值为空）默认勾选；覆盖（当前值非空）默认不勾选，避免误删用户手写内容
        const initial = new Set(
          list
            .filter((row) => formatDisplayValue(row.current_value_json, row.type) == null)
            .map((row) => row.field_key)
        );
        setSelected(initial);
        setSuggestions(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(err.message || 'AI 提取失败，请稍后重试');
        setSuggestions([]);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    if (!Array.isArray(suggestions)) return [];
    return suggestions.map((row) => {
      const currentDisplay = formatDisplayValue(row.current_value_json, row.type);
      const suggestedDisplay = formatDisplayValue(row.suggested_value_json, row.type);
      return {
        ...row,
        currentDisplay,
        suggestedDisplay,
        isOverride: currentDisplay != null,
      };
    });
  }, [suggestions]);

  const selectedCount = selected.size;

  function toggle(fieldKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fieldKey)) next.delete(fieldKey); else next.add(fieldKey);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(rows.map((r) => r.field_key)));
  }

  function selectNone() {
    setSelected(new Set());
  }

  async function handleConfirm() {
    if (selectedCount === 0 || confirming) return;
    setConfirming(true);
    setConfirmError('');
    try {
      const picked = rows.filter((r) => selected.has(r.field_key));
      await onConfirm(picked);
      onClose();
    } catch (err) {
      setConfirmError(err.message || '写入失败，请稍后重试');
      setConfirming(false);
    }
  }

  const isLoading = suggestions === null;
  const isEmpty = !isLoading && !fetchError && rows.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="we-dialog-panel w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="we-dialog-header">
          <h2>AI 提取状态字段建议</h2>
        </div>

        <div className="we-dialog-body flex flex-col gap-4">
          {isLoading && (
            <p className="we-state-field-hint">正在从人设正文分析可能的状态字段值，请稍候…</p>
          )}

          {!isLoading && fetchError && (
            <p className="we-state-field-error">{fetchError}</p>
          )}

          {isEmpty && (
            <p className="we-section-empty">AI 未能从当前人设正文中提取到任何状态字段建议，可先完善人设正文（简介/系统提示词）后重试</p>
          )}

          {!isLoading && rows.length > 0 && (
            <>
              <div className="we-extract-toolbar">
                <div className="we-extract-toolbar-actions">
                  <button type="button" className="we-btn we-btn-sm we-btn-secondary" onClick={selectAll}>全选</button>
                  <button type="button" className="we-btn we-btn-sm we-btn-secondary" onClick={selectNone}>全不选</button>
                </div>
                <span className="we-extract-count">已选 {selectedCount} / {rows.length} 条</span>
              </div>

              <div className="we-extract-list">
                {rows.map((row) => (
                  <label
                    key={row.field_key}
                    className={`we-extract-row${row.isOverride ? ' we-extract-row--override' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="we-extract-checkbox"
                      checked={selected.has(row.field_key)}
                      onChange={() => toggle(row.field_key)}
                      aria-label={`勾选写入 ${row.label}`}
                    />
                    <div className="we-extract-body">
                      <div className="we-extract-row-head">
                        <span className="we-extract-label">{row.label}</span>
                        {row.isOverride ? (
                          <span className="we-extract-badge we-extract-badge--override">将覆盖</span>
                        ) : (
                          <span className="we-extract-badge we-extract-badge--new">新增</span>
                        )}
                      </div>
                      <div className="we-extract-values">
                        <span className="we-extract-current">
                          当前：{row.currentDisplay ?? EMPTY_DISPLAY}
                        </span>
                        <span className="we-extract-arrow">→</span>
                        <span className="we-extract-suggested">
                          建议：{row.suggestedDisplay ?? EMPTY_DISPLAY}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}

          {confirmError && <p className="we-state-field-error">{confirmError}</p>}
        </div>

        <div className="we-dialog-footer">
          <button onClick={onClose} className="we-btn we-btn-sm we-btn-secondary" disabled={confirming}>取消</button>
          <button
            onClick={handleConfirm}
            disabled={selectedCount === 0 || confirming || isLoading}
            className="we-btn we-btn-sm we-btn-primary"
          >
            {confirming ? '写入中…' : `写入 ${selectedCount} 条`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
