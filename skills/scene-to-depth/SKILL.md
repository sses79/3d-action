---
name: scene-to-depth
description: Find reference clips for a written scene in the depth shot library and turn them into packages for a video model - a tinted depth video (white near, each person one colour), keyframe composition stills, a video prompt and one image prompt per keyframe, cast with the scene's characters. Use when a scene, storyboard or beat list needs motion or camera control from real footage, or when another project (s-video) asks for a depth reference for a beat.
---

# Scene to depth references

The library: `docs/DEPTH_LIBRARY_PLAN.md`. The page: `http://127.0.0.1:5174/editor/depth.html`. The Studio service must be running (`npm run start:authoring`, port 5174); call its operations through the `animation-studio` MCP tools, or post them:

```sh
curl -s -X POST http://127.0.0.1:5174/api/tool -H 'Content-Type: application/json' -d @request.json
```

Source footage stays local and out of the repository. A package's keyframe *source* stills are frames of someone else's footage: they are for checking, never for uploading or copying a likeness. People in the library are roles (A, B, C), not actors.

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

## 4. Describe a clip (when it has no description)

Descriptions are written by Claude, not by a model inside the service. Open the clip on the page or read `get_depth_clip`, look at the keyframe stills (the source stills show what happens), and call `describe_depth_clip` with: a two or three sentence summary, labels from the fixed list, who each person letter is (roles and clothes, no actor names), `peopleCount`, what the camera does per shot index, and per keyframe time a summary and what each person does. Mark `content: shows a killing` (or `blood`) when it does; otherwise `none of concern`.

## 5. Cast it for the scene

`cast_depth_clip {clip, cast: {A: "who A becomes, with their look"}, style, scene?}` returns the reference video (path and URL), the keyframe composition stills, the video prompt (reference video as Video 1) and one image prompt per keyframe. Cast every person letter that matters; a letter left out is described as the source's role, which may not fit the scene. Things the clip shows that the scene does not have (a crown, a weapon, armour) must be overridden in the cast text.

## What to hand back

Per beat: control on or off and why; for on, the clip ID, why it fits and what differs from the beat, the reference video path, the keyframe stills, the video prompt and the image prompts; for off, the framing to use. State the limits: Seedance has no official depth input (it goes in as an ordinary reference video; one A/B on 2026-10-18 showed it works); the keyframe images must be generated in the scene's style from the image prompts; source stills are not for upload.
