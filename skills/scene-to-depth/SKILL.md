---
name: scene-to-depth
description: Find reference clips for a written scene in the depth shot library and turn them into packages for a video model - a tinted depth video (white near, each person one colour), keyframe composition stills, a video prompt and one image prompt per keyframe, cast with the scene's characters. Use when a scene, storyboard or beat list needs motion or camera control from real footage, or when another project (s-video) asks for a depth reference for a beat.
---

# Scene to depth references

The library: `docs/DEPTH_LIBRARY_PLAN.md`. The page: `http://127.0.0.1:5174/editor/depth.html`. The Studio service must be running (`npm run start:authoring`, port 5174); call its operations through the `animation-studio` MCP tools, or post them:

```sh
curl -s -X POST http://127.0.0.1:5174/api/tool -H 'Content-Type: application/json' -d @request.json
```

Source footage stays local and out of the repository. A package's keyframe *source* stills are frames of someone else's footage: they go only to the keyframe step, as layout references (room, framing, camera angle, light), with every person replaced and no face, costume or likeness taken; never to the video model, never into the repository. People in the library are roles (A, B, C), not actors.

## 1. Split the scene into beats and decide control per beat

For each beat (a few seconds of one action), decide whether it needs a control video (`docs/SHOT_TO_CLAY_PLAN.md`, "When a shot needs a control video"):

- **On** when the camera moves (follows, pans, pushes, circles, handheld), someone moves (walks, enters, exits, falls, fights), three or more people stand in a wide shot, someone touches someone or something (a grab, a strike, a hand-over), or a moment inside the shot must land at an exact time.
- **Off** when people stay in place, talking or listening, and the camera holds on them. These need no reference video: keyframe images and the prompt carry them. Say so in the answer instead of searching.

## 2. Find clips for the beats that need control

`find_depth_clips {beat, labels?, people?, maxSeconds?, control: "on"}`. Write the beat in plain words (who does what, where the camera is); add labels from the fixed list in the tool's description when you are sure (camera: follow, track round...; action: walk, grab...; setting; light; mood). Results are ranked with the reason each matched. Read the top two or three with `get_depth_clip` (summary, people, keyframe text, shots) and judge them yourself: match the action and the camera first, then the number of people and the length. Clips longer than the beat are fine to describe as a whole; a clip cannot be trimmed here.

Only described clips are searched. If nothing fits, try `includeUndescribed: true` and look at those clips' measured reasons and thumbnails on the page; if one fits, describe it first (step 4).

If no clip fits, say so. The fall-backs are a staged clay scene (`scene-to-reference` skill, no footage needed) or keyframes alone.

## 3. Build and fix a clip if needed

