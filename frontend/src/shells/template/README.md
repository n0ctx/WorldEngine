# Shell template

Scaffold for a new shell implementation. Copy this folder, rename it, and
register the new shell in `frontend/src/core/router/selectShell.js`.

## Steps

1. Copy the folder:

   ```bash
   cp -R frontend/src/shells/template frontend/src/shells/my-shell
   ```

2. Implement `AppShell.jsx`. It receives `children` (the routed page tree) and
   the current `locationKey` (used for route-change transitions). It MUST:

   - Render any global chrome (top bar, side rail, ambient overlays).
   - Wrap `children` in its transition container.
   - Reference visual values through `--we-*` tokens only.
   - NOT import routing/state/business modules from `core/router/`.

3. Optionally add subfolders:

   ```
   shells/my-shell/
     AppShell.jsx
     index.js
     components/        # shell-owned chrome/panels
     layout/            # shell-owned slot renderers
     transitions/       # shell-owned motion treatments
     shell.css          # optional structural styles (no token values)
   ```

4. Register the shell:

   ```js
   // frontend/src/core/router/selectShell.js
   import BookSpreadShell from '../../shells/book-spread';
   import MyShell from '../../shells/my-shell';

   export const SHELLS = {
     'book-spread': BookSpreadShell,
     'my-shell': MyShell,
   };
   ```

5. Verify routes still render and the theme system still applies.

## Boundaries

- A shell MUST NOT import from `frontend/src/core/router/`.
- A shell MAY import from `frontend/src/components/ui` and shared utilities.
- A shell SHOULD render slots from `frontend/src/pages/layout/PageLayout`
  (`HeaderSlot`, `MainContentSlot`, etc.) when a page describes layout
  neutrally. Pages MUST NOT know which shell will render their slots.
