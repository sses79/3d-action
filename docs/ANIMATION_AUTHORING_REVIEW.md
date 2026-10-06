# Animation authoring review and next design

> Historical plan or milestone report. Some features described as future work are now implemented. See [Current state](CURRENT_STATE.md) for the current codebase.

Reviewed 4 October 2026. This is an audit and design proposal, not an implementation of new controls.

## Editor availability

Neither port 5173 nor 5174 had a listening process. The static demo server and authoring service were restarted:

```sh
python3 serve_demo.py --host 127.0.0.1 --port 5173
npm run start:authoring
```

Both HTTP endpoints subsequently returned 200. The active library contains Jump, Burst Attack, and LLM Hammer Study. The removed combination remains removed. These commands run local processes; they do not install an automatic startup service. If those processes exit, the URLs stop responding.

The browser automation tool blocked access to the local page in this session. Availability was verified through HTTP, not a fresh browser rendering check.

## Recovered records

The complete saved action record survived removal in `.authoring/removed-actions/pouch-coil-launch.json`. It contains revisions 1–5 in history, revision 6 as the latest action, and revision 5 as the comparison reference. The ID stayed `pouch-coil-launch` even when the display name changed.

For inspection, each exact action snapshot is now extracted into `authoring/history/step-punch-high-kick/revision-N.json`, wrapped as `{ "action": ... }`. These are action submission files, not complete project-import files. No snapshot was submitted back to the live library.

`authoring/history/step-punch-high-kick/audit.json` contains track differences and measurements reconstructed with the actual GLB and shared player. Reproduce it with:

```sh
node authoring/history/audit-removed-action.mjs
```

The archive stores action data, not original prompts, creation timestamps, or versioned generator source. The prompt descriptions below are reconstructed from this conversation. The current generator contains the final edits; the exact saved JSON is the authoritative record of previous outputs.

## What changed in each revision

| Revision | Request or purpose | Actual change | Remaining issue |
|---|---|---|---|
| 1 | Initial Pouch → Coil → Launch | 2.85 s, 8 phases, 17 tracks. Forward checking arm, hip load, rear left kick and recovery. | This was the earlier checking/parrying action, before the requested punch/high-kick sequence. |
| 2 | Refine the checking arm | Only right upper-arm and forearm rotation tracks changed. | Still the earlier action; it was later superseded. |
| 3 | Step forward, right punch, lower-body turn, left high kick | New 10-phase sequence, 2.45 s, 0.26 m root advance. Added 30 finger tracks from Punch_Jab for closed fists. Total 47 tracks. Peak left ankle target (0.16, 1.58, 0.62) m. | High ankle position did not guarantee a straight knee. The airborne foot retained a flat-foot orientation. |
| 4 | Refine outward kick extension | Changed left thigh, calf and foot tracks. Peak ankle target became (0.16, 1.52, 0.80) m; Follow target changed from (−0.12, 1.42, 0.73) to (−0.12, 1.42, 0.86) m. | The knee still bent during High Kick and Follow; the foot was still flat. |
| 5 | Straight knee and foot, then recoil | Blended the ankle target toward full leg reach by 1.37 s; held extension through 1.54 s. Aligned the ankle-to-toe direction with the shin. Recoil folded the knee afterward. | Peak and Follow aligned, but High Kick midpoint was still visibly bent. The upper chest alone carried the torso lean. |
| 6 | Correct knee angle and lean back for balance | Full extension moved earlier to 1.32 s. Backward lean distributed 70% to spine_01 and 30% to spine_03. Authored lean reached −0.35 rad, about 20°, at the kick peak and through Follow. Lean returned to zero at 1.68 s during Recoil. | This was still manually authored geometry without a reusable contact/balance controller or validated motion-quality specification. The user abandoned it. |

Revisions 4 and 5 changed only three left-leg tracks. Revision 6 differs in 17 body/root tracks partly because a new sample timestamp was added to all of them; this does not mean all 17 channels received a new movement concept. Fingers stayed unchanged.

