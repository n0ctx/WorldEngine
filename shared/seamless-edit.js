import { useCallback, useLayoutEffect, useState } from 'react';

export function autoSizeTextarea(element) {
  if (!element || element.tagName !== 'TEXTAREA') return 0;
  element.style.height = '0px';
  const nextHeight = element.scrollHeight;
  element.style.height = `${nextHeight}px`;
  return nextHeight;
}

function measureEditorHeight(element) {
  if (!element) return 0;
  if (element.tagName === 'TEXTAREA') {
    return autoSizeTextarea(element) || Math.ceil(element.scrollHeight || element.getBoundingClientRect().height);
  }
  const rectHeight = Math.ceil(element.getBoundingClientRect().height || 0);
  const scrollHeight = Math.ceil(element.scrollHeight || 0);
  return Math.max(rectHeight, scrollHeight);
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

    if (anchor) {
      const width = Math.ceil(anchor.getBoundingClientRect().width);
      const height = Math.ceil(anchor.getBoundingClientRect().height);
      if (width > 0) nextStyle.width = `${width}px`;
      if (height > 0) nextStyle.minHeight = `${height}px`;
    }

    if (editor) {
      const editorHeight = measureEditorHeight(editor);
      const anchorHeight = anchor ? Math.ceil(anchor.getBoundingClientRect().height) : 0;
      const nextHeight = Math.max(anchorHeight, editorHeight);
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
