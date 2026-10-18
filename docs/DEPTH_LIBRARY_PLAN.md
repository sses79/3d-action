# Depth shot library — plan (2026-10-18; the user's four decisions are at the end)

A library of reference clips cut from source videos, each a **tinted depth video** with keyframes, a summary and labels, on its own page (`/editor/depth.html`), and reachable by other agents through the service (MCP) and a skill. An agent writing a scene asks for a clip that fits a beat ("a man walks round a bier, the camera following"), gets candidates, picks one, gives its cast and style, and receives the depth video, the keyframe stills and the prompts.

Why: the A/B on 2026-10-18 showed the tinted depth works as Seedance 2.5's reference video for footage clips (`SHOT_TO_CLAY_PLAN.md`, "A/B result"), and most shots need no control at all ("When a shot needs a control video"). So the library holds only the shots that need control, and the rest are described by keyframes and text.

## What exists already

| Step | Built | Where |
| --- | --- | --- |
| Cut a video into shots | yes | `authoring/render/shots.py` |
| Which shots need control | yes (rule plus "by eye" cases) | `authoring/render/control-need.py` |
| Depth, 0.3-0.8 s a frame | yes | `authoring/render/da3-depth.py` (Depth Anything 3 in ComfyUI) |
| People followed in a shot | yes, seeded by hand | `.authoring/shots/got/follow.py` (scratch) |
| Tint, boxes by hand, gaps | yes | `authoring/render/depth-tint.py` |
| Keyframes, cast, style, prompts, page | yes | `video-clay-pack.py`, Clay page "From a video" |
| Speech timing | yes (whisper.cpp, local model) | used by hand so far |

Four packages were made this way (standoff, courtyard A/B, V.5, V.8); each took 5-15 minutes of machine time plus picking people and boxes by hand.

## The library entry (a clip)

One entry = one clip of 15 s or less: a single control-on shot, or a run of consecutive shots that belong together (the fight: eleven cuts). Stored under `.authoring/depth-library/<source-id>/<clip-id>/` (third-party footage stays out of the repo, as now): `depth.mp4`, keyframe stills (source and depth), `entry.json`.

`entry.json`: source (file name, SHA-256, start, end), shots (times, what the camera does), people (role names A, B, C… with colour and a description; no actor names), speech windows (times only), keyframes (time, summary, what each person does), **summary** (two or three sentences), **labels**, measured numbers (camera, move, people, shot sizes from `control-need.py`), build record (times, what was done by hand), review state.

Labels (a fixed list, each entry several):
- camera: still, pan, push in, pull out, follow, track round, handheld, crane/low angle, cut sequence
- action: walk, enter, exit, approach, turn away, sit/stand, grab, strike, fall, lift, hand over, embrace, crowd moves, fight
- people: 1, 2, 3-5, crowd; shot size: close, medium, wide
- setting: interior/exterior, hall, courtyard, chamber, stairs, street, field; light: day, night, candle, dark
- mood: tense, grief, menace, calm, violent
- length band: under 3 s, 3-8 s, 8-15 s; cuts: one shot / several

## Steps

