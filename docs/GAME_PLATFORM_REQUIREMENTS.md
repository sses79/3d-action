# Shared game platform and animation editor requirements

> Historical plan or milestone report. Some features described as future work are now implemented. See [Current state](CURRENT_STATE.md) for the current codebase.

3 October 2026 · Research and proposed implementation contract

## Direction

The animation editor is the first implemented part of a future mobile-compatible game platform. It must produce actions that the game can play directly. Build the editor, one character, and action evaluation first; build the game scene and gameplay afterward.

Keep the editor interface separate from the runtime, but share asset loading, rig mapping, action evaluation, and action schemas. This updates the standalone-editor framing in `docs/ANIMATION_EDITOR_PLAN.md`.

## What the gameplay reference establishes

The supplied `ssstwitter.com_1791038934982.mp4` is about 11 seconds long, 640 × 360, at 30 frames per second. Sampled frames show a landscape game view, an elevated angled camera, two characters, a left virtual joystick, and right buttons labelled leap, A/stomp, and B/wall. A highlighted stomp button appears during an effect, and later frames show a wall-like object on the arena.

These observations support designing for touch input and actions with timed effects. The video does not establish native versus browser deployment, engine, asset source, skeleton, physics system, networking, or achieved device performance. The recording's frame rate is not a measured game frame rate.

Public searches did not identify the original engine. The visible `kushti.earth` address could not be retrieved through the research tool. Do not claim the reference uses Three.js, Unity, Godot, or a specific model pack.

## Our platform choice

Use a browser platform first:

- **React + TypeScript + Vite:** editor shell, timeline, inspector, asset browser, and revision controls.
- **Three.js:** character rendering and animation playback in both editor and future game.
- **WebGPURenderer with WebGL2 fallback:** continue the watch demo's renderer approach. Avoid requiring WebGPU-only compute features for core playback.
- **Blender → GLB:** rigged characters, source poses, and imported/baked clips.
- **Versioned JSON:** editable actions, phases, control maps, events, and revision proposals.
- **Future game runtime:** TypeScript input commands, fixed-step simulation, character state transitions, and collision handling. Choose a physics library when gameplay requirements justify it.

This is a project choice, not identification of the reference engine. A browser-first platform lets desktop and phone use the same runtime and makes the editor's preview closely match the eventual game. Native packaging and store distribution can be considered later.

