# Owned scene plan: the 3D scene as our own commercial output

Proposed 2026-10-29, decisions 2026-10-30 (end of this document), not built. Starts from `build_depth_scene` (docs/DEPTH_LIBRARY_PLAN.md, "A 3D scene from a clip"): a library clip
becomes a 3D scene of plain-shape figures, one camera per shot, matched at the clip's keyframes. Tim wants that scene to be the thing
we sell or deliver, so it has to stand on its own: described for reuse, framed by hand easily, its keyframes our own pictures rather
than frames of the film, its people good to look at, and its set our own.

What is ours and what is not. The scene's geometry, figures, cameras, renders and anything generated from those renders are made
here. What comes from the source is measured, not copied: where people stand, how they move (the builds), where the cameras were and
when the cuts fall. The tinted depth video and the keyframe source stills are pictures made from the film's pixels; they stay
internal (matching, checking) and never go into the owned package.
Beyond that, the owned scene is not the source's scene played back: its blocking and timing are changed to perform a text of ours,
a scene from Macbeth (public domain) or our own demo play (part 1b). The source gives the shape (two seated people, a wide shot then
over-the-shoulder reverses); the lines, beats, cut times, distances and who moves when come from our text. That also answers the
keyframes: they are moments of our performance, rendered from our scene, and they show a user at once what the scene looks like
when acted.

Looks Tim sent as examples (four tennis explainers, 2026-10-29, phone videos, kept only in Downloads): a smooth white faceless
mannequin with real anatomy, hands and feet, soft shadow and a glossy floor in a lit arena, glowing trails on the racket; a
muscled white mannequin with a coloured cap and shorts and labelled callouts on joints; a cartoon player next to the mannequin; an
anime-style render of the same swing. Three of them say they contain AI-generated content: the likely recipe is a 3D motion render
used as the control for an image or video model, which is what this plan builds.

## 1. A reuse card for every scene

Today a clip has a summary and beats. An owned scene needs a card that says why someone would pick it and what it can become:

- the action in neutral words, without names from the source ("two women seated side by side on a terrace; the elder talks, the
  younger listens, then answers; a quiet negotiation");
- the blocking, measured: who sits or stands, distances, facing, who moves and when (from `layout.json` and the builds);
- the camera grammar: shot list with sizes and kinds (wide establishing, over-the-shoulder, reverse single), cut times, lens;
- what it is good for: kinds of scenes it fits (confession, interview, deal at a table, parent and child), roles in general terms,
  mood; and what it is not good for (no walking, no contact, heads only in shots 5-7);
- quality, measured: fit in pixels at the keyframes, which shots have a build and which hold, people left out, known faults;
- duration, aspect, number of people, tags for search.

Built by the LLM from the layout, builds, beats and the clip's existing summary, then checked against the numbers (a card may not
claim walking when no build moves more than 0.3 m). Stored with the scene, shown on the depth page's 3D SCENE section, searched by
`find_depth_clips`. Small: a day.

## 1b. Performed as our own play

Every owned scene is shown performing a short text of ours, so it is both changed from the source and easy to judge at a glance:

- pick the text: a Macbeth scene (public domain; the daggers scene is already staged by `stage_scene`) or our own demo play, matched
  to the scene by its reuse card (two people seated and talking gets a dialogue, a fight gets a fight); the user can give their own;
- the LLM maps the text onto the scene: roles to people, lines and beats to shots, and changes what the text needs: cut times
  follow the lines' lengths (speech at about 2.5 words a second), a shot is cut, held or repeated, distances and places shift
  (closer for a threat, apart for a refusal), a person stands or sits, turns or moves where a beat says so, within limits that
  keep each build's motion believable (retime 0.7-1.4x, move a place up to about 1 m, turn up to 45 degrees);
- moves the source has no build for come from the movement library (stand up, sit down, turn, step, gesture) joined to the builds,
  as stage_scene already does for written scenes;
- the keyframes are our beats: one per beat at its clearest moment, rendered from our scene (part 3 turns them into pictures);
- the result is a scene of its own with its own revision; the fitted source scene stays underneath as the reference it came from,
  and the reuse card lists both ("from: seated two-person dialogue, 3 cuts; performed as: Macbeth 1.7, Macbeth and Lady Macbeth").

