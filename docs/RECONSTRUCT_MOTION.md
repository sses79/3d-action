# `reconstruct_motion`: video window to draft action

Status: 6 October 2026. Phase 4 of [NEW_PLAN.md](NEW_PLAN.md). One service operation, available through MCP and the CLI, turns a window of a local video into an estimated Action v2 draft on the current rig. It replaces the clip-specific pilot scripts for new work; the pilot evidence under `authoring/reviews/video/kick-reference/` is unchanged.

The output is always `estimated-draft-unreviewed`. It is never an approved movement, and nothing here confirms contact, balance or naturalness.

## Request

```sh
npm run start:authoring
node authoring/cli.mjs call reconstruct_motion --args authoring/examples/reconstruct-motion.json
```

| Field | Default | Meaning |
| --- | --- | --- |
| `video` | required | Local file path, absolute or relative to the repository root |
| `start`, `end` | required | Window in source seconds, 0.5–8 s long |
| `detector` | `yolo26s` | `yolo26s` or `yolo26n` 2D pose model |
| `fit` | `stable` | `stable`, `fitted` or `none` (lift only) |
| `straightKneePrior` | `false` | Side-view assumption: a confidently straight 2D knee is treated as straight in 3D. Leave off for other camera angles |
| `sourceSpeed` | `1` | Speed of the footage relative to real time (0.1–1). `0.4` turns slow motion at 40% into a real-time action. Phases and corrections stay in footage seconds |
| `airborne` | `false` | Let the character leave the floor, using the lowest ankle's height in the image. For jumps filmed with a level camera at roughly constant distance |
| `corrections` | none | Up to 8 bounded corrections: `smooth` (strength 1–5) or `hold` on one body part in one clip-time window |
| `phases` | one phase | `[{name, end, kind?}]`, ends in clip seconds; the last must equal the window length |
| `actionId`, `name` | `video-reconstruction-draft` | Identity of the baked draft |
| `commit`, `expectedRevision` | `false` | Save the draft in Studio (revision 0 for a new action) and add a motion-quality check |
| `force` | `false` | Ignore cached stages |

## Stages and cache

| Stage | Implementation | Rerun when these change |
| --- | --- | --- |
| observe | `authoring/reconstruction/observe.py` | video content, window, detector model, script, Python lock file |
| lift | `lift.py` (MotionBERT Lite) | observe result, checkpoint, vendored source commit, script |
| fit | `fit.py` | lift result, `fit`, `straightKneePrior`, script |
| retarget | `retarget.ts`, in the service | motion result, character asset, `actionId`, `name`, `phases`, script |

Each stage writes to `.authoring/reconstruction-cache/<stage>-<key>/` with a `stage.json` recording its inputs and duration. A stage is published by renaming a temporary folder, so a failed stage leaves no entry. `authoring/reconstruction/pipeline.mjs` holds the orchestration; nothing evicts old cache entries yet.

## Measured on the side-kick fixture

Original recording, 11.45–13.75 s, `stable` fit with the straight-knee prior, one run on this machine (CPU, two Torch threads):

| | Seconds |
| --- | ---: |
| observe (67 frames, includes Python imports and model load) | 12.2 |
| lift | 2.0 |
| fit | 2.7 |
| retarget | 0.03 |
| Total, nothing cached | 17.1 |
| Identical repeat | 0.02 |
| Change fit mode or prior | fit and retarget only |
| Change phases, id or name | retarget only |

The result is bit-identical to the pilot: the 67 observed keypoint sets, the lifted and stabilized 3D positions and all 66 baked tracks have a maximum difference of 0 against `pose-small/`, `reconstruction-stable/motion-ir.json` and `reconstruction-stable/action.json`.

A second window of the same recording (16.5–21.5 s, 151 samples, no prior) completed in 23 s and produced a rough draft. It was not reviewed against the video in detail, so it shows the operation is no longer tied to the fixture, not that the result is good.

## Summary returned

About 3 KB: stage keys, cached flags and timings; observation counts with clip times where the subject was not selected, where body landmarks fell below 0.5 confidence, and where the subject's box touches the frame edge; sample count and bridged frames; fit residuals; the action's phases and track count; paths to the pose report, motion estimate and action; and the standing limits. With `commit:true` it adds the saved revision and the motion-quality status and inspection windows.

## Quality fixes after reviewing the side kick (6 October 2026)

