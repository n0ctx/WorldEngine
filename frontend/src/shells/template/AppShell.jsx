/**
 * Template shell. Replace this body when authoring a real shell.
 * Contract:
 *   - Receives `children` = the routed page tree.
 *   - Receives `locationKey` for route-change transitions.
 *   - Owns global chrome and visual frame. References only --we-* tokens.
 */
export default function AppShell({ children /*, locationKey */ }) {
  return <div className="we-shell-template-root">{children}</div>;
}