Switching a model refits the scene. A user picks a different character for a role (a child for an adult, a tall man for a short
woman); its proportions change what the cameras see and where hands land, so the scene follows:

- places and contacts: hip and seat heights from the model (a child's chair, a lower table), hands that touched a shoulder or a
  table moved to the new body's reach, the distance between two people kept at what the beat needs;
- cameras: each shot keeps its framing, not its numbers. The framing is what the shot showed of each person before the switch
  (head, shoulders, hips and feet on screen); the camera is refitted so the new bodies land on those same screen points, with the
  same least-squares fit build_depth_scene uses (a camera's height, distance and tilt free; its lens kept unless the shot cannot
  be framed without changing it). A close-up of an adult's face becomes a close-up of the child's face, lower and nearer;
- a shot the refit cannot frame (a body too large for the room, a contact out of reach) is named with what to change;
- the keyframe renders are made again from the refitted scene.

The demo version is what the depth page and the reuse card show first. About three days; it reuses stage_scene's beat planning
and the library's joins.

Built 2026-10-30, the first performance by hand: `authoring/plays/macbeth-1-7-on-got-olenna-033.json` performs Macbeth 1.7 on 033
(Lady Macbeth = D in peasant-female, Macbeth = E in ranger-male; six lines from "We will proceed no further" to "I am settled",
23.2 s against the source's 15). A performance spec names the fitted pair it comes from, roles (name, character, height), shots in
our order and lengths (shot 6 comes back for the last line), which build each person plays in each shot, and the lines with times.
`authoring/render/perform.py SPEC` (vision venv) writes it as its own pair (set_shots_scene, pair = the spec's id), renders it
(about 50 s), burns the lines in (captioned.mp4; this ffmpeg has no drawtext, so each line is a picture laid over in its time) and
writes one keyframe per line at its middle and keyframes.jpg, in `.authoring/plays/<id>/`. Builds are stretched to the shot
(speed = build length / shot length, kept within 0.7-1.4; past that the build plays back and forth, `loop`). set_shots_scene
segments gained `speed`, `offset`, `loop` and `frame` (the camera a build was made in: without it a build played under another
shot's camera was turned by that camera, so Lady Macbeth faced us in the repeated shot 6). Not yet: the LLM writing the spec from
a play and the reuse card, places and turns changed by the text (this one only retimes, cuts and repeats), sound, the page.

Built 2026-10-30, later the same day: blocking from the text, a set, better characters and a page for viewers.
- Blocking: segments take `turn` (degrees about the hips, or [from, to] across the segment); the spec's play entries take `turn` and
  `move` ([dx, dz] across the shot, kept afterwards). Macbeth 1.7 uses turns only (both are seated): Macbeth turns away on "Prithee,
  peace" and back on "If we should fail?" (shot 6 split in two at the same camera), Lady Macbeth turns in on him for "screw your
  courage". Standing up, sitting down or walking that the source lacks (from the movement library) is still to do.
- Set: 32 CC0 props from Quaternius' Fantasy Props MegaKit (Standard, Tim's download) as GLB in `editor/assets/props/` with
  `index.json` (size, seat height for seats; `authoring/render/prop-build.py`). set_shots_scene takes `set` [{prop, place, turn,
  scale, lift}], drawn in clay grey. A role's `seat` in the spec puts a chair under them, turned their way, scaled to their hips.
  Macbeth 1.7 has two chairs, a candle stand kept out of the close shots, a stool with the chalice, two banners.
- Characters rebuilt with the Universal Base Characters kit (Standard, CC0): textured heads and eyes, hair skinned to the same
  skeleton (buns, long, parted, buzzed, beard), tinted (`--hair-color`).
- The Scenes page, `/editor/scenes.html` (editor/scenes.tsx), for viewers: each performance's captioned video, card, cast with a
  body per role and Perform again (a job running perform.py with `--cast`, about a minute), lines that jump the video, keyframes,
  shots and set. It shows only our renders and the spec's viewer-facing text (`name`, `play`, `card`, shot `note`; producer notes go
  in `why`). The depth library stays on depth.html. There is no sign-in yet: anyone who can reach the service can open either page,
  so keeping producers' pages from viewers needs accounts or a separate public server serving only the Scenes routes.

Built 2026-10-30, moves the footage lacks: 24 Mixamo animations (Tim's Humane-Basics pack; the files name Mixamo as their source)
retargeted onto the Studio skeleton and registered as library movements `move-mixamo-*`: walking, walking backwards, up stairs,
sneak walk, running, crouch, bored idle, open and close a door, press a button, push, punches, a punch combo, kicks, a jump kick,
block, get punched, get kicked, jump, jump and roll, falling, falling impact, death, corpse, swimming. `authoring/render/mixamo-retarget.py`
(Blender: both skeletons rest in a T-pose, so each bone takes the Mixamo bone's world turn from rest; hips travel scaled by hip
height, 0.88) writes a GLB per clip; `authoring/render/mixamo-register.py` turns them into Action v2 and registers them. The FBX and
GLBs stay in `.authoring/sources/mixamo-humane-basics/` (untracked): Adobe's terms allow Mixamo animations in commercial work but
not redistributing the files, so they never go in the public repo. Checked on the Studio player in a test shots scene
(`mixamo-check`): walking, sneak, running, jump, kicks, push, door, button, punches and death play with feet and body on the floor.
The Mixamo walks carry their travel in the hips (Walking: 1.43 m a cycle, 1.48 m/s). In scenes a library movement plays as a
segment like a build (set_shots_scene actionId may name a move-...): `loop: 'cycle'` repeats it forward, `inPlace` takes its hip
travel out so places carry the figure, `reverse` plays a build backwards, and turns go to 180 degrees. In a performance spec a play
entry may be a list of steps with seconds, and a step may be {movement, walk: {from, to}} (heading from the path, speed = the path's
pace over the movement's own, 0.5-2, so the feet roughly keep up) or {movement, turn: [from, to] headings, at}. Macbeth 1.7 now opens
with Macbeth walking in from the front left, a step-turn to his chair and his own sit-down, and closes with a new line ("Away, and
mock the time with fairest show...") as he stands up (his sit-down played backwards from where his hips settle), turns and walks
out past the candle stand; 32.2 s. The seated-leg solve runs only on build segments (it bent a walk's legs). Not done: a door (the
prop kit has none); foot contact is not measured (a walk slower than half its own pace slides); the UAL2 root-motion file is left
out, since the walks' own hip travel gives their pace.

## 2. Camera controls people can use

The Clay page already lets a person drag cameras on the floor plan and type yaw, pitch, height and lens. Typing numbers is slow and
it is hard to know which way is which. Add, for the selected shot:

- a control pad in camera terms, each button one step (step size small, medium, large):
  orbit left/right around the person framed (or the pair's centre), crane up/down, dolly in/out, truck left/right, tilt up/down,
  pan left/right, zoom in/out (lens), and level (pitch 0);
- the same on the keyboard while the preview has focus: arrows orbit and crane, shift+arrows truck and pedestal, +/- dolly,
  [ ] zoom, with the step shown;
- dragging in the shot preview: drag orbits, shift+drag trucks, wheel dollies, alt+wheel zooms;
- "back to fitted": the camera build_depth_scene solved, per shot;
- while adjusting, the shot preview at the shot's keyframe beside the internal keyframe still (a ghost overlay on demand) so a
  person sees how far they moved from the fitted framing; the keyframe stills of the package re-render when they let go.

Changes are written through `set_shots_scene` with the pair's revision like every other edit. Orbit is the default because most
fixes are "a little more from her side". About two days, in `editor/clay.tsx` and a small camera-maths helper shared with the
renderer.

## 3. Our own keyframe pictures

Today a depth package's keyframe image prompt takes the depth still and the source frame as layout references. For owned output,
replace both with pictures of our scene:

1. at each keyframe render from the scene: a beauty still (the mannequin look of part 4), a depth still, a person-coloured mask and
   a pose skeleton (OpenPose-style, from the build's joints), all at the shot's camera;
2. generate the keyframe image from those with our characters and our set: the image model gets the beauty still (or depth plus
   pose for a ControlNet model) as layout, character sheets for who each figure becomes, and the set description of part 5;
3. a keyframe gate: find the people in the generated image (the detector and SAM 3D Body we already run) and compare their boxes
   and joints with the render; refuse an image whose people moved, swapped or vanished (the same idea as the keyframe gate in
   docs/DEPTH_REFERENCE_IMPROVEMENT_PLAN.md);
4. the owned package carries the renders and the generated keyframes, and no source stills.

Two ways to generate, both kept: a hosted image model with the beauty still as a reference image (fast, what Seedance and Jimeng
users already do), and local ComfyUI with depth and pose ControlNets (slower, exact layout, nothing leaves the Mac). Speed first:
start with the hosted one, measure layout errors with the gate, add the local one if the gate fails too often. About three days.

## 4. Characters that look good, and ours

The plain-shape figures (capsules, tapered column, legs for seated people) are fast and read well as control, but they are not a
product. Tim's decision (2026-10-30): a quality character model, ideally with our copyright, and the user can switch models to
fit the scene. Plain shapes stay as the quick option.

Where models come from, in order of preference:

- made by us: generated with Meshy on a paid plan (Meshy's terms: paid-plan outputs are owned by the user with full commercial
  use; free-plan outputs are CC BY 4.0, usable commercially with a Meshy credit but not ours alone; check the terms again when
  subscribing), or modelled or finished in Blender. Generated models get cleaned in Blender (topology at the joints, hands, scale);
- bought, with a licence that allows commercial use in video (a licence, not copyright: kept as a fallback, its terms recorded);
- the community models on meshy.ai/tags/character belong to the people who made them: references for what to ask for, not ours;
- the CC0 Quaternius bodies we already ship (`editor/assets/characters/`) stay as the free default.
  Quaternius packs looked at 2026-10-30, both CC0 (public domain: free for commercial use with no credit, but nobody's exclusive
  property, so anyone may use the same model): Modular Character Outfits Fantasy (12 outfits from 62 parts, rigged on a humanoid
  rig the pack lists as compatible with the Universal Animation Library and the Universal Base Characters heads, so it should play
  our builds with no bone map; about two thirds free, the rest and the .blend files in the paid Source edition) and Ultimate Modular
  Characters (11 characters of 4 swappable parts, FBX, OBJ, Blend, glTF; rig not stated, so check it before relying on it);
- the route to models that are ours: a CC0 base body on our skeleton, with outfits, hair and faces we make in Blender or generate
  and then fit and skin to that body in Blender (weights copied from the base). What we add is our own work; the base stays CC0.

Every model goes into a character library with its provenance (made here / generated on plan X on date / bought from Y under
licence Z), so the owned package can list it (part 6).

How a model joins the scenes:

- the builds are actions on the `quaternius-ual1` mannequin; `register_character` already lets a body of another skeleton follow
  the mannequin joint by joint (Character Creator FBX today). Add the skeletons our sources give: Meshy's auto-rig and the
  Mixamo-style humanoid most generators and stores use, with a bone map and a check pose sheet (T-pose and three test actions
  side by side) before a model is offered;
- each model records its height, hip height, leg and arm lengths and seat height, so the scene can adjust for it (part 1b);
- the starter set: a smooth faceless white mannequin like the examples (first), then a few dressed characters (an adult man,
  an adult woman, an older woman, a child), each in two or three outfits.

How it looks:

- one colour accent per person on the mannequin (cap, top or shorts in the person's library colour), body white; the depth and
  mask passes keep the flat person colours for control;
- rendered in Blender (the renderer `export_pair_reference` already has): satin material, soft key and rim light, contact
  shadows, a floor with mild reflection; 16:9 and 9:16 (both, Tim 2026-10-30);
- optional overlays from the examples: motion trails on a chosen joint (hand, foot, racket tip) over a time window, and joint
  callouts with a label, both drawn from the build's joints, both off by default;
- the three.js clay view keeps plain shapes for editing speed and can show the chosen model at a lower quality.

Check first on 033: the same scene in plain shapes and in the mannequin, sheets side by side, render time per second of video.
About three to four days for the mannequin and the bone maps; dressed characters follow one at a time.

Built 2026-10-30, the character library's first step: the free Standard edition of the Fantasy outfits (Tim's download) gives
four characters, `peasant-female`, `peasant-male`, `ranger-female`, `ranger-male` (`editor/assets/characters/`, 1.3-3.1 MB each,
provenance in `provenance.json`). The outfits are on the Studio's skeleton exactly (65 joints, same names and order), so no bone map;
they come without heads, so `authoring/render/character-build.py` adds the head and neck of the superhero base body of the same sex
(plain skin, dark eyes) and writes one GLB with 1024 JPEG textures. They are built-in characters (`runtime/characters.ts`), so
staged scenes, Studio and `set_shots_scene` (new figure `character`) take them; the clay view poses them with their own proportions
(rotations, the pelvis carrying height, feet to the floor). `export_pair_reference` renderer blender adds `look.mp4` when someone
wears one: the scene's skeleton per person drives that body bone for bone in Blender, its meshes stand in for the clay ones in every
pass (so depth and tint have the character's outline), and the look pass draws its own materials. `build_depth_scene` takes
`characters: {person: body}` (kept from the last build) and `look: true`; the depth page's 3D SCENE section has a body per person
and Render in clothes. 033 with D as peasant-female and E as ranger-female: right on every shot, the sit-down included. Limits: bald
heads, no hair; no chairs (part 5); the look render took 12 minutes for 15 s because the export renders clay, depth and tint too.
Tim's choice the same day: the quick clay render is the default (three.js, the characters' own shapes in each person's colour, 47 s
for 033's 15 s); the page picks a body per person and Build again applies it. The Blender look render stays for later
(`look: true` on build_depth_scene, `renderer: blender` on export_pair_reference) and has no button on the page.

## 5. Our own set

The scene has no room yet: figures stand on a plain floor. For owned output:

- blocking set from the layout: the floor, the people's furniture where the solve says they sit (chair, bench, table at the measured
  heights), and walls or a rail only where the shots need a background; plain objects from the `stage_scene` kit, placed by the LLM
  from the clip's summary and checked against the cameras (nothing between a camera and its people);
- the look of the set comes from the user's scene text, not the source: "a hotel bar at night", "an office", "a tennis court". In
  the beauty render it is plain shapes; in the generated keyframes (part 3) and the video model it becomes the described place;
- optional: one generated wide picture of the set (an environment image) placed behind the stage in Blender, so every camera sees
  the same place and the video model gets a consistent background.

About two days for the blocking set; the environment image is a follow-up if the generated keyframes drift between shots.

## 6. The owned package

A new mode of the package: `owned`. It contains the scene renders (beauty, depth, mask, pose) per shot and whole, the generated
keyframes with their prompts and gate results, the reuse card, the scene file (`scene.glb` and `.blend`) and a provenance list:
what was measured from the source (positions, motion, camera, cut times), what was made here (everything in the package), and the
models used to generate pictures. Delivered like depth packages today (deliver_depth_package, V.8 format), ranked by results.

## Order

1. Reuse card (1 day) and camera controls (2 days): improve every scene at once, need nothing new.
2. Performed as our play (3 days): 033 as Macbeth 1.7; its keyframes are ours.
3. Mannequin look on 033 (3-4 days), with the Blender beauty pass, in 16:9 and 9:16; then the bone maps for Meshy and
   Mixamo-style skeletons and switching a model with the refit of part 1b (2-3 days).
4. Our keyframes with the gate (3 days), from the beauty pass.
5. Blocking set (2 days), then the owned package (1 day).

Decided (Tim, 2026-10-30): 033 first, performed as Macbeth 1.7; owned output in both 16:9 and 9:16; the white mannequin look
first, then models of our own that a user can switch between, with the scene refitted to the model; the image model for keyframes
is to be chosen by Tim later.

Open: Meshy paid plan or another generator for our own characters, and which dressed characters to make first.