Three.js documents automatic WebGL2 fallback, and also describes WebGPURenderer as experimental. Verify the chosen materials, skeletal animation, and shadows on both backends before relying on them. Source: [renderer guide](https://threejs.org/manual/pages/webgpurenderer).

Suggested future organization:

```text
editor/              panels, timeline, inspector, LLM revisions
runtime/             asset loading, rig adapter, action evaluator, playback
runtime/schema/      character, action, event, and revision contracts
game/                input, simulation, character controller, game scenes
assets/characters/   public GLB files and manifests
source/              Blender source and preparation scripts
```

These folders are proposed and have not been created. Keep the existing watch and jelly demos available.

## Character selection

Recommended first candidate: [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html). The creator lists humanoid rigs, animation-friendly topology, glTF/FBX exports, compatibility with the Universal Animation Library, CC0 licensing, and an average of about 13,000 triangles. A superhero-proportion base is a plausible starting point for readable jump and combat poses.

Use [Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) for baseline action candidates. The creator lists 120+ animations and CC0 licensing. [Library 2](https://quaternius.com/packs/universalanimationlibrary2.html) adds combat and parkour candidates. Neither library should be assumed to contain the exact stylized leap in the reference.

The pages distinguish free and paid Source tiers; `.blend` source is advertised in the Source tier. CC0 rights and free download availability are separate questions. Inspect the free archive, included license, model, skeleton, and clip list before selecting a file. Do not assume all advertised animations or editable Blender sources are included for free. Importing a permitted glTF/FBX into Blender can provide an editable project even when an original `.blend` is unavailable.

If the candidate fails the asset check, create an original simple humanoid in Blender with our own rig. A static prop, an unrigged AI mesh, or a disconnected mannequin can test layout but cannot validate skeletal deformation and clip editing.

### Asset acceptance requirements

| Requirement | Initial contract |
| --- | --- |
| Rights | Recorded source URL and included license permitting modification and distribution |
| Format | Self-contained GLB for runtime; editable Blender project for our modifications |
| Skeleton | Stable bone IDs/names; root, pelvis, torso, head, arms, hands, legs, and feet |
| Rig mapping | Explicit mapping from editor controls to the selected skeleton; no automatic arbitrary-rig promise |
| Coordinates | Runtime uses meters and Y-up; preparation records forward direction and ground origin |
| Deformation | Shoulder, elbow, hip, and knee bends checked at extreme jump poses |
| Materials | Small material set and portable glTF materials; baked replacements for Blender-only shaders |
| Initial budget | Aim for at most 20k triangles, 64 deform bones, and a small texture set per character; these are project targets, not platform limits |
| Instance safety | Two independently animated clones can share mesh resources without sharing mutable skeleton state |

Use a skeleton-aware clone for comparison instances. Treat importing clips and compiling editor poses as separate operations. Blender constraints need baking or a separately implemented browser control solver.

## Actions and their runtime contract

### Editor milestone

Implement **idle/guard and jump** first. The jump includes coil, rise, hang, follow, settle, recover, and guard, plus optional launch and impact events. A second simple action later proves the schema supports more than jumps.

### Future game action set

| Action | Required behavior |
| --- | --- |
| Idle/guard | Stable looping pose and transition target |
| Locomotion | Start/stop, facing, speed-driven walk/run; directional variants later |
| Jump/leap | Anticipation, launch, apex, descent, landing, recovery |
| Stomp | Windup, strike/impact marker, follow-through, recovery |
| Wall ability | Windup, spawn marker, recovery; wall object belongs to the game |
| Hit reaction | Reaction and return to control |
| Defeat | Non-looping terminal action, if the game needs it |

The stomp, wall, hit, and defeat requirements are proposed for our future runtime. The video alone does not show their complete behavior.

Each action needs:

- Stable action and rig IDs, schema version, revision ID, duration, and loop policy.
- Named phases with editable durations, intent captions, and pose references.
- Root-position and joint-rotation tracks; interpolation settings and validated control ranges.
- Event markers such as takeoff, impact, foot contact, and ability spawn.
- Transition metadata: entry/exit poses, blend duration, and interruptible intervals.
- An explicit root-motion policy and ground-contact assumptions.

For initial gameplay, the character controller should own world position and facing. The action supplies local pose and a visual jump-height track. Avoid applying the same movement in both the clip and controller. If physical jumping is added, let simulation own height and use explicit phase synchronization rather than stacking a second height curve on it.

Preview event markers in the editor. The game consumes them to trigger effects or gameplay. Pose sampling during scrubbing must not apply damage or spawn game objects. Event delivery during forward playback must track crossed timestamps, loops, and resets to avoid duplicates.

## LLM editing requirements

Give the LLM the action schema, current revision, permitted rig controls, phase intents, and selected request. It returns a typed proposal, not executable JavaScript. Reject unknown controls, out-of-range values, inconsistent timing, and stale revisions.

Keep the previous action as an immutable reference. Compile the candidate and sample it with the same evaluator the game uses. Compare both at the same absolute time, with optional phase-relative alignment when durations differ. Accept, undo, or discard a proposal as a revision.

Imported baked clips alone are insufficient for semantic editing. The editor must retain phase metadata and editable pose/control data, or establish an explicit mapping to editable clip tracks. GLB supplies the character and baseline clips; action JSON supplies editor semantics.

## Mobile requirements

- Browser play on desktop and phones; test actual iPhone and Android devices before claiming support.
- HTTPS for network previews, preserving our existing secure local-preview setup.
- Future game: landscape layout, joystick and action buttons, simultaneous movement/action touch handling, safe-area spacing, and correct cancel/release handling.
- Editor: desktop-focused editing, phone playback/review with collapsible panels and large transport controls.
- Pause safely on visibility loss; prevent stuck input after a touch cancellation or tab switch.
- Start with a 30 fps mobile target and 60 fps desktop target. Cap render resolution, reduce shadow cost, and measure on named test devices. Targets are not verified results.
- Test WebGPU and forced WebGL2, clip seeking, memory use, resizing, and two-character comparison.

## Editor-first implementation sequence

1. **Asset gate:** obtain a permitted humanoid, inspect its skeleton and clips, and prepare one known GLB plus manifest. Verify animated import in the browser.
2. **Editor shell:** reference-inspired dark layout, central model, cameras, transport, and named phase strip. Show idle and jump. This is the first user-visible build.
3. **Shared action core:** deterministic absolute-time sampling, editable phase timing, pose controls, event preview, save/load, and independent A/B instances.
4. **LLM revision path:** validate imported proposals first, then connect a provider through a server endpoint. Verify accepted edits replay identically after reload.
5. **Runtime reuse proof:** a small test stage loads the exported action without editor code and plays it through the same evaluator. It is an integration check, not the complete game.
6. **Later game:** touch input, controller, action transitions, arena, and effects using the validated assets and actions.

Do not implement the full arena before the editor. The first build succeeds when a real rigged model plays/replays, scrubbing restores the correct pose, changing hang duration changes the action predictably, and the reference remains unchanged.

## Remaining unknowns

The reference engine and exact model are unverified. Our free candidate's actual archive, bone structure, and clip availability still need inspection. LLM provider, game mechanics, physics, multiplayer, and native distribution are not selected. None of these prevents the editor asset and playback milestone.

## Character-feel reference update

The user supplied the creator's description, a control-scheme screenshot, and a roughly 4.46-second video. The description identifies Brawl Stars, Avatar, and Street Fighter as inspirations, with knocking opponents off an edge as a probable objective. It leaves 1v1 versus 3v3 undecided. Treat this as reference context, not a decision to reproduce that game or its characters.

The screenshot describes these input variants:

| Input/context | Reference behavior |
| --- | --- |
| Stick | Heavy walk; one foot always down |
| Stick while holding a growing wall | Tear the wall free |
| A tap | Stomp a stone out of the floor |
| A hold | Continue drawing stones into orbit |
| A with stones | Tap to sling; hold for a volley |
| B tap | Plate |
| B hold | Barrier |
| B hold while planted | Rampart → bastion → tower |
| B near a wall | Strike with it: shove, slide, topple |
| Leap | A separate super with a cooldown |

The text says two action buttons, while the screenshot includes an additional leap/super control. Keep two primary buttons and an optional super command in the schema; do not assume an A+B chord triggers leap. The exact combination rules are not fully supplied.

Sampled video frames show three labelled variants together: tap B/plate, hold B/barrier, and hold B while planted/rampart. Labels describe subsequent firing, shoving, or toppling. This shows why a fixed one-shot clip is insufficient for some abilities: their motion branches with held input and context.

### Editor requirements for character feel

Offer two modes in the same workspace:

1. **Timeline mode:** deterministic clip replay, scrubbing, phase timing, pose edits, and A/B comparison.
2. **Input test mode:** a small neutral floor, virtual stick/A/B controls plus keyboard equivalents, one controllable character, and an optional dummy/prop. Use the shared runtime to test press, hold, release, turning, and action transitions. This is a character test area; a full arena is deferred.

Character feel combines animation with movement, input handling, and feedback. Provide separate editable groups rather than treating every change as a pose edit:

- **Motion:** anticipation, extension, follow-through, recovery, silhouette, planted feet, and arm/body overlap.
- **Response:** input buffering, tap/hold threshold, release behavior, allowed interruption, and transition blends.
- **Movement:** acceleration, braking, turning, movement allowed during an action, and controller-owned displacement.
- **Feedback:** event-aligned sound/effect cues, optional camera impulse and brief visual impact pause. Keep cue preview separate from gameplay consequences.

Start with jump playback and heavy walk/guard as a foundation. Add a simple press → hold → release action before complex stone or wall abilities. Actual 1v1/3v3 rules and multiplayer are unnecessary for this test area.

### Branching actions

Extend action data with explicit states and transitions, for example:

```text
idle → windup → held loop → release → recovery → idle
                    └── movement/context → alternate release
```

A held loop lasts until input or state changes; it must not be encoded only as a fixed phase duration. Charge level can select a pose/loop variant and release branch. The input resolver emits abstract commands; the state machine selects an action; the animation evaluator samples its pose. The future game owns stones, walls, collision, and knockback.

Record input commands, timestamps, initial state, and any simulation seed as a replay scenario. Reuse the same scenario for revision comparisons. Show input time, visible motion onset, contact/release events, and return-to-control time on diagnostic tracks. Replay the complete input/state sequence to seek in this mode; direct clip seeking alone cannot reconstruct spawned props or branch history.

LLM revisions may edit validated animation controls, state timing, movement parameters, and preview cue parameters. Display those categories in the revision diff. They cannot invent unsupported ability operations or modify executable runtime code. Judge changes through both repeatable replay and hands-on input tests; a motion graph does not establish whether a character feels satisfying.
