# codex-3d

Three browser demos; active work is **Animation Studio** (LLM-driven movement library, action compiler and review viewer). Built by Codex (GPT-6.1 Sol) 3–5 Oct 2026; Claude took over on 6 Oct 2026.

## Read first

- `docs/CURRENT_STATE.md` — current architecture, data ownership, the 37 service operations, limits.
- `docs/NEW_PLAN.md` — active plan (video → reusable 3D actions). Phases 1–3 delivered for one pilot clip; Phase 4 (reusable `reconstruct` CLI/MCP operation with stage caching) is next.
- `docs/HANDOFF.md` — append-only session log (long, dense). Read the last few sections, not the whole file. Add a dated section after substantial work.
- Other `docs/` plans and studies are historical unless `CURRENT_STATE.md` points at them.

## Layout

- `runtime/` shared deterministic player, action schema, movement compiler, diagnostics (TS)
- `authoring/` local service (`server.mjs`, port 5174), `core.ts` operations, MCP adapter, CLI, contracts, schemas, vision and reconstruction scripts, review evidence
- `editor/` Studio UI (React + Three.js WebGPU/WebGL2); `watch/` Watch Lab; `index.html` Citrus Jelly
- `skills/` authoring workflows (also exposed to Claude via `.claude/skills`)
- `.authoring/` live state: `project.json` (small index) with `project.json.blobs/` (content-addressed action bodies, via `authoring/project-store.mjs`) plus `.preview/.contracts/.runs` sidecars, model caches, Python venv
- `jump/` is unused draft code

## Commands

```sh
npm run build            # watch/app.js
npm run build:editor     # editor/app.js
npm run build:authoring  # authoring/core.js (required after editing core.ts or runtime/)
npm run start:authoring  # service on 127.0.0.1:5174
python3 serve_demo.py --host 127.0.0.1 --port 5173   # public demo server
node --test tests/*.test.mjs   # 81 tests, ~17 s, uses temp state dirs
npm run test:vision && python3 tests/server.py && node tests/physics.mjs && node tests/fallback.mjs
npx tsc --noEmit -p editor/tsconfig.json
node authoring/cli.mjs tools   # operation schemas (service must be running)
```

`app.js` and `core.js` are generated bundles; edit the sources. New public files must be whitelisted in `serve_demo.py`.

## Conventions

- Source is written very densely (multi-thousand-character lines, few comments). Match it when making small edits; grep by symbol rather than reading whole files.
- Never hand-edit `.authoring/project.json` or its sidecars; go through the service (MCP `animation-studio` or `authoring/cli.mjs`). Back up the index, blobs folder and sidecars together.
- Every write pins revisions (`expectedRevision`, `sourceRevision`); fetch current values instead of assuming them.
- "Supported" contact/seam reviews are bounded, configuration-specific visual and numeric checks, not physical validation. Do not claim more than the evidence in `authoring/reviews/` shows.
- Not a git repository; there is no undo beyond the service's own revision history.
