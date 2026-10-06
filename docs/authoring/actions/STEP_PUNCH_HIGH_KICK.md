# Step → Punch → High Kick

Documentation location: `docs/authoring/actions/STEP_PUNCH_HIGH_KICK.md`. Commands run from the repository root; original component-relative code and asset paths below refer to `authoring/actions/`.

This action replaces the earlier Pouch → Coil → Launch breakdown at the user’s request. It uses the same action ID (`pouch-coil-launch`) and existing Quaternius mannequin.

| Phase | Duration | Movement |
|---|---:|---|
| Ready | 0.20 s | Hold guard, with the right foot leading. |
| Step | 0.32 s | Advance the right foot, shift the body forward, and plant before punching. |
| Right Punch | 0.22 s | Extend a closed right fist and begin retracting it. |
| Hip Turn | 0.28 s | Retract the arm, turn the pelvis, and shift onto the right support leg. |
| Chamber | 0.22 s | Lift and fold the left knee before releasing the kick. |
| High Kick | 0.18 s | Turn through the hips and extend the left leg toward head height. |
| Follow | 0.12 s | Continue the kick across its arc. |
| Recoil | 0.28 s | Fold the knee and bring the leg back. |
| Recover | 0.43 s | Replace the left foot and restore the torso and hands to guard. |
| Guard | 0.20 s | Hold the advanced stance. |

Total: **2.45 seconds**. Root movement advances **0.26 m**. Replay resets the starting position.

## Implementation and verification

The action holds `A_TPose` and applies 47 tracks: 15 body rotations, pelvis position, root position, and 30 finger rotations. The fist shapes come from the asset’s `Punch_Jab` clip. Body tracks have 91 samples each. The offline generator bakes leg poses into normalized local quaternions; runtime uses the existing shared player, with no new IK or physics system.

At 1.42 s, MCP diagnostics measured the left ankle at approximately **(0.165, 1.533, 0.810) m** and the supporting right ankle at **(−0.13, 0.105, 0.40) m**. The mannequin’s head joint is about 1.53 m high in this pose. Validation and diagnostics report no warnings. Browser checks covered the punch, high kick, and replay.

Current saved revision: **6**. The previous versions remain in authoring history; Reference currently shows the previous high-kick revision 5.

- Generator: `step-punch-high-kick.mjs`
- MCP submission data: `step-punch-high-kick.json`
- Viewer: http://127.0.0.1:5173/editor/

Pose keys use absolute seconds. The LLM must retime those keys together with phase durations.

## Kick correction — revision 5

Chamber releases into a straight leg by 1.37 s. The knee remains extended through Follow (ending 1.54 s), then folds during Recoil. The toes align with the shin during full extension instead of retaining the grounded flat-foot rotation. At 1.42 s, diagnostics measure approximately 1.25° knee deviation from straight and 0° toe-direction deviation from the shin. The right support foot stays planted. High Kick, Follow, and Recoil were visually checked in the browser. Total duration stays 2.45 s.

## Knee timing and balance correction — revision 6

Full knee extension now arrives at 1.32 s, before the High Kick midpoint. Backward lean is distributed over spine_01 and spine_03, reaching a 0.35 rad authored counterlean through High Kick and Follow. Recoil brings that lean back to zero by 1.68 s while folding the knee. At 1.33 and 1.48 s, diagnostics measure approximately 1.2° deviation from straight at the knee; at 1.68 s the knee is folded and the torso is upright. All three poses were checked in the viewer.
