---
name: video-to-action
description: Turn a window of a local video into a draft 3D character action in Animation Studio, review it against the source frames, and apply bounded corrections. Use when the user supplies a video clip of a person and wants the movement as an action.
---

# Video to action

Project: `/Users/tim/Yun/codex-3d`. The Studio service must be running (`npm run start:authoring`, port 5174). Use the `animation-studio` MCP tools, or `node authoring/cli.mjs call TOOL --args file.json`. Reference: [RECONSTRUCT_MOTION.md](/Users/tim/Yun/codex-3d/docs/RECONSTRUCT_MOTION.md).

You choose the window, the options and the phase labels, and you judge the result against the video. The tools do all numerical work. Never patch joint angles or keyframes by hand to make a video-derived action look right; if the tools cannot get there, say what is wrong and stop.

## 1. Track and look

1. `begin_action_run` with the user's request.
2. `inspect_video` on the whole file, then Read the returned PNG. Note what the recording contains: repeats, slow-motion replays, insets of other people, cuts, overlays, and where one clean real-time performance starts and ends.
3. `inspect_video` again on the candidate window with a higher `count` to place the start and end within about 0.1 s.

## 2. Choose the window and options

- **Window**: one continuous real-time performance by one person, 0.5–8 s. Start once the whole body is inside the frame and end before a cut or freeze. Prefer a start and end in a settled pose. The tallest person in the first frame is the one followed, so do not start on a frame where someone else is larger.
- **`source`**: leave it out. The body model (SAM 3D Body) is used when installed and handles kicks, spins, hand-supported and inverted moves; `summary.source` says which source ran, and gives a `fallbackReason` when the rule pipeline ran instead. Set `source: rules` only to compare, or when you need a rule-only option (`fit`, `straightKneePrior`, `decisions`).
- **`smooth`** (body source): 0–1, default 1. Lower it only if a fast, sharp move looks softened against the video.
- **`straightKneePrior`** (rule pipeline only; selects it): set `true` when a kicking or raised leg is seen roughly side-on and visibly straightens. Leave `false` when the leg points toward or away from the camera.
- **`sourceSpeed`**: for slow-motion footage, the fraction of real speed (0.4 = 40%). The action comes out in real time; `phases` and `corrections` stay in footage seconds, while review times are action seconds. State how you estimated it.
- **`decisions`** (rule pipeline only; selects it): set `true` for spins and fast kicks where legs cross, if the user accepts cropped frames being sent to a vision model through OpenRouter (about a cent per clip). It lets confident answers veto wrong leg-swap repairs. Check `decisions.legDisagreed` in the summary: those times are where the model and the detector name different legs.
- **`airborne`**: set `true` only if both feet leave the floor. It assumes a level camera and a performer at roughly constant distance.
- **`phases`**: name what the body is doing, in clip seconds from the window start, the last ending at the window length. Mark quick strikes `fast` and still poses `hold`. Read the times off the contact sheet; do not guess.
- **`actionId`**: a new id that does not start with `move-`. Use a fresh id (or `-v2`, `-v3`) for each attempt so earlier ones remain for comparison.

Run `reconstruct_motion` with `commit: true` and `expectedRevision: 0`. Committing links the source video, so Studio's Video review shows it beside the character.

## 3. Read the summary before looking at pictures

- `subjectClippedByFrameEdge`, `missingSubjectFrames`: move the window if these cover much of it.
- `lowConfidenceBodyTimes`, `repairedLegObservations`, `extendedLegReach`: times where the detector struggled or was repaired. Inspect these first.
- `quality.inspectionWindows`: velocity flags. They mark places to look, not faults.
- `peakLiftMeters`: for a jump, compare with what the video shows.

Also in the summary, from the character itself:

- `action.jitter`: millimetres of frame-to-frame shake in knees, feet, elbows, hands and head (distance from a smooth curve through neighbouring frames). About 4–7 mm with smoothing on these clips, 9–13 mm without.
- `action.bodyPartsInside`: frames where one part is more than 2 cm inside another, the worst depth, each stretch with the pair involved, and `crossings` (a limb that changed from in front of a part to behind it while overlapping it). Look at those times first.
- `action.jointRangesBeyondNormal`: joints past textbook ranges. Expected for hips in splits and high kicks; a prompt to look, not an error.
- `estimate.reobservedLegFrames`: frames where a lost leg was found again on a turned copy of the frame.

## 4. Compare with the video

`compare_video_action` writes a sheet with the video on top and the character from the front and side below. Read it.

1. One pass over the whole action (`count: 10`).
2. A dense pass over each fast phase and each flagged time (explicit `times`, 0.05–0.1 s apart).

Check, in this order: which limb does what; timing of the main beats; limb directions at the peak; whether a held pose is held; feet on or off the floor; trunk facing and head direction. The Front view matches the video camera only roughly: Studio looks slightly down, so a limb pointing in depth reads flatter than in the clip. The side row shows depth the video cannot confirm; treat it as an estimate.

Sheets show poses, not motion. Ask the user to play it in Studio with Video review on before calling anything finished.

## 5. Corrections, in order of preference

1. **Window or option was wrong** (clipped subject, wrong prior, missed jump, bad phase times): rerun with the fix. Unchanged stages are cached.
2. **A part jitters or drifts where the video is steady**: add a bounded correction and rerun.
   - `{"type":"smooth","part":"left-leg","start":1.9,"end":2.3,"strength":2}` averages out jitter.
   - `{"type":"hold","part":"right-arm","start":0,"end":0.4}` keeps the part in its pose from the window start.
   - Parts: `left-leg`, `right-leg`, `legs`, `left-arm`, `right-arm`, `arms`, `head`. Keep the window as short as the problem. At most 8 corrections.
3. **Anything else** (a limb pointing the wrong way throughout, wrong depth, missing motion): this is a pipeline limit. Report it with the times and what the video shows instead. Do not hide it with corrections.

After a correction, compare only the corrected window, then one whole-action pass to confirm nothing else moved.

## 6. Finish

`append_action_run_event` with what you checked and what remains wrong, then `finish_action_run`. Tell the user the action id, what matches the clip, what does not, and that the result is an unreviewed draft. Do not register it as a library movement; that needs the user's acceptance and a contact review.

## Changing a pipeline rule

If the fault is in the pipeline and you change `observe.py`, `lift.py`, `fit.py` or `retarget.ts`:

1. Say what was seen, at what times, and measure the cause before editing (detector overlay, joint numbers on the rig). Do not edit on a guess.
2. Prefer a rule about what a body cannot do over a rule about what the detector probably did.
3. Rebuild every catalogued clip and read the comparison: `python3 authoring/reconstruction/batch.py run --catalog authoring/reviews/video/tricking-basics --rule "…"`. Look at every clip it marks, especially a jump in swapped frames or fit error on a clip you were not working on.
4. Add an entry to [RULE_LOG.md](/Users/tim/Yun/codex-3d/docs/RULE_LOG.md): seen, cause, rule, result on the target clip, effect on the others, status. Record mistakes made on the way.
5. Do not call it fixed from still sheets alone; ask the user to play it.

## Known limits

- One camera: depth, twist, foot angle and mirroring are estimates. The pipeline leans on a learned 3D estimate for depth.
- Travel is sideways in the image only; there is no travel toward or away from the camera.
- Hands, fingers and feet are not posed. The head turns from the nose and visible ear only.
- Tuned on two clips (a karate side kick and a flying side kick). Expect new failure kinds on other movements and report them.
- The source video is played from where it is; moving the file breaks Video review for that action.
