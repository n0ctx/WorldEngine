import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';

/**
 * MarkdownEditor — 所见即所得 Markdown 编辑器（tiptap WYSIWYG）
 * Props:
 *   value       — 受控 markdown 字符串
 *   onChange(v) — 接收新 markdown 字符串（非 event 对象）
 *   placeholder — 占位文本
 *   minHeight   — 最小高度（px），默认 120
 *   className   — 额外 class
 */
export default function MarkdownEditor({ value = '', onChange, placeholder, minHeight = 120, className = '' }) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Markdown.configure({ transformPastedText: true }),
    ],
    content: value,
    onUpdate({ editor }) {
      const md = editor.storage.markdown.getMarkdown();
      onChangeRef.current?.(md);
    },
  });

  // 外部 value 变化时同步（光标不跳）
  useEffect(() => {
    if (!editor) return;
    const current = editor.storage.markdown.getMarkdown();
    if (current !== value) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  const exec = useCallback((cmd) => editor?.chain().focus()[cmd]().run(), [editor]);

  const tools = [
    { label: 'B', title: '加粗', cmd: 'toggleBold', mark: 'bold' },
    { label: 'I', title: '斜体', cmd: 'toggleItalic', mark: 'italic' },
    { label: 'H', title: '标题', cmd: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), mark: { textStyle: false, heading: { level: 2 } } },
    { label: '"', title: '引用', cmd: 'toggleBlockquote', mark: 'blockquote' },
    { label: '<>', title: '行内代码', cmd: 'toggleCode', mark: 'code' },
  ];

  return (
    <div className={['we-md-editor', className].filter(Boolean).join(' ')}>
      <div className="we-md-toolbar">
        {tools.map((t) => {
          const active = typeof t.mark === 'string'
            ? editor?.isActive(t.mark)
            : editor?.isActive(...(Array.isArray(t.mark) ? t.mark : Object.entries(t.mark)[0]));
          return (
            <button
              key={t.label}
              type="button"
              title={t.title}
              className={active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                typeof t.cmd === 'string' ? exec(t.cmd) : t.cmd();
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <EditorContent
        editor={editor}
        className="we-md-content"
        style={{ minHeight }}
      />
    </div>
  );
}
