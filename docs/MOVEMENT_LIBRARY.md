# Movement library and action composition

Open http://127.0.0.1:5173/editor/.

**Movements** in the left sidebar are reusable source motions. **Actions** are full sequences, including their connections. MCP tools and LLM skills build both; Animation Studio owns storage, revisions, previews, archives and portable exports. There is no model-provider chat panel in the viewer.

The four entries below describe the initial seed library. Current coverage is 61 movements; see [Current state](CURRENT_STATE.md) and [the full inventory](LIBRARY_CONTRACT_REVIEW.md).

## Initial seed library

- **Kick guard**: the kick source's own starting stance, held for 0.5 seconds.
- **Forward kick**: the existing adapted Mesh2Motion CC0 motion; supporting left foot.
- **Right cross**: Quaternius source clip, with contact marked unverified.
- **Walk cycle**: complete Quaternius source cycle, not a verified single step.

Select any movement to play it and inspect its source, support/travel hints and notes. These metadata hints are not a phase-by-phase contact solver. Archive selected hides a custom entry without deleting it; Archived entries allows restoration. Built-in Jump/Burst cannot be archived.

## First composed action

**Guard → Kick → Guard** contains eight phases: guard hold, connection, preparation, release, recoil, recovery, connection, final guard. Each connection lasts 0.2 seconds. The right inspector shows the recipe with movement revision numbers. The kick retains its source poses rather than reconstructing individual joint angles.

## MCP responsibilities

| Tool | Purpose |
| --- | --- |
| `list_movements`, `get_movement` | Discover/read source movement records and revisions. |
| `build_movement` | Prepare a discovered source clip segment, or copy an existing Action v2 into a movement. |
| `register_movement` | Store/revise supported full motion data with source/contact metadata. |
| `compose_action` | Join revision-pinned movements into baked Action v2 data. |
| `archive_entry` | Reversibly archive/restore a movement or custom action. |

Existing `get_action`, `restore_revision`, `get_diagnostics`, `set_preview`, `export_project` and `import_project` also serve library workflows. IDs beginning with `move-` belong to movements. All writes require the current revision; 0 creates a new record. The generic action revision tool cannot revise movement records.

`compose_action` takes an ID, name, expected revision and ordered steps:

```json
{
  "actionId": "guard-kick-guard",
  "name": "Guard → Kick → Guard",
  "expectedRevision": 0,
  "steps": [
    {"movementId":"move-guard","revision":1,"speed":1,"transition":0},
    {"movementId":"move-kick","revision":1,"speed":1,"transition":0.2},
    {"movementId":"move-guard","revision":1,"speed":1,"transition":0.2}
  ]
}
```

Use the revisions returned by the tools; the example creates a new action only. An existing action requires its actual revision. The compiler supports 1–8 movements, movement speeds of 0.5–1.5, positive connection durations up to 1 second, total duration up to 4 seconds and at most 256 samples per channel. Short clips whose retimed phases fall below the action schema's minimum are rejected.

## How joining works

`runtime/movements.ts` evaluates source motions on the real rig through `CharacterPlayer`. It samples every bone and root transform, evaluates explicit smooth pose-blend connections, retimes impact cues and writes baked tracks. Constant channels collapse to one key. Bone/root units remain compatible with the existing shared runtime.

The initial pose-blend compiler now also supports optional single-foot whole-body anchoring (see docs/STEP_PUNCH_STUDY.md). It does **not** provide two-foot IK, automatic root-motion alignment, collisions or physical balance. Unknown support and source travel are flagged for visual review. For larger mismatches, select a compatible bridging motion or authored combination. A longer blend cannot establish natural coordination by itself.

The persisted recipe records movement IDs and revisions. The action also holds the baked result: changing or archiving a movement does not alter an existing action. Recompose explicitly to incorporate a new source revision. The game plays the baked action through the shared runtime without an LLM.

## Skills

Repository and installed copies exist for:

- `skills/movement-building/SKILL.md`: source preparation, metadata, movement verification and registration.
- `skills/action-composition/SKILL.md`: prompt decomposition, source selection, explicit connections and whole-action review.

Installed under `/Users/tim/.codex/skills/` for future sessions. The existing animation-authoring skill routes to these workflows. Skill frontmatter, content and installed-copy consistency were checked manually; the supplied validator could not run because PyYAML is absent.

## Persistence and validation

The studio stores categorized entries and recipes in `.authoring/project.json`. Existing projects are migrated by adding the four seed movements once. Archived seeds remain archived. Save project exports the full library and compiled movement data; import validates all entries before applying changes. Large exports can exceed browser localStorage capacity: downloading still works and the studio's on-disk library remains saved. Import/request size is bounded at 64 MB.

All 23 tests pass (7 authoring, 9 editor, 7 watch), plus TypeScript checking. Added tests cover library/source building, stale revisions, archives, persistence, explicit connections, source-pose reproduction, stable initial/final stance, source revision independence, recipes, portable exports/imports and invalid-import atomicity. Browser checks covered individual movement preview and Archive/Restore. The natural-motion guarantee remains limited to reviewed source movements and tested connections.

## Step-punch extension

Added Advancing left step and Step → Right Punch, with explicit left-foot anchoring across their connection. The reviewed cross now has Load/Punch/Follow/Recover labels and left-support metadata. See docs/STEP_PUNCH_STUDY.md for implementation and limits. The current suite has 25 passing tests.