1. **Ingest a source video.** One command (and later a service operation) runs shots, control and speech timing over the whole video and proposes clips: control-on shots, joined when consecutive and together under 15 s, split where a shot is off. Control-off shots become entries too, with keyframes and text but no depth (a search can answer "no control needed, here are framings"). Writes a source record with every shot (on or off, numbers, thumbnail). About 2 minutes for a 2-minute video. Nothing heavy yet.
2. **Build a clip.** Depth for the clip's frames, people followed without seeds (the detector's boxes joined by overlap within each shot, the largest few people named A, B, C by size and position), tint, keyframes (each shot's start, and the middle of long shots), stills. 5-15 minutes a clip; runs as a background job with progress. Built only for clips the user marks to build (or all on request), never the whole catalogue by default.
3. **Fix by hand where needed**, on the page: rename and join people across shots (A in shot 2 is B in shot 3), drop a person, draw a box for what the detector misses (armour, someone lying down), rebuild the tint (seconds; the depth is saved). These are the cases that needed hand work in V.5 and V.8.
4. **Describe.** Summary, labels and keyframe text written by Claude in a session from the keyframe frames (no API calls; the user's choice), then editable on the page. A built clip without a description is listed as "not described" and is not returned by searches until it has one. Speech is timed, not transcribed into the library.
5. **The depth page** (`/editor/depth.html`, its own page; the Clay page keeps staged scenes): a library view (sources, clips as cards with thumbnail, summary and labels; filter by label and text; on/off shots of a source on a strip) and a clip view (what "From a video" shows now: video, shot/keyframe/speech rows, keyframe cards, cast and style, prompts). The four existing packages move in.
6. **Service operations (MCP) and a skill.**
   - `find_depth_clips {scene text or beat, labels?, people?, length?}` returns ranked clips with the reason each fits: labels first, then words of the summary and keyframe text; no model call inside the service, the calling agent judges the candidates.
   - `get_depth_clip {id}`, `list_depth_clips {filter}`.
   - `cast_depth_clip {id, cast: {A: who}, style, scene?}` returns file paths (and service URLs) of the depth video and keyframe stills, the video prompt and one image prompt per keyframe.
   - `ingest_source_video`, `build_depth_clip` as jobs (`get_job` for progress).
   - Skill `scene-to-depth`: from a scene's beats, decide per beat whether it needs control (the definition), search the library for those beats, cast and return the package; beats without control get keyframe prompts only. Usable from s-video through the MCP.

## Limits to state

- The library is only as good as its sources: a beat with no matching clip falls back to a staged clay scene (no footage) or to keyframes alone.
- Seedance has no official depth input; the evidence is one A/B. A model update could change this.
- People are roles, not identities; anything a clip shows (costume, a crown, a weapon) is replaced by the cast description, which the prompt must say.
- Depth of a dark frame is flat (the standoff's first frames); a figure in armour or lying down needs a hand box.
- Building is minutes per clip on this Mac; a large catalogue would want the NVIDIA cloud GPU (the pending card) or mini4.

## The user's decisions (2026-10-18)

1. People: automatic (detector boxes joined per shot, named A, B, C), fixed on the page when wrong.
2. Descriptions: by Claude in a session only, no API calls.
3. Control-off shots: in the library too, as keyframes and text without depth.
4. Clips: up to 15 s, whole sequences of consecutive control-on shots kept together.

## Built

### Step 1, ingest (2026-10-18)

`authoring/render/depth-ingest.py VIDEO --id SOURCE-ID [--name] [--max 15] [--bridge 5]` writes `.authoring/depth-library/<id>/source.json` (every shot with its numbers, on/off and reasons, speech windows, a thumbnail), the speech times (whisper.cpp with a local model; the words are not kept) and the proposed clips. A control-off stretch of up to 5 s between two on-shots joins the sequence ("bridged"): the standoff's grab shots measure slow between fast fight cuts, and at 3 s the grab (4.2 s) still split the fight into fragments. Runs longer than 15 s are split at shot boundaries. About 2 minutes a video (shots 1 min, the control measure 50 s, speech 6-13 s).
- `got-standoff` (119 s, 48 shots, 15 on): clips 001 (0-6.8 s: her walk down and the Mountain walking up; the courtyard A/B), 016 (47.8-50.1 s: the crowd moves), 023 (70.5-83.7 s, eleven shots: the fight to the throat-lift; close to V.8) and 024 (83.7-93.7 s: the rest of the fight, which shows the killing); 27 still entries.
- `got-tywin` (211 s, 43 shots, 3 on): 016 (53.5-58.8 s, the camera moving round Tywin), 022 (93.6-98.2 s, four at the bier), 028 (132.8-144.9 s, the walk round the bier; V.5); 40 still entries.
- `overview.jpg` per source: every shot, clips in colour, bridged shots marked.

