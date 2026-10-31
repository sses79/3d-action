# Animation Studio — spec

Written 2026-10-31 from the code, the plans in `docs/` and the work so far. It follows the shape of Matt Pocock's `to-spec` skill
(problem, solution, user stories, implementation decisions, testing decisions, out of scope) once for the whole Studio and then once
per part: **Movement**, **Clay**, **Depth** and **Scene**. It says what the Studio is for and what each part must do, so that work
can be planned against it, in tickets or by hand, the way `implement-spec` expects. It names modules and operations, not files:
those change. Plans in `docs/` keep the measurements and history; this spec does not repeat them.

Status words used below: **built** (in the service and used), **partly built**, **planned** (agreed with Tim, not built),
**open** (not decided).

---

## 0. The whole Studio

### Problem Statement

Tim makes short videos with video models (Seedance, Jimeng and others). A video model given only a prompt invents the blocking,
the camera and the motion, and it gets them wrong: people stand in the wrong places, actions become poses, cuts land at the wrong
time. He needs a control signal for each shot that says where the people are, how they move and where the camera is, made quickly,
from either a piece of footage or a written scene, and in a form he owns and can sell or deliver.

### Solution

Animation Studio is a local service on Tim's Mac (with a second Mac, mini4, for heavy models) that turns footage or a written scene
into 3D figures acting in a 3D room, seen through cameras with cuts, and renders that as reference packages for a video model. It
is driven by LLM agents through MCP, a CLI or HTTP, and by people through four pages. It has four parts:

1. **Movement**: a library of reusable 3D movements on one skeleton, from free packs, Mixamo and video, joined into actions.
2. **Clay**: two or more plain-shape figures performing in a room of plain objects with the source camera, rendered as clay and
   depth videos with a meta file (the reference package for a video model).
3. **Depth**: a library of tinted depth clips cut from footage, with keyframes, beats and prompts, delivered as packages to other
   projects by a service that stays up.
4. **Scene**: our own performances of our own texts (Macbeth, our plays) staged from a measured scene, with our characters and set,
   shown to viewers and delivered as owned output.

### User Stories

1. As Tim, I want one service that stays up and restarts itself, so that agents can use the Studio without me starting it.
2. As Tim, I want every operation available to MCP, the CLI and HTTP with the same schema, so that any agent can drive it.
3. As an agent, I want to read the operations and their limits from the service, so that I don't guess what is allowed.
4. As an agent, I want long operations to come back as a job I can read later, so that a 10-minute build does not time out my call.
5. As an agent, I want jobs kept on disk, so that a restart does not lose them.
6. As an agent, I want every write to name the revision it expects, so that two agents cannot overwrite each other's work silently.
7. As Tim, I want every stored thing to keep its revision history, so that I can go back when a change makes it worse.
8. As Tim, I want the service to tell me when it is running old code, so that I know a restart is needed.
9. As Tim, I want the heavy models (3D body, depth, people search, point tracks) to run on mini4 when it answers, so that jobs take
   half the time, and on this Mac when it does not.
