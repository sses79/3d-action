# Escape Slide → Stand

Documentation location: `docs/authoring/actions/ESCAPE_SLIDE.md`. Commands run from the repository root; original component-relative code and asset paths below refer to `authoring/actions/`.

Prompt: “Create a quick slide away from danger, followed by a controlled slide exit and return to standing.”

Created through the local MCP movement-building/action-composition workflow as `escape-slide`, revision 2. Source movements remain unchanged. The action pins four new movement variants: escape slide start r2, escape slide loop r2, escape slide exit r2 and standing finish r2.

| Beat | Duration | Source treatment |
|---|---:|---|
| Slide Entry | 0.556 s | UAL2 Slide_Start at 1.5× |
| Connection | 0.060 s | Matching source endpoints |
| Escape Glide | 0.500 s | First 35% of Slide_Loop at 1.4× |
| Connection | 0.080 s | Source slide pose to exit start |
| Controlled Exit | 0.588 s | Slide_Exit at 0.85× |
| Connection | 0.300 s | Decelerating exit stride into neutral standing |
| Standing | 0.350 s | UAL1 Idle_Loop starting pose held |

Total: 2.434 seconds. Explicit root travel advances along +Z from 0 to 0.45 m during entry, to 1.6 m through glide and to 1.9 m during the exit. The standing endpoint remains at 1.9 m. Direction is an assumed escape heading for this standalone preview; gameplay must rotate that heading away from an actual threat. No joint rotations were reconstructed or patched. Phase colors mark fast entry/glide, moving connections/exit and standing hold.

The original Slide_Exit ends in a running stride, discovered during browser inspection. Revision 2 connects that endpoint into a neutral UAL1 Idle_Loop standing pose instead of freezing the running stride. Revision 1 is retained as the comparison reference. No planted-foot constraint is selected during a ground slide. Source contacts remain unverified; no collisions, invulnerability or threat detection are implemented. Actual-rig diagnostics have 65 finite joint transforms and a finite pose-speed curve. Browser checks cover the low glide and return to standing, with loop disabled so the character stays at its destination.

The exact composition request is `escape-slide-recipe.json`. It already exists in the live library, so read `get_action` and supply the current expectedRevision before revising. Read the four variants through `get_movement` to retrieve their full joint/root data. Tool writes persist automatically; the action recipe keeps the revision pins.
