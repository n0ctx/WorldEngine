/**
 * Central shell selection.
 *
 * Adding a new shell:
 *   1. Drop the implementation under `frontend/src/shells/<id>/`
 *      with an `AppShell` default export.
 *   2. Register it in SHELLS below.
 *   3. Set DEFAULT_SHELL_ID or expose a switching UI (not yet wired).
 *
 * Keep this file small. Runtime shell switching is intentionally NOT
 * implemented yet — there is no second shell to switch to. When that
 * becomes a real need, swap the static export below for a config-driven
 * lookup; pages and routes will not need to change.
 */
import ClassicParchmentShell from '../../shells/classic-parchment/index.js';

export const DEFAULT_SHELL_ID = 'classic-parchment';

export const SHELLS = Object.freeze({
  'classic-parchment': ClassicParchmentShell,
});

export function selectShell(shellId = DEFAULT_SHELL_ID) {
  return SHELLS[shellId] ?? SHELLS[DEFAULT_SHELL_ID];
}