10. As Tim, I want one skeleton for everything (the Studio mannequin's 65 joints), so that any movement plays on any of our bodies.
11. As Tim, I want third-party footage, frames and downloaded animation files kept out of the public repo, so that the repo holds
    only what we may publish.
12. As Tim, I want measured checks (foot slide, floor contact, fit in pixels, parts inside each other) written next to each result,
    so that I can judge it without watching every frame.
13. As Tim, I want checks described as what they measured and no more, so that "supported" never reads as "physically correct".
14. As Tim, I want to rate results and leave timed notes, so that the next session works on what I said is wrong and leaves alone
    what I approved.
15. As Tim, I want speed first when choosing how to make a reference, with slower methods kept as options.
16. As a session that takes over the work, I want a short current-state page and an append-only log, so that I can continue without
    re-deriving what was decided.

### Implementation Decisions

- **One service, one operation table.** The service owns all state; MCP, the CLI and HTTP are thin adapters over the same
  operation table, which also publishes each operation's schema. 75 operations today. Pages call the same service.
- **Bundled core.** The operations and the shared runtime (player, action schema, compiler, retargeting) are compiled into one
  bundle the service runs; changing them needs a rebuild and a restart, which the deploy command does. Python stages and the
  render's browser code are loaded per run.
- **State.** A small project index plus content-addressed bodies (one immutable file per unique action body), with sidecars for
  preview, reviews and runs; the depth library, jobs, intake ledger, scenes and plays have their own folders. All of it is outside
  git; the only undo is the revision history. Nobody edits it by hand.
- **Revisions.** Every write takes the expected revision and, where it depends on other entries, their revisions too; a stale one is
  refused. Evidence pins the revisions and hashes it was measured on and goes stale when they change.
- **Jobs.** A call that runs past 240 s, or is sent async, becomes a job on disk with states queued, running (with its step),
  needs_input (with what is needed), done and failed.
- **Workers.** A stage that has a mini4 runner tries mini4 first and falls back to this Mac; each run records where it ran and how
  long it took.
- **Models.** SAM 3D Body for bodies from video, Depth Anything 3 for depth, SAM 3 for missed people, YOLO pose and BoT-SORT for
  tracking, ARROW for point tracks (non-commercial: internal only), a vision LLM through OpenRouter for judgement steps. The
  OpenRouter key is read from a file outside the repo.
- **Skeleton.** `quaternius-ual1`, 65 joints. Bodies on the same skeleton play directly; other skeletons follow it joint by joint
  through a registered bone map.
- **Pages.** Studio (movements and actions), Clay (pair scenes and reference packages), Depth (the depth library and packages) and
  Scenes (performances, for viewers).
- **Licences.** CC0 packs (Quaternius) may be shipped; Mixamo animations may be used in our output but the files stay local;
  third-party footage is only measured, and pictures made from its pixels never leave the internal package.

### Testing Decisions

- **One seam: the operation table.** A good test calls an operation the way an agent does (by name, with arguments, against a
  service on a temporary state folder) and checks what comes back and what a later read returns. It does not reach into the
  compiler or the store. The existing service tests are the prior art; they run in about 15 s.
- **A second seam for pictures: the rendered result's numbers.** Renders write their measurements beside the video (feet per frame,
  fit per keyframe, checks per role). A test of a render asserts on those numbers, not on pixels.
- Python stages are tested through the operation that runs them, with small fixtures, and on 2–3 real clips by hand; a full catalog
  rebuild runs only when Tim asks.
- Type checks for the pages and the runtime run with the tests.

### Out of Scope

- A game engine, controllers, collision or multiplayer. Actions can be played by a game later through the shared player.
- Accounts, billing and hosting for other people (planned only as far as keeping the Scenes page apart from producer pages).
- Physical simulation of contact or balance.
- Training our own models.

### Further Notes

- The project's history is in the plans named in `CLAUDE.md`; this spec replaces none of them.
- Open across parts: who may see which page once the Scenes page is public; Meshy or another generator for our own characters; the
  image model for keyframes.

---

## 1. Movement

### Problem Statement

Every other part needs believable motion on one skeleton: walking to a chair, sitting down, turning, a kick, a dance step, a fight
exchange. Free packs and Mixamo have clean, generic moves; footage has the exact move a scene needs but comes out noisy. Joining
moves by hand shows seams: feet slide, steps restart on the wrong foot, a body snaps from one pose to the next.

### Solution

A movement library: every movement is an action on the Studio skeleton with its source, licence, measured profile (start and end
pose, support, travel, pace) and reviews. Movements come from free packs, Mixamo (retargeted in Blender) and video (reconstructed
with SAM 3D Body). An LLM picks movements, the compiler joins them with explicit connections into baked actions, and measured
checks and reviews say how good each join is.

