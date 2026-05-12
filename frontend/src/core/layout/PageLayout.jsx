/**
 * Neutral page layout contract.
 *
 * A page declares its structure by passing named slot React nodes. The
 * active shell decides how to arrange them visually (parchment two-page,
 * single-pane modern, etc.). This API stays style-agnostic on purpose —
 * do not introduce shell-specific vocabulary (book, paper, parchment, …)
 * here.
 *
 * Pages may also opt out by rendering their own composition; this primitive
 * is offered for new pages and migration, not enforced.
 *
 * Usage:
 *   <PageLayout
 *     header={<TitleBar />}
 *     left={<SessionList />}
 *     main={<ChatStream />}
 *     right={<StatePanel />}
 *     inspector={<DetailsPanel />}
 *     overlay={<Toast />}
 *   />
 *
 * The default DOM rendering below is a sensible fallback when the active
 * shell does not provide its own slot renderer. Shells SHOULD provide
 * their own renderer to integrate with chrome and transitions.
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

function DefaultRenderer({ header, left, main, right, inspector, overlay }) {
  return (
    <div className="we-page-layout we-page-layout--default">
      {header ? <div className="we-page-layout__header">{header}</div> : null}
      <div className="we-page-layout__body">
        {left ? <aside className="we-page-layout__left">{left}</aside> : null}
        <section className="we-page-layout__main">{main}</section>
        {right ? <aside className="we-page-layout__right">{right}</aside> : null}
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

export const HeaderSlot = ({ children }) => children;
export const MainContentSlot = ({ children }) => children;
export const LeftSidebarSlot = ({ children }) => children;
export const RightSidebarSlot = ({ children }) => children;
export const InspectorSlot = ({ children }) => children;
export const OverlayLayer = ({ children }) => children;
export const TransitionContainer = ({ children }) => children;
