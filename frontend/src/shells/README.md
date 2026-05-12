# Frontend Shells

This directory hosts **shell implementations**: the global frame, app chrome, and
structural presentation around the routed page content. A shell owns *how* the
app looks structurally; pages own *what* is shown; themes own *which tokens*
paint it.

## Layering

```
core   (frontend/src/core, pages, components/ui, components/{domain})
   ↓ composes routes & page content
shell  (frontend/src/shells/<shell-id>)
   ↓ wraps app with global frame (top bar, transitions, panels)
theme  (themes/, data/themes/)
   ↓ overrides --we-* tokens only
```

**Direction is strict:**

- `core` MUST NOT import from `shells/`.
- `shells/<id>` MAY import from `core` and shared `components/`.
- `themes/` MUST NOT contain layout, structure, or component CSS — only
  `--we-*` token overrides (see `themes/README.md`).

The selected shell is chosen centrally in
`frontend/src/core/app/selectShell.js`. Adding a new shell means dropping a new
folder here and registering it there — no changes to pages, routes, or theme
loading.

## Responsibilities of a shell

A shell owns:

- **App chrome** — top bar, global toast region, persistent panels.
- **Page frame** — the visual container that wraps every route.
- **Transitions** — route-to-route motion treatment.
- **Decorative layout** — shell-specific wrappers, ornaments, textures.
- **Slot rendering** — how `core/layout/PageLayout` slots (`HeaderSlot`,
  `MainContentSlot`, `LeftSidebarSlot`, `RightSidebarSlot`, `InspectorSlot`,
  `OverlayLayer`) are visually arranged. Pages declare slots neutrally; the
  shell decides whether they become a parchment two-page spread, a single-panel
  modern layout, etc.

A shell MUST NOT own:

- Routing, app state, or business logic.
- Domain components (chat, world, character, writing, settings, assistant).
- Token values (those belong in themes).
- Page content or data fetching.

## Current shells

- **`classic-parchment/`** — the default shell. Implements the book/parchment
  experience: serif chrome, top bar, page transitions, and the
  `PageLayout` renderer that arranges page slots into the parchment two-page
  spread. Shell-internal chrome (BookSpread, PageLeft, PageRight, Bookmark,
  ParchmentTexture, PageFooter, FleuronLine, MemoryRecallOverlay, TopBar,
  PageTransition) lives under
  `shells/classic-parchment/{layout,components,transitions}/` and MUST NOT
  be imported by pages or by neutral `components/` modules. Pages declare
  layout via `core/layout/PageLayout` slots and let the shell render them.

- **`template/`** — scaffold for creating a new shell. Copy it, rename, and
  register it in `core/app/selectShell.js`. See `template/README.md`.

## Conventions

- Shell id matches its folder name (e.g. `classic-parchment`).
- Each shell exports an `AppShell` component as its root frame and an `index.js`
  barrel.
- Shells receive routed children; they do not own the `<Routes>` element.
- Shells must keep `tokens.css` as the source of truth for visual values; no
  hardcoded hex/spacing/shadows.
- A shell may ship its own CSS file for chrome layout (kept structurally
  neutral wrt token values).

## Relationship to themes

A shell describes **structure**; a theme describes **values**.  A user can
swap themes freely without touching the active shell. Shells should *not*
encode visual values inline — they must reference `--we-*` tokens so theme
swaps keep working.
