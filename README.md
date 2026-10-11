# Rogue Skeet

A portrait, one-thumb skeet-shooting roguelite for mobile web (TypeScript, Vite, PixiJS v8).
Prototype plan: [docs/implementation-plan.md](docs/implementation-plan.md). Design: [docs/design-prototype.md](docs/design-prototype.md).

## Develop

```sh
npm ci
npm run dev          # http://localhost:5173/ (use --host, open on a phone on the same network)
npm test             # Vitest unit tests
npm run e2e          # Playwright smoke test (builds, previews, Pixel 7 touch viewport)
npm run lint && npm run typecheck
npm run build        # production build with base /rogue-skeet/ (GitHub Pages)
npm run preview      # serve the build at http://localhost:4173/rogue-skeet/
```

Playwright uses the Chromium under `PLAYWRIGHT_BROWSERS_PATH` when present (see `playwright.config.ts`); otherwise run `npx playwright install chromium`.

## Dev panel

Add `?dev` to the URL (e.g. `http://localhost:5173/?dev`) to load the Tweakpane tuning panel with JSON export. It is lazy-loaded and not part of the normal bundle path. `?scene=playfield` opens the greybox layout directly.

## Layout

`src/core` (loop, rng, vec2, events), `src/render` (stage, layout, greybox, debug overlay), `src/feel` (tuning + dev panel), `src/scenes` (router, menu, playfield), `tests/`, `e2e/`, `tools/`.
