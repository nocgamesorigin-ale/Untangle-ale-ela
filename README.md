# Untangle Ale Ela

An HTML5 rubber-band untangle puzzle (20 levels, boosters, hard / super-hard levels).

- **Play on the web:** https://nocgamesorigin-ale.github.io/Untangle-ale-ela/
  On iPhone: Safari → Share → *Add to Home Screen* — it then opens full screen as its own app.
- **Android APK:** [Releases → latest](https://github.com/nocgamesorigin-ale/Untangle-ale-ela/releases/tag/latest) (`untangle-ale-ela.apk`)

Every push to `main` runs `.github/workflows/build.yml`: it builds the single-file web game,
deploys it to GitHub Pages, wraps the same file in the Android WebView app in `android/`,
and attaches the APK to the `latest` release.

| Command | What it does |
|---|---|
| `npm install` | install the tool chain (Vite + TypeScript) |
| `npm run dev` | dev server with hot reload (the GameKit preview runs this for you) |
| `npm run build` | type-check, then build **one self-contained `dist/index.html`** |
| `npm run typecheck` | type-check only |

## Layout

```
index.html        page shell (dark background, full-screen canvas)
src/main.ts       boot: canvas + DPR, game loop, input, `ready` event
src/game.ts       gameplay: state machine, update(dt), draw(ctx)
src/input.ts      pointer taps in canvas pixels (touch, mouse, pen)
src/gamekit.ts    emit(name, data): events shown live in the GameKit preview
src/style.css     reset
vite.config.ts    single-file build (vite-plugin-singlefile)
CLAUDE.md         instructions for Claude Code
AGENTS.md         instructions for Codex
.claude/skills/   skills the AI assistant can run on this project
```

## Tips

- Add `?debug=1` to the preview URL for an fps / state overlay.
- Keep everything playable with one finger; the preview's device presets show you the real safe area.

---

# Untangle Ale Ela (Tiếng Việt)

Game HTML5 tạo bằng GameKit. Một thư mục = một game.

- `npm install` cài Vite + TypeScript.
- `npm run dev` chạy dev server có hot reload (khung xem trước của GameKit tự chạy lệnh này).
- `npm run build` kiểm tra kiểu rồi build ra **một file duy nhất `dist/index.html`**.
- Sửa gameplay trong `src/game.ts`; gọi `emit('levelStart', {...})` ở những mốc quan trọng để thấy trong ngăn **Sự kiện** của khung xem trước.