Reviewing the first draft against the video found two defects, both now handled in the stages:

- **Leg lost during recoil.** Motion blur made the detector drop the kicking leg in four frames (clip 1.367, 1.5, 1.567, 1.6 s) and redraw it on top of the standing leg, so the character's leg dropped to the floor in the middle of the recoil. `lift.py` now detects this pattern (one leg's knee and ankle both land within 0.2 body heights of the other leg's, confidence below 0.9, ankle jump above 0.3 body heights from the last trusted frame), bridges those frames by interpolation and marks them low-confidence. The summary lists them as `repairedLegObservations`. `--no-leg-repair` restores the old behavior.
- **Knees locked or crouched.** The straight-knee assumption was all-or-nothing: with it, the standing knee sat at exactly 180° for the whole clip; without it, the standing leg folded to about 110°. It now pulls only a raised leg to fully straight. A planted leg is merely kept from folding below 160°.

On the fixture this gives a held-high recoil (knee 96° → 68° → 79° instead of a straight dropped leg), a standing knee near 160°, a 180° kick extension, and a lower projection error (0.0067 against 0.0091). The result is saved as `video-side-kick-v2`; the comparison sheet is `authoring/reviews/video/kick-reference/reconstruction-v2/kick-comparison.png` (local only). The three velocity review windows remain, the kick is lower than in the video, and the 160° floor and the repair thresholds were chosen on this one clip. Because of these changes the operation no longer reproduces the pilot bit-for-bit; the pilot files are kept as they were.

## Kick height and lean (6 October 2026)

`video-side-kick-v2` still kicked lower than the video and leaned less. Measuring the estimate against the rig at the peak found two causes:

- **Lean lost in retargeting.** The spine bones were oriented from a frame built on the shoulder line, with the spine direction squared to it. With level shoulders that removes sideways lean: the estimate leaned 48° from vertical, the rig only 35°. For this operation the torso frame now keeps the pelvis-to-neck direction exactly and squares the shoulder line to it (`torsoFrame` in `retarget.ts`). The pilot code path is unchanged.
- **Kick shortened at the peak.** On the extended leg the blurred ankle point slid up the shin (shank 109 px, then 61 and 58 px in the next two frames). The fit read the shorter leg as pointing about 37° toward the camera, which lowered it. `lift.py` now restores the hip-to-ankle reach of a raised, straight leg to its largest value within two neighbouring straight frames, keeping the observed direction. Two frames were extended (by 34% and 16%); the summary lists them as `extendedLegReach`.

Result, saved as `video-side-kick-v3`: kick-leg elevation at the peak rises from 24° to 30°, and in the front view the lean and the foot at head height match the video (`reconstruction-v3/kick-comparison.png`, local only). Still open: the leg remains about 27° toward the camera, which a single view cannot confirm; the head follows the torso instead of staying upright; and the three velocity windows remain.

## Legs passing through each other (6 October 2026)

In the Gather phase of `video-side-kick-v3` the legs cross for the step-over, and the two knees passed through each other. Measured on the rig, the legs came within 0.6 cm from 0.60 to 0.93 s and the knee depth order flipped at 0.63 s and back at 0.90 s. The lift had kept the left knee in front throughout; the fit collapsed that depth gap because nothing told it legs are solid.

`fit.py` now samples six points along each leg and penalizes any pair closer than their combined radii (0.30 of hip width at the thigh and knee, tapering to 0.17 at the ankle). Where the legs overlap in the image the only way to satisfy this is in depth, and the starting estimate decides which leg is in front. The fit report and summary give `legOverlap` before and after.

Result, saved as `video-side-kick-v4`: minimum leg-to-leg distance on the rig is 11.3 cm over the whole clip, with no depth-order flips; kick extension, elevation and lean are unchanged and projection error is 0.0071. Only leg against leg is covered: arms, torso and the floor are not, and the radii are estimates rather than measurements of the character mesh.

## Left-leg wobble in the ready hold (6 October 2026)

In `video-side-kick-v4` the left knee twitched at about 1.97 s while the pose should be still. The observations there are steady (knee x 0.284, 0.285, 0.288), but the fitted knee jumped 0.286 → 0.273 → 0.288 and its angle 148° → 155° → 147°. The planted-knee floor was weighted by how straight the knee looks in 2D, with a ramp between 154° and 172°. In the final wide stance the knee sits right at that threshold, so the floor switched on for single frames.

