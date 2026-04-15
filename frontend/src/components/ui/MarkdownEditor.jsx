import MDEditor, { commands } from '@uiw/react-md-editor';

/**
 * MarkdownEditor — 所见即所得 Markdown 编辑器（Obsidian 风格）
 * Props:
 *   value       — 受控字符串值
 *   onChange(v) — 接收新字符串（非 event 对象）
 *   placeholder — 占位文本
 *   minHeight   — 最小高度（px），默认 120
 *   className   — 额外 class
 */
export default function MarkdownEditor({ value = '', onChange, placeholder, minHeight = 120, className = '' }) {
  const toolbar = [
    commands.bold,
    commands.italic,
    commands.title,
    commands.quote,
    commands.code,
  ];

  return (
    <div
      className={['we-md-editor', className].filter(Boolean).join(' ')}
      data-color-mode="light"
    >
      <MDEditor
        value={value}
        onChange={(v) => onChange?.(v ?? '')}
        preview="live"
        commands={toolbar}
        extraCommands={[]}
        textareaProps={{ placeholder }}
        height={Math.max(minHeight, 120)}
      />
    </div>
  );
}
