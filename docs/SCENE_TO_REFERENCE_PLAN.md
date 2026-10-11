# Scene text to reference: plan

Written 2026-10-11 at the user's request. Status: milestone 1 built the same day (see the end); milestones 2-4 not started.

## Goal

Start from a written story scene (characters, place, timed beats, dialogue) and end with the same reference package the video path produces: clay video, depth video, first frames and `reference.json`. In between, an LLM reads the scene and decides the blocking; the movement library supplies the motion; the figures move inside a room of plain objects.

This returns to the project's first track (text → LLM → movement) and joins it to what was built on 2026-10-10/11 (pair scene, room objects, camera, foot locking, reference export).

```
scene text ──LLM──▶ blocking spec ──compile──▶ figures moving in a room ──render──▶ reference package
                    (who, where, when,          (movement library,              (clay, depth, first
                     which movement)             paths, facing, room objects)    frames, meta)
```

## What a scene text gives us, and what it does not

Using "Very Grown-Up" (15 s, two characters, an entrance hall) as the example:

| The text states | The LLM must decide | Needs a person |
|---|---|---|
| Who is present, ages, who speaks when | Where each stands (marks on the floor), how far apart | Whether the layout suits the story |
| Beats with times (0–4, 4–7, 7–10, 10–13, 13–15 s) | Which movement plays in each beat and for how long | Whether a movement reads as intended |
| Required actions: face each other, stamp one foot, glance at the foot, look down, feet together, careful steps toward the corridor | Path of the walk, where the corridor opening is | — |
| Physical requirements: clear standing area, route to the corridor, no furniture crossed, door not touched | Room objects and their sizes | Sizes, if the home has references |
| Nothing about cameras (left to `director-advisor`) | Nothing: take the shot plan as input | The shot plan |

The LLM must not add actions the text does not have, and must mark every choice it makes as a choice, the way the scene text marks its own adaptation choices.

## What exists and can be reused

- **Room and objects**: `runtime/pair-scene.ts` (box, cylinder, arch, wedge), drawn by the renderer and Studio.
- **Renderer and export**: clay and depth passes, first frames, per-second description, `reference.json` (`export_pair_reference`).
- **Composer**: `compose_action` joins library movements with `travel: continue`, `facing: target`, `aim`, `order: turn-first`; `revise_action_recipe` changes durations.
- **Foot locking and the slide measure**.
- **Capturing a movement from a video clip**: `reconstruct_motion` → `register_movement`. This is how missing movements can be added.
- **Library today (68 movements)**: mostly combat and game actions. Usable for acting: idles (plain, folded arms, talking on a phone), a nod ("yes"), walk, step forward. Missing for this scene: foot stamp, look down, glance, feet together, careful walk, turn on the spot.

## What has to be built

In the order I would build it.

1. **A staged scene that does not come from a video.** Today a scene hangs on a pair, and a pair needs two actions reconstructed from one video window with a camera-relative placement. A staged scene needs performers placed directly in room coordinates, one to three of them, each with a height (a 13-year-old next to an adult).
2. **Longer composed actions.** The composer stops at 4 s. A scene needs 15–20 s per character. The limit comes from baked keys per track; the action format already allows 512 keys.
3. **Movement through the room.** "Walk from this mark to that mark, turn to face that person, stop." The walk cycle and facing options exist; missing is a step that works out how many cycles a distance needs, scales the stride to land on the mark, and turns along the way. Foot locking should apply to composed walks as it does to video ones.
4. **Blocking spec and its compiler.** A JSON the LLM writes and the service checks:
   - room objects and named marks;
   - per character: start mark, height, and a timeline of beats (movement, duration, facing target, optional walk to a mark);
   - cameras (see 7).
   The compiler turns it into one composed action per character plus the staged scene.
5. **Acting movements.** A first vocabulary of about 20 (stand and listen, talk with small gestures, arms crossed, shrug, point, foot stamp, look down, feet together, careful steps, turn on the spot, sit, stand up). Sources, in order of preference:
   1. what the library has;
   2. capture from short clips with the existing video path (someone films the movement, or a clip is found);
   3. a text-to-motion generator. Not assumed: needs its own research into what exists, its licence and whether it runs here.
6. **Where the head points.** Glances carry this scene ("glances at the stamped foot, then back"). A look-at layer that turns neck and head toward a target, within limits, on top of any movement.
7. **Authored cameras.** The video path tracks one real camera. Here the cameras come from a shot plan: position, look-at, lens, cut times, simple moves. The renderer already takes a camera per frame; a cut is a jump. The meta gains a shot list.
8. **Meta for a staged scene.** `reference.json` plus the beats, who speaks when (lines and times), and the shot list, so the prompt writer has timing as well as geometry.
9. **A skill, `scene-to-reference`**, with the rules for the LLM: what to take from the text, what to decide, what to flag, how to check.

