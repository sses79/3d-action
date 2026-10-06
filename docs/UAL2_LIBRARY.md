# UAL2 in Animation Studio

The free Quaternius Universal Animation Library 2 **Standard** package is now a reusable movement source in Animation Studio. The downloaded GLB contains **43 clips**. This import does not include all 130+ motions advertised across the full product or paid Blender-source editions. The publisher licenses the pack under CC0: https://quaternius.com/packs/universalanimationlibrary2.html.

## What is available

Studio has a searchable **UAL2 Standard · 43** group in the Movements sidebar. Select a movement to inspect and replay it. The source library includes hooks and separate recoveries, sword combos, ninja-jump segments, slides, shield motions, farming, idle and zombie motions. Props such as swords, shields and tools are not supplied by this character adapter.

The original Standard GLB, license and source hash are retained under `editor/source/ual2/`. `authoring/source/import-ual2.mjs` adapts its skeleton to the existing Quaternius mannequin. It transfers world rotation deltas relative to each source/target rest pose, converts them back to target local quaternions and preserves target bone lengths. Pelvis translation retains source body travel at the mannequin's 1.85 m normalization. Sampling is approximately 60 Hz, bounded at 241 keys per track. The compiled package is `runtime/ual2-library.json`; the mannequin GLB remains the runtime character.

This is a fixed-source/fixed-target adapter, not an arbitrary-rig retargeter. It does not solve contacts, physical balance or collisions. Imported metadata marks support unknown and travel source until reviewed. Motions may be stylized and fast. Pose-speed measurements include local pelvis/body travel; model-root translation is excluded.

## MCP and skills workflow

1. `get_capabilities` discovers the source library, current project sequence, complete tool schemas and rig channels.
2. `sync_movement_library` adds missing UAL2 records. Edited or archived IDs are preserved. Repeated sync is idempotent; it does not overwrite newer movement revisions or unarchive entries.
3. `list_movements` finds candidates. `get_movement` obtains the exact source revision and full motion.
4. `adapt_movement` creates a trimmed/retimed variant. Phase/source timing, joint keys and cues change together. It preserves the starting spatial offset; it does not rebase travel, generate poses or repair coordination.
5. `set_preview` and `get_diagnostics` inspect the movement. Review entry/exit, contact, action peak and recovery.
6. `compose_action` joins reviewed movements, adds named connection phases and pins source revisions. The compiled copy remains stable when movements change.
7. Replay/compare in Studio, then ask the LLM for another revision. Archive reversibly when needed.

The `movement-building` skill covers discovery, sync, adaptation and inspection. `action-composition` handles joining reviewed movements. The existing animation-authoring skill remains the full action/rig authoring entry point. No model API or prompt textbox is required in Studio; the connected LLM calls these tools.

### Sync

Replace the sequence with the value just returned by `get_capabilities`:

```json
{"library":"ual2-standard","expectedSequence":107}
```

Submit to `sync_movement_library`. Read the sequence again before another sequence-checked operation.

### Create a variant

After reading the source and confirming its current revision:

```json
{
  "sourceMovementId":"move-ual2-melee-hook",
  "sourceRevision":1,
  "movementId":"move-hook-quick",
  "name":"Quick hook",
  "from":0.1,
  "to":0.9,
  "speed":1.15,
  "expectedRevision":0
}
```

Submit to `adapt_movement`. `from`/`to` are normalized across the whole movement; speed is 0.5–1.5. Revision 0 means create. For another revision, use the current destination revision. The running library already contains this example, so do not repeat revision 0.

### Join attack and recovery

The running example `ual2-hook-recovery` contains the complete source hook, a 0.08 s explicit connection, and its recovery, totaling approximately 1.15 s:

```json
{
  "actionId":"ual2-hook-recovery",
  "name":"UAL2 Hook → Recovery",
  "expectedRevision":0,
  "steps":[
    {"movementId":"move-ual2-melee-hook","revision":1,"speed":1,"transition":0},
    {"movementId":"move-ual2-melee-hook-rec","revision":1,"speed":1,"transition":0.08}
  ]
}
```

Submit to `compose_action` only after checking revisions. This example already exists: use its current action revision to revise it. Source support remains unverified; no planted-foot constraint is used here. Composition supports 1–8 movements, up to 4 s and 256 keys. Trim or speed up longer sources before composition. A single reviewed support foot can optionally be anchored at a connection; this remains whole-body compensation, not IK.

Terminal fallback uses the same MCP protocol:

```sh
node authoring/call.mjs get_capabilities
node authoring/call.mjs list_movements
node authoring/call.mjs adapt_movement /absolute/path/to/arguments.json
```

## Storage and verification

Tool writes persist automatically in `.authoring/project.json`. Save project exports complete movement/action data, metadata and recipes. Compact JSON keeps the current full library export within the 128 MB import bound; browser localStorage may be too small, but download and service persistence still work. Only the selected entry sends full tracks to the viewer; other entries use lightweight catalog summaries. An offline summary-only catalog cannot be exported as a full project.

The 11 authoring tests cover sync idempotency, preservation of edits/archives, revision checks, trim/retime boundaries, source immutability, composition, actual-rig sampling and service/MCP integration. Nine editor and seven watch tests also pass; editor TypeScript checks pass. Browser checks cover searchable grouping, imported movement playback and the composed attack/recovery example. These checks establish functionality, not physical realism for every imported motion.

To regenerate the offline package:

```sh
node authoring/source/import-ual2.mjs
npm run build:authoring
npm run build:editor
```

Restart the authoring service after changing its bundled package. Sync preserves already stored records; deliberately revise an existing movement to adopt a changed adapter output.
