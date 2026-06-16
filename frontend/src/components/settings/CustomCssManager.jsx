import { useState, useEffect, useCallback } from 'react';
import {
  listSnippets, createSnippet, updateSnippet, deleteSnippet,
  reorderSnippets, refreshCustomCss,
} from '../../core/api/custom-css-snippets';
import { useAppModeStore } from '../../core/state/appMode';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import SortableList from '../ui/SortableList';
import ConfirmModal from '../ui/ConfirmModal';
import DialogShell from '../ui/DialogShell';
import Icon from '../ui/Icon';
import DragHandle from '../ui/DragHandle.jsx';
import { SETTINGS_MODE } from '../../core/constants/settings';
import { log } from '../../core/utils/logger.js';

const CSS_REFERENCE_EXAMPLE = `/* ✅ 推荐：改变量协调换肤 */
:root {
  --we-color-bg-canvas: #e8dcc8;
  --we-color-accent: #8b2e24;
}

/* ✅ 推荐：改消息样式 */
.we-message-assistant .we-message-content {
  font-size: 18px;
  line-height: 2;
}

/* ✅ 推荐：改用户消息边线颜色 */
.we-message-user { border-left-color: #4a7c8b; }

/* ⚠️  注意：骨架类名可能随版本变化 */
.we-book-spine { ... }`;

export default function CustomCssManager({ settingsMode = SETTINGS_MODE.CHAT }) {
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const appMode = useAppModeStore((s) => s.appMode);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnippets(await listSnippets({ mode: settingsMode }));
    } finally {
      setLoading(false);
    }
  }, [settingsMode]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  // 写卡助手在 apply_css_snippet 成功后会派发 we:css-updated，主界面随之 reload
  useEffect(() => {
    const onUpdated = () => {
      void load();
      void refreshCustomCss(appMode);
    };
    window.addEventListener('we:css-updated', onUpdated);
    return () => window.removeEventListener('we:css-updated', onUpdated);
  }, [load, appMode]);

  async function handleSave(data) {
    if (editingSnippet) {
      await updateSnippet(editingSnippet.id, data);
    } else {
      await createSnippet({ ...data, mode: settingsMode });
    }
    await load();
    await refreshCustomCss(appMode);
  }

  async function handleToggle(snippet) {
    await updateSnippet(snippet.id, { enabled: snippet.enabled ? 0 : 1 });
    await load();
    await refreshCustomCss(appMode);
  }

  async function handleDelete(id) {
    await deleteSnippet(id);
    setDeletingId(null);
    await load();
    await refreshCustomCss(appMode);
  }

  async function handleReorderEnd(finalItems) {
    const items = finalItems.map((s, i) => ({ id: s.id, sort_order: i }));
    await reorderSnippets(items);
    await refreshCustomCss(appMode);
  }

  return (
    <div>
      <div className="we-css-reference">
        <details>
          <summary>推荐选择器参考</summary>
          <div className="we-css-reference-body">
            <pre className="we-css-reference-code">{CSS_REFERENCE_EXAMPLE}</pre>
            <p className="we-css-reference-note">
              稳定锚点类名与 token 规则以当前前端文档为准，标 ⚠️ 的类名可能随版本变化请谨慎。
            </p>
          </div>
        </details>
      </div>

      <div className="we-css-snippet-list__header">
        <span className="we-css-snippet-list__title">自定义 CSS 片段</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setEditingSnippet(null); setShowEditor(true); }}
        >
          添加
        </Button>
      </div>

      {loading ? (
        <p className="we-css-snippet-empty">加载中…</p>
      ) : snippets.length === 0 ? (
        <p className="we-css-snippet-empty">暂无 CSS 片段</p>
      ) : (
        <SortableList
          items={snippets}
          onReorder={setSnippets}
          onReorderEnd={handleReorderEnd}
          renderItem={(s) => (
            <SnippetRow
              snippet={s}
              onEdit={() => { setEditingSnippet(s); setShowEditor(true); }}
              onToggle={() => handleToggle(s)}
              onDelete={() => setDeletingId(s.id)}
            />
          )}
          className="we-css-snippet-list"
        />
      )}

      {showEditor && (
        <SnippetEditor
          snippet={editingSnippet}
          onSave={handleSave}
          onClose={() => setShowEditor(false)}
        />
      )}

      {deletingId && (
        <ConfirmModal
          title="确认删除"
          message="此操作无法撤销。"
          confirmText="确认删除"
          danger
          onConfirm={() => handleDelete(deletingId)}
          onClose={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

function SnippetRow({ snippet, onEdit, onToggle, onDelete }) {
  return (
    <div className="we-css-snippet-row">
      <span className="we-css-snippet-row__drag"><DragHandle /></span>

      <div className="we-css-snippet-row__main">
        <span className="we-css-snippet-row__name">{snippet.name}</span>
        {snippet.content && (
          <span className="we-css-snippet-row__preview">
            {snippet.content.trim().slice(0, 40)}{snippet.content.trim().length > 40 ? '…' : ''}
          </span>
        )}
      </div>

      <div className="we-css-snippet-row__actions">
        <button
          type="button"
          onClick={onToggle}
          title={snippet.enabled ? '点击禁用' : '点击启用'}
          className={`we-css-snippet-row__toggle${snippet.enabled ? ' we-css-snippet-row__toggle--on' : ''}`}
        >
          {snippet.enabled ? '启用' : '禁用'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label="编辑"
          className="we-css-snippet-row__action"
        >
          <Icon aria-label="编辑">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </Icon>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="删除"
          className="we-css-snippet-row__action we-css-snippet-row__action--danger"
        >
          <Icon aria-label="删除">
            <path d="M18 6 6 18" />
            <path d="M6 6l12 12" />
          </Icon>
        </button>
      </div>
    </div>
  );
}

function SnippetEditor({ snippet, onSave, onClose }) {
  const [name, setName] = useState(snippet?.name ?? '');
  const [content, setContent] = useState(snippet?.content ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), content });
      onClose();
    } catch (err) {
      log.error('css.snippets.save_failed', err, { toast: `保存失败：${err.message}` });
      setSaving(false);
    }
  }

  return (
    <DialogShell onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
        <div className="we-dialog-header flex items-center justify-between">
          <h3>{snippet ? '编辑 CSS 片段' : '新建 CSS 片段'}</h3>
        </div>

        <div className="we-dialog-body flex flex-col gap-4">
          <div>
            <label className="we-dialog-label">片段名称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：消息气泡样式"
              autoFocus
            />
          </div>

          <div>
            <label className="we-dialog-label">CSS 内容</label>
            <Textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder=".message-bubble { background: #fff; }"
              spellCheck={false}
              className="we-css-snippet-editor__textarea"
            />
          </div>
        </div>

        <div className="we-dialog-footer">
          <Button variant="ghost" type="button" onClick={onClose}>取消</Button>
          <Button variant="primary" type="submit" disabled={saving || !name.trim()}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