The floor is now always active on a planted leg and follows the observed 2D angle when that is below 160°, so there is no switch. Result, saved as `video-side-kick-v5`: the left knee holds 152–155° through the hold and eases to 160°; on the rig its frame-to-frame jerk at 1.97 s drops from 5.4 to 0.8 cm per frame², and the maximum over the ready hold from 5.4 to 1.6. Leg clearance (11.3 cm) and the kick are unchanged. The fitted knee now sits about 0.014 normalized units inside the observed position throughout the hold, a steady offset rather than a wobble. Projection error is 0.0076.

## Second clip: flying side kick (6 October 2026)

Source: a 42 s screen recording with several repeats of the same jump kick, slow-motion replays and an inset of another performer. One real-time take was used, 33.85–36.0 s (2.15 s): run-in, plant and chamber, takeoff, kick. The take ends in the air; there is no landing in the recording. Detection was clean: one person, 3 weak frames at 0.80–0.92 s, no merged-leg repairs, four reach extensions.

The clip needed one new capability. Retargeting pinned the lowest foot to the floor in every frame, so a jump was impossible. With `airborne: true` the root is raised by how far the lowest ankle sits above the lowest line it reaches in the clip, fading in between 20 and 40 cm so that rising onto the toes does not count as leaving the floor. A first attempt based on pelvis height lifted the character from 0.67 s while the foot was still planted; the ankle-based rule takes off at about 1.3 s, matching the video, and peaks at 1.14 m of foot clearance (the image gives about 1.1 m).

Saved as `video-flying-side-kick`. Compared with the video on a 12-frame sheet, the run-in, chamber, takeoff, tucked leg and arms follow the performer. Open points: the kicking leg appears about a third shorter in the image than a standing leg, which the fit reads as roughly 45° away from the camera; one view cannot say whether that is real, exaggerated, or toward the camera instead. Purple effects are composited over the legs around takeoff. Heights assume a level camera and constant subject distance, and root travel is still image-X only.

## Video review for every video-derived action (6 October 2026)

Studio's **Video review** button used to open one pinned side-kick bundle regardless of the selected action. It now follows the selected action: any action with a current linked source video shows that video beside the character on the shared timeline, and review stays on while switching between such actions.

- `reconstruct_motion` with `commit: true` links the source automatically. `link_video_source` (`actionId`, `expectedRevision`, `video`, `start`, `end`) attaches a window to an existing action; its length must equal the action duration.
- The link stores the file path, checksum, size, modified time, window, action revision and the motion-quality windows (shown as review buttons). It is bound to that revision, so a revised action needs relinking.
- The service streams the original file from `/api/video-source?actionId=…` with range requests. It serves only files it linked itself and refuses one whose size or modified time has changed.
- The video is not copied: moving or deleting the original breaks review for that action, and exported projects carry the local path.

All eight existing video-derived actions were linked. The older `/api/video-review/` bundle routes remain but the editor no longer uses them.

## Flying kick leg level with the clip (6 October 2026)

In `video-flying-side-kick` the kicking leg looked lower and shorter than in the clip. Its image direction was right (about 10° above horizontal), but the fit tilted it about 45° away from the camera. The 3D lift had it nearly in the image plane (about 11°). The tilt came from the segment-length term: the raised leg measures about a quarter shorter in the image than a standing leg (hip and ankle points drift inward on a raised leg), and fixed lengths can only explain that as depth.

Three changes in `fit.py`, all under the straight-knee option:

- Segment lengths are relaxed on a raised leg that looks straight, so it keeps the depth of the lift.
- A leg also counts as raised when its ankle is no more than half a leg length below its own hip, which holds when both feet are off the floor.
- A raised leg is pulled straight from a 2D knee angle of about 150° up (was 160°): the knee point sits on the kneecap, so a straight raised leg can read that low. This removed a dip to 154° in the last frames.

Result, `video-flying-side-kick-v2`: depth tilt at the kick 13–17° (was 42–46°), elevation +10°, knee 180° from 1.53 s to the end. On the comparison sheet the leg is level and full length as in the clip. The tucked leg is unchanged: its shin is estimated pointing about 50° away from the camera, which matches the lift and the body orientation but cannot be confirmed from one view.

The same change moves the karate side kick: elevation 30.2° → 33.6° and tilt toward the camera 28° → 13°, with snap timing, leg clearance (11.3 cm) and the steady ready hold unchanged. Saved separately as `video-side-kick-v6`; v5 is untouched.

