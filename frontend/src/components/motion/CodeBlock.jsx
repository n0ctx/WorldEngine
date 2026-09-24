/* 移植自 Rare UI code-block — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 只读代码块：整套语法配色由主题强调色的同一色相推出，亮色主题把明度阶梯倒过来；
 * 复制按钮按下后图标换成对勾并描出笔画。 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy } from 'lucide-react';
import { Highlight } from 'prism-react-renderer';
import { useMotion } from '../../core/hooks/useMotion.js';
import { readCssColor } from './readCssColor.js';

const TAP_SPRING = { type: 'spring', stiffness: 500, damping: 30 };
const SWAP_SPRING = { type: 'spring', duration: 0.3, bounce: 0 };
const CHECK_SPRING = { type: 'spring', duration: 0.4, bounce: 0.35 };
const REDUCED_SWAP = { duration: 0.15 };
const COPY_RESET_MS = 1800;

function rgbToHsl([r8, g8, b8]) {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

const hsl = (h, s, l) => `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`;

// 语法配色的明度与饱和度系数保留上游数值
function buildTheme([h, s, l], dark) {
  const tint = (lightness, sat = s) => hsl(h, sat, lightness);
  const ramp = (lightness) => (dark ? lightness : 100 - lightness);
  const accent = dark ? tint(Math.min(Math.max(l, 56), 70)) : tint(Math.min(Math.max(l, 38), 50));
  return {
    plain: { color: 'var(--we-color-text-primary)', backgroundColor: 'transparent' },
    styles: [
      { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: tint(ramp(42), s * 0.35), fontStyle: 'italic' } },
      { types: ['punctuation'], style: { color: tint(ramp(62), s * 0.3) } },
      { types: ['operator', 'combinator'], style: { color: tint(ramp(70), s * 0.4) } },
      { types: ['keyword', 'selector', 'atrule', 'important', 'tag'], style: { color: accent } },
      { types: ['string', 'char', 'inserted', 'url'], style: { color: tint(ramp(76)) } },
      { types: ['function'], style: { color: tint(ramp(88), s * 0.5) } },
      { types: ['attr-name'], style: { color: tint(ramp(78), s * 0.7), fontStyle: 'italic' } },
      { types: ['number', 'boolean', 'constant', 'symbol', 'deleted'], style: { color: tint(ramp(70)) } },
      { types: ['class-name', 'maybe-class-name', 'builtin'], style: { color: tint(ramp(93), s * 0.35) } },
      { types: ['property', 'variable', 'parameter'], style: { color: tint(ramp(97), s * 0.15) } },
      { types: ['regex'], style: { color: tint(ramp(72), s * 0.6) } },
    ],
  };
}

// 主题强调色与明暗在挂载时读一次：代码块只出现在展开的详情里，切换主题会让它重新挂载
function useAccentTheme(ref) {
  const [theme, setTheme] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dark = getComputedStyle(el).getPropertyValue('--we-color-scheme').trim() === 'dark';
    setTheme(buildTheme(rgbToHsl(readCssColor(el, 'var(--we-color-accent)')), dark));
  }, [ref]);
  return theme;
}

function CopyButton({ code }) {
  const { reduced } = useMotion();
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
  }, [code]);

  const swap = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.5, filter: 'blur(4px)' },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.5, filter: 'blur(4px)' },
      };

  return (
    <motion.button
      type="button"
      aria-label={copied ? '已复制' : '复制'}
      onClick={copy}
      whileTap={reduced ? undefined : { scale: 0.9 }}
      transition={TAP_SPRING}
      className={`we-code-block__copy${copied ? ' is-copied' : ''}`}
    >
      <AnimatePresence initial={false}>
        {copied ? (
          <motion.span key="check" className="we-code-block__copy-icon" {...swap} transition={reduced ? REDUCED_SWAP : CHECK_SPRING}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden>
              <motion.path
                d="M4 12.5l5 5L20 6.5"
                initial={reduced ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.2, ease: 'easeOut', delay: 0.05 }}
              />
            </svg>
          </motion.span>
        ) : (
          <motion.span key="copy" className="we-code-block__copy-icon" {...swap} transition={reduced ? REDUCED_SWAP : SWAP_SPRING}>
            <Copy size={14} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export default function CodeBlock({ code, language = 'json', filename }) {
  const ref = useRef(null);
  const theme = useAccentTheme(ref);
  const trimmed = useMemo(() => code.replace(/^\n+/, '').trimEnd(), [code]);

  return (
    <div ref={ref} className="we-code-block">
      <div className="we-code-block__header">
        <span className="we-code-block__name">{filename ?? language}</span>
        <CopyButton code={trimmed} />
      </div>
      <div className="we-code-block__viewport" role="region" aria-label={filename ?? `${language} 代码`} tabIndex={0}>
        {theme && (
          <Highlight code={trimmed} language={language} theme={theme}>
            {({ tokens, getLineProps, getTokenProps }) => {
              const gutterWidth = `${String(tokens.length).length}ch`;
              return (
                <pre className="we-code-block__pre">
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line, className: 'we-code-block__line' })}>
                      <span aria-hidden className="we-code-block__gutter" style={{ width: gutterWidth }}>{i + 1}</span>
                      <span>
                        {line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}
                      </span>
                    </div>
                  ))}
                </pre>
              );
            }}
          </Highlight>
        )}
      </div>
    </div>
  );
}
