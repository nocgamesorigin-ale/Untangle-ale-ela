# Untangle Ale Ela — project notes for the AI assistant

This is an HTML5 game: Vite + TypeScript + Canvas 2D, no engine. `npm run build`
must keep producing ONE self-contained `dist/index.html`.

## Commands
- `npm run typecheck` — run after every change; the build fails on type errors.
- `npm run build` — single-file output in `dist/index.html`.
- The GameKit preview (VS Code) runs `npm run dev` itself; do not start a second server.

## Where things are
- `src/game.ts` — gameplay. A `Game` class with `startLevel()`, `update(dt, taps)`, `draw(ctx)` and the
  phases `title | playing | won | lost`. Put new rules here.
- `src/main.ts` — boot, canvas sizing (device pixel ratio), the fixed-step loop. Rarely needs changes.
- `src/input.ts` — pointer taps in CSS pixels. Extend here for drag/swipe.
- `src/gamekit.ts` — `emit(name, data)`. Call it at `levelStart`, `win`, `lose` and any new milestone;
  the preview shows these events live and they mark where analytics hooks go later.
- Levels: `main.ts` calls `registerLevels({ count, current, goTo, canvas })` so the GameKit preview lists every
  level (dropdown + thumbnail panel). Keep it working: `goTo(n)` must start level n directly (no menu in between),
  every level must look the same each time it opens (seeded layout), and `LEVEL_COUNT` in `game.ts` must match
  the levels that exist. `startLevel()` calls `levelChanged()`; any other way of changing level must too.

## Rules
- Mobile first: portrait, one finger, no hover-only interactions, respect `--sat` (top safe area).
- Keep 60 fps on a mid-range phone: no per-frame allocations in hot loops, no DOM in the game loop.
- Do not change `vite.config.ts` or the `package.json` scripts unless asked.
- No new dependencies without saying why; the output must stay a single file.
- After a change: `npm run typecheck`, then tell the user what to try in the preview.