A proposed clip (not built) is built with `build_depth_clip {clip}` (a job of about 2 minutes; poll `get_depth_job`). People are found and named A, B, C per shot automatically; across a cut the same person may get a new letter, and two people in alike clothes may share one. Look at the package on the page and fix it with `fix_depth_clip {clip, shots: {"2": {"E": "A", "G": "-"}}}` (shot index from the clip's shots; "-" drops a person). About 10 seconds.

### Beats

Before casting, give the package its beats (`set_depth_beats`): the action as a one-line summary and 1.5–2.5 s beats, each with actor, verb, target, contact and change. A 5 s clip carries 2–3 beats. One beat over the whole clip usually needs no control video. The prompts are written from the beats (`docs/DEPTH_REFERENCE_IMPROVEMENT_PLAN.md`).

To make a new clip from beats instead of taking a library clip's own cuts, use `plan_depth_cut` (whole-second duration, one source span per beat; it trims or widens spans to 1.0-1.2x, puts beats on whole seconds and warns on short beats or shots). Try `dry: true` first.

Then `pick_depth_keys` places the keyframes, one per beat where it reads best. Read its warnings: where it cannot rank a shot (the actor untinted) or cannot see the peak of a change (a lift, a face), give the beat a `peak` with `set_depth_beats` and pick again.

With beats set, `cast_depth_clip` hands over keyframes in order: generate keyframe 1, approve it, then keyframe 2 with keyframe 1 among its references, and so on; each entry lists its references and prompt. Set the video generator to the stated duration exactly.

Each keyframe gets a contact card (the source frame with outlines and an arrow from each hand to what it touches). Where the detector misses someone (armour, dark clothes, an arm from below) the card has no arrows: place them with `set_contact_marks` (or on the page) before handing over a keyframe whose beat has contact.

The check gates each keyframe of a package with beats: a beat person without colour, or a marked contact hand not in its owner's colour, is a fault. Fix it (a hand box) or say in the hand-over that the keyframe image and contact card must carry whose hand it is.

After a generation, run `review_depth_result {package, video}`: it flags a wrong length, missing or extra cuts and beats whose action became a pose, and makes a sheet at each keyframe. Report its flags with your own look at the sheet, then rate the package.

Give the review a `verdict` (used, good, retake, rejected) and a one-line `note` once the user has decided; the take, its sheet and its measures then show under RESULTS on the package's page. When a take made with a cast and style worked, call `cast_depth_clip` with `keep: true` so the package keeps them. Say where a package stands with `set_depth_package_status` (current, replaced by another, stopped, test); pick `current` packages first.

To continue a previous take, a package can open on a lead image (its last frame, held about 0.5 s; `derivedFrom.lead`): its first keyframe is that image, not generated, and the video prompt says to start on it. Join the new take to the old one at the new take's first cut, not on the lead frame: the generated first frame drifts a little in light and framing.

### Stars

Every package has stars as a control signal (`docs/DEPTH_LIBRARY_PLAN.md`, "Star standard"): 5 reference (a person's judgement, best after a generation), 4 strong (no faults, clear motion), 3 usable, 2 weak, 1 not usable. A person's rating wins; otherwise the check suggests 1-4. Prefer 4-5 stars (`find_depth_clips {minStars: 4}`); each result names its best package, often a 5-star package built by hand over the same time, and `cast_depth_clip` takes that package ID. After a generation, tell the user what it showed and record it with `rate_depth_package {package, stars, why, proven: {model, date, result}, by}`; give 5 only when the user judged it.

### Check the colours before handing over

Every build and fix runs a double check at the keyframes (`authoring/render/depth-check.py`): it reads the tinted depth frame back and compares each colour with the people the detector sees in the source frame. `get_depth_clip` (package.check) and `cast_depth_clip` (check) list the issues, the page shows them on each keyframe card and links the check sheet. Issues: **missing** (a tracked person has no colour), **unexpected** (a colour with no person), **untinted person** (a large person the detector sees has no colour), **two colours** (one person's box holds two colours), **box-shaped** (a region fills its bounding box) and **head** (the colour stops short of a visible face). Look at the sheet: two colours where one person stands behind another, and box-shaped for a box drawn by hand, can be right. Fix the rest (rename, drop, a box by hand) and say in the hand-over what is left.

## 4. Describe a clip (when it has no description)

Descriptions are written by Claude, not by a model inside the service. Open the clip on the page or read `get_depth_clip`, look at the keyframe stills (the source stills show what happens), and call `describe_depth_clip` with: a two or three sentence summary, labels from the fixed list, who each person letter is (roles and clothes, no actor names), `peopleCount`, what the camera does per shot index, and per keyframe time a summary and what each person does. Mark `content: shows a killing` (or `blood`) when it does; otherwise `none of concern`.

## 5. Cast it for the scene

`cast_depth_clip {clip, cast: {A: "who A becomes, with their look"}, style, scene?}` returns the reference video, the video prompt (reference video as Video 1) and `keyframeGeneration`: per keyframe its time, its prompt and two layout references, the depth still (where each person stands, how near, the framing) and the frame of the source at that time (room layout, architecture, camera angle, light). Cast every person letter that matters; a letter left out is described as the source's role, which may not fit the scene. Things the clip shows that the scene does not have (a crown, a weapon, armour) must be overridden in the cast text.

Why both references: the video model holds the picture to the depth video's layout. In the courtyard test (2026-10-18) a keyframe drawn with the woman on the right and one narrow window was overruled: the video put her where the depth had her, with the source's windows and column. A keyframe drawn to the same layout from the start agrees with the video instead of fighting it. If the scene needs a different room, say so: the source's architecture comes through the depth.

## What to hand back

Per beat: control on or off and why; for on, the clip ID, why it fits and what differs from the beat, then two hand-overs in order:

1. **Keyframe generation** (an image model, before the video): for each `keyframeGeneration` entry, Image 1 = the depth still, Image 2 = the source frame, then the character sheets (and the scene's background plate if any), with its prompt. Each generated keyframe is bound to its time.
2. **Video generation**: Video 1 = the reference video, then the character sheets and the generated keyframes, with the video prompt.

For off beats: the framing to use. State the limits: Seedance has no official depth input (it goes in as an ordinary reference video; one A/B on 2026-10-18 showed it works); the keyframe images must be generated in the scene's style from the image prompts and the two layout references; source frames go to the keyframe step only.
