# Step → Right Punch study

Open Animation Studio at http://127.0.0.1:5173/editor/ and select **Step → Right Punch**. The left sidebar also contains its new **Advancing left step** base movement. This is a distinct-source composition, not the removed punch/high-kick action.

## Source movement preparation

The Quaternius `Walk_Loop` is in place. The step uses cycle 0.6–1.0 followed by 0.0–0.1, crossing the loop boundary to complete a left-leg advance. Its original joint motion is retained. A root translation compensates the supporting right toe's horizontal travel during the stride, then holds the resulting displacement during planting. Total forward travel is approximately 0.53 m over 0.667 seconds. This is authored preview displacement, not collision/controller movement.

`authoring/source/build-step.mjs` reproduces the prepared movement in `authoring/source/step-forward.json`. It samples the actual rig through diagnostics. The record keeps coarse support marked unknown because support changes from right to left within the movement; no phase-specific contact schema exists yet.

The punch uses the unmodified Quaternius `Punch_Cross` motion. Its source timing is labeled Load (0.18 s), Punch (0.22 s), Follow (0.25 s), Recover (0.35 s). Those labels do not alter source joint poses. Sample inspection showed the left toe approximately stationary while the rear foot pivots/repositions, so the reviewed punch record uses left support and in-place travel.

## Connection

The recipe joins the advancing step to the punch with a 0.30-second connection and `contact: "left"`. The compiler:

1. Aligns the incoming source's left ball joint with the preceding movement endpoint using an XYZ whole-body offset.
2. Blends the original endpoint poses without changing limb lengths.
3. Corrects whole-body translation during the blend to retain that selected foot location.
4. Carries the offset through the punch, avoiding a reset to its source origin.

The rear foot is free to reposition. This is not two-foot IK, automatic contact detection, physical balance enforcement or locomotion collision handling. The source motions still require artistic review. Root travel and coarse unknown support remain visible as review notes.

## Result

Seven phases: Left step → Plant → Join → Load → Punch → Follow → Recover. Total duration approximately 1.97 seconds. Loop is off so the character stays at the advanced position after recovery; Replay intentionally restarts the action.

The existing composition MCP tool accepts optional per-step `contact: "left"` or `"right"`; omitted contact preserves the previous pose-blend behavior. Recipes, baked tracks, references and Undo remain supported. The installed action-composition skill documents selecting contact only when the source supports that foot.

## Checks

All 25 tests pass (9 authoring, 9 editor, 7 watch), plus TypeScript checking. New actual-rig tests sample the entire connection, check lead-toe drift below 4 mm, retained advance, unchanged incoming joint poses, and invalid-contact rejection. A regression test covers floating-point endpoint differences when source motion has multiple labeled phases. Browser inspection covered connection stance and replay; the rear foot remains unconstrained.
