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
- Built the other three (2026-10-19): 030 (12.6 s, four shots; 5.1 min), 035 (6.6 s; 2.9 min), 044 (5.2 s; 2.3 min). 030 needed a fix: a second detection of Ramsay (C) lay over him in shot 32, and Roose came back as D (shot 34) and as A (shot 35); drop C, D is B, A is B in shot 35 (12 s). Now Ramsay blue and Roose orange throughout; one note (a head). 035 and 044 are clean apart from heads; 035's last frames flicker (Ramsay's head split between both colours at about 6.5 s, as the other man passes behind him). All five Ramsay depth clips built; suggested 4 stars each.

### Control needed, measured again (2026-10-19)

The user pointed out that Ramsay 002 (a lord writing, a slow push-in), 035 (Ramsay in close-up, a man walking behind) and 044 (a still two-shot) need no control video. The rule had fired on speed: in dark close handheld shots the camera sways and the focus breathes, which reads as motion, though the picture ends where it began. `control-need.py` now also measures the net change over the shot (camera shift and zoom summed; each person's travel across the width and growth) and requires real speed or real change (see SHOT_TO_CLAY_PLAN.md). `authoring/render/depth-remeasure.py SOURCE` applies the current rule to an ingested source without losing descriptions, builds, fixes or ratings: shots get the new numbers and verdicts, and each depth clip `needsControl`. On the three sources: Ramsay 002 and 044 now need no control; 035 still measures as needing it (the man behind travels) and is off by the user's call (`set_depth_clip_control {clip, control: on|off|measured, why, by}`, also on the page: a clip's panel says why and has a switch). Standoff and Tywin clips keep control (the crowd moving, the fight, the moving camera at the bier). `find_depth_clips control: on` and the page follow the decision; clips marked not needed are greyed. New ingests use the rule as it is now.

### A 5 s test cut of V.8 (2026-10-19)

`macbeth-v8-test-5s`: four segments of `macbeth-v8-fight` (0.05-2.20, 5.47-6.53, 6.53-7.84, 10.71-12.19 s: the seizing, the grin, the chain, held up by the throat) joined and played at 1.2× to exactly 5.0 s (150 frames, 960x540); cuts at 1.79, 2.68 and 3.77 s, each a keyframe (0.15, 1.95, 2.85, 4.4 s). The cut depth and source videos are in `.authoring/depth-library/got-standoff/edits/`. A package's `derivedFrom {package, sourceVideo, segments, speed}` lists it under the original source on the page, and the keyframe check maps its times back through the segments and speed (it had read the original video at the cut's own times). Check: the cuts pass; the first keyframe has the same notes as V.8 (the soldier's back in the foreground, Macduff's hand box).
- Recut the same day at the user's direction: it starts at V.8's 0:05 (4.97 s, the struggle past the Mountain's shoulder) and runs straight through to the throat-lift: source 4.97-9.57 and 10.71-12.11 s (only the arms-locked shot from below shortened, 2.2 to 1.1 s), 1.2×, 5.0 s, six camera angles with a keyframe each (0.12, 0.54, 1.42, 2.51, 3.04, 4.4 s). The arms-locked shot is untinted, as in V.8 (two arms from below).
- Shot 5 of the test cut (V.8 shot 34, arms locked, from below) tinted by boxes by hand in V.8 (`.authoring/shots/got/v8/shot34-hand.json`: the Mountain's body and gauntlet arm left, orange; the blue figure's body and arm right, blue), V.8 tinted again from its saved depth and the test cut again. The keyframe at 3.04 s now passes the check; the sky under the arch stays grey (far).

## Clip proposals: growing a short shot into its action (2026-10-25)

`authoring/render/depth_propose.py` now proposes clips for `depth-ingest.py`. Before that, ingest grouped them itself. The rules:
- control-on shots in a row join, up to 15 s;
- a slow stretch of at most 5 s between two on-shots is bridged into them;
- **new:** a group shorter than 2 s takes in its neighbours while they are short (2.5 s at most) and still move (someone moves ≥ 0.08, travels ≥ 0.1, or the camera moves ≥ 0.1), the side with more movement first, up to 10 s;
- a group still under 3 s is marked short.

**Why.** got_video_a (uploaded by Tim) proposed clip 007, 0.9 s, the one shot of the scene where the camera jolts. The action is Cersei's guards seizing Littlefinger with a blade at his throat, 8.6–16.2 s across six quick cuts. The neighbouring shots move (0.10–0.37 movement) but each stays under the control thresholds, and with only one on-shot there was nothing to bridge.

**What it did:**
- **got_video_a.** Re-split (`depth_propose.py got-video-a --write`): clip 007 and the stills 004–006 and 008–009 became clip `got-video-a-004`, shots 4–9, 7.8–16.2 s. Shot 10, Cersei talking (3.1 s), stops it. A fresh ingest of the same file gives the same clip.
- **The other three sources.** No change: the growth needs a control group under 2 s, and there is none. All their clips are described, so a re-split keeps them anyway; a re-split only replaces proposed clips with no work on them.
- **What-if (`--what-if`).** Protecting only built, fixed and person-set clips shows what today's control rule would propose:
  - Ramsay 002 and 044 would become stills, as Tim decided.
  - Fight clip 023 would shrink to shots 30–33. The seize (25–29) measures slow, and the lift from below (34) reads as no movement, because the detector finds no one in armour from below. Growth cannot reach a shot the detector cannot see. That needs another signal (a shot where the detector loses the people it had, or the camera's slow push). It is open.

## The check: overlap is not a fault (2026-10-26)

`depth-check.py` treated two colours inside one detected person's box as a fault ("two colours"). When one person stands in front of another, that is right: Cersei seen behind a guard's arm, a guard behind Littlefinger's shoulder. Those overlaps held got-video-a-004 at 2 suggested stars after its hand boxes.

Now two colours in one box are a note, "overlap: … holds X in front of Y", only when both of these hold:
- **depth:** their median depths lie 35 grey levels or more apart (the tinted depth keeps depth as brightness);
- **another person:** one of the two colours lies mostly (40%+) outside the box, so it belongs to someone else.

Otherwise it stays a fault, now saying why: at the same depth, or both mostly inside the one person.

**Measured.** Real overlaps were 45–82 grey levels apart:
- got-video-a-004 at 2.93 s, the arm across Cersei: 45 and 82;
- at 6.89 s, the shoulder before the guard: 81.

Bodies split in two were 24–25 apart:
- got-standoff-req1 at 2 s, Macbeth's near hands as a second person: 25;
- got-tywin-016 at 2.65 s: 24.

With 15 grey levels the split Macbeth passed as an overlap, because a near hand is nearer than its own head. The second condition alone did not catch it either: the detector had made a second "person" of the hands.

**Rechecked all 19 built packages.** Only got-video-a-004 changed: suggested 2 → 4 stars. Part B's wrong hand colour and the other faults remain.

## Wide shots: small people (2026-10-27)

got-video-a-013 is a high wide shot looking down on the courtyard: Cersei, Littlefinger and four guards, each 23–31% of the frame tall. The first build tinted 2–3 of the 6, and the check still passed.

**Check.** It skipped anyone under 30% of the frame tall, so in a wide shot it never saw the untinted people. Now the cutoff follows the shot: half the largest detected person's height, between 12% and 30% of the frame. On 013's first build it then reported 3 and 1 untinted people at its two keyframes. Clips 004 and 024: no change.

**Build.** The 15% size floor wasn't what dropped them. Two other things did:
- **Pieces.** The detector loses a small person for a few frames, and each loss started a new track. Cersei came out as three pieces, none seen in a third of the shot. Now, within a shot, a piece that starts within 1 s of another's end, at the same place (within 0.45 of a box height) and about the same size (0.6–1.65×), continues it. Real joins in 013 measured up to 0.41; a wrong one in a close, crowded shot of 004 measured 0.55.
- **Cap.** `--people` now defaults to 6 (was 4).
- **Edges.** A track that starts or ends within 1 s of its shot's edge, away from the frame's edge (so not someone walking out), is held to the shot's edge. Without this the left guard had no colour in the first 0.27 s.

**Result.** 013 has all six people (A–F) through the shot, and the check passes. A rebuild took 8 s from the saved depth. Seen from above, the floor is almost as near as the people, so the colours have flat lower edges. One guard's colour runs a little into a pillar at 4 s.

**Replayed on fixed clips** (the detector cache, without rebuilding them):
- got-video-a-004: shot 5 finds a fifth person; shot 6's wrong join is gone at 0.45.
- got-ramsay-026: shot 27 finds 3 people (was 1).
- got-ramsay-030: one track runs longer.

Fixed and rated clips were not rebuilt. A rebuild would replace their hand fixes.

## ARROW for people the detector misses: a test (2026-10-27)

[ARROW](https://github.com/ifradlin/arrow) (RWTH Aachen, released 2026-10-12) reads a set of frames together and tracks any picked point in 3D, along with depth, point clouds and camera poses. Its encoder is Depth Anything 3 Giant. Code: MIT. **Weights: CC BY-NC 4.0, plus Waymo's non-commercial terms.** Tim confirmed this project's use is non-commercial.

**Set-up.** Installed on mini4 in `~/Yun/arrow-runner` (`uv sync`, MPS). Weights are `weights/model.safetensors`, 5.29 GB. The test script is `authoring/render/arrow-track.py`: it takes seed points in the first frame as fractions of the picture, and gives each point's position in every frame and a visibility score (0–1).

**Speed.** 23 frames at 504 px in 28 s on mini4, about 1.2 s a frame. The first run took 52 s, which looks like warm-up. Loading the model takes 5–6 s. By comparison, the pose detector on this Mac takes about 0.55 s a frame.

**Results.** Two seed points per person, 23 frames each:
- **got-video-a-013**, six small people from above (5.5 s): scored against the build's tracks.
  - Cersei, Littlefinger, the top guard and the bottom guard: on their own person in every frame of the shot, including the bottom guard walking out of the frame.
  - The left guard: lost when he crouches by the well (about 3 s); his points jump to Cersei and the top guard.
  - The right guard: one of his two points slides onto the top guard's feet as his cloak swirls.
  - Visibility separates them: points that hold stay at 0.93–0.98; points that drift fall to 0.5–0.65.
- **got-standoff shot 34**, the lift from below, where the detector finds no one:
  - The figure lifting: both points hold all the way through (0.76–0.95).
  - The lifted figure: his body point holds (0.72–0.79); his face point is marked hidden while the sword crosses it.
- **got-ramsay shot 27**, the embrace:
  - Ramsay's face holds right through it (0.97–0.98); his chest is marked hidden once Roose's arm covers it.
  - Roose's points stay on his back and head, but at 0.55–0.62, and one sits on the edge between the two heads.

**What it means.** ARROW can follow people where the detector cannot: armour from below, two bodies in an embrace. It is several times slower than the detector, and it loses small people who change shape fast. So it fits as a fallback on the shots where the check reports someone missing, not as the people step for every build.

**Not built yet:**
- Seeds from a person's box (detector or hand box): about 10 points on the person's own depth.
- Per frame, a box from that person's visible points (visibility 0.7 or more), passed to the tint as a track. It would not be a hand box, so it keeps the depth shape.
- Running it on every frame of a clip in 24-frame chunks that overlap.
- Measuring it on 023 and 026 against their hand fixes.

### Built: `follow` in a fix (2026-10-27)

`fix_depth_clip` takes `follow: [{name, shot, time, box}]`: the person in that box at that clip time is followed through the shot. `authoring/render/arrow-follow.py` does the work:
1. **Seeds:** up to 16 points on the person's own (nearer) depth inside the box.
2. **Tracking:** up to 24 frames of the shot go to mini4, about 45 s a person.
3. **Boxes:** in each frame the person takes the detector box that holds most of their visible points. A frame without one is blended between neighbours up to 1.5 s apart, or else the box moves with the points.

The result replaces their detector track in the shot as an ordinary track, not a hand box. It is kept in `<clip>.follow-<key>.json` so a later fix doesn't run ARROW again.

The first version moved the seed box with the points alone. In the dark embrace Roose's points bunched up and his box shrank to a square between the two heads. Picking the detector's box with the points fixed that: the detector finds both bodies but can't keep them apart, and the points can.

**got-ramsay-026, shot 27 (the embrace).** Follows for Roose (A) and Ramsay (B) from the detector's boxes at 3.05 s. Roose: 14 frames from the detector, 10 blended. Ramsay: 22 and 2. The fix took 104 s.
- **Identity:** right throughout. Each man keeps his own colour through the embrace, with no swaps.
- **Shape:** worse than the hand boxes.
  - The tint keeps the nearer part of each box (Otsu). In an embrace that is the arms and shoulders, so both heads went grey from 6.4 s; the check flags a head at 6.32 s that the hand boxes passed.
  - Roose's back in the foreground at 3.1–4.3 s gets only a thin strip, the same as before.
  - At 5.3 s, with both bodies at almost the same depth, the colours fill their boxes.

026 was put back to its hand boxes (revision 3, the same check as before). Next, for shape: split the frame between the followed people with their own visible points as markers (a watershed on the depth), not a nearer-part cut per box. The points sit on heads and backs as well as arms, so the split would follow the depth edge between the two bodies.

### Built: the marker split for followed people (2026-10-28)

`arrow-follow.py` now keeps each point's place per frame, and `depth-fix.py` carries the visible points (at least 3) into the tracks between ARROW frames. `depth-tint.py` grows all followed people in a frame at once with a watershed instead of cutting each box by depth:
- **Markers:** small discs on each person's points. A point far behind the person's other points (under 0.6 of their median) is dropped as drifted onto the wall.
- **Background:** inside a box, what lies well behind that person (under 0.8 of their points' 25th-percentile depth, for every box that holds the pixel); in a margin of 4% round the boxes, what is further than the people. Anything nearer outside the boxes (their own shoulders and arms in a close shot) is left to be flooded from the points.
- **Edges:** the depth and the picture's own brightness (evened out with CLAHE). The depth alone runs smoothly from Ramsay's dark coat into the lit wall, and his colour flooded the wall as a rectangle.
- **Where it may go:** each person keeps what grew from their points, from the top of their box down and sideways as far as it grew. A box within 4% of a frame edge runs to it.
- A followed person with fewer than 3 points in a frame falls back to the old nearer-part cut.

**got-ramsay-026 again** (revision 9, kept; 14 s per refix after the first, which re-ran ARROW once for the points):
- 3.2–4 s: Ramsay clean against a grey wall; Roose's back in the foreground blue to its edge, where the hand boxes left it grey.
- 6.4–9 s: both heads and both bodies split along a real edge, and Ramsay's hand on Roose's back is orange (his).
- 5.3 s: Roose has no visible points (ARROW's visibility drops there), so he is still a rectangle; Ramsay has 5 points and only slivers.
- Check: 6.32 s passes the head test the box version failed. It flags two colours in Roose at 6.32 s (blue 67%, orange 26%, 15 grey levels apart): that is Ramsay's arm across his back, which the check cannot tell from a fault. 9.81 s (shot 28, hand boxes) is flagged as before.

### Built: follow keys for frames with too few points (2026-10-28)

On 026, points were lost where the two men turn into the embrace (4.4–4.7 s): after it Roose kept 3 of 15 and Ramsay 5 of 16, and the tint fell back to rectangles. A follow entry now takes `keys: [{time, box}, ...]` (up to 6) instead of one time and box. Each key seeds the person again on their own depth in that box, and all seeds go in one ARROW run, each placed in its own frame, so the cost stays about the same (109 s for both men). The fix result lists `thin` stretches per follow (under 3 points seen), which says where a key is needed.

Changes to the marker split that came with it:
- The background test uses each person's furthest points (the 5th percentile, times 0.9), not the 25th percentile times 0.8. Ramsay's face is much nearer in the depth than his own shoulder (218 against about 150 grey levels), so his shoulder had counted as background.
- It applies in their box, the 4% margin beside it, and everything below it. Detector boxes in the embrace often cover only the head.

**026, shot 27, keys at 3.05 s and 5.3 s** (boxes at 5.3 s on the heads and upper backs, kept off Ramsay's hand; revision 16):
- Points seen: Roose 19–32 throughout, Ramsay 11–20. No thin stretch.
- Every frame of the shot is grown from points. At 5.3 s both heads and bodies are split, where before Roose was a rectangle, and at 4.0 s Ramsay's shoulder is orange.
- The check is unchanged: two colours in Roose at 6.32 s (Ramsay's arm across his back) and 9.81 s in shot 28.

A mistake made twice in this work: a comment put in the middle of a dense line commented out the statements after it (the background markers, then the seed transform in `arrow-track.py`). Put comments only at the end of a line.

**Shot 26, Ramsay from behind (0–3 s).** It was untinted for its first 1.3 s. Ramsay fills the frame with his back to the camera, dark and with his head cut off, and the pose detector finds nobody until Roose steps out from behind him at 1.6 s. Then only Roose was coloured, and his box spilled onto Ramsay's shoulder. Now Ramsay is followed from keys at 0.3 s and 2.0 s, and Roose from a key at 2.7 s. Ramsay is orange from the first frame, Roose blue from when he appears, and the check is unchanged (revision 21). Two more tint rules came out of it:
- **Stray points:** a seed on Ramsay's back stayed where Roose stepped into view and turned Roose's head orange. A point is now dropped when its own nearest point is over 5% of the frame away and someone else's point is nearer. A first rule based on depth dropped Roose's own head points, because his head is nearer in the depth than his body.
- **Grow area:** it runs down to the bottom of the frame, because bodies go on below the detector's boxes.

Keys need boxes that stay clear of the other person: a first box for Ramsay at 2.0 s took in Roose's face, and some of Ramsay's seeds landed there.

Still open in 026: Ramsay's head, cut off at the top in shot 26, stays grey (all his seeds are on his back). The guard at the back left of shot 26 is not tinted.


### Built: missed people found by SAM 3 (2026-10-28)

Build, check and follow all used to rely on the pose detector to say who is in a frame. A person it never boxes (026's opening: Ramsay from behind, a dark back filling the frame with the head cut off) got no colour, and the check passed, because it uses the same detector. `authoring/render/depth_missed.py` adds a second way to see people:
- **Find:** SAM 3 (`sam3-people.py`, ComfyUI) looks for "person" in three frames of each shot, at 20, 50 and 80% through it. That's about 7 s a frame on this Mac, kept as `<clip>.people-sam3.json/.npz`. Two things were needed first. ComfyUI's node keeps one detection per prompt unless the conditioning asks for more (now up to 10). A dark frame (mean under 0.2) is brightened with gamma 0.45; without that, Ramsay's back on the dark wall was not found.
- **Missed:** each outline is read against the tinted video. Missed means under a quarter coloured, or coloured in someone else's colour: the colour of a person whose track box matches another outline better (Roose's box spilling over Ramsay). Followed people are left out of that test, because their colour comes from their points and their box can be a detector box over two people. Small people are left out as in the check.
- **Follow:** missed outlines in one shot are joined across its frames (same place, height and width, boxes overlapping) into follow entries with seed points inside the outline. Seeding from the box's nearer depth gave a narrow guard only 2 points. The follow takes the name of a track whose box matches the outline (IoU 0.5 or more: tracked but left uncoloured), else a new letter.
- **Where it runs:** the build runs it as step 6 and follows what it finds when the clip has no fixes yet (`--no-missed` skips it). `fix_depth_clip` with `findMissed: true` adds what it finds to the fix. The check reads the cache and lists what is still missed: "missing subject (SAM 3)", a fault, for the largest person in the frame, else "untinted person (SAM 3)", a note.

Two tint changes came with it: followed people are grown before the detector's people (letter order had let Roose's box paint over Ramsay), and their pixels are protected like hand boxes.

**Tests:**
- **026, unfixed shot 26:** the check flagged Ramsay ("missing subject (SAM 3)" at 0.6 s), which the old check passed. `findMissed` added Ramsay and the guard, and the result matches my hand fix: Ramsay coloured from the first frame, Roose on Roose, the guard tinted. The automatic name for Ramsay was a new letter, because no track had him in that shot; renamed to B by hand (revision 29).
- **013:** SAM 3 found Littlefinger uncoloured at 1.09 s, between the two keyframes the old check looked at. His shot-13 track had partly been on the guard at the top, which had lost its pink at 0.15 s. The pass gave the follow his own name A (his track box matched the outline), so he is blue throughout, the guard is pink again, and the description still holds (revision 14, check passes).
- **044**, built fresh: the pass ran in the build (34 s), found nobody missed, and both men are coloured.

**On mini4 (2026-10-28):** SAM 3 runs there when it answers, the way Depth Anything 3 does: the frames are cut here and sent, `sam3-people.py` runs in `~/Yun/sam3d-runner`'s ComfyUI (the same commit as ours), and the outlines come back. If mini4 fails or doesn't answer, it runs here. `DEPTH_WORKER=local|mini4` forces one, and each run adds a line to `.authoring/logs/workers.jsonl`. `depth_missed.py --setup` copied the weights (1.75 GB, 47 s) and the script; run it again after `sam3-people.py` changes. Speed: 3.3 s a frame there against 7 here (026: 9 frames in 39 s with the copying; 013: 3 frames in 20 s). The people found are the same as here. Borderline outlines vary between the machines (frame decoding, M4 against M1 maths): near-duplicate outlines and a sliver at a frame edge. So the pass merges outlines that overlap by more than 0.7 and leaves out slivers under 3% wide at an edge.

Limits: SAM 3 gives one outline for two people in a close embrace (it is coloured, so it is not missed). A new letter is a new person: someone known from another shot is renamed in the follow entry. Three frames a shot can miss someone seen only briefly.


### Fight clip 023 (2026-10-28)

`got-standoff-023` (13.2 s, 11 fast handheld cuts: the soldier reaches for the queen, the Mountain seizes him and lifts him by the throat) built for the first time.
- **The build:** the detector gave 14 letters for two people, mostly monks in the crowd. The soldier got two or three colours, and the Mountain (armour, often blurred in the foreground) none. Shots 30–35 had no colour at all. The missed-people step found 107 uncoloured outlines and tried to follow 25 people. That failed at the tint (a ninth person got the colour "gray") and was rolled back.
- **Limits added to the automatic follow:** only people near the camera (an outline's depth at least 0.8 of the nearest); the largest and tallest first; at most 3 a shot and 8 a clip; new letters only while colours remain; never someone the fix dropped. A person without a colour is now left out of the tint instead of breaking it. **The automatic pick still fails on 023.** Depth Anything renders the blurred foreground Mountain as far, and in shots 26 and 28 the nearest person is a monk seen from behind. In a crowd, judgement is needed: the description says two people.
- **The fix, by hand from the pass's list:**
  - Renames: the soldier's letters in shots 25–29 become A; every monk is dropped.
  - 15 follows picked from SAM 3's outlines, with their seed points: the Mountain (B) in shots 25–30, 32, 33 and 34, the soldier (A) in shots 30–35. They took 8.8 min on mini4, with points in every frame but a shot's last.
- **Tint, followed frames:** everyone the detector boxes in a frame with someone followed now grows together with them. Their markers come from the nearer part of their box, leaving out a widened hull around the followed people's points; without that, the nearer part of Roose's box in 026 was Ramsay's back. Dropped people (kept as "ghosts" in tracks-fixed.json) mark background, except where they are a second box on someone kept, at that person's depth. Before this, the Mountain's growth took the soldier's face in shot 25 and the monk's back in 26 and 28.
- **Check:** a person whose box matches a track the fix dropped is "dropped person", a note, not a missing subject.
- **Result (revision 9):** no faults. Own stars 4 (suggested); the clip keeps V.8's 5 as its best package. The soldier is blue and the Mountain orange throughout, including the lift from below (34). The monks stay grey.
- **What is weak:** in shot 33 the Mountain is only his blurred shoulder at the left edge (his arm across the bottom stays grey). In shot 27 the soldier's dark robe is partly grey. In shot 31 the Mountain's gauntlet on the soldier's shoulder is grey.

026 and 013 were re-fixed with the new tint: 013 still passes (revision 16). 026 (revision 31) lost its head flag at 9.81 s; at 2.0–2.7 s Roose's head has a few grey patches where my hand version had all blue.

Next, when a clip has a crowd: name its people from the description first (who matters), then let the pass seed only them.

### Built: the crowd step, who matters from the description (2026-10-28)

In a crowd, "near and largest" picks the wrong people (023: the blurred giant in front reads as far in the depth; a monk from behind is the nearest). So when a described clip (summary and `peopleCount` N) has more than N people in a sampled frame, `depth_missed.py` asks a vision model instead (`who()`, `DEPTH_DRAFT_MODEL`, default `openai/gpt-6-luna`, the key as for `depth-draft.py`): every sampled frame with SAM 3's outlines numbered, plus the summary. The model names the N people the summary is about, with how each looks, and says which outline is which in every frame (one call, 31 frames for 023, about 56 s; kept as `<clip>.crowd.json` while the summary and frames stay the same).
- Letters: each person takes the build track that matches them most often (IoU 0.5); someone no track matches takes a letter no remaining track wears, so there is never a ninth name.
- Renames, in the build's letters, per shot: a track on one of the people takes their letter, and a track only on other outlines is dropped. A track matches an outline at IoU 0.5, or when at least half its box lies on the outline itself (a part box: in 023 shot 25 a second track on the soldier's chest). Most frames win, and a tie goes to the person.
- Follows: the missed outlines that are one of the people, under their letter; at most N a shot and 24 a clip.
- `fix_depth_clip findMissed` puts the renames under any renames given by hand and reports `missed.crowd` (the people, the renames, the model). A first build writes them into its fixes.
Test on 023 from the build's tint (revisions 10 and 11, then 12 with the part-box rule): the model named the soldier and the armoured giant. The renames came out as my hand renames, apart from F in shot 25, which joins the soldier where I had dropped it. The 16 follows are the 15 I picked by hand plus the giant in shot 30. The check finds no faults. The soldier is now orange (B) and the giant blue (A), the reverse of the hand version. Shot 33 is better: the giant's arm across the bottom is coloured, where the hand version had only his shoulder. Still grey as before: the soldier's robe in shot 27 and the gauntlet in shot 31.
Limits: the step only runs on a described clip with a people count; the model sees source frames (layout evidence only, never sent to a video model); a person the model fails to name in a frame is treated as crowd there.

### Built: cut sequences (2026-10-28)

The control rule looks only at movement inside a shot, so a dialogue told in cuts (Olenna's shots 3–8: held cameras on two people, a new setup at each cut) came out as still entries only. That is right when dialogue is made shot by shot from keyframes. A sequence made in one take also needs when each cut lands and each setup's framing, so `depth_propose.py` (rule 5) now also proposes cut sequences:
- held shots (control off) in a row with people in them, not part of a control clip;
- windows of at most 15 s: whole shots in the middle, the first and last shot cut to what fits (at least 1.5 s of each), at least two cuts; one window after another, without overlap;
- the clip is kind `control` with `sequence: "cuts"` and the reason "cut sequence: N cuts, a new setup at each", so build, check, fix and the page treat it as any depth clip; its shots stay still entries as well; a kept (built or described) cut sequence keeps them too.
Written for all five sources (32 proposals: Olenna 6, Ramsay 10, standoff 5, Tywin 9, video-a 2); built and described clips were not touched, and a second run changes nothing. A long shot over 15 s is now cut into equal pieces (Olenna's 16.4 s walk: 8.2 + 8.2, not 15 + 1.4).
Built `got-olenna-033` (the end of shot 4, shots 5 and 6, the start of 7) to test a window starting and ending inside shots: the build ran (6.4 minutes) but put two keyframes outside the clip (the middle of shot 4 measured over the whole shot); keyframes now use only the part of each shot inside the clip. The detector named the two women with 8 letters across the 4 setups, as for any cut sequence before its fix: renames per shot are the usual next step.