## The example, as blocking

| Time | Gabi | Abby | Needs |
|---|---|---|---|
| 0–4 s | On her mark, facing Abby, talking stance | On her mark, facing Gabi, listening | idle, talk; marks; facing |
| 4–7 s | Listening | Small head shake, talking | talk; head |
| 7–10 s | Stamps one foot | Still | **foot stamp** |
| 10–13 s | Still | Glance down at the foot, back up | **look-at** |
| 13–15 s | Looks down, feet together, careful steps toward the corridor | Stays | **look down, feet together, careful walk**; walk to a mark |

Room: floor, two walls, front door block, corridor opening; marks for Gabi, Abby and the corridor entrance.

## Milestones

1. **Stand-ins in a room.** The example with what exists: both on marks facing each other in idle, Gabi walks to the corridor mark at 13 s; block room; one wide camera; export the package. Proves items 1–4 and the export. No stamp, no glance.
2. **The scene's own movements.** Capture foot stamp, look down, feet together and careful walk; add the look-at layer. The scene plays as written.
3. **Shots and meta.** Cameras from a shot plan with cuts; beats and lines in the meta; the skill.
4. **Research text-to-motion** as a third source of movements.

## Checks that carry over

- Fixed wide view and the foot-slide figure for every character.
- Body parts do not pass through each other or through room objects (the pair contact test, extended to boxes).
- Each movement used is at confidence 2 or 3, or the result says which were not reviewed.
- The report says what the text stated, what the LLM chose, and what was not checked.

## Decisions for the user

1. **Where acting movements come from.** Capturing from clips is the path we have. Who films or finds the clips?
2. **A child's figure.** Scale the same figure down, or wait for a second figure with a child's proportions? Scaling is immediate; proportions will read as a small adult.
3. **The shot plan's format.** What does `director-advisor` hand over, so the camera input can match it?
4. **Scene length.** Is 15 s the working maximum (it matches the reference-video limit of the video model), or should longer scenes be planned for?
5. **Faces and hands.** The clay figures have no face. Dialogue shows only as who is talking and head direction. Is that enough for the reference?

## Not known yet

- Whether the walk cycle bends cleanly along a curved path, or only straight lines between marks will look right.
- How the composer's joins behave over 15 s with loops and holds; it has only been used up to 4 s.
- Whether foot locking needs changes for composed actions, where the feet are already clean inside each movement.
- Whether any text-to-motion generator is good enough and usable under its licence.

## Milestone 1, as built (2026-10-11)

- **`stage_scene`** (52 operations) takes a blocking spec: room objects, named marks, two performers (height, start mark, facing, parts) and camera shots. It bakes one action per performer in room coordinates (`runtime/stage.ts`) and records the two as a pair with a staged scene, so Studio (Pair and Scene on), `render_pair_video` and `export_pair_reference` work on it unchanged. `reference.json` gains `staging` (marks, each performer's parts with times and movement IDs, the shots).
- **Parts**: a library movement looped to fill its seconds, on the spot (turning to face a mark or the other performer over half a second) or walking in a straight line to a mark. Walk distance is read from the movement's feet (the body moves so the lower foot stays put); whole cycles are played and the stride is scaled to land on the mark. Joins are 0.3 s pose blends. Up to 30 s and 30 parts per performer; keys at 30 per second, fewer for parts over 17 s.
- **Example**: `authoring/scenes/very-grown-up.json`, staged as `scene-very-grown-up` (r3). Hall of 9 blocks, 4 marks, one 28 mm wide camera. Gabi (1.55 m): talking, listening, talking, still, then one cycle of the formal walk at 0.7 speed, 1.00 m toward the corridor, stride x0.97. Abby (1.70 m): arms folded, the "no" idle on her refusal, arms folded, talking, arms folded. Foot slide over 15 s: 0.18 m for Gabi (all in the walk), 0 for Abby.
- **Three rig clips registered as movements** for this: `move-idle`, `move-idle-talking`, `move-walk-formal` (Quaternius UAL1, CC0, not reviewed). The rig also has sitting, interact and pick-up clips not yet registered.
- **Not in it**: the foot stamp, Abby's glance, looking down, feet together (no such movements, no look-at); turning on the spot swivels the feet; the walk is one straight line; the child is the adult figure scaled; one camera, no cuts tried; every movement used is unreviewed.
- **A fault and its repair.** The first version saved an action whose last keys repeated a time, without validating it. The service validates everything at start and would not start. `stage_scene` now validates before saving, and the loader drops keys that repeat a time (keeping the first) instead of refusing to start; two actions were repaired that way.
