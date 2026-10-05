import { useCallback, useLayoutEffect, useState } from 'react';

function autoSizeTextarea(element) {
  if (!element || element.tagName !== 'TEXTAREA') return 0;
  element.style.height = '0px';
  const nextHeight = element.scrollHeight;
  element.style.height = `${nextHeight}px`;
  return nextHeight;
}

// 量出的尺寸要回写成 CSS 宽高，只能取布局尺寸：getBoundingClientRect 含祖先 transform 缩放与 zoom，
// 回写后 ResizeObserver 再量一次就再乘一次，编辑框会逐帧变宽或变窄
function layoutSize(element) {
  const style = getComputedStyle(element);
  return {
    width: Math.ceil(parseFloat(style.width) || 0),
    height: Math.ceil(parseFloat(style.height) || 0),
  };
}

function measureEditorHeight(element) {
  if (!element) return 0;
  if (element.tagName === 'TEXTAREA') {
    return autoSizeTextarea(element) || Math.ceil(element.scrollHeight || layoutSize(element).height);
  }
  return Math.max(layoutSize(element).height, Math.ceil(element.scrollHeight || 0));
}

export function useSeamlessEditLayout({
  active,
  anchorRef,
  editorRef,
  trackValue,
  selectEnd = false,
}) {
  const [surfaceStyle, setSurfaceStyle] = useState(undefined);

  const syncLayout = useCallback(() => {
    const anchor = anchorRef.current;
    const editor = editorRef.current;
    const nextStyle = {};
    const anchorSize = anchor ? layoutSize(anchor) : { width: 0, height: 0 };

    if (anchorSize.width > 0) nextStyle.width = `${anchorSize.width}px`;
    if (anchorSize.height > 0) nextStyle.minHeight = `${anchorSize.height}px`;

    if (editor) {
      const editorHeight = measureEditorHeight(editor);
      const nextHeight = Math.max(anchorSize.height, editorHeight);
      if (nextHeight > 0) nextStyle.minHeight = `${nextHeight}px`;
    }

    const normalizedStyle = Object.keys(nextStyle).length > 0 ? nextStyle : undefined;
    setSurfaceStyle((prevStyle) => {
      const prevKeys = prevStyle ? Object.keys(prevStyle) : [];
      const nextKeys = normalizedStyle ? Object.keys(normalizedStyle) : [];
      if (prevKeys.length === nextKeys.length && prevKeys.every((key) => prevStyle[key] === normalizedStyle[key])) {
        return prevStyle;
      }
      return normalizedStyle;
    });
  }, [anchorRef, editorRef]);

  useLayoutEffect(() => {
    if (!active) {
      setSurfaceStyle(undefined);
      return undefined;
    }

    syncLayout();
    const editor = editorRef.current;
    if (editor) {
      editor.focus();
      if (selectEnd && typeof editor.setSelectionRange === 'function') {
        const len = editor.value?.length ?? 0;
        editor.setSelectionRange(len, len);
      }
    }

    const ResizeObserverCtor = globalThis.ResizeObserver;
    const resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(() => syncLayout()) : null;
    if (resizeObserver && anchorRef.current) resizeObserver.observe(anchorRef.current);
    if (resizeObserver && editorRef.current) resizeObserver.observe(editorRef.current);
    window.addEventListener('resize', syncLayout);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', syncLayout);
    };
  }, [active, anchorRef, editorRef, selectEnd, syncLayout]);

  useLayoutEffect(() => {
    if (active) syncLayout();
  }, [active, trackValue, syncLayout]);

  return { surfaceStyle, syncLayout };
}
