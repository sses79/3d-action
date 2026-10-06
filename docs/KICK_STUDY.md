# Authored kick study

Open http://127.0.0.1:5173/editor/ and select **Authored Kick Study**.

This experiment changes the motion-authoring approach: use a coordinated existing motion as the baseline, then compile bounded semantic adjustments. It does not restore the abandoned Step → Punch → High Kick combination.

## Use

1. Play or replay the original forward kick.
2. Change **Kick height offset** (-8° to +8°) or **Release speed** (0.75× to 1.25×).
3. Select **Apply variation**. This saves a revision and resets the comparison reference to the baseline.
4. Select **Compare**. Blue is the original; gold is the variation. Both play on the same time axis, so different release speeds intentionally reach extension at different times.
5. Use **Original motion** to restore the exact baseline or **Undo** to restore a previous variant. **Save project** exports baked movement, reference and semantic parameters.

The viewer uses the existing Three.js renderer, skeleton and shared action player. A future game engine using that player can load the generated Action v2 JSON without an LLM at runtime. Collisions, locomotion and gameplay remain separate systems.

## Motion source and adaptation

The existing Quaternius mannequin library and the free UAL2 Standard archive had no kick clip. This study uses `Kick_Breach` from [Mesh2Motion's public animation library](https://github.com/Mesh2Motion/mesh2motion-app). Its repository dedicates models, rigs and animations to CC0. The original GLB, license, SHA-256 provenance and extracted source clip are retained under `editor/source/kick/`.

This is a right-leg forward breaching kick, around waist height, with its own knee bend and arm motion. It is not the previously requested head-height kick. Source coordination is a reference for review, not proof of biomechanical correctness.

`authoring/source/import-kick.mjs` transfers each source bone's animated world rotation relative to its source rest rotation onto the target rest rotation. It converts the result back to target local space. Target limb translations stay fixed. Pelvis translation follows the source, with a whole-body correction that anchors the left ball joint to its initial location. This permits supporting-foot rotation without changing target bone lengths. The offline adapter is specific to these two skeletons; arbitrary model import is not supported.

The adapted motion is sampled at 60 Hz into `runtime/kick-baseline.json`. Prepare (0–0.5 s), Release (0.5–0.8 s), Recoil (0.8–1.2 s) and Recover (1.2–1.833 s) are editorial ranges over that motion. The `A_TPose` source phase is only the neutral carrier; absolute baked tracks contain the actual movement.

## Bounded controls

`runtime/kick.ts` always compiles from the immutable baseline, never from the previous generated variant.

- Height smoothly rotates the entire right-leg chain through its thigh around world X. The knee and foot retain their authored local rotations. A small coupled spine correction adds torso compensation. Its envelope rises from 0 at 0.4 s to full correction at 0.78 s, then returns to 0 by 1.2 s. The supporting leg is unchanged.
- Release speed divides only the Release duration. Every key is warped consistently; subsequent keys shift by the same time difference. Preparation, recoil and recovery retain their durations.
- Zero height and 1× speed restore the exact baked baseline. No corrections accumulate across revisions.

There is no IK, collision detection, joint-limit solver or center-of-mass balance solver. Corrections outside the narrow range are rejected. Future actions should use additional suitable source motions and their own tested adapters rather than widening these controls indefinitely.

## MCP / skill

Read `get_capabilities`, then `get_action` for `kick-study`. Submit:

```json
{"heightDeg":4,"releaseSpeed":1.1,"expectedRevision":3}
```

through `revise_kick`. Use the actual current revision; 0 is only for creation. The local fallback is `node authoring/call.mjs revise_kick arguments.json`. The repository skill at `skills/animation-authoring/SKILL.md` describes this path. Every semantic revision records history and restores the original comparison reference. Portable export carries baked motion and parameters, so viewing does not require re-compilation.

## Verification

Type check and all 21 tests pass (5 authoring, 9 editor, 7 watch). The kick test evaluates the actual target GLB at anticipation, extension, recoil and recovery for both height limits with faster release. It checks retained support-foot motion, fixed limb lengths, unchanged knee profile, requested height direction, unchanged start/end poses, baseline reset, stale-revision rejection, rejected parameters, persistent reload, Undo and export/import.

Browser verification covered the source extension/recovery poses, replay, both controls, saved revision update and original/variation comparison. Final artistic approval still requires watching the motion; numerical checks cannot establish how satisfying it feels.
