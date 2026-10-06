# Movement connection profiles

Animation Studio now records revision-bound entry/exit measurements for every active movement. The current library has 53 profiles. Measurements do not alter motion, timing, existing action recipes or movement revisions.

## Recorded evidence

Each endpoint includes normalized world head height, a coarse upright/low/airborne label, root position, model-axis forward vector, fifteen root-relative body-joint positions and their local quaternions. Root-relative positions remove the global translation offset while preserving body shape and height. The model forward vector is its +Z axis transformed by model-root rotation; it is not inferred anatomical facing.

Foot hints measure the ball joints at the endpoint and up to 0.05 seconds inside the movement. A foot within 0.05 m of the ground and moving no faster than 0.15 m/s is a stationary-foot candidate. Results are left/right/both/none. `none` means no stationary foot was detected, not absence of hand/body support, and does not distinguish a sliding foot from a foot in the air. These are heuristic hints, not measured force/contact or verified support. Visual review can record endpoint support and evidence notes separately; it does not establish balance or full-motion contacts.

Travel records root displacement, pelvis/world displacement and root path distance from 30 intervals. Root and body travel are separate because source animations can move the pelvis with a stationary model root. Curved root distance is an approximation; signed XYZ displacements use the viewer's normalized world meters.

## LLM workflow

1. Read `get_capabilities` and `list_movements`.
2. Run `profile_movement_library` with the current project sequence when profiles are missing or stale. One batch persists all new measurements, leaving selection and motion unchanged.
3. Call `find_movement_connections` with the outgoing movement ID and actual `sourceRevision`, optionally `limit` (1–20).
4. Choose candidates by prompt semantics, endpoint pose, foot evidence and travel. Read full movement records before composition.
5. Inspect start/end in Studio. Record evidence with `review_movement_profile` when warranted; identify it as LLM visual review and leave uncertain support unknown.
6. Compose, inspect the full transitions and revise if needed. Existing planted-foot alignment remains opt-in, not selected automatically from hints.

Matching ranks fifteen-joint positional RMS plus weighted local quaternion angular RMS and a penalty for incompatible single-foot hints. A `near` label requires pose RMS below 0.12 m, rotation RMS below roughly 23 degrees and no single-foot conflict. These thresholds are initial heuristics. The result includes root-gap distance; it does not automatically rebase, rotate or physically validate the connection. A numerically close endpoint can be inappropriate for the requested action. No semantic search or trained motion model is introduced.

The actual Slide_Start exit finds Slide_Exit and Slide_Loop among its closest candidates (0–0.003 m positional RMS); LayToIdle is flagged as needing a transition (~0.38 m positional RMS). This helps avoid the first wrong choice without claiming that every suggested connection is natural.

## Storage and validity

Profiles are stored beside movement records in `.authoring/project.json`; list/get tools and the Studio movement inspector expose them. Exports include current profiles for reference. Imported projects discard profile caches and require a fresh measurement because movement revisions and dependencies may change. Movement revision changes remove or invalidate measurements and reviews; archive/restore revision changes also require refresh. Profile/review updates increment the project sequence without changing movement revision pins. Existing baked actions remain stable.

MCP has 24 tools. New tools are `profile_movement_library`, `find_movement_connections` and `review_movement_profile`. The movement-building/action-composition skills include this workflow. Composition returns extra endpoint mismatch and unreviewed warnings when current profiles exist; it still works with unprofiled legacy movements.

Verification: 13 authoring and nine editor tests pass, along with editor TypeScript checks. Tests cover profile persistence, export, near-match ranking, stale sequence/revision rejection, invalidation on motion revision and unaffected source motion. Browser verifies the profile inspector and movement playback.
