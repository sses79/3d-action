> Superseded by [Step → Punch → High Kick](STEP_PUNCH_HIGH_KICK.md). This file describes the earlier action revision.

Documentation location: `docs/authoring/actions/POUCH_COIL_LAUNCH.md`. Commands run from the repository root; original component-relative code and asset paths below refer to `authoring/actions/`.

# Pouch → Coil → Launch: technical animation breakdown

This action translates the supplied three-part combination into editable animation data. The first version uses a left rear-leg roundhouse-style kick. That kick type is an interpretation of the rotational prompt; it was not specified explicitly.

The supplied right-foot lead / left rear-leg arrangement is preserved. In conventional boxing terminology that is a southpaw arrangement; orthodox normally reverses those feet. See the [stance definition](https://en.wikipedia.org/wiki/Southpaw_stance). A true orthodox variant would need mirrored limbs and rotation cues, rather than simply relabeling this action.

## Coordinate and timing conventions

The character initially faces world +Z; +Y is up. Positive local/world angles use the right-hand rule. The Coil rotates the pelvis about world Y from approximately −5° to −29°: clockwise when viewed from above using the standard X-right, Z-down projection. The Launch reverses that turn, reaching approximately +37° at kick extension. “Clockwise” changes with viewing direction, so signed yaw is the authoritative animation control.

These timings and angles are authored starting values for a stylized animation. The action player interpolates pose data; it does not simulate the forces of a martial technique.

| Phase | Time | Duration | Visual role |
| --- | --- | --- | --- |
| Ready | 0.00–0.25 s | 0.25 s | Establish the right-lead stance and guard |
| The Pouch | 0.25–0.80 s | 0.55 s | Advance the right foot and extend the right checking hand |
| The Coil | 0.80–1.25 s | 0.45 s | Retract the checking hand, wind up the pelvis, shift over the support leg |
| The Launch | 1.25–1.52 s | 0.27 s | Reverse the hip turn, lift the left knee and release the kick |
| Follow | 1.52–1.68 s | 0.16 s | Continue the kick through its arc |
| Recoil | 1.68–2.05 s | 0.37 s | Fold the kicking leg back in |
| Recover | 2.05–2.65 s | 0.60 s | Replace the left foot and restore the guard |
| Guard | 2.65–2.85 s | 0.20 s | Hold a readable finish |

Total: **2.85 seconds**. Ready and the concluding phases make the three main beats usable as a complete replayable action.

## Phase 1 — The Pouch

**Intent:** occupy the opponent-facing line with the right hand while advancing the right foot. Treat this as a checking/parrying gesture, rather than substituting a straight punch.

- Start with the right foot ahead and the left foot behind; both knees are flexed.
- Advance the right ankle approximately 0.22 m, from Z = 0.14 to Z = 0.36. Give it a short lifting arc before planting.
- Move the character root forward by the same 0.22 m over the step. The left foot stays at its initial world position during this beat.
- Extend the right upper arm and forearm forward and upward, leaving the elbow readable rather than snapping into a locked pose. The right hand reaches approximately face height.
- Keep the left hand close to the guard and keep the head facing the opponent's nominal direction.
- Reach the checking pose around 0.66 s and retain it until 0.80 s, so the viewer can read the intention.

**Authored pose check at 0.66 s:** right hand ≈ (−0.246, 1.594, 0.674) m; head joint ≈ (−0.034, 1.536, 0.240) m; planted right ankle ≈ (−0.130, 0.105, 0.360) m. The head joint is not an eye marker.

The mannequin represents the checking gesture. There is no opponent, obstruction/visibility system, or parry collision in the preview, so “blind/check” is an intent label rather than a gameplay effect.

## Phase 2 — The Coil

**Intent:** overlap arm retraction with a visible rotational wind-up; avoid stopping one motion completely before starting the other.

- Retract the right hand toward the guard as the pelvis rotates into the requested clockwise wind-up.
- Shift the pelvis toward the planted right leg and lower it slightly. This visually establishes the right leg as the support for the next beat.
- Counterrotate the upper torso relative to the pelvis, allowing the chest to turn less than the hips. Keep the head's world-facing orientation stable.
- Preserve the left rear-foot contact for most of the coil. Begin lifting that foot near the end, creating overlap with Launch.
- Hold the loaded pelvis orientation briefly near 1.07–1.25 s. This is a deliberate anticipation hold; “Hold” does not require every joint to stop moving.

**Animation controls:** pelvis yaw, pelvis local position, spine rotation, independently authored right upper-arm/forearm rotations, and left-leg pose.

The arm and hips share coordinated timing. The visible arm retraction does not establish that the arm alone mechanically powers the kick; momentum transfer would require a physical model beyond this pose evaluator.

## Phase 3 — The Launch

**Intent:** make the release visibly faster than the preparation, with the hip turn leading the leg's full extension.

- Reverse the pelvis wind-up at approximately 1.25 s.
- Lift and fold the left knee before extending the leg. At 1.36 s the action is in a chamber pose; by 1.52 s it reaches the extension pose.
- Rotate the supporting right foot with the release while retaining its ankle anchor. The preview currently rotates around the ankle, rather than simulating an exact ball-of-foot pivot and heel mechanics.
- Keep the right hand retracted and let the left arm adjust for a readable counterbalance.
- Use a slight torso counterlean as the kicking leg extends.
- Continue the foot across an arc in Follow; do not freeze the fully extended leg as if it were a held jump apex.

**Authored pose check at 1.52 s:** left ankle ≈ (0.520, 0.910, 0.780) m; right ankle ≈ (−0.130, 0.105, 0.360) m. The kick finishes near hip height on this 1.85 m normalized mannequin.

No contact, damage, or hit-confirm event is added because the current preview contains no target. No ground-impact effect is appropriate for this first kick version.

## Recovery and finish

Follow continues the arc for 0.16 s. Recoil folds the left knee, then Recover replaces the foot behind the right lead and returns the torso and hands to guard. The character ends approximately 0.22 m forward of its starting root position, preserving the advance from the Pouch.

Replay/loop resets the action to its starting position. In a later game, a controller must own accumulated world displacement; it should not apply the same movement a second time.

## Implementation

- Action ID: `pouch-coil-launch`; display name: `Pouch → Coil → Launch`.
- Character: existing Quaternius UAL1 mannequin.
- Source clip: a held `A_TPose`. The checking step and kick are authored joint poses, not an existing canned kick clip.
- Seventeen tracks: fifteen local joint-rotation tracks, one pelvis-position track, and one root-position track.
- Ninety-nine timestamped keys per track, including the main pose timestamps and intermediate samples.
- Local rotations are normalized quaternions. Runtime rotation interpolation uses slerp.
- The offline authoring script computes leg poses from desired ankle positions; it bakes those results into the action. No runtime IK solver is added or advertised.
- MCP validates the action, creates/revises it, persists history, and selects it in the existing viewer.
- Diagnostics confirmed the requested ankle/hand positions and a finite pose-speed curve. Browser inspection covered Pouch, Coil and kick poses, plus playback. These checks establish the prototype's animation behavior, not physical accuracy of a real technique.

Files:

- `pouch-coil-launch.mjs`: reproducible authoring script.
- `pouch-coil-launch.json`: complete action submission data for MCP.
- `../../editor/pouch-coil-launch-preview.png`: editor preview.

## Useful next prompts

- “Make the Pouch quicker and the Coil more deliberate, preserving the planted right foot.”
- “Keep the left hand closer to the chin through the kick.”
- “Reduce the torso turn and make the kick sweep wider.”
- “Mirror the action into a left-lead stance with a right rear-leg kick.”

The LLM must retime pose keys when changing phase durations: these tracks use absolute seconds and do not follow phase boundaries automatically.
