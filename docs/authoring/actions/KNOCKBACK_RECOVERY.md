# Knockback recovery

Documentation location: `docs/authoring/actions/KNOCKBACK_RECOVERY.md`. Commands run from the repository root; original component-relative code and asset paths below refer to `authoring/actions/`.

Prompt: React to a heavy hit, stagger backward, regain balance and return to guard.

Saved action `knockback-recovery`, revision 3, 2.26 seconds. Created through movement-building and action-composition MCP tools. Studio plays the baked action; sources and revision history remain in the library.

## Motion recipe

- Ready: 0.14 s, held UAL1 Idle_Loop.
- Hit connection: 0.04 s.
- Hit: 0.22 s, first 40% of UAL1 Hit_Chest.
- Stagger: 0.43 s, remaining chest reaction with backward displacement tapering to a stop.
- Catch-step connection: 0.10 s, incoming right toe anchored.
- Catch step: 0.65 s, UAL1 Walk_Loop second half played backward (1 → 0.5), ending on the left foot.
- Balance/guard connection: 0.28 s, incoming left toe anchored.
- Guard: 0.40 s, held Punch_Cross endpoint with raised hands.

Final baked root position: [-0.26824374461869543, 0.000689948857898859, -1.3898308379822126], in normalized meters. Contact alignment deliberately rebases the incoming step and guard; final root differs from their source positions. Replay resets to the initial position; normal end playback holds the destination. Loop is off.

## Source choices and revision record

UAL2 Hit_Knockback was rejected: it ends lying on the ground and would require a get-up action. Standing UAL1 Hit_Chest fits this prompt better. The backward catch step reuses coordinated source joints rather than custom angle patches; it is a reversed walk adaptation, not a dedicated authored stagger clip.

Action r1 used unanchored joins. Diagnostics exposed foot displacement. r2 added left-foot step alignment and right-foot guard alignment, but this brought the torso forward at the step entry. r3 switches the step source to the opposite half-cycle, anchors the right foot into the step, then the left foot into guard. Step source r2 is pinned in the final recipe. Original sources and other actions remain intact.

## Validation and limits

Inspected chest reaction, catch-step entry/midpoint and final guard in Side/Orbit. Replayed final action at half speed. Final diagnostic samples at step entry, exit and guard show the selected support toe approximately 0.015–0.016 m above the floor. Initial knockback includes deliberate backward sole sliding; the source chest-hit clip itself is planted. Single-foot join alignment is whole-body translation, not IK, collision response or physical balance verification. No gameplay damage or impulse is implemented.

Recipe: `knockback-recovery-recipe.json`. Source movement payloads are retained alongside this file. For later timing changes use `revise_action_recipe` with current action revision 3; source selection/contact changes use explicit composition.
