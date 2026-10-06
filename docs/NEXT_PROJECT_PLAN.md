# Next project proposal: Harbor Run

> Historical plan or milestone report. Some features described as future work are now implemented. See [Current state](CURRENT_STATE.md) for the current codebase.

Prepared: 3 October 2026. Status: proposed plan; implementation has not started.

Reference: [Building games with Astra](https://developers.openai.com/blog/how-to-build-games-with-astra), Thomas Ricouard, OpenAI Developers, 4 September 2026.

## Direction

Build a small browser boat game. Sail through three checkpoints in a sheltered island harbor, then return to the dock. Aim for a satisfying two-minute trip. The boat should steer clearly, move with the sea, and leave a visible wake.

This is an original project proposal. It uses the article's development approach; it does not copy Sunwake or its assets. Space exploration is an alternative if that theme is preferred.

### What we take from the guide

Define the player experience first. Establish visual references. Build a small playable version. Keep simulation separate from rendering. Give development tools repeatable scenes, useful state, and performance counters. Test journeys through real controls. Review appearance and control feel after each stage. The article also demonstrates connecting a procedural environment to a Blender vehicle through a shared simulation.

### Why this fits our work

Citrus Jelly gave us experience with responsive physical motion. SECOND gave us a verified Blender-to-GLB pipeline, Three.js rendering, selectable model parts, saved preferences, and a local HTTPS preview. Harbor Run adds player movement, camera tracking, collision handling, objectives, sound, and a complete game loop.

Reuse the practices and server setup. Create new game code and assets in `harbor/`. Keep the jelly and watch demos available.

## First release

### Player journey

1. Open the game and see the boat at the dock.
2. Choose Play. The camera settles behind the boat.
3. Accelerate and steer to checkpoint 1, then 2, then 3.
4. Follow a clear dock marker back to the start.
5. Slow down and remain within the docking area for one second.
6. See the trip time and best time. Choose Replay or Free sail.

The timer starts when the boat leaves the starting area. It stops after a successful return. A collision slows the boat but does not end the trip. A Reset boat control returns a stranded boat to the most recent safe position and adds a visible time penalty.

### Controls

| Platform | Controls |
| --- | --- |
| Desktop | W / Up: accelerate. S / Down: brake and reverse. A/D or Left/Right: steer. Escape: pause. R: reset boat. |
| iPhone | Large left/right steering buttons and a throttle/brake control. Separate Pause and Reset buttons. |
| Both | Chase camera by default. An optional wider camera improves visibility. No drag-to-orbit during a timed run. |

Touch controls must work with two fingers. Release or cancel must clear held input. The game pauses when the tab is hidden; resuming must not advance the boat or timer by the hidden duration.

### Visual direction

A small orange launch, brushed metal details, pale islands, blue-green water, and warm morning light. Use clear silhouettes and restrained interface elements. The next checkpoint must remain easy to identify against reflections and foam.

Prepare front, side, and rear boat references before detailed modeling. The first review should cover the boat's silhouette, camera composition, and water colors. Concept images are an optional later deliverable, not generated as part of this planning step.

### Scope boundary

The first release has one boat, one fixed harbor, one route, a timer, a results screen, and free sailing. Weather is a single preset. There are no accounts, multiplayer systems, terrain streaming, open oceans, boat upgrades, or paid generation services in the initial scope.

## Technical proposal

| Part | Proposed implementation |
| --- | --- |
| Project | TypeScript and Vite in an isolated `harbor/` project. Build static output for the existing demo server. |
| Rendering | Reuse the installed Three.js version initially. WebGPURenderer, with a verified WebGL2 fallback. |
| Boat | A small original Blender model, saved as editable `.blend` and exported as one self-contained GLB. A suitable CC0 model can be substituted after inspecting its license and structure. |
| Water | A bounded mesh with three directional wave components. Use shared parameters and simulation time for the visible surface and boat sampling. Prototype with simple sine waves before adding complexity. |
| Boat motion | Fixed 1/60-second simulation. Sample water at four hull points; damp height, pitch, and roll. Horizontal motion uses thrust, drag, speed-sensitive steering, and a speed limit. |
| Environment | A fixed harbor with simple islands, dock geometry, buoys, and repeated props. Use inexpensive explicit collision shapes. |
| Wake | A capped pool of wake strips and spray particles. The wake is a visual effect in version one. |
| UI | HTML controls and status text, separate from scene rendering. Large touch targets, keyboard focus, mute control, and optional reduced motion. |
| Audio | Generated or properly licensed engine/water sounds. Start audio only after Play. Keep the game usable when muted. |
| Save | Store best time and preferences locally. Validate stored values and recover from missing or malformed data. |

Proposed modules: `input`, `simulation`, `waves`, `boat`, `camera`, `harbor`, `checkpoints`, `audio`, `ui`, and `diagnostics`.

The state flow is `menu → playing → results`. Pause stores the previous state. Free sail uses the same boat simulation without the route timer.

A full rigid-body engine is unnecessary for the first version. Reconsider one if hull collisions, complex terrain, or additional moving bodies exceed the simple model's limits. Web Workers are also conditional: add them only if measured generation work interrupts play.

## Build stages and review gates

| Stage | Work | Ready to move on when… |
| --- | --- | --- |
| 1. Playable controls | Flat sea, placeholder hull, chase camera, desktop/touch input, pause/reset. | Acceleration and steering feel clear. The camera follows without jitter. Phone input does not stick. |
| 2. Shared water motion | Waves, four-point buoyancy, damping, caps on steep pitch/roll. | A resting boat stays stable. Visible waves and hull motion agree. Reset cannot create an impulse or invalid position. |
| 3. Complete route | Three checkpoints, island/dock collision shapes, return docking, timing, replay. | One trip can be completed entirely through normal controls. Checkpoints cannot be skipped. Docking requires low speed. |
| 4. Blender and appearance | Boat references, editable model, GLB, materials, water look, wake, lighting. | The boat reads clearly from the chase camera. Wake follows the traveled path. The model does not exceed its agreed rendering budget. |
| 5. Phone and delivery | Quality presets, sound, saved preferences, HTTPS routes, performance checks. | A physical iPhone run succeeds. Replay works repeatedly. Both render backends load. Source files remain private. |

Each stage produces something playable and a short record of what changed, how it was checked, and what still needs review. Fix control and simulation problems before expanding the harbor.

## Verification and budgets

Named development scenes: `dock`, `calm-water`, `wave-test`, `island-contact`, and `return-dock`. These help reproduce problems; a full journey test must still drive the game through actual controls.

Expose development diagnostics for boat position/speed, simulation time, input state, active checkpoint, collision/reset count, render backend, draw calls, triangles, and frame intervals. Also show a compact DOM summary so browser inspection does not depend on access to internal JavaScript globals.

Automated checks:

- Wave samples are repeatable and agree across their CPU/render representations within a defined tolerance.
- Fixed-step movement remains stable across different render frame rates and long frame interruptions.
- Buoyancy settles instead of gaining energy without input.
- Checkpoints require the correct order; crossing checks use the traveled segment so fast movement cannot miss them.
- Docking requires all checkpoints, low speed, and the specified dwell time.
- Pause, visibility changes, restart, and touch cancellation clear or preserve the appropriate state.
- Results and saved preferences recover safely from invalid data.

Browser checks cover the actual start-to-finish journey, checkpoint feedback, collisions, recovery, pause/resume, replay, both rendering backends, and mobile layout. Run a physical iPhone test separately.

Provisional targets, to be measured rather than promised:

- First playable download: under 10 MB including the boat.
- Boat: approximately 10,000 triangles and a small material set.
- Main game view: initially below 100 draw calls.
- Mac Chrome: aim for 60 fps. iPhone: aim for stable 30 fps or better.
- Report frame-time percentiles on the actual test devices. Software-rendered browser timings are not hardware GPU benchmarks.

Quality settings can lower water mesh detail, wake/spray count, scene render resolution, and optional effects. Keep the HTML interface sharp. If an expensive effect contributes little at phone size, omit it from the mobile preset.

## Risks and responses

- **Boat feels like it slides:** tune thrust, drag, steering, and camera together in stage 1.
- **Water and hull disagree:** share wave parameters and simulation time; do not create independent wave systems.
- **Wave motion makes navigation uncomfortable:** cap roll/pitch and offer a steadier camera and calmer preset.
- **An attractive model is expensive:** inspect GLB draw calls/materials and keep decorative details in textures where possible.
- **Touch controls hide the route:** test on a real phone early; reserve clear regions for controls and checkpoint guidance.
- **Scope grows into an ocean simulator:** use the fixed harbor and complete one reliable route first.

## Ready-to-use implementation brief

Build Harbor Run in `harbor/`: a small browser boat game with a two-minute route through three ordered checkpoints and a low-speed return to the dock. Start with the playable controls, a flat sea, a placeholder boat, and a chase camera. Support keyboard and two-finger iPhone controls. Add fixed-step simulation and explicit pause/reset behavior. Then connect a shared wave model to the visible water and four-point boat buoyancy. Complete the game loop before polishing the Blender boat, materials, wakes, and audio. Keep simulation, rendering, input, and UI in separate modules. Add repeatable test scenes, DOM-readable diagnostics, meaningful automated checks, and a real-control journey test. Use Three.js with WebGPU and WebGL2 fallback. Preserve the existing jelly and watch demos. Deliver editable Blender source, GLB, a static browser build, test results, and an HTTPS preview through the existing explicit demo routes. Treat the performance targets in this plan as budgets to validate on Mac and iPhone. No paid service or runtime AI integration is required by this brief.

## Decision before implementation

Confirm the theme by selecting Harbor Run or replacing it with a small space-landing game. If space is chosen, begin with one planet and one landing site, then demonstrate takeoff, flight, landing, and return. Revisit the architecture for that choice; large-scale coordinates and streamed terrain are outside the harbor plan.
