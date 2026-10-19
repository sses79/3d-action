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

### The depth page (2026-10-18)

`/editor/depth.html` (`editor/depth.tsx`; built with `npm run build:editor`; header link "Depth library" on the Clay page). Library view: the sources at the left with what to show (depth clips, still shots, built packages) and filters by what was measured (camera moves, someone moves, people in a wide shot, bridged sequence, speech, several shots) and by text; for the chosen source a strip of every shot (proposed clips in colour, bridged shots marked), the built packages, and the clips as cards (shots, time, reasons, "proposed · not built · not described"). A clip opens a side panel with each shot's numbers and speech windows. A built package opens the clip view that was "From a video" on the Clay page (video, rows, keyframe cards, cast and style, prompts); old `clay.html?video=` links are sent there. Service: `/api/depth-library` (sources with the packages cut from the same video file) and `/api/depth-library-file` (only shot thumbnails and the overview). The four packages are listed under their sources (three under the standoff, V.5 under Tywin). Labels and summaries wait for the describe step.

### Step 3, building a clip and fixing it (2026-10-18)

- `authoring/render/depth-build.py SOURCE CLIP` builds a proposed clip with no hand work: depth (`da3-depth.py --save-width 960`, so a 1080p clip is no longer 1.5 GB), the pose detector on every frame (cached per video), boxes joined into tracks per shot, tracks kept when seen in a third of the shot and 15% of the picture tall (the biggest four), named A, B, C... and joined across cuts only when their clothes' colour histograms correlate 0.85 or more; tint; keyframes at shot starts and the middle of long shots; package into `.authoring/video-clay/<clip>/`; the clip in `source.json` becomes "built". Tywin 016 (5.3 s, one moving shot): 2.2 minutes (depth 62 s, detector 66 s, tint 5 s); the older man is A throughout; the body on the bier is found as a person (B) for 2.3 s and then falls under A's box; the cut-off foreground figure is missed. Standoff 001 (6.8 s, two shots): 1.9 minutes; at 0.55 the clothes match joined the wrong people across the cut (dark robes look alike), at 0.85 one wrong join remains (two soldiers in the same robes) and the rest are split. So joining is mostly the page's job.
- `authoring/render/depth-fix.py SOURCE CLIP` (and `POST /api/depth-library/fix`) applies fixes per shot: in each shot each person found is renamed to any letter (joins across cuts, splits a name given to two people) or dropped; the tint and package are made again from the saved depth in about 9 s. The automatic tracks are kept; the fixed ones are written beside them. Standoff 001 fixed with shot 2: E is A (Cersei), D is B (Lancel); now the same two colours carry across the cut.
- The page: a built clip's card opens its package; the package's PEOPLE panel lists each shot's people with a letter choice or drop, and "Apply and tint again" reloads the video and stills. A proposed clip's panel gives the build command (a button waits for the service jobs).
- Not yet: boxes drawn by hand on the page (armour, someone lying down); building from the page.

### Step 4, service operations and the skill (2026-10-18)

Nine operations on the service (MCP `animation-studio`, `authoring/depth-library.mjs`, wired in `core.ts`; 64 tools now): `list_depth_clips`, `get_depth_clip` (measured shots, description, build and fixes, package people, keyframes and file paths/URLs), `find_depth_clips` (a beat in words, optional labels, people, length, control on/off; ranked by labels given (3), labels the beat names (2) and words found in the summary and keyframe text (1); only described clips unless asked; each result says why), `describe_depth_clip` (summary, labels from a fixed list, who each letter is, people count, camera per shot, keyframe text; written by Claude in a session; a built clip's package is remade with it), `cast_depth_clip` (cast per letter, style; returns the reference video, keyframe composition stills, the video prompt and image prompts, written by `runtime/depth-prompts.ts`, the same code as the page), `ingest_source_video` and `build_depth_clip` (jobs; `get_depth_job`), `fix_depth_clip` (per-shot renames and drops). The page has a Build button for a proposed clip (the job, followed until done).
- Tried: standoff 016 built as a job (83 s), Tywin 022 from the page's button (63 s); standoff 001 and Tywin 016 described; "Lady Macbeth comes down the stairs into the courtyard and the guards wait for her" finds standoff 001 first (courtyard, stairs, words), "Macbeth stands over his dead wife on a bier, grieving, the camera circling" with the label track round finds Tywin 016 first; cast of Tywin 016 as Macbeth and Lady Macbeth returns the depth video, two keyframes and both prompts. Prompts number shots within the clip (not the source's numbers).
- Skill `skills/scene-to-depth` (visible through `.claude/skills`): split a scene into beats, decide control per beat, find, build and fix, describe when needed, cast, hand back per beat; off beats get framings, not clips.
- Limits: search is by labels and words, not meaning (the calling agent judges); only two clips are described so far; jobs are kept in memory until the service restarts; hand-drawn boxes on the page are not built yet.