## Trunk turning after the kick, and head direction (6 October 2026)

In `video-flying-side-kick-v2` the upper body turned to the left after the leg straightened at about 1.74 s, while in the clip it holds its side-on position with the head facing the kick.

- **Trunk.** Which way the trunk faces is set almost entirely by the depth of the hips and shoulders, which the image barely constrains. The lift held shoulder yaw at about +21° after 1.7 s; the fit swung it from +25° to −5°, and hip yaw differed from the lift by up to 53° frame to frame. The karate clip had the same fault (up to 22° and 33°). `fit.py` now keeps trunk joints (pelvis, hips, spine, neck, head points, shoulders) at the lift's depth, smoothed over about a fifth of a second, and the general depth prior is raised from 0.12 to 0.5. Shoulder yaw now stays within 8° of the lift (flying kick) and 1° (karate), and holds +20° to the end of the flying kick.
- **Head.** The head bone was not driven at all, so it faced wherever the chest did. The lifted head joints cannot fix that: the head-top input is extrapolated through the nose, so a turned face reads as a head lying on its side (66–68° from vertical at the kick). `lift.py` now emits `faceDirection` from the nose relative to the visible ear(s), and retargeting keeps the head upright between trunk and vertical and turns it that way, at most 80° from the trunk and only when the face points are confident. In both clips the face reads as a left profile throughout, toward the kick.

Costs: projection error rises (flying kick 0.0078 → 0.0110, karate 0.0075 → 0.0089) because the trunk no longer bends its depth to fit the image. Kick-leg angles, leg clearance (10.3 cm minimum on the karate clip) and the steady ready hold are unchanged. Saved as `video-flying-side-kick-v3` and `video-side-kick-v7`; earlier versions untouched. The head rule assumes the rest pose faces straight ahead and uses a fixed nose-to-ear size (8.5% of body height); it has only been seen on profile views.

## Phase 5: skill, review sheets and bounded corrections (6 October 2026)

The LLM-facing workflow is `skills/video-to-action/SKILL.md`: look at the video, choose the window and options, label phases, reconstruct, compare with the source, correct within bounds, report. Three additions support it.

- **`inspect_video`** writes a labelled contact sheet of a video or a window of it, so the window and phase times are read off frames instead of guessed.
- **`compare_video_action`** writes a sheet with video frames above the character from the front and side at the same clip times, for an action with a linked source. The capture camera for these sheets now stands further back so a jump stays in frame.
- **`corrections`** on `reconstruct_motion` run as their own cached stage between fit and retarget. `smooth` averages a body part's joint positions inside a window with the window's end frames fixed; `hold` keeps the part in its pose from the window start and eases back over the last three frames. Parts: `left-leg`, `right-leg`, `legs`, `left-arm`, `right-arm`, `arms`, `head`.

Trial, following the skill with tools only, on a different take of the flying-kick recording (22.75–26.05 s, includes the landing):

- The first attempt was wrong because the contact sheet's timestamps were off by up to about 0.25 s: the recording has a variable frame rate and the sheet sought by time. Sheets now match frames to their real timestamps, as the reconstruction does. The mistimed action was archived.
- The second attempt, `video-flying-kick-landing-v2`, matches the video on a 12-frame pass over the whole action and a 12-frame pass over kick and landing: run-in, chamber, takeoff, level kick, descent, one-leg landing, recovery. 24 s uncached. Peak lift 1.15 m. Three velocity windows are flagged at phase boundaries (0.78, 1.88, 2.98 s).
- A `smooth` correction on the kick leg over 2.0–2.7 s reran in 0.08 s and changed only the right thigh and shin tracks, only between 2.03 and 2.67 s (`-v3`).

No joint angle was edited by hand. What the trial does not show: a different performer, camera angle or movement type; whether `hold` is useful in practice (only unit-tested); and the user's own judgement of the motion in playback.

## Clip 3: triple spinning kick, a different performer and camera (6 October 2026)

Source: a 17 s screen recording of a taekwondo combination (three kicks with two full turns), landscape, recorded at about 18 frames per second, then a paused frame. Window 2.30–5.15 s, `straightKneePrior` and `airborne` on, seven phases. Run 120af2fd, following the `video-to-action` skill.

