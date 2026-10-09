# codex-3d

Three browser demos; active work is **Animation Studio** (LLM-driven movement library, action compiler and review viewer). Built by Codex (GPT-6.1 Sol) 3–5 Oct 2026; Claude took over on 6 Oct 2026.

## Read first

- `docs/CURRENT_STATE.md` — current architecture, data ownership, the service operations, limits.
- `docs/NEW_PLAN.md` — active plan (video → reusable 3D actions). Phases 1–5 delivered (`reconstruct_motion`, review sheets, bounded corrections and the `video-to-action` skill; see `docs/RECONSTRUCT_MOTION.md`). Proven on 20 upright clips of a tricking tutorial (`authoring/reviews/video/tricking-basics/`, 34 recorded runs). Phase 6 started 2026-10-09: `move-video-hook-kick` is registered and used in `guard-video-hook-kick-guard`; its status paragraph in `NEW_PLAN.md` lists what is not reviewed. See the Open section of `docs/RULE_LOG.md` for what is unfinished in reconstruction.
- `docs/SAM3D_PLAN.md` — agreed plan (2026-10-09) to make SAM 3D Body the main reconstruction path: detector, default with fallback, rotations; lists which ComfyUI parts to reuse.
- `docs/HANDOFF.md` — append-only session log (long, dense). Read the last few sections, not the whole file. Add a dated section after substantial work.
- `docs/RULE_LOG.md` — every reconstruction rule, why it exists and what it did to the other clips. After changing a rule, run `authoring/reconstruction/batch.py` and add an entry.
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
npm run start:authoring  # service on 127.0.0.1:5174 (set OPENROUTER_ENV_FILE or OPENROUTER_API_KEY to allow reconstruct_motion decisions:true)
python3 serve_demo.py --host 127.0.0.1 --port 5173   # public demo server
node --test tests/*.test.mjs   # 89 tests, ~17 s, uses temp state dirs
npm run test:vision && python3 tests/server.py && node tests/physics.mjs && node tests/fallback.mjs
npx tsc --noEmit -p editor/tsconfig.json
node authoring/cli.mjs tools   # operation schemas (service must be running)
```

`app.js` and `core.js` are generated bundles; edit the sources. New public files must be whitelisted in `serve_demo.py`.

## Conventions

- Use Node 26 (`/Users/tim/.nvm/versions/node/v26.7.0/bin`); the default shell may give Node 18, which fails on JSON import attributes.

- Source is written very densely (multi-thousand-character lines, few comments). Match it when making small edits; grep by symbol rather than reading whole files.
- Restart the service after editing `pipeline.mjs`, `retarget.ts` or `core.ts` (it loads them once); Python stages are picked up per run. A full 20-clip batch takes 10–15 minutes, so run it in the background.
- SAM 3D Body is the default 3D source (`source: auto`; plan and status in `docs/SAM3D_PLAN.md`): ComfyUI and weights live in untracked `.authoring/comfyui`; `authoring/reconstruction/body.py` runs there. The character is posed from the model's joint rotations by default (`pose: rotations`; `positions` is the earlier path). Eight live `sam3d-<slug>` actions are rotation builds (clips 1, 4, 16, 19, 34, 43, 51, 52); the other 51 are still position builds until rebuilt. `batch.py` builds all catalog clips into `sam3d-<slug>` actions; `--source rules` builds the rule pipeline into the plain slugs. `mini4.local` (key login as `tim`, `~/Yun/sam3d-runner`) runs the model about twice as fast.
- Confidence levels decide what may be rebuilt: read `list_reviews` first; levels 2–3 (acceptable, approved) are left alone, level 1 (has issues) is the work list with the user's timed notes. Record what the user reports with `set_review`. Rebuild a few targeted actions, not the whole catalog, unless asked.
- Never hand-edit `.authoring/project.json` or its sidecars; go through the service (MCP `animation-studio` or `authoring/cli.mjs`). Back up the index, blobs folder and sidecars together.
- Every write pins revisions (`expectedRevision`, `sourceRevision`); fetch current values instead of assuming them.
- "Supported" contact/seam reviews are bounded, configuration-specific visual and numeric checks, not physical validation. Do not claim more than the evidence in `authoring/reviews/` shows.
- Git tracks code, docs and review evidence (public repo `sses79/3d-action`); `.authoring/` live state is not tracked, so its only undo is the service's revision history.