### All clips described (2026-10-18)

Claude described every clip of both sources through `describe_depth_clip` from sheets of their shot thumbnails: 7 depth clips and 66 still shots (summary, labels, people count, camera per shot; roles and clothes, no actor names). Standoff 024 is labelled `shows a killing` and `blood`; 023 (the seizing and lift, no killing) and 028 (an open hand on the floor) are `violent`. A build job had loaded `source.json` before a description was written and saved its old copy over it (standoff 001 lost its description); `depth-build.py` and `depth-fix.py` now read the file again and change only their own clip when they save. Searches: "an armoured giant walks up to a woman in a courtyard" finds standoff 001 first; "a young king and his mother talk quietly at a bier" finds Tywin's still shots at the bier; "a fight: a soldier is seized by the throat" finds standoff 023, then 024. Per-letter people descriptions are written only for the two clips described earlier (001, Tywin 016); the others name roles in the summary.

### Boxes drawn by hand on the page (2026-10-18)

The package view's PEOPLE panel has "Boxes by hand": choose a letter, press Draw, pause on a frame and drag over the person on the video; draw again at other times in the same shot to follow them. A box is kept per person and shot as keys (clip time, box as fractions of the picture), blended between keys and held before the first and after the last; the boxes at the current moment are drawn over the video (a diamond marks a key at this time). "Apply and tint again" sends them with the per-shot renames (`POST /api/depth-library/fix`, and `fix_depth_clip` takes `boxes`); `depth-fix.py` writes them as a track file marked exact (`<clip>.hand.json`, tracks named `<letter>-hand` in the person's colour), so they are tinted first and in front, and a hand box replaces that person's detector track in its shot (otherwise the detector box that made the box necessary still tints its own wrong pixels). Tried on Tywin 016: two keys over the body on the bier (0.2 s, 4.5 s) made it orange through the moving shot, about 5-6 s to tint again; the detector's B box had been tinting the lord's head orange and is gone. Between two keys the box moves in a straight line, so a moving camera wants a key every second or so.

### Keyframes drawn to the depth's layout (2026-10-19)

The courtyard result against its keyframes showed that the video takes positions and the room's shapes from the depth video and the look from the keyframes: keyframe 4 put Lady Macbeth on the right and one narrow window behind the knight; the video put her in the centre and the knight at the left edge, with two lattice windows and a column where the source has them. So a keyframe is now made from two layout references, the depth still and the frame of the source at that time (room, architecture, camera angle, light; every person replaced, no likeness taken). `runtime/depth-prompts.ts` writes this into each keyframe's image prompt (Image 1 depth still, Image 2 source frame); `cast_depth_clip` returns `keyframeGeneration` (per keyframe: time, the two references with paths, the prompt) and `videoGeneration` (Video 1, then the character sheets and the generated keyframes); the page's note and the `scene-to-depth` skill say the same. The source frames go to the keyframe step only, never to the video model.

### Double check at the keyframes (2026-10-19)

`authoring/render/depth-check.py SOURCE CLIP` reads each keyframe's tinted depth frame back (each colour = pixels whose hue is nearest that colour and clearly saturated) and compares it with the source frame: the people with a box at that moment (tracks, fixes, boxes by hand) and the people the pose detector sees there (at least 30% of the picture tall; double detections merged). It reports missing, unexpected, untinted person, two colours, box-shaped and head (the colour stops short of a seen face), writes `check.json` and `check.jpg` (source with the detector's boxes beside the tinted frame with each colour's outline and the issues) into the package. `depth-build.py` and `depth-fix.py` run it and keep {ok, issues} on the clip; the page shows a summary in the header with a link to the sheet and the issues on each keyframe card; `get_depth_clip` and `cast_depth_clip` return them; the skill says to look and fix before handing over. On the four built clips: Tywin 022 passes; standoff 001 has the Mountain untinted at 2.97 s (his track starts later); Tywin 016 has the foreground figure untinted, the hand box box-shaped and two colours where the lord stands behind the bier (right: the bier is in front of him); standoff 016 has two large people untinted in shot 18. Expectation came first from the people named in the shot, which flagged people not yet in view; it is now the people with a box at that moment.

