import { useRef } from 'react';
import { useSeamlessEditLayout } from './seamless-edit.js';

export default function SeamlessEditableSurface({
  editing = false,
  className = '',
  surfaceClassName = '',
  readClassName = '',
  overlayClassName = '',
  trackValue,
  selectEnd = false,
  renderRead,
  renderEditor,
}) {
  const anchorRef = useRef(null);
  const editorRef = useRef(null);
  const { surfaceStyle, syncLayout } = useSeamlessEditLayout({
    active: editing,
    anchorRef,
    editorRef,
    trackValue,
    selectEnd,
  });

  return (
    <div className={['we-seamless-edit', className].filter(Boolean).join(' ')}>
      <div
        className={[
          'we-seamless-edit__surface',
          editing ? 'we-seamless-edit__surface--editing' : '',
          surfaceClassName,
        ].filter(Boolean).join(' ')}
        style={surfaceStyle}
      >
        <div
          ref={anchorRef}
          className={[
            readClassName,
            editing ? 'we-seamless-edit__anchor' : '',
          ].filter(Boolean).join(' ')}
          aria-hidden={editing || undefined}
        >
          {renderRead()}
        </div>
        {editing && (
          <div className={['we-seamless-edit__overlay', overlayClassName].filter(Boolean).join(' ')}>
            {renderEditor({ editorRef, measureRef: editorRef, syncLayout })}
          </div>
        )}
      </div>
    </div>
  );
}
