# 3D demos and Animation Studio

This repository contains three working demos: **Citrus Jelly**, **Watch Lab**, and **Animation Studio**. The current development focus is Animation Studio: an LLM-driven movement library, action compiler and review viewer built with React, TypeScript and Three.js. MCP and CLI share one local authoring service.

Current library coverage: **61 classified movements**, **102 reviewed candidate foot-contact intervals**, and **27 curated joins** (26 supported exact configurations, one needs review). Coverage does not certify physical balance or every possible movement combination.

Start with [Current features, architecture and data workflow](docs/CURRENT_STATE.md).

## Run locally

From the repository root, install dependencies and build:

```sh
npm ci
npm run build
npm run build:editor
npm run build:authoring
```

Start the authoring service in a terminal:

```sh
npm run start:authoring
```

Open **[Animation Studio](http://127.0.0.1:5174/editor/)**. The service binds to loopback; the LLM runs in the calling conversation, without an embedded provider chat or API key dependency.

For the three demos on port 5173, run this in another terminal:

```sh
python3 serve_demo.py --host 127.0.0.1 --port 5173
```

- [Citrus Jelly](http://127.0.0.1:5173/): native WebGPU/WGSL soft-body material study.
- [Watch Lab](http://127.0.0.1:5173/watch/): Blender-prepared CC0 model, live clock and interactive buttons.
- [Animation Studio](http://127.0.0.1:5173/editor/): connects to the local authoring service on port 5174.

WebGPU requires localhost or HTTPS. Watch Lab and Studio have WebGL2 fallback. LAN demo serving exposes explicit public files; authoring remains local. The certificate/IP notes in the original demo guide are historical session details, not permanent working URLs.

## Code layout

| Path | Responsibility |
| --- | --- |
| `index.html`, `serve_demo.py` | Citrus demo and public demo server |
| `watch/` | Watch runtime, source preparation and browser assets |
| `editor/` | Animation Studio UI and supported character assets |
| `runtime/` | Shared deterministic player, schemas, movement compiler and diagnostics |
| `authoring/` | Local service, MCP, CLI, contracts, schemas, capture and review evidence |
| `skills/` | Executable skill entry points for authoring, movement building and composition |
| `.authoring/` | Local project, preview, review and run-log storage |
| `tests/` | Automated checks |
| `docs/` | Project documentation, studies and historical plans |

`jump/` is an unused preliminary draft. The implemented studio is `editor/`.

## Docs index

### Current overview and setup

- [Current codebase and data workflow](docs/CURRENT_STATE.md)
- [Animation Studio authoring bridge](docs/authoring/README.md)
- [Citrus Jelly](docs/CITRUS_JELLY.md)
- [SECOND / Watch Lab](docs/watch/README.md)
- [SECOND demo: 3D model, Blender, and Three.js](docs/watch/IMPLEMENTATION_SUMMARY.md)

### Movements, composition and evidence

- [Movement library and action composition](docs/MOVEMENT_LIBRARY.md)
- [UAL2 in Animation Studio](docs/UAL2_LIBRARY.md)
- [Movement connection profiles](docs/MOVEMENT_PROFILES.md)
- [Semantic movement contracts — first implementation](docs/MOVEMENT_CONTRACTS.md)
- [Movement library contract review](docs/LIBRARY_CONTRACT_REVIEW.md)
- [Contact reviews and seam policies](docs/CONTRACT_REVIEWS.md)
- [Velocity-aware movement connections](docs/VELOCITY_CONNECTIONS.md)
- [Deterministic motion inspection](docs/MOTION_QUALITY.md)
- [Find common motion between two movements](docs/COMMON_MOTION.md)
- [One-call action timing revisions](docs/RECIPE_REVISIONS.md)
- [Animation Studio CLI](docs/CLI_AUTHORING.md)
- [Prompt-to-action tracking](docs/ACTION_RUN_LOGS.md)

### Studies and recorded experiments

- [Human video to action: investigation and golden example specification](docs/VIDEO_TO_ACTION.md)
- [Reference-video pilot: lateral snap kick](docs/VIDEO_KICK_REFERENCE.md)
- [Fast video-to-motion reconstruction plan](docs/VIDEO_MOTION_RECONSTRUCTION.md)
- [`reconstruct_motion`: video window to draft action](docs/RECONSTRUCT_MOTION.md)

- [Regular Sword contract pilot](docs/SWORD_PILOT.md)
- [Locomotion contracts: Slide](docs/SLIDE_CONTRACTS.md)
- [Authored kick study](docs/KICK_STUDY.md)
- [Step → Right Punch study](docs/STEP_PUNCH_STUDY.md)
- [Rendered-action pose check](docs/VISION_POSE_EXPERIMENT.md)
- [CLI versus MCP for Animation Studio](docs/CLI_VS_MCP.md)
- [Animation authoring review and next design](docs/ANIMATION_AUTHORING_REVIEW.md)
- [Animation Studio · first milestone](docs/editor/README.md)

### Plans and handoff

- [New phased plan: video to reusable 3D actions](docs/NEW_PLAN.md)

- [3D project handoff](docs/HANDOFF.md)
- [Next project proposal: Harbor Run](docs/NEXT_PROJECT_PLAN.md)
- [Third project: Animation Studio](docs/ANIMATION_EDITOR_PLAN.md)
- [Shared game platform and animation editor requirements](docs/GAME_PLATFORM_REQUIREMENTS.md)
- [LLM action authoring with a browser preview](docs/LLM_ACTION_AUTHORING_PLAN.md)
- [UAL2 combos and a standard movement contract](docs/MOVEMENT_CONTRACT_ANALYSIS.md)

### Action examples and asset attribution

- [Block → Counter → Recover](docs/authoring/actions/BLOCK_COUNTER.md)
- [Escape Slide → Stand](docs/authoring/actions/ESCAPE_SLIDE.md)
- [Knockback recovery](docs/authoring/actions/KNOCKBACK_RECOVERY.md)
- [Pouch → Coil → Launch: technical animation breakdown](docs/authoring/actions/POUCH_COIL_LAUNCH.md)
- [Step → Punch → High Kick](docs/authoring/actions/STEP_PUNCH_HIGH_KICK.md)
- [editor/source/kick/MESH2MOTION_CC0.md](docs/editor/source/kick/MESH2MOTION_CC0.md)

Plans and studies retain their historical observations; they are not the current feature inventory. `docs/document-locations.json` records the old-to-new document locations. Skill `SKILL.md` files remain under `skills/` because they are operational entry points rather than project documentation. Source license text files remain with their assets.

## Verification

Commands run from the repository root:

```sh
node tests/physics.mjs
node tests/fallback.mjs
npm test
npm run test:editor
node --test tests/connection.test.mjs tests/authoring.test.mjs tests/contracts.test.mjs tests/contract-reviews.test.mjs tests/cli.test.mjs tests/motion-quality.test.mjs
npm run test:vision
python3 tests/server.py
```

The latest motion-connection work passed 44 Node regression tests and the authoring/editor builds. Detailed evidence and remaining limitations are in [Velocity connections](docs/VELOCITY_CONNECTIONS.md); that result is separate from the documentation reorganization.

- [Side-kick 3D reconstruction benchmark](docs/VIDEO_RECONSTRUCTION_BENCHMARK.md) — measured stages, failed extension, evidence and reproduction.

- [Video/motion bundle v1](docs/VIDEO_MOTION_BUNDLE.md) — validated reference/estimate snapshots, time anchors and CLI inspection.