### User Stories

1. As an agent, I want to list movements with what they are for, so that I can pick one for a beat without loading every action.
2. As an agent, I want each movement's start and end pose, support and travel measured, so that I can pick ones that join.
3. As an agent, I want ranked connections between two movements, so that I join them where they meet best.
4. As an agent, I want to find a common window of motion in two movements, so that I can cut a join where they agree.
5. As an agent, I want to compose movements into an action from a typed spec with pinned revisions, so that the same spec always
   compiles to the same action.
6. As an agent, I want a check run that compiles without writing, so that I can try a spec before committing it.
7. As an agent, I want to change only the timing of a composed action, so that I keep its sources and modes.
8. As Tim, I want joins that blend position and turning speed, and carry root travel on, so that a join does not snap.
9. As Tim, I want a movement cut from a longer one (a steady walk from a start-walking clip), so that a loop has the pace and gait
   of the clips around it.
10. As Tim, I want a cut loop to start where its source's travel starts, so that a walk in place is not held off its path.
11. As Tim, I want Mixamo animations retargeted onto our skeleton and registered with their source, so that we have the moves
    footage lacks (start, stop, turns, sit and stand, door, punches).
12. As Tim, I want the Studio's own walk cycle as a library movement with its joint tracks, so that its steps can be matched at joins.
13. As Tim, I want a movement's pace measured from its feet when it walks on the spot, so that a walk covers ground at its own speed.
14. As an agent, I want to reconstruct a move from a video window, so that a scene can use the exact move the footage shows.
15. As an agent, I want the reconstruction to report parts inside each other, crossings and joints past normal ranges, so that I
    know what to correct.
