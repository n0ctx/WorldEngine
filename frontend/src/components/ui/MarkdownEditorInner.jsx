import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';

/**
 * MarkdownEditorInner — 所见即所得 Markdown 编辑器（tiptap WYSIWYG）
 * 仅在懒加载完成后渲染，承载真实 Tiptap 依赖。
 */
export default function MarkdownEditorInner({ value = '', onChange, placeholder, minHeight = 120, className = '' }) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Markdown.configure({ transformPastedText: true }),
    ],
    content: value,
    onUpdate({ editor: currentEditor }) {
      const md = currentEditor.storage.markdown.getMarkdown();
      onChangeRef.current?.(md);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.storage.markdown.getMarkdown();
    if (current !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
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
        style={{ height: minHeight }}
      />
    </div>
  );
}
