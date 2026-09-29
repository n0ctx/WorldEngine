/* 信号故障文字：playKey 每换一次，文字就被干扰一次——左右两路错位色切片撕裂、
 * 字重抽搐、一道扫描带扫过，然后定格。decode 时先显示数字雨乱码（半角片假名 / 数字），再从左到右锁定成真字。
 * 真实文字始终留在 DOM 里（解码期间只是透明），读屏读到的永远是最终值、版面也不跳。 */
import { useEffect, useState } from 'react';
import { useMotion } from '../../core/hooks/useMotion.js';
import { GLITCH } from '../../core/utils/motion.js';

// 数字雨字形：按原字宽度取，全角字配全角片假名、半角字配半角片假名 / 数字，解码前后版面同宽
const WIDE_GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
const NARROW_GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';
const WIDE_CHAR = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
const GLYPH_TICK_MS = 50;

function glyphFor(ch, i, tick) {
  const pool = WIDE_CHAR.test(ch) ? WIDE_GLYPHS : NARROW_GLYPHS;
  return pool[(i * 5 + tick) % pool.length];
}

function scramble(chars, locked, tick) {
  return chars
    .map((ch, i) => (i < locked || /\s/.test(ch) ? ch : glyphFor(ch, i, tick)))
    .join('');
}

// 返回当前这一帧的乱码串；解码结束或不在解码时返回 null
function useDecode(text, runKey) {
  const [frame, setFrame] = useState({ runKey: null, text: null, locked: 0, tick: 0 });

  useEffect(() => {
    if (runKey == null) return undefined;
    const total = Array.from(text).length;
    const stepMs = Math.min(GLITCH.decodeStep, GLITCH.decodeMax / Math.max(total, 1)) * 1000;
    const start = performance.now();
    let raf = 0;
    const step = (now) => {
      const elapsed = now - start;
      const locked = Math.min(total, Math.floor(elapsed / stepMs));
      setFrame({ runKey, text, locked, tick: Math.floor(elapsed / GLYPH_TICK_MS) });
      if (locked < total) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, runKey]);

  if (runKey == null) return null;
  const chars = Array.from(text);
  const current = frame.runKey === runKey && frame.text === text;
  const locked = current ? frame.locked : 0;
  return locked >= chars.length ? null : scramble(chars, locked, current ? frame.tick : 0);
}

export default function GlitchText({ text, playKey = null, decode = false }) {
  const vars = useMotion().glitch();
  const active = vars != null && playKey != null;
  const scrambled = useDecode(text, active && decode ? playKey : null);

  if (!active) return text;

  return (
    <span key={playKey} className="we-glitch" data-text={scrambled ?? text} style={vars}>
      <span className={scrambled ? 'we-glitch__text we-glitch__text--masked' : 'we-glitch__text'}>{text}</span>
      {scrambled ? <span className="we-glitch__decode" aria-hidden="true">{scrambled}</span> : null}
    </span>
  );
}