- **v1** got the ready stance, landings and recovery, but the kicks were bent or absent. The cause is blur: at 18 fps a fast kick is a smear, and the detector either exchanged the two legs between frames or drew the kicking leg on top of the standing one.
- **Leg-swap repair (new, in `lift.py`).** When exchanging a frame's left and right knee and ankle removes most of a large frame-to-frame jump (over 0.5 body heights in total, at least halved), the labels are exchanged. Nine frames were exchanged in this clip, none in the other three clips. A confidently drawn merged leg is now also rejected after a jump over 0.45 body heights within four frames.
- **v2** (`video-triple-kick-v2`): on a 12-frame dense sheet, kicks 2 and 3 are extended and level at the right times (1.3–1.4 s and 2.2–2.3 s), with chamber before and lowering after.

Still wrong in v2, and not fixable by options or corrections:

- **Kick 1 is missing** (0.47–0.67 s). For seven frames the detector draws both legs straight down with confidence above 0.9 and identical positions. The extended leg is never observed, so there is nothing to repair from; bridging would only give a low leg.
- **First turn goes the wrong way round.** The trunk turns to back-facing (about 170°) and returns the same way instead of continuing through the spin. The second turn completes a full 360°. From 2D points the two directions look the same.
- The contact sheet for landscape video was unreadable as one strip; comparison sheets now wrap into blocks of four columns (six for portrait).

What this says about generality: the pipeline carried over to a new performer, camera and movement without retuning for the parts the detector saw. Its ceiling here is the 2D detector on blurred, low-frame-rate footage. A source recorded at 30 fps or more, or the original video file instead of a screen recording, is the most direct fix.

## Clip 3 from the original video file (6 October 2026)

The user supplied the original 720p, 30 fps file; the triple kick is its second combo. Window 38.85–41.70 s, same options and phases, run ef369e51, saved as `video-triple-kick-v3`.

- Detection is cleaner than from the screen recording: no merged-leg repairs, five leg swaps repaired (nine before), eleven weak frames around the two turns.
- Kicks 2 and 3 are recognisable on a dense sheet: chamber, extension to about horizontal, lowering. Kick 3 extends slightly early and lower than the video.
- **Kick 1 is still missing.** The earlier conclusion that the screen recording's frame rate was to blame was wrong, or at least incomplete: in the original the kicking leg is still a motion-blurred white streak against a white wall, and the detector draws both legs straight down for five frames (0.48–0.68 s) at confidence above 0.9. Running `yolo26s` and `yolo26n` at 1280 px input instead of 640 px misses it as well.
- The first turn still goes to back-facing (about 170°) and returns the same way; the second completes 360°.

So the limit on this clip is the 2D pose detector on blurred footage, not the capture. Options not yet tried: a larger or blur-tolerant pose model (needs a download), or a second estimate of the kicking leg from image evidence other than keypoints.

## Tricking basics video: catalogue and pilot (6 October 2026)

