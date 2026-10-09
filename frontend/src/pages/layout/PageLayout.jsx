/**
 * Neutral page layout contract.
 *
 * A page declares its structure by passing named slot React nodes; the
 * active shell decides how to arrange them visually (parchment two-page,
 * single-pane modern, etc.). This API stays style-agnostic on purpose —
 * do not introduce shell-specific vocabulary (book, paper, parchment, …)
 * here.
 *
 * This is the preferred composition path for shell-structured pages
 * (today: ChatPage, WritingSpacePage). Pages MUST NOT import shell chrome
 * directly; if a new page needs shell framing, route it through these
 * slots so any shell can render it.
 *
 * Usage:
 *   <PageLayout
 *     header={<TitleBar />}
 *     left={<SessionList />}
 *     main={<ChatStream />}
 *     right={<StatePanel />}
 *     inspector={<DetailsPanel />}
 *     overlay={<Toast />}
 *     leftActions={<NewButton />}
 *     rightActions={<PanelTools />}
 *     leftLabel="会话列表"
 *     rightLabel="状态面板"
 *   />
 *
 * leftActions / rightActions are the side panes' own top-row actions; shells that
 * render left/right as collapsible rails put them in the same row as the rail toggle
 * and hide them while collapsed.
 *
 * leftLabel / rightLabel are plain accessibility strings, not shell vocabulary —
 * shells that render left/right as collapsible rails (e.g. book-spread) use them
 * to label the rail toggle button (aria-label/title). Shells that don't collapse
 * anything are free to ignore them.
 *
 * The default DOM rendering below is a neutral fallback used when no shell
 * provides a renderer (e.g. tests, future shells under construction).
 * Shells should always install their own renderer via
 * `PageLayoutRendererProvider` to integrate with chrome and transitions.
 */
import { createContext, useContext } from 'react';

const PageLayoutRendererContext = createContext(null);

export function PageLayoutRendererProvider({ render, children }) {
  return (
    <PageLayoutRendererContext.Provider value={render}>
      {children}
    </PageLayoutRendererContext.Provider>
  );
}

function DefaultRenderer({ header, left, leftActions, main, right, rightActions, inspector, overlay }) {
  return (
    <div className="we-page-layout we-page-layout--default">
      {header ? <div className="we-page-layout__header">{header}</div> : null}
      <div className="we-page-layout__body">
        {left ? <aside className="we-page-layout__left">{leftActions}{left}</aside> : null}
        <section className="we-page-layout__main">{main}</section>
        {right ? <aside className="we-page-layout__right">{rightActions}{right}</aside> : null}
        {inspector ? <aside className="we-page-layout__inspector">{inspector}</aside> : null}
      </div>
      {overlay ? <div className="we-page-layout__overlay">{overlay}</div> : null}
    </div>
  );
}

export default function PageLayout(slots) {
  const renderer = useContext(PageLayoutRendererContext);
  if (typeof renderer === 'function') return renderer(slots);
  return <DefaultRenderer {...slots} />;
}
