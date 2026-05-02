import { useEffect, useRef, useState } from 'react';
import { EditorView, ViewPlugin, Decoration, keymap, placeholder as cmPlaceholder } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

// --- Obsidian-style live preview decorations ---

function buildDecorations(view) {
  const { state } = view;
  const cursorLine = state.doc.lineAt(state.selection.main.head).number;
  const lineDecos = [];
  const markDecos = [];
  const seenLines = new Set();

  syntaxTree(state).iterate({
    enter(node) {
      const fromLine = state.doc.lineAt(node.from).number;
      const active = fromLine === cursorLine;

      // Blockquote: add line deco for every line in the block
      if (node.name === 'Blockquote') {
        let pos = node.from;
        while (pos <= node.to && pos < state.doc.length) {
          const line = state.doc.lineAt(pos);
          if (line.number !== cursorLine && !seenLines.has(line.from)) {
            seenLines.add(line.from);
            lineDecos.push(Decoration.line({ class: 'cm-md-blockquote' }).range(line.from));
          }
          if (line.to >= node.to) break;
          pos = line.to + 1;
        }
        return; // still recurse to handle QuoteMark children
      }

      // Heading line decorations
      if (!active) {
        const lf = state.doc.lineAt(node.from).from;
        if (!seenLines.has(lf)) {
          if (node.name === 'ATXHeading1') { seenLines.add(lf); lineDecos.push(Decoration.line({ class: 'cm-md-h1' }).range(lf)); }
          else if (node.name === 'ATXHeading2') { seenLines.add(lf); lineDecos.push(Decoration.line({ class: 'cm-md-h2' }).range(lf)); }
          else if (node.name === 'ATXHeading3') { seenLines.add(lf); lineDecos.push(Decoration.line({ class: 'cm-md-h3' }).range(lf)); }
        }
      }

      // Mark decorations – only on non-active lines
      if (active) return;

      if (node.name === 'HeaderMark') {
        const spaceEnd = state.doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
        markDecos.push(Decoration.mark({ class: 'cm-md-hide' }).range(node.from, spaceEnd));
      } else if (node.name === 'EmphasisMark') {
        markDecos.push(Decoration.mark({ class: 'cm-md-hide' }).range(node.from, node.to));
      } else if (node.name === 'QuoteMark') {
        const spaceEnd = state.doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
        markDecos.push(Decoration.mark({ class: 'cm-md-hide' }).range(node.from, spaceEnd));
      } else if (node.name === 'CodeMark') {
        markDecos.push(Decoration.mark({ class: 'cm-md-hide' }).range(node.from, node.to));
      } else if (node.name === 'StrongEmphasis') {
        markDecos.push(Decoration.mark({ class: 'cm-md-strong' }).range(node.from, node.to));
      } else if (node.name === 'Emphasis') {
        markDecos.push(Decoration.mark({ class: 'cm-md-em' }).range(node.from, node.to));
      } else if (node.name === 'InlineCode') {
        markDecos.push(Decoration.mark({ class: 'cm-md-inline-code' }).range(node.from, node.to));
      }
    },
  });

  const allDecos = [
    ...lineDecos.sort((a, b) => a.from - b.from),
    ...markDecos.sort((a, b) => a.from - b.from),
  ].sort((a, b) => a.from - b.from || (a.value.startSide ?? 0) - (b.value.startSide ?? 0));

  return Decoration.set(allDecos, true);
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) { this.decorations = buildDecorations(view); }
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// --- Toolbar commands ---

function wrapWithMark(view, mark) {
  const { state } = view;
  const sel = state.selection.main;
  if (sel.empty) {
    view.dispatch(state.update({
      changes: { from: sel.from, insert: mark + mark },
      selection: { anchor: sel.from + mark.length },
    }));
  } else {
    const text = state.doc.sliceString(sel.from, sel.to);
    if (text.startsWith(mark) && text.endsWith(mark) && text.length > mark.length * 2) {
      view.dispatch(state.update({
        changes: { from: sel.from, to: sel.to, insert: text.slice(mark.length, -mark.length) },
      }));
    } else {
      view.dispatch(state.update({
        changes: [{ from: sel.from, insert: mark }, { from: sel.to, insert: mark }],
        scrollIntoView: true,
      }));
    }
  }
  view.focus();
}

function toggleLinePrefix(view, prefix) {
  const { state } = view;
  const sel = state.selection.main;
  const fromLine = state.doc.lineAt(sel.from);
  const toLine = state.doc.lineAt(sel.to);
  const changes = [];
  for (let n = fromLine.number; n <= toLine.number; n++) {
    const line = state.doc.line(n);
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: '' });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  view.dispatch(state.update({ changes, scrollIntoView: true }));
  view.focus();
}

function checkActiveMarks(state) {
  const cursor = state.selection.main.head;
  const line = state.doc.lineAt(cursor);
  let isBold = false, isItalic = false, isCode = false;
  let node = syntaxTree(state).resolveInner(cursor, -1);
  while (node) {
    if (node.name === 'StrongEmphasis') isBold = true;
    else if (node.name === 'Emphasis') isItalic = true;
    else if (node.name === 'InlineCode') isCode = true;
    node = node.parent;
  }
  return {
    bold: isBold,
    italic: isItalic,
    heading: /^#{1,3}\s/.test(line.text),
    blockquote: /^>\s?/.test(line.text),
    code: isCode,
  };
}

const TOOLBAR = [
  { label: 'B', title: '加粗',   key: 'bold',       action: (v) => wrapWithMark(v, '**') },
  { label: 'I', title: '斜体',   key: 'italic',     action: (v) => wrapWithMark(v, '*') },
  { label: 'H', title: '标题',   key: 'heading',    action: (v) => toggleLinePrefix(v, '## ') },
  { label: '"', title: '引用',   key: 'blockquote', action: (v) => toggleLinePrefix(v, '> ') },
  { label: '<>', title: '行内代码', key: 'code',    action: (v) => wrapWithMark(v, '`') },
];

const CM_BASE_THEME = EditorView.theme({
  '&': { height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto' },
});

export default function MarkdownEditorInner({ value = '', onChange, placeholder, minHeight = 120, className = '' }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [activeMarks, setActiveMarks] = useState({ bold: false, italic: false, heading: false, blockquote: false, code: false });

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      history(),
      markdown(),
      livePreviewPlugin,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      CM_BASE_THEME,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current?.(update.state.doc.toString());
        }
        if (update.selectionSet || update.docChanged) {
          setActiveMarks(checkActiveMarks(update.state));
        }
      }),
    ];
    if (placeholder) extensions.push(cmPlaceholder(placeholder));

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    setActiveMarks(checkActiveMarks(view.state));

    return () => { view.destroy(); viewRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external value changes (e.g. loading new record)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return (
    <div
      className={['we-md-editor', className].filter(Boolean).join(' ')}
      style={{ minHeight: minHeight + 37 }}
    >
      <div className="we-md-toolbar">
        {TOOLBAR.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.title}
            className={activeMarks[t.key] ? 'active' : ''}
            onMouseDown={(e) => {
              e.preventDefault();
              if (viewRef.current) t.action(viewRef.current);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="we-md-content" ref={containerRef} />
    </div>
  );
}