Source: a 232 s, 60 fps slow-motion compilation with one performer, a fixed camera and an on-screen title per trick. `authoring/reviews/video/tricking-basics/catalog.json` lists 59 titled clips (the video's title says 60) with names read from the titles and a proposed window each. The split comes from the brightness of the title band; tricks are separated by crossfades that briefly show two performers, so windows start at least 1.1 s after the previous title ends.

`reconstruct_motion` gained `sourceSpeed` so slow-motion footage becomes a real-time action; Video review and comparison sheets map action time back to footage time. The pilot assumed 0.4, from a hook kick lasting 2.2 s of footage. That factor is a guess.

Four clips were run (run 78495786), each about 44 s uncached because the detector stage reads a long 60 fps file:

| Clip | Result against the video |
| --- | --- |
| Hook kick | Wind-up, turn and recovery match. The high kick, seen from behind, is not reproduced |
| Tornado kick | Wind-up, first kick, jump (1.13 m) and landing match. The second, high kick is missed |
| Cartwheel | Entry and exit match. The inverted middle collapses into a heap on the floor |
| Frontflip | Failed: the tucked, inverted body is lost by the detector in 45 of 81 frames |

What this means for a library built from this video:

- About 20 of the 59 clips stay on the feet (kicks, sweeps, spins), judged from their names only. These are within reach, with the known weakness on very high or back-facing kicks.
- The other 39 go inverted or put hands on the floor. The pipeline cannot do these yet: floor placement uses the feet only, the head rule assumes an upright head, the detector loses tucked inverted bodies, and the 3D lift is untested upside down.
- None of the pilot drafts is good enough to register as a movement.

## Tricking basics: batch of 20 upright clips (6 October 2026)

**Footage speed.** During the tornado kick's jump the trunk centre falls freely; a parabola fitted to its image height gives a footage speed of 0.50–0.53 for a performer 1.65–1.85 m tall, and the hang time implied by the rise agrees at 0.53. The batch used 0.5. The pilot's 0.4 was wrong.

**Performer tracking.** The first batch failed on 9 of 20 clips: the detector stage picked the tallest figure in the first frame, which during a crossfade is the fading previous performer, and then lost the real one. `observe.py` now chains boxes frame to frame by overlap, takes the longest chain as the performer, and continues past broken overlaps by overlap or height. The karate, flying-kick and triple-kick clips reproduce their earlier repairs and projection errors exactly. The second batch ran all 20 with no lost frames, about 56 s per clip.

**Results** (`authoring/reviews/video/tricking-basics/batch-upright.json`; six sampled poses per clip, front view against the video, judged by the LLM only):

| Grade | Clips |
| --- | --- |
| Good (4) | Pop 360 (crescent), Pop 360 hyper, J-step swing 540, Pop 720 |
| Fair (3) | Front sweep, (Cheat) 540 kick, Cheat 900 |
| Partial (8) | Hook kick, Tornado kick, Cheat 360 crescent, Feilong, Swing 720, Cheat 720, Backside 900, Cheat 720 double |
| Poor (3) | Round(house) kick, Outside crescent kick, Back sweep |
| Not upright after all (2) | Scoot, Palm kick |

The pattern across the partial and poor clips is one failure: a high kick, with the leg near vertical beside the head, is not reproduced. The character stays standing or airborne with the leg down. Wind-ups, spins, jumps, tucks and landings carry over. Jump heights were not checked against the footage; 1.87 m for Backside 900 looks too high. Scoot and Palm kick were grouped as upright from their names but put the hands on the floor.

None of these has been watched in motion or seen by the user, and none is registered as a movement.

## High kicks: lost-leg detection and arc bridging (6 October 2026)

The user pointed out that Pop 360 (crescent) had the high-kick fault too: from 0.68 s the left leg should swing up to nearly vertical beside the head at 0.76 s and be back out by 0.89 s.

Cause, from the detector overlay: as the leg crosses the body the detector redraws it straight down on the other leg for about ten frames. The first such frame missed the "merged" test by a hair (ankles 0.21 body heights apart against a 0.2 limit), was accepted as trusted, and made every later frame look consistent. Frames that were flagged were bridged in a straight line, which pulls the leg through the body.

Changes in `lift.py`:

- A leg is also lost when its ankle jumps more than 0.45 body heights in one frame. It stays lost, for at most twelve frames, while it is merged or its knee or ankle is below 0.9 confidence, and a run ends only when the next frame looks good too.
- Lost runs with trusted frames on both sides are bridged by swinging knee and ankle about the hip. Of the two ways round, the one that does not pass through the other leg is taken. The summary lists these as `legArcBridges`.

Pop 360 (crescent): one bridge, 176° over the top, 1.37–1.73 s of footage. On eight poses from 0.62 to 0.94 s the leg is out left at 0.68, near vertical beside the head at 0.76–0.80 and out right at 0.89, as in the clip. The path inside the bridge is inferred from its two ends, not observed.

Batch rerun (eight poses per clip): good 9, fair 5, partial 3, poor 1, not upright 2 (was 4, 3, 8, 3, 2). Still missed: the high part of the Hook kick, and the second high kick in Tornado kick, Feilong and Backside 900, where the detector's error did not trip either rule. Earlier clips: the karate kick's four lost frames are now bridged along arcs (projection 0.0096 → 0.0098); the triple kick gains five repairs but its first kick is still missing; the flying kicks are unchanged.

## Spins: limbs turn with the body, and a bridged kick passes in front (6 October 2026)

User review of Pop 360 (crescent): from 0.22 s the upper body turned while the lower body kept facing front, and at 0.8 s the kicking leg swung through the back of the body. The user asked for a rule that a high spinning kick always passes in front of the body.

- **Limb twist.** The estimate's hips and shoulders turned together (within about 55°). The fault was in `retarget.ts`: each limb was swung onto its target direction starting from the rest pose in world space, so its twist never followed the body and knees and feet kept facing the camera through a spin. `localForDirection` now first carries the limb with its parent bone's rotation and then swings the shortest way onto the target (operation path only). On the rig, toes are within about 10° of the pelvis facing at 0.3–1.2 s; the right foot lags 39° at 0.15–0.22 s while still planted.
- **Front of the trunk.** A bridged leg has no observed depth and the lift had placed it behind. `fit.py` now keeps the knee and ankle of a bridged leg on the chest side of the pelvis (at least 0.5 and 1.0 hip widths, fading in from the bridge ends). The chest direction comes from the lifted shoulders and spine.

Pop 360 (crescent) r4: the leg crosses in front of the chest at 0.76–0.80 s on the comparison sheet. The rule applies only inside bridges; a leg tracked throughout keeps the estimate's depth. Batch rerun: grades unchanged (9 good, 5 fair, 3 partial, 1 poor, 2 not upright); Cheat 360 crescent and Feilong each look slightly worse at one sampled pose, where a bridged leg pushed forward reads lower from the front. Earlier clips: karate kick clearance 10.2 cm and hold steady; flying and triple kicks unchanged in outcome.

## Leg identity when the legs overlap (6 October 2026)

User review of J-step swing 540: correct at 0.56 s, then the swinging right leg suddenly became the support leg.

Cause: my own leg-swap repair. As the right leg comes down beside the left, the detector draws both legs on top of each other for a few frames. Comparing the next clear frame with such an overlapped frame, either labelling fits equally well, and the repair exchanged left and right for the next 14 frames. The raw detections were right throughout.

Changes in `lift.py`: leg identity is now judged only between frames where the legs are apart; overlapped frames are neither tested nor used as the reference. Identity is corrected only between adjacent frames: a first version compared across the overlapped gap and introduced new false swaps in three other clips (Outside crescent kick, Cheat 360 crescent, Feilong), because a leg can really move far across a gap. Two further guards came out of re-checking the triple kick: a bridged leg takes the long way round only for a swing wider than 90°, and the "impossible one-frame jump" limit now scales with footage speed (0.7 body heights in real time, 0.5 at half speed), since a real-time kick does cover that much between frames.

J-step swing 540 r5: no swaps; on the rig the right foot is the raised one from 0.50 to 0.90 s and the left takes over at 1.0 s for the final kick, as in the clip. Pop 360 (crescent) and the karate kick keep their bridges; the triple kick's third kick is intact (`video-triple-kick-v4`), its first kick still missing.

## Swings must be smooth: reversal, stub and straight-line rules (6 October 2026)

User review of J-step swing 540: good at 0.58 s, then the swinging leg suddenly dropped and came back up to the correct pose at 0.74 s. The user asked for a rule that three positions along a swing must be smooth. The remaining high-kick misses were to be fixed too.

Cause: as the right leg swung across behind the body it pointed away from the camera, and for six frames the detector drew it straight down on the left leg. The jump (0.23 body heights) was under the lost-leg limit, so those frames were trusted.

Changes in `lift.py`:

- **Reversal.** A leg that snaps onto the other leg against the direction it was moving over the previous trusted frames (jump over 0.15 body heights, reduced confidence) is lost.
- **Stays lost while overlapped or a stub.** A lost leg stays lost while the legs overlap, and while its thigh plus shank is under 60% of its usual image length; runs may last 20 frames (was 12).
- **Straight line for a foreshortened leg.** If the leg's hip-to-ankle reach at either end of the bridge is under half its maximum, the bridge is a straight line in the image instead of an arc about the hip.

J-step swing 540 r8: the leg rises steadily from 0.58 to 0.74 s with no dip. Hook kick r8: the detector had drawn the kicking leg as a stub for four frames after losing it; the run now extends to where the leg reappears and the bridge is a 171° arc over the top, matching the clip on eight poses. Karate kick: its recoil bridge is now a straight line (folded leg), as it was in the version the user accepted. Flying kick unchanged.

Not fixed: the second high kick in Tornado kick (the bridge exists but one end is foreshortened, so it is a straight line), Feilong and Backside 900 (no lost run is detected there).

## Which leg is lost in an overlapped stretch (6 October 2026)

Tornado kick, Feilong and Backside 900 each missed a high kick. In all three the detector drew both legs together down the hanging leg for 10–15 frames while the kicking leg was vertical beside the head. The forward rules either flagged the wrong leg (the one that happened to be drawn as a stub just before) or flagged nothing.

New rule in `lift.py`, applied before the forward pass: for an unbroken stretch of at least three overlapped frames, look at the first clear frame after it where a leg has moved more than 0.3 body heights from where the pair was drawn. That leg (it must have moved at least twice as far as the other, with a one-frame snap over 0.25 on the way in or out) is lost for the whole stretch, plus stub frames just before; the other leg is trusted. The run ends exactly where the leg reappears. Feet that are simply together arrive and leave gradually and are not affected. Related changes: whether a bridge is a straight line is decided by the leg's image length (thigh plus shank under 60% of usual), not its hip-to-ankle reach, so a tucked leg still swings on an arc; and the long way round is taken only when the other leg lies in the middle half of the short sweep.

Results on eight-pose sheets: Tornado kick r10 and Feilong r8 now show the second kick vertical beside the head at the right time. The triple kick keeps its second and third kicks, and its first kick, previously absent, is now a low swing. Backside 900 is still wrong: the frames before its overlapped stretch have both legs tucked and mislabelled, so the bridge starts from a bad pose and takes the low way round. Karate kick: recoil bridge is an arc again (folded leg, full image length).

## Limb roll must be continuous (7 October 2026)

User review of Cheat 720: fine at 0.75 s, but at 0.82 s the legs appeared to swap, with a leg spinning against the body's spin.

The joint positions were right. The fault was the kicking leg's roll about its own axis: on the rig its toe direction turned 83° and then 80° in two 0.02 s steps while the shin itself moved 20–30°. `retarget.ts` swung each limb the short way from its (parent-carried) rest direction every frame; when a leg is kicked straight up it points opposite its rest direction, the short way switches sides, and the roll flips by about 180°.

Now, after the first frame, a limb is carried by its parent's turn since the previous frame and swung the short way from where it last pointed, so the roll is continuous. To stop roll drifting over a spin it is eased back toward the rest-anchored roll by up to 20% a frame, fading to nothing when the limb points opposite its rest direction. Cheat 720 r10: toe turn per step is at most 33° and never exceeds the shin's by much; toes stay within about 55° of the pelvis facing and return to within 20° by the end. This applies to every limb in every clip, so all video-derived actions change slightly on their next rebuild.

## Legs on the right side, knees the right way (7 October 2026)

User screenshots of Cheat 720 at 0.54–0.66 s: legs look swapped at 0.54 s and the pose at 0.57 s looks wrong.

Measured on the rig for those times:

- **0.54 s, legs exchanged in depth.** He is side-on, facing image-right, so his right side is nearer the camera. The estimate had the right foot 0.31 m on the far side and the left foot nearer than the right. Side-on, the legs overlap in the image and the lift gets their depths exchanged.
- **0.61–0.70 s, knees bent backward.** In the back view the tucked right leg was placed in front of the body with its knee pointing behind the pelvis (knee-forward measure −0.7 to −0.8).

Two anatomical terms in `fit.py` (weight 400 each, `--no-knee-direction` disables both), with left, right and front taken from the hips and spine of the lift:

- **Knee direction.** The knee stays on the front side of the hip-to-ankle line, scaled by how bent the leg is.
- **Own side.** A knee may cross the body's midline by 0.3 hip widths and an ankle by 0.8, no further.

Cheat 720 r13: right foot depth at 0.54 s −0.31 → −0.02 m; knee-forward measure positive for every bent leg from 0.50 to 0.70 s; tucked foot behind him in the back view. Both measures are reported in the fit report (`backwardKnee`, `crossedLegs`). Other clips: karate cross-step keeps 10.2 cm clearance with no depth-order flips; projection error rises slightly everywhere (for example triple kick 0.0128 → 0.0153). The body turning about 80° between 0.54 and 0.57 s is in the footage (shoulder order reverses over three frames) and was left alone.

## Limits

- Each uncached run starts new Python processes, so imports and model load are paid every time; there is no resident model.
- Subject selection is tallest-first then box overlap. It is not identity tracking and there is no way to pick another person yet.
- Root travel is approximate image-X only. Depth, twist, foot orientation, mirroring and world scale remain estimates.
- Windows are capped at 8 s (MotionBERT accepts 243 frames; baked tracks allow 256 keys).
- The stage scripts changed, so the pilot bundle's stage fingerprints were regenerated; its data files are unchanged.