16. As an agent, I want bounded corrections (a kick's height, a turn, a hold), so that I fix a draft without inventing joint angles.
17. As Tim, I want two performers in one video reconstructed into two actions in one shared space, so that pairs can dance or fight.
18. As Tim, I want hand holds and contacts between two performers kept, so that a held hand stays held.
19. As Tim, I want foot contacts in a source reviewed and stored as source facts, so that a join may rely on them.
20. As Tim, I want rated reconstructions left alone and only the ones with my notes rebuilt, so that good work is not lost.
21. As Tim, I want movements archived, not deleted, so that I can bring one back.
22. As an agent, I want each prompt-to-action run logged with its timings, so that slow steps can be found.

### Implementation Decisions

- **Action v2** is the one motion format: phases, joint and root tracks, cues; up to 30 s and 32 phases. A composed action is
  bounded to fewer steps and seconds; the limits are read from the service, not assumed.
- **Movement registry** holds the action, metadata (source, travel `in-place` or `source`, support, licence notes), a profile and
  reviews. Registering pins the expected revision.
- **Compiler** takes a recipe (pinned sources, ordered steps, explicit connections with duration, blend and travel modes) and bakes
  an action plus a receipt. Velocity blends and root-travel continuation are opt-in per connection; incompatible contact modes are
  refused.
- **Movement cutting** takes a window of a movement (optionally the best loop near the given times, chosen by pose distance over
  legs, arms and spine) and registers it as a new movement with its travel re-based.
- **Mixamo** comes in through a Blender retarget (both skeletons rest in a T-pose; each bone takes its source bone's world turn
  from rest; hip travel scaled by hip height) and a register step; only the plain standing turns are used, not the crouched ones.
- **Reconstruction** defaults to SAM 3D Body with joint rotations (`source: auto`, `pose: rotations`), with the older rule pipeline
  as fallback. Reconstruction rules are logged with their effect on the other clips.
- **Pairs** hold two actions, their shared space, contacts and hand holds; a pair can be built from one video or composed.
- **Reviews** are bounded and configuration-specific: a contact or seam decision applies to the exact sources and settings it was
  made on.

### Testing Decisions

- Through the operation table: register, cut, compose, revise timing, reconstruct on a fixture clip; assert on the stored action,
  its revision, the receipt and the measured profile.
- Joins are judged by measured numbers (largest frame-to-frame change of a foot's speed at the join, planted-foot slide), compared
  before and after a change on 2–3 actions, not by eye alone.
- Reconstruction changes run the clip batch in the background and record the result in the rule log; prior art is the rule log and
  the reconstruction tests.

### Out of Scope

- Text-to-motion models as a source (researched, not adopted).
- Motion matching over a large database (the library is small and curated).
- Physical balance or force.

### Further Notes

- 146 movements (35 from Mixamo) and 211 actions are in the live library today.
- Open: 51 tricking clips are still position builds (Tim: leave them unless an issue is reported); the guard-to-counter
  connection and the internal advancing-step boundary are unresolved.

---

## 2. Clay

### Problem Statement

A video model follows a reference video far better than a prompt, but footage is not ours to hand over, and a written scene has no
footage at all. Tim needs a reference made of plain shapes that keeps what matters (who stands where, how they move, where the
camera is and when it cuts) and drops everything else.

### Solution

A pair scene: two (or more) figures in plain shapes, each in its own colour, acting their actions in a room of plain objects and
props, seen through cameras that follow the source camera (turning, zooming, travelling) or are placed by hand. It renders as a clay
video, a depth video and first frames, with a meta file a prompt writer reads: the reference package. The Clay page shows exactly
what the video model will receive and lets a person edit it.

### User Stories

1. As Tim, I want a clay reference from a video of two performers, so that a video model gets their blocking without the footage.
2. As Tim, I want a clay reference from a written scene, so that I can make a reference with no footage at all.
3. As Tim, I want plain-shape coloured figures by default, so that the model reads people clearly and copies nothing of the source.
4. As Tim, I want the figures on a real floor with their feet locked when they stand, so that they do not slide.
5. As Tim, I want the source camera tracked with its zoom, so that the reference frames the people as the shot did.
6. As Tim, I want a stage of plain objects measured from the video (walls, arches, a pit), so that the room is in the right place.
7. As Tim, I want props (a cup handed over, a ball thrown, a thing put down and picked up), so that an action with an object reads.
8. As Tim, I want a scene told in cuts drawn shot by shot from each camera, with the people in one room across every cut, so that a
   dialogue scene keeps its geography.
9. As Tim, I want people seen only waist-up drawn as upper bodies on a tapered column, so that no leg motion is invented.
10. As Tim, I want seated people drawn with legs, solved to the floor at their own ankle height, so that they sit on a chair.
11. As Tim, I want several players, a ball and a known court for a sport clip, so that a team play becomes a reference.
12. As Tim, I want the package to follow Seedance 2.5's guide for 3D references, so that the model treats it as intended.
13. As Tim, I want the Clay page to show the package, play it, and let me drag cameras and figures, so that I can fix it by hand.
14. As an agent, I want to stage a written scene from beats (who, where, when, which movement), so that I can produce a package
    without the page.
15. As an agent, I want each LLM choice in the blocking marked as a choice, so that Tim can see what the text did not say.
16. As an agent, I want the package exported to a folder with the meta file, so that a prompt writer can use it.
17. As Tim, I want a Blender renderer as an option, so that a nicer look is possible when speed matters less.

### Implementation Decisions

- **Pair scene** is the shared model for staged and video scenes: figures (action segments with places, turns, speed, offset, loop,
  hip pins, seat heights), plain stage objects (box, cylinder, arch, wedge), props, cameras per shot with cuts.
- **Shots scene** extends it for scenes in cuts: each shot has its own camera and the segments each person plays in it; a segment
  may be a build from footage or a library movement.
- **Clay view** is one renderer used by the page and the export alike, so what the page shows is what is exported. It owns the
  figure rules: feet to the floor and held planted feet for library movements, a walk moved along its path by its planted foot,
  seated legs solved hip-knee-ankle to the body's own ankle height, seat height, and inertialization at joins within a shot (not at
  cuts).
- **Export** writes the clay video, depth video, first frames and the meta file; with `feet` the render also writes per-frame feet
  and the body's sole heights.
- **Staging** takes a scene text, has the LLM write a blocking spec (marks, beats, movements, objects) and compiles it with the
  movement library into a pair scene.
- **Characters** are registered bodies; the plain-shape figure is the default for references.

### Testing Decisions

- Through the operation table: set a pair or shots scene with a stale revision (refused) and a current one (stored); render with
  `feet` and assert on the feet file (no planted ball sliding more than a set limit, no frame below the floor beyond 1 cm).
- The page's type check and a smoke load of each page.
- Prior art: the pair and reference export tests, and the feet check that performances already write.

### Out of Scope

- Faces and expressions (the video model supplies them).
- Lip sync.
- Physics for props beyond a planned path.

### Further Notes

- Decided (Tim, 2026-10-18): for footage, tinted depth won the A/B; clay is used when there is no footage.
- Open: the multi-person sport path is built on one compilation's plays with scratch steps; it is not yet a service operation.

---

## 3. Depth

### Problem Statement

For a scene with footage, the tinted depth of the real shot is the best control signal, but making one took a person and an agent
fifteen calls and throwaway scripts, and other projects (s-video, Tim's own agents) could not ask for one themselves. Packages also
failed in known ways: actions turned into poses, a keyframe taken at the wrong moment, durations that disagreed, short shots that
lost their beat.

### Solution

A depth library and a depth service. Source videos are taken in, cut into shots, and the shots that need a control signal become
clips: a tinted depth video (white near, each person one colour), keyframes, beats, a summary and labels. A caller hands in footage
and a scene and gets a package (depth video, keyframes with image prompts, a video prompt, contact cards) delivered to its project
folder, with gates that stop bad keyframes before a video is made. The Depth page shows the library and lets a person fix clips.

### User Stories

1. As an agent, I want to hand in a video and a scene in one call and get a package, so that I do not chain fifteen calls.
2. As an agent, I want the job to stop with `needs_input` and say what it needs, so that I can answer and let it continue.
3. As an agent, I want the package delivered to my project folder in the V.8 format, so that my pipeline reads it as is.
4. As an agent, I want to find clips by a beat in words ("a man walks round a bier, the camera following"), so that I can reuse one.
5. As an agent, I want each package to have a revision, so that two agents cannot overwrite it.
6. As Tim, I want downloads from smovie with `purpose: depth` taken into the library by themselves, so that I do not import by hand.
7. As Tim, I want a video cut into shots and each shot marked as needing control or not, so that only those shots get depth.
8. As Tim, I want each person tinted in their own colour through the clip, people missed by the detector found by SAM 3, and
   people followed by point tracks where boxes fail, so that the tint does not jump between people.
9. As Tim, I want to draw boxes and rename people on the page, so that I can fix a clip in a minute.
10. As Tim, I want the package to start from beats (actor, verb, target, contact, change), so that the video model is told what changes.
11. As Tim, I want the guide's duration to equal the output's, shots of at least 1.5 s, and one keyframe per beat at its clearest
    moment, so that the failures of the V.8 test do not repeat.
12. As Tim, I want contact cards for each touch (whose hand, where), so that hand ownership survives into the video.
13. As Tim, I want a keyframe gate that checks a generated keyframe against the layout, so that a wrong keyframe is refused.
14. As Tim, I want to review a generated video against the package and record a verdict, so that results rank the clips.
15. As Tim, I want stars and a status for each package, so that the best ones are found first.
16. As Tim, I want a continuation package from a previous take's last frame, so that a long scene is made in parts.
17. As Tim, I want a 3D scene built from a clip (people placed and posed at the keyframes, one camera per shot), so that a clip can
    be re-shot, recast and restaged from our own 3D.
18. As Tim, I want the 3D scene's fit and check sheet shown on the page, so that I see where it is off.

### Implementation Decisions

- **Clip entry**: source (file name, hash, window), shots, people (role letters, colours, descriptions; no actor names), speech
  windows, keyframes, summary, labels, measured numbers, build record and review state. Footage and pictures from it stay in the
  library folder, outside git.
- **Service contract**: `make_depth_reference` (footage, scene, optional beats, cast, style, duration, lead frame, deliver-to) →
  job → `get_depth_job` → `deliver_depth_package`; the steps underneath remain separate operations for agents that need them.
- **Package rules**: beats first; guide duration equals output duration; shots at least 1.5 s; one keyframe per beat; contact
  cards; a keyframe gate before any video; a result review after.
- **3D scene from a clip**: SAM 3D Body at each keyframe per named person; one room fitted so each person lands on their own points
  in every keyframe (error in pixels over box height, Levenberg-Marquardt, two stages); coarse builds per shot for people seen
  whole; written as a shots scene; rendered with a check sheet of source against scene.
- **Intake** from smovie keeps a ledger so a download is taken once.
- **Ranking** by recorded results.

### Testing Decisions

- Through the operation table on a short fixture clip: ingest, build, fix, beats, cut plan, keyframes, package, deliver; assert on
  the package files and revision, the job states, and that a stale revision is refused.
- The keyframe gate and the 3D scene fit are judged by their numbers (people's boxes and joints against the render; fit in pixels per
  keyframe) on 2–3 clips.
- Prior art: the service tests for jobs and revisions.

### Out of Scope

- A shared library of third-party film for other people; callers bring their own footage.
- Generating the video itself (the caller's video model does that).
- Rented machines.

### Further Notes

- 204 clips in the library today; mini4 runs depth, the people search and point tracks.
- Open: the result-review helper is built but used on few takes, so ranking has little data.

---

## 4. Scene

### Problem Statement

A reference made from a film is the film's blocking and the film's moments; its keyframe stills are the film's pixels. To deliver or
sell a scene, Tim needs one that is ours: performing our own text (Macbeth, public domain, or our plays), with our characters, our
set and keyframes rendered from our 3D, and that a viewer can watch and judge at a glance.

### Solution

A performance: a measured scene (from the 3D scene of a depth clip) re-staged to perform a text of ours. A performance spec names the
scene it comes from, the roles and their characters, the shots in our order and lengths, what each person plays in each shot
(builds from the footage, or library moves such as walking in, sitting down, standing up and walking out), the set and the lines with
their times. One command writes it as a scene, renders it, burns in the lines, and writes keyframes and checks. The Scenes page shows
performances to viewers; the owned package carries only what is ours.

### User Stories

1. As Tim, I want a scene performed as Macbeth 1.7, so that a viewer sees our play, not the film it was measured from.
2. As Tim, I want cut times to follow the lines' lengths, shots cut, held or repeated, so that the timing is our text's.
3. As Tim, I want people to stand up, sit down, walk in and walk out where the text says, so that the blocking is our own.
4. As Tim, I want walking in, stopping, turning and sitting chained from library transitions with pose-matched joins, so that the
   walk to a chair is smooth.
5. As Tim, I want the walk at its own pace with steps that match the start and stop, so that the gait is not slow-motion strides.
6. As Tim, I want planted feet held and feet on the floor during library moves, so that nobody slides or floats.
7. As Tim, I want a seated person on the chair at the chair's height, so that they sit on it, not in it.
8. As Tim, I want turns only where they read as natural, so that the figures do not move like robots.
9. As Tim, I want each role's character chosen from our bodies (the Studio mannequin by default, CC0 characters, our own later),
   so that the scene looks good and is ours.
10. As Tim, I want a set from our props (chairs at the roles' seats, a candle stand, banners) kept out of the close shots, so that
    the room reads without blocking the people.
11. As Tim, I want one keyframe per line rendered from our scene, so that the package's pictures are ours.
12. As Tim, I want the feet check written with every performance, so that I can see slides and floor problems without watching.
13. As a viewer, I want a page with each performance's captioned video, its card, cast and lines that jump the video, so that I can
    watch and choose one.
14. As a viewer, I want to pick a body per role and perform again, so that I see the scene with other characters.
15. As a viewer, I want to see nothing from the source film (no footage, depth or clip IDs), so that what I see is all ours.
16. As Tim, I want a reuse card per scene (action in neutral words, measured blocking, camera grammar, what it fits and does not),
    so that someone can find the scene they need.
17. As Tim, I want camera controls in camera terms (orbit, crane, dolly, truck, pan, tilt, zoom) with keys and drag, so that I can
    reframe a shot without typing numbers.
18. As Tim, I want our own keyframe pictures generated from scene renders and checked by a gate, so that no source still is used.
19. As Tim, I want switching a role's character to refit seats, contacts and cameras by framing, so that a child in an adult's
    role still sits on a chair and fills the close-up.
20. As Tim, I want an owned package (renders, our keyframes, the card, the scene file, a provenance list) in 16:9 and 9:16, so that
    I can deliver it.
21. As Tim, I want the LLM to write the performance spec from a play and the reuse card, so that a new performance does not need me.

### Implementation Decisions

- **Performance spec** (a JSON document per play, in the repo, viewer-facing text kept apart from producer notes): source scene,
  roles (name, character, height, seat), shots (camera, seconds, note, why), per-shot play entries per role, set, lines.
- **Play steps**: a build from the footage (stretched to its shot within 0.7–1.4×, else looped), a library movement once in place,
  a walk along a path, a turn, `go` (start walking → walk → stop walking → turn on the spot → stand to sit, into the role's seat) and
  `rise` (sit to stand → turn → start walking → walk). Joins are pose-matched; the stop may stretch the walk ±10% to land on its pose.
- **Default walk**: the Studio walk cycle at 0.92 m/s between the Mixamo start, stop, turns and sit; a go or rise may name another
  walk and pace.
- **Rendering**: the Clay view's figure rules (Clay, above), the quick three.js render by default; Blender look render kept as an
  option without a page button.
- **Outputs per performance**: scene video, captioned video, one keyframe per line, a keyframe sheet, and a record with cameras,
  lines, files and the feet check per role.
- **Scenes page** serves only performance outputs and viewer text; the depth library stays on its own page.

### Testing Decisions

- Through the perform command on Macbeth 1.7 (the reference performance): it must finish, write every output, and its feet check
  must stay within limits (planted-ball slide median under 1 cm; no frame below the floor beyond 1 cm; the lowest foot during walks
  within 3 cm of the floor). A change to the figure rules is checked against these numbers before and after.
- Viewer safety: a test that the Scenes page's data has no source clip IDs, footage or depth paths.
- Prior art: the feet check in the performance record; the depth scene check sheet.

### Out of Scope

- Sound and voice (lines are captions for now).
- Accounts and a public server for the Scenes page (needed before it is public; not built).
- Faces, hair simulation and cloth.

### Further Notes

- Built: Macbeth 1.7 on clip 033 (39.8 s; walk in, sit, turns, stand and walk out), the Scenes page, CC0 characters and props, the
  Studio mannequin as a body, the feet check.
- Planned, in Tim's order (2026-10-30): reuse card and camera controls; mannequin look in 16:9 and 9:16 with bone maps for Meshy and
  Mixamo-style skeletons and the refit on switching; our keyframes with the gate; the blocking set; the owned package.
- Open: the LLM writing performance specs; seated feet keep the build's ankle angle, so toes lift up to 12 cm (hidden in Macbeth
  1.7's framing); the turn clip's pivot step slides up to 30 cm; the image model for keyframes.
