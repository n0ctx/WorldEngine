import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useMotion } from '../../core/hooks/useMotion.js';
import { STREAM } from '../../core/utils/motion.js';

// 代码块由 CodeBlock 用 String(children) 取文本，里面不能插元素
const SKIP_TAGS = new Set(['pre', 'code']);
const CHAR_TAG = 'we-char';
const CARET_TAG = 'we-caret';
const NO_CHUNKS = [];
const STAGGER_MS = STREAM.typing.stagger * 1000;
const LAG_MS = STREAM.typing.lag * 1000;
const CHAR_MS = STREAM.char.duration * 1000;
// 间隔短到这个程度就不再给每个字挂光标，否则几个字的光标会叠在一起
const CHAR_CARET_MIN_MS = 6;

/**
 * 书写光标：跟在最新文字后短促明暗；fading 时暗下去。
 * 还没有文字时单独放在正文位置，作为唯一的等待信号。
 */
export function StreamCaret({ fading = false }) {
  const m = useMotion();
  return <CaretMark vars={m.stream()} fading={fading} />;
}

function CaretMark({ vars, fading }) {
  return (
    <span
      className={`we-stream-caret${fading ? ' we-stream-caret--fading' : ''}`}
      style={vars ?? undefined}
      aria-hidden="true"
    />
  );
}

function isBlank(text) {
  return !/\S/.test(text);
}

// 给还没排期的到达段排进打字队列：接在上一段打完之后逐字出现；
// 到达快过打字时压缩间隔，保证打字进度最多落后真实到达 LAG_MS
// 顺带把早已显形完的段标成 done：它们只去掉动画、保留同一个元素，段落结构变化引起重新挂载时不会重打一遍
function schedule(track, now) {
  let typedUntil = track.typedUntil;
  const chunks = track.chunks.map((chunk) => {
    if (chunk.scheduled) {
      return !chunk.done && chunk.end + CHAR_MS < now ? { ...chunk, done: true } : chunk;
    }
    const start = Math.max(now, typedUntil);
    const step = Math.min(STAGGER_MS, Math.max(0, now + LAG_MS - start) / Math.max(1, chunk.length));
    typedUntil = start + chunk.length * step;
    return { ...chunk, wait: start - now, step, end: typedUntil, scheduled: true, done: false };
  });
  return { ...track, chunks, typedUntil, typing: true, caretBack: false };
}

// 文本节点按到达段切开，段内每个字包一层并带上它的出现时刻；
// 从节点末尾对齐源文本偏移：新文字总在末尾，转义等让节点值短于源码时尾部仍然对得上
function splitText(node, chunks, withCaret) {
  const end = node.position?.end?.offset;
  if (end == null) return [node];
  const { value } = node;
  const base = end - value.length;
  const firstLocal = Math.max(0, chunks[0].offset - base);
  if (firstLocal >= value.length) return [node];

  const pieces = [];
  if (firstLocal > 0) pieces.push({ type: 'text', value: value.slice(0, firstLocal) });
  let plain = '';
  let local = firstLocal;
  let k = 0;
  for (const ch of value.slice(firstLocal)) {
    const pos = base + local;
    while (k + 1 < chunks.length && chunks[k + 1].offset <= pos) k++;
    const { offset, wait, step, done } = chunks[k];
    if (isBlank(ch)) {
      plain += ch;
    } else {
      if (plain) { pieces.push({ type: 'text', value: plain }); plain = ''; }
      pieces.push({
        type: 'element',
        tagName: CHAR_TAG,
        properties: done ? { dataDone: 'true' } : {
          // 一律向下取整：相邻两个字的光标亮起区间不会重叠
          dataDelay: Math.floor(wait + (pos - offset) * step),
          dataStep: withCaret && step >= CHAR_CARET_MIN_MS ? Math.floor(step) : undefined,
        },
        children: [{ type: 'text', value: ch }],
      });
    }
    local += ch.length;
  }
  if (plain) pieces.push({ type: 'text', value: plain });
  return pieces;
}

function markChars(node, chunks, withCaret) {
  if (!node.children || (node.type === 'element' && SKIP_TAGS.has(node.tagName))) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text') return splitText(child, chunks, withCaret);
    markChars(child, chunks, withCaret);
    return [child];
  });
}

// 光标挂在最后一个字之后；最后是代码块时挂到正文末尾
function appendCaret(tree, caret) {
  let target = null;
  const walk = (node) => {
    if (!node.children || (node.type === 'element' && SKIP_TAGS.has(node.tagName))) return;
    node.children.forEach((child, index) => {
      if ((child.type === 'text' && !isBlank(child.value)) || child.tagName === CHAR_TAG) target = { parent: node, index };
      else walk(child);
    });
  };
  walk(tree);
  const parent = target?.parent ?? tree;
  const index = target ? target.index + 1 : parent.children.length;
  parent.children.splice(index, 0, caret);
}

function rehypeStreamMarks({ chunks, withCaret, caret }) {
  return (tree) => {
    if (chunks.length) markChars(tree, chunks, withCaret);
    if (caret) {
      appendCaret(tree, {
        type: 'element',
        tagName: CARET_TAG,
        properties: { dataFading: caret === 'fading' ? 'true' : undefined },
        children: [],
      });
    }
  };
}