All high-kick revisions retained the same durations: Ready 0.20, Step 0.32, Right Punch 0.22, Hip Turn 0.28, Chamber 0.22, High Kick 0.18, Follow 0.12, Recoil 0.28, Recover 0.43, Guard 0.20 seconds. Their differences therefore came from poses and interpolation, not duration edits.

## Reconstructed measurements

Knee bend here is the angle between hip-to-knee and knee-to-ankle directions: 0° means straight. It is a geometric diagnostic, not an anatomical joint-limit or deformation test.

| Revision | High Kick midpoint, 1.33 s | Peak, 1.42 s | Follow midpoint, 1.48 s |
|---|---:|---:|---:|
| 3 | 87.32° | 43.03° | 62.56° |
| 4 | 84.09° | 23.49° | 42.02° |
| 5 | 39.34° | 1.25° | 1.23° |
| 6 | 1.25° | 1.25° | 1.23° |

At revision 6 peak, the left ankle was 1.533 m high. The head was about 0.109 m behind the pelvis along the forward axis; revision 5 had only 0.031 m of that displacement. By Recoil midpoint the authored counterlean was zero and the knee was folded. Head displacement is evidence of pose change, not proof of physical balance.

These results expose the earlier verification mistake: checking a good peak pose and numerical validity was insufficient to declare the transition fixed. The full release and recoil must be inspected. Straight bone directions also do not certify knee twist, skin deformation, contact stability, or an appealing silhouette.

## How the LLM authored it

1. Read the actual rig manifest and current saved revision through MCP.
2. Translate the prompt into named phases and manually chosen pose landmarks.
3. Run `authoring/actions/step-punch-high-kick.mjs` offline against `editor/assets/character.glb`.
4. Sample A_TPose, position the pelvis/root, rotate the spine, aim arm bones, and calculate two-bone leg poses from ankle targets and knee bend hints.
5. Convert world directions into normalized local quaternions; bake roughly 30 samples per second plus explicit landmark times. Copy fist rotations from Punch_Jab.
6. Submit the resulting JSON through `validate_action` and `revise_action`, using the current revision ID. The previous action becomes Reference and history is retained.
7. Inspect key poses and diagnostics; update the generator and submit another whole-action revision.

The runtime does not run the generated script. `runtime/player.ts` resets the skeleton, samples the source clip, applies tracks, and renders deterministic poses at an absolute time. The offline leg calculation was a bespoke authoring helper, not an exposed runtime IK tool.

The transport worked: revisions persisted and the same player evaluated them. The weak layer was motion authoring. Prompts were translated into hand-written geometry with action-specific assumptions. Duration controls could not correct those geometric mistakes.

## Recommended product: prompt iteration with shared semantic controls

Use one structured action plan as the source for both LLM changes and optional user controls:

```text
User prompt + previous plan + requested differences
                    ↓
             revised action plan
                    ↓
       rig adapter + motion compiler
                    ↓
          existing Action v2 tracks
                    ↓
       viewer / diagnostics / comparison
```

This is a proposed extra layer; the current platform accepts baked tracks and does not implement this compiler yet.

Keep the default flow simple: describe an action, replay it, and describe what to change. Preserve accepted parts of the previous plan. A request such as “lean back more during the kick” should revise the torso parameter for those phases, rather than inventing a completely new punch, step, and recovery. Regenerate the affected motion from the revised plan and continuity constraints.

The phase inspector can offer an optional **Adjust feel** panel. It should expose movement intent, not bone names, axes, quaternions, or a full keyframe editor.

| Control | Meaning | Applicability |
|---|---|---|
| Arm swing / reach | Per-arm amplitude, direction and release timing | Punch, jump anticipation, follow-through |
| Torso lean | Forward/back or lateral lean relative to movement direction, plus return timing | Kick, launch, recovery |
| Jump height | Root trajectory apex, independent of leg pose | Airborne root-motion actions |
| Squash/stretch | Bounded stylized deformation and recovery | Optional character style; not every rig should permit it |
| Knee extension / release | When the kick moves from folded chamber to extension, with a soft joint limit | Kicks; fixes the failure found here |
| Foot posture and contact | Pointed/flexed foot; planted support and pivot intent | Kick, landing and stepping |
| Hip turn | Wind-up and release amount/direction | Combination techniques |

