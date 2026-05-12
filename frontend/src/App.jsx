/**
 * App entry composition: pick a shell, mount routes inside it.
 *
 * Anything visual (top bar, transitions, panels, decoration) is owned by
 * the shell at `frontend/src/shells/<id>/AppShell.jsx`. Anything routing /
 * lifecycle / data lives in `core/app/AppRoot.jsx`. This file only wires
 * them together.
 */
import { useLocation } from 'react-router-dom';
import { selectShell } from './core/app/selectShell.js';
import AppRoot from './core/app/AppRoot.jsx';

const AppShell = selectShell();

export default function App() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  const locationKey = (backgroundLocation || location).pathname;
  return (
    <AppShell locationKey={locationKey}>
      <AppRoot />
    </AppShell>
  );
}