## Star standard for a control signal (2026-10-19)

What the library offers is a control signal for dynamic film scenes; a package's stars say how good a signal it is. The user set the bar with two references: the standoff in the courtyard (0-8.9 s; its first 5 s generated in the A/B and followed within a frame) and the final fight (V.8: eleven quick cuts, a grab, a lift, a complicated handheld camera, judged great quality). Both are rated 5.

| Stars | Meaning |
| --- | --- |
| 5 | Reference: judged excellent by a person, best after a generation that followed it (cuts, positions, movement); strong motion or a complex moving camera. Only a person gives 5. |
| 4 | Strong: no faults at the keyframes, clear camera or body motion; not yet proven in a generation. |
| 3 | Usable: one fault away from the main action, or little motion (a still camera with people placed), or not checked. |
| 2 | Weak: faults on the main people; fix before use. |
| 1 | Not usable: identities wrong across cuts, depth broken, or content that cannot be used. |

- Faults are what the keyframe check calls missing (a tracked person with no colour), unexpected (a colour with nobody) and two colours (on one person). Notes are untinted person, head and box-shaped: both 5-star references have plenty of them (untinted extras watching, heads a little short, boxes drawn by hand) and still generated well, so they cost nothing. The check now also runs on packages built by hand (`depth-check.py SOURCE package:ID`).
- The machine suggests 1-4 (`suggestStars` in `authoring/depth-library.mjs`): 4 with no faults, 3 with one, 2 with more; at most 3 with little motion; 3 if not checked. A person's rating (`rate_depth_package`, or the STARS box in the package view: pick, say what it rests on, save; kept in `.authoring/depth-library/ratings.json`) replaces it.
- A clip's stars are those of its best package: its own build or a package built by hand over at least half the same time (fight clip 023 takes V.8's 5 stars, clip 001 the courtyard's). `find_depth_clips` adds (stars - 3) x 0.5 to the score, says the stars and which package in each result, and takes `minStars`; `cast_depth_clip` takes a package ID too (a clip's `bestPackage`), so the 5-star hand-built packages are what an agent casts.
- Suggested now: standoff 001 and 016 at 4, Tywin 022 at 3 (little motion), Tywin 016 at 2 (two colours where the lord stands behind the bier: a person would raise it), V.5 at 3 (two colours, box-shaped hand box).

### A third source: Ramsay kills Roose (2026-10-19)

`got-ramsay` (225 s, 1280x720, no sound track: ingest now skips speech timing when a video has no audio). 55 shots, 10 need control, 5 depth clips proposed (002 the opening, 026 the approach and the embrace in which the killing happens, 030 the close-ups after it, 035, 044), 45 still shots; 1.9 minutes. Very dark footage throughout.
- Built 026 (12.6 s, three shots; 5.3 minutes) and 002 (7.9 s; 3.3 minutes) with no hand work. 002 passes the check. 026 is weak: in the close embrace the detector's boxes overlap, so Ramsay's close-up (shot 27) has no tint, the embrace tints only part of one back with both heads grey, and Roose comes back in shot 28 as a new person (C) instead of A. It needs the page's fixes (C is A; boxes by hand for Ramsay in shot 27 and both in the embrace).
- The check called all of that "untinted person", a note, and would have suggested 4 stars. An untinted person is now a fault ("missing subject") when they are the largest person in the frame: the subject, not a bystander. The standoff and the courtyard references still have no faults; V.8 gets one (the soldier's back in the foreground of its first shot, a bystander who is the largest person there), which its 5-star rating by the user overrides. 026 now gets 2 stars, 002 4.
- The build ran the check before recording the clip's package, so the check found nothing; it now runs after.
- Not described yet; 026 and 030 show a killing.
- Fixed 026 (2026-10-19) through `fix_depth_clip`: in shot 28 B and C are A (Roose); boxes by hand for Ramsay (B) in his close-up and the embrace (shot 27) and when his back and head are seen in shot 28, and for Roose (A) in the embrace from 5 s. A key may now have `box: null` (out of view from that time to the next key), so a person can enter partway through a shot. 14 s to tint again. Check: the two missing subjects are gone; two notes remain (a bystander at 3.1 s, a head at 9.8 s); suggested 4 stars. Roose is blue and Ramsay orange across all three shots.
- All 50 clips of `got-ramsay` described; 026, 030 and the still shots of the body are marked `shows a killing`. "a father embraces his son, who stabs him" finds 026 first; "a lord writing at a desk in a dark room, the camera moving in" finds 002 first.