Duration changes pace; reach, pose, easing, overlap, contact and recovery change how the action reads. Controls should have units and ranges, an applicability flag, and a preview. Jump height cannot stand in for kick height: kick height is a foot target relative to the character; jump height moves the whole character.

Manual changes and prompt changes must modify the same plan and create the same revision record. Avoid separate slider state layered invisibly over LLM-generated tracks. Undo and Compare should work for either input method.

## Prompt-only alternative

The user need not manipulate controls. Present a short interpretation after generation, such as:

> High Kick: reach head height, straighten early, point the foot, lean the torso back slightly, keep the right foot planted. Follow retains extension. Recoil folds the knee and returns the torso upright. Step and punch are preserved.

Follow-up guidance can suggest useful dimensions: “higher or lower?”, “faster release?”, “more torso lean?”, “shorter recoil?”. Ask only when an ambiguity changes the result materially. Do not make the user repeat the whole original prompt for a targeted revision.

Store each revision with its parent, original prompt, follow-up instruction, interpreted plan, parameter differences, rig version, compiler version and compiled tracks. The old archive lacks much of this provenance. A future change summary should say exactly what was altered and preserved.

Prompt-only operation still needs consistent underlying motion semantics. Asking again without that layer would repeat the same unreliable geometry-authoring loop.

## Changing the 3D character

Separate the character mesh, skeleton adapter, semantic action plan and compiled tracks.

| Change | Proposed handling |
|---|---|
| Material or appearance change on the same verified skeleton/bind pose | Reuse the motion; inspect deformation and accessories. |
| Body proportions change | Recompile targets from the new measured limb lengths and normalized body dimensions; reevaluate reach and contact. |
| Different humanoid skeleton | Add a rig profile: semantic bone map, rest/bind rotations, forward/up axes, units, limb lengths, joint limits and supported controls. Recompile or retarget, then validate. |
| Non-humanoid or unrigged object | Use a different action family/adapter, or require a rigged asset. A humanoid kick plan does not automatically apply. |

Bone names alone are insufficient: local axes, bind pose, hierarchy, bone lengths and skin weights affect the result. Preserve rest bone lengths; avoid using arbitrary joint translation to force an impossible pose. Detect unreachable targets and report a useful alternative instead of silently producing a bad knee.

Three.js supplies `SkeletonUtils.retarget` and `retargetClip`, with bone mapping and offset options. They can support a future adapter, but they are not currently wired into this editor. See the [official documentation](https://threejs.org/docs/pages/module-SkeletonUtils.html). Retargeting remains something to verify on each supported rig.

This keeps the project focused on action design and review. It does not require mesh modeling, weight painting, rig construction or Blender's general animation interface. A character whose rig or weights are unsuitable still needs asset preparation outside this tool.

## Small next implementation

1. Introduce a versioned semantic plan and a single supported humanoid rig profile. Start with one reliable action family; do not promise arbitrary motion generation.
2. Add phase-relative landmarks for chamber, release, follow and recoil. Retiming should move their keys and cues together; current absolute-second tracks do not do that automatically.
3. Implement deterministic compilation of torso lean, knee extension, foot posture, root height and bounded style scaling. Include support-foot/contact constraints where required.
4. Add an MCP revision tool that accepts a plan patch and preserves unaffected phases. Update the authoring skill to use it.
5. Show the interpreted plan and parameter differences beside the existing viewer. Optional controls use the same patch operation.
6. Check full-motion release/recovery, contact drift, reachable targets, joint orientation and continuity; compare fixed viewpoints at slow and normal speed. Keep snapshots and compiler provenance.

A worthwhile first acceptance test is this failed case: at the High Kick midpoint and throughout Follow, the knee is near-straight and the foot points along the shin; the support foot remains anchored; the torso counterleans and returns upright during Recoil. Inspect the rendered motion as well as measuring it. Only then generalize the controls to other actions and models.
