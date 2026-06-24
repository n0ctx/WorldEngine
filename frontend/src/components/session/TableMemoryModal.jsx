import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ModalShell from '../ui/ModalShell.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import SectionTabs from '../ui/SectionTabs.jsx';
import { getTableMemory, updateTableMemory } from '../../core/api/table-memory.js';

const ALIAS_COL = '别名';

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/** 单元格内联文本编辑器：失焦/回车提交，Escape 取消（镜像 StatusTable.CellEditor，但为文本） */
function CellEditor({ initial, maxLength, onCommit, onCancel }) {
  const [draft, setDraft] = useState(initial ?? '');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select?.(); }, []);
  return (
    <input
      ref={ref}
      type="text"
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(draft); }
        if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
      }}
      className="we-input we-tm-input"
    />
  );
}

function TableMemoryGrid({ columns, rows, maxLength, onCellCommit, onDeleteRow }) {
  const [editingKey, setEditingKey] = useState(null);
  const hasRows = Array.isArray(rows) && rows.length > 0;

  return (
    <div className="we-tm-scroll">
      <div
        className="we-tm-grid"
        style={{ '--we-tm-cols': columns.length }}
        role="table"
        aria-label="表格记忆"
      >
        <div className="we-tm-row we-tm-head" role="row">
          {columns.map((col) => (
            <span key={col} className="we-tm-cell we-tm-head-cell" role="columnheader">{col}</span>
          ))}
          <span className="we-tm-cell we-tm-head-cell we-tm-alias-cell" role="columnheader">{ALIAS_COL}</span>
          <span className="we-tm-cell we-tm-head-cell we-tm-action-cell" role="columnheader" aria-label="操作" />
        </div>

        {!hasRows && (
          <div className="we-tm-empty" role="row">暂无数据</div>
        )}

        {hasRows && rows.map((row) => (
          <div key={row.id} className="we-tm-row we-tm-body" role="row">
            {columns.map((col) => {
              const cellKey = `${row.id}:${col}`;
              const isEditing = editingKey === cellKey;
              const val = row[col];
              const isEmpty = val == null || val === '';
              return (
                <span key={col} className={`we-tm-cell we-tm-body-cell${isEditing ? ' we-tm-cell--editing' : ''}`} role="cell">
                  {isEditing ? (
                    <CellEditor
                      initial={isEmpty ? '' : String(val)}
                      maxLength={maxLength}
                      onCommit={(v) => { setEditingKey(null); onCellCommit(row.id, col, v); }}
                      onCancel={() => setEditingKey(null)}
                    />
                  ) : (
                    <span
                      className={`we-tm-value${isEmpty ? ' we-status-null' : ''} we-status-editable`}
                      onClick={() => setEditingKey(cellKey)}
                      title="点击编辑"
                    >
                      {isEmpty ? '—' : String(val)}
                    </span>
                  )}
                </span>
              );
            })}
            <span className="we-tm-cell we-tm-body-cell we-tm-alias-cell" role="cell">
              <span className={`we-tm-value we-tm-alias${row[ALIAS_COL] ? '' : ' we-status-null'}`}>
                {row[ALIAS_COL] || '—'}
              </span>
            </span>
            <span className="we-tm-cell we-tm-body-cell we-tm-action-cell" role="cell">
              <button
                type="button"
                className="we-tm-delete"
                onClick={() => onDeleteRow(row.id)}
                aria-label="删除此行"
                title="删除此行"
              >
                <TrashIcon />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TableMemoryModal({ sessionId, onClose }) {
  const [data, setData] = useState(null); // 整个 tables 对象，null=loading
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getTableMemory(sessionId)
      .then((res) => {
        if (cancelled) return;
        setError(''); setData(res?.tables ?? null); setSchema(res?.schema ?? null);
      })
      .catch((err) => { if (!cancelled) setError(err.message || '加载失败'); });
    return () => { cancelled = true; };
  }, [sessionId]);

  function requestClose() {
    if (saving) return;
    if (dirty) { setConfirmDiscard(true); return; }
    onClose();
  }

  // Escape 关闭（ModalShell 自身不处理键盘）
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !confirmDiscard) requestClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function commitCell(tableKey, rowId, colKey, value) {
    setData((prev) => {
      if (!prev) return prev;
      const table = prev.tables[tableKey];
      const rows = table.rows.map((r) => (r.id === rowId ? { ...r, [colKey]: value } : r));
      return { ...prev, tables: { ...prev.tables, [tableKey]: { ...table, rows } } };
    });
    setDirty(true);
  }

  function deleteRow(tableKey, rowId) {
    setData((prev) => {
      if (!prev) return prev;
      const table = prev.tables[tableKey];
      const rows = table.rows.filter((r) => r.id !== rowId);
      return { ...prev, tables: { ...prev.tables, [tableKey]: { ...table, rows } } };
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!data || saving) return;
    setSaving(true); setError('');
    try {
      const res = await updateTableMemory(sessionId, data);
      setData(res?.tables ?? data);
      setDirty(false);
      onClose();
    } catch (err) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const sections = useMemo(() => {
    if (!data || !schema) return [];
    const fieldMax = schema.fieldMaxChars;
    return Object.keys(schema.tables).map((key) => ({
      key,
      label: schema.tables[key].name,
      content: (
        <TableMemoryGrid
          columns={schema.tables[key].columns}
          rows={data.tables[key]?.rows ?? []}
          maxLength={fieldMax}
          onCellCommit={(rowId, colKey, value) => commitCell(key, rowId, colKey, value)}
          onDeleteRow={(rowId) => deleteRow(key, rowId)}
        />
      ),
    }));
  }, [data, schema]);

  const loading = data === null && !error;

  return (
    <ModalShell onClose={requestClose} maxWidth="max-w-4xl">
      <div className="we-dialog-header">
        <h2>表格记忆</h2>
      </div>

      <div className="we-dialog-body we-tm-body-wrap">
        <p className="we-settings-toggle-hint mb-2">
          每轮自动维护以下表格；可点单元格改值、删行（删除为真删除，立即生效）。开关关闭仅停止更新与注入，已有数据保留。
        </p>
        {loading ? (
          <div className="we-tm-skeleton">
            {[90, 80, 85].map((w, i) => (
              <div key={i} className="we-skel we-tm-skeleton-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : sections.length > 0 ? (
          <SectionTabs sections={sections} defaultKey={sections[0]?.key} />
        ) : null}
        {error && (
          <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="we-dialog-footer">
        <button onClick={requestClose} disabled={saving} className="we-confirm-cancel">
          取消
        </button>
        <button onClick={handleSave} disabled={saving || loading || !dirty} className="we-confirm-ok">
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      {/* 放弃确认浮层：portal 到 body（脱离 ModalShell 的 transform 上下文），
          并以高于表格 Modal 的层级渲染，避免落在其 z 之下 */}
      {confirmDiscard && createPortal(
        <div className="we-tm-confirm-layer">
          <ConfirmModal
            title="放弃未保存的修改？"
            message="你对表格记忆做了改动但尚未保存，关闭将丢弃这些改动。"
            confirmText="放弃"
            cancelText="继续编辑"
            danger
            onConfirm={async () => { setConfirmDiscard(false); onClose(); }}
            onClose={() => setConfirmDiscard(false)}
          />
        </div>,
        document.body,
      )}
    </ModalShell>
  );
}
