import { lazy, Suspense } from 'react';

const MarkdownEditorInner = lazy(() => import('./MarkdownEditorInner.jsx'));

/**
 * MarkdownEditor — 懒加载包装层
 * 将 Tiptap 依赖延后到真正进入编辑场景时再加载，避免进入首包。
 */
export default function MarkdownEditor(props) {
  const minHeight = props.minHeight ?? 120;

  return (
    <Suspense
      fallback={(
        <div className="we-md-editor" style={{ height: minHeight + 37 }}>
          <div className="we-md-toolbar" aria-hidden="true">
            <button type="button" disabled>B</button>
            <button type="button" disabled>I</button>
            <button type="button" disabled>H</button>
            <button type="button" disabled>"</button>
            <button type="button" disabled>{'<>'}</button>
          </div>
          <div
            className="we-md-content"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <span className="we-edit-empty-text">编辑器加载中…</span>
          </div>
        </div>
      )}
    >
      <MarkdownEditorInner {...props} />
    </Suspense>
  );
}