// 还没排期的段先按"立刻整段出现"占位，布局阶段排期后在绘制前改成真实节奏
function pendingChunk(offset, length) {
  return { offset, length, wait: 0, step: 0, scheduled: false };
}

// 流式期间记录每次到达的文字段；文本不是在末尾增长（被改写、换了一条）就全部视为已出现
function advance(track, text, streaming, caret) {
  if (text === track.text && streaming === track.streaming && (!streaming || caret === track.caret)) return track;
  let chunks = streaming && !track.streaming ? [] : track.chunks;
  if (text !== track.text) {
    chunks = streaming && text.startsWith(track.text)
      ? [...chunks, pendingChunk(track.text.length, text.length - track.text.length)]
      : [];
  }
  return {
    ...track,
    text,
    streaming,
    chunks,
    typedUntil: chunks.length ? track.typedUntil : 0,
    // 只有生成时挂着光标，结束时才有光标可以暗下去
    caret: streaming ? caret : track.caret,
    fading: track.streaming && !streaming ? true : streaming ? false : track.fading,
  };
}

function initialTrack(text, streaming, caret) {
  return {
    text,
    streaming,
    caret,
    chunks: streaming && text ? [pendingChunk(0, text.length)] : [],
    typedUntil: 0,
    typing: false,
    caretBack: false,
    fading: false,
  };
}

/**
 * 流式正文：新到达的文字逐字打出，已出现的字保持静止；打字节奏贴着真实到达速度，最多落后 STREAM.typing.lag。
 * caret=true 时书写光标跟着正在出现的字走，打完停在最后一个字后面；生成结束先暗下去再移除。
 * 聊天与写作共用；reduced motion 下不逐字、光标静止、结束直接移除。
 */
export default function StreamingMarkdown({
  children: text,
  streaming = false,
  caret = false,
  remarkPlugins,
  rehypePlugins,
  components,
}) {
  const m = useMotion();
  const vars = m.stream();
  const [track, setTrack] = useState(() => initialTrack(text, streaming, caret));
  const next = advance(track, text, streaming, caret);
  if (next !== track) setTrack(next);

  // 读时钟只能在渲染之外：新段在绘制前排好打字节奏
  const hasPending = !!vars && next.chunks.some((chunk) => !chunk.scheduled);
  useLayoutEffect(() => {
    if (!hasPending) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 排期依赖时钟，只能在提交后、绘制前完成
    setTrack((t) => schedule(t, performance.now()));
  }, [hasPending, next.chunks]);

  // 打字进行中由逐字光标领路，打完再换回常驻光标；
  // 最后一个字也显形后，已打完的字还原成普通文字：段落结构变化时旧字不会重打，逐字包裹也不会越积越多
  const { typing, typedUntil } = next;
  useEffect(() => {
    if (!typing) return undefined;
    const left = Math.max(0, typedUntil - performance.now());
    const caught = (t) => t.typedUntil === typedUntil && t.chunks.every((chunk) => chunk.scheduled);
    const typed = setTimeout(() => setTrack((t) => (caught(t) ? { ...t, caretBack: true } : t)), left);
    const settled = setTimeout(
      () => setTrack((t) => (caught(t) && !t.fading ? { ...t, typing: false, chunks: [] } : t)),
      left + CHAR_MS,
    );
    return () => { clearTimeout(typed); clearTimeout(settled); };
  }, [typing, typedUntil]);

  // 生成结束：等剩下的字打完、光标暗完，再把逐字包裹去掉
  const fading = !!vars && next.fading;
  useEffect(() => {
    if (!fading) return undefined;
    const tail = Math.max(0, typedUntil - performance.now()) + (STREAM.char.duration + STREAM.caretOut.duration) * 1000;
    const timer = setTimeout(() => setTrack((t) => ({ ...t, fading: false, typing: false, chunks: [] })), tail);
    return () => clearTimeout(timer);
  }, [fading, typedUntil]);

  const writing = streaming || fading;
  const chunks = vars && writing ? next.chunks : NO_CHUNKS;
  const withCaret = streaming ? !!caret : fading && !!next.caret;
  let caretState = null;
  if (!(vars && typing) || next.caretBack) caretState = streaming ? (caret ? 'live' : null) : (fading && next.caret ? 'fading' : null);

  const plugins = useMemo(
    () => (chunks.length || caretState
      ? [...(rehypePlugins ?? []), [rehypeStreamMarks, { chunks, withCaret, caret: caretState }]]
      : rehypePlugins),
    [rehypePlugins, chunks, withCaret, caretState],
  );
  // 组件引用必须跨渲染稳定，否则每到一段文字整篇正文都会重新挂载
  const mdComponents = useMemo(() => ({
    ...components,
    [CHAR_TAG]: ({ children, 'data-delay': delay, 'data-step': step, 'data-done': done }) => (done ? <span>{children}</span> : (
      <span
        className={`we-stream-char${step ? ' we-stream-char--caret' : ''}`}
        style={{ ...vars, '--we-stream-char-delay': `${delay}ms`, '--we-stream-char-step': step ? `${step}ms` : undefined }}
      >
        {children}
      </span>
    )),
    [CARET_TAG]: (props) => <CaretMark vars={vars} fading={props['data-fading'] === 'true'} />,
  }), [components, vars]);

  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={plugins} components={mdComponents}>
      {text}
    </ReactMarkdown>
  );
}
