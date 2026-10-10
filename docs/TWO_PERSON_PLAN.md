# Two performers in one video — plan

Written 2026-10-10, after the line drawn at the end of Phase 6's first round (four video movements registered, four composed chains, facing options in the composer). The user asked whether a video with two characters can be handled and asked for a search of what exists before planning. Rule carried over from `SAM3D_PLAN.md`: use what is already installed or published before writing our own.

Nothing in this plan is built yet.

## Goal

From one clip with two people, get two actions on one timeline, standing in one shared space at the distance and facing the video shows, playable together in Studio beside the source. Contact between the two (a hit that lands, bodies that do not pass through each other) comes after that works.

## Where we start

Checked in the code on 2026-10-10:

- `authoring/reconstruction/observe.py` detects every person in every frame and already builds one track per person, linking boxes frame to frame by overlap (IoU 0.2, up to 6 frames apart). It then keeps the longest track and discards the rest.
- `SAM3DBody_Predict` takes a list of boxes per frame and returns one body per box. `body.py` passes one box and reads `people[0]`.
- Each body comes with `pred_cam_t`, its position relative to the camera. We store it in `body-raw.npz` and do not use it.
- Ultralytics 8.4.173 in `.authoring/vision-venv` ships tracker configurations, BoT-SORT among them.
- `.authoring/comfyui` (commit 58b176f) has the `SAM3_VideoTrack` node, and `SAM3DBody_Predict` accepts its `track_data`. The SAM 3.1 weights are not downloaded.
- Root travel of a video action comes from the hip centre in the picture, sideways to the camera only; travel toward or away from the camera is not estimated.
- The action format, the retarget, the Studio viewer and the composer each hold one character.

## What exists elsewhere, and the decision

From the search of 2026-10-10. I read search summaries and ComfyUI's tutorial page, not the repositories; Mac support, licences and maintenance are unverified unless stated.

| Need | Candidate | Decision |
|---|---|---|
| Two bodies per frame | `SAM3DBody_Predict`, already installed | Use. ComfyUI's documentation says it returns one or more people per frame when given boxes or tracks. |
| Identities across frames | BoT-SORT in Ultralytics (already installed): motion plus appearance matching | Try first. No download; a change inside `observe.py`. |
| Identities across frames | `SAM3_VideoTrack` with SAM 3.1 (1.75 GB): tracks with masks; the route ComfyUI's tutorial uses for multi-person clips | Fallback if BoT-SORT swaps the two when they cross. Masks also tell the body model which pixels belong to whom. Reports on Apple Silicon conflict; test on a short clip before relying on it. |
| Both people in one world | Human3R: one model for all people, the scene and the camera | Not now. Needs an NVIDIA GPU, uses the SMPL-X body (a different body model from the one our rotation mapping is built on), licensed for non-commercial research. |
| Both people in one world | `pred_cam_t` from SAM 3D Body | Use. It is the same model we already map to our character. |
| Close contact | BUDDI: a learned prior for two people in close interaction, used to correct two estimates | Later, and only if our own rule is not enough. SMPL-X, non-commercial. |
| Close contact | PromptHMR with its interaction switch; two 2024–2025 papers on closely interacting people from one video | Not now. SMPL-X; public code not confirmed for the two papers. |
| Close contact | Our solid-parts rule (R30, R40), extended from one body to two | Use first. |

## Steps

### Step 1 — two tracks, two actions

- `observe.py` keeps the two main tracks instead of one, each with its own boxes, and names them by where they stand at the start (left and right in the picture). BoT-SORT replaces or backs up the overlap linking.
- `body.py` runs once per track on that track's boxes. Running the two separately keeps the second look (R39), despike (R38) and smoothing per person; one call with two boxes per frame is a later saving.
- `reconstruct_motion` gains a way to say which performer (`subject: left | right`, default the current single choice), and builds one action per call. The pair shares the clip window, so the two actions have the same length and timeline.
- The summary reports how many frames each track is missing and where the two boxes overlap, since those are the frames to distrust.

Done when a short two-person clip gives two actions that each follow their own performer through the whole window, with no swap of identities, checked on review sheets.

### Step 2 — one shared space

- Put both roots in one frame from `pred_cam_t`: sideways and vertical position as now, plus the distance between the two along the camera's line of sight, which solo actions do not have.
- Keep the floor rule as it is (lowest point of each body on the floor) and check that the two floors agree; if they do not, that measures how wrong the depth guess is.
- Store the pair as a record: the two action ids and revisions, and each one's placement. An action stays usable on its own.
- Measure against the video: the distance between the two hip centres in the picture, frame by frame, against the same distance in our scene seen from the camera.

Done when that distance follows the video within a stated error and the two characters face each other when the performers do.

### Step 3 — two characters in Studio

- The viewer loads a second character and plays a pair on one clock, with each character's placement applied.
- Video review shows the pair beside the source clip.
- Confidence levels and notes stay per action; a note can name the other performer.

Done when the user can review a pair the way a solo action is reviewed now. Stop here for the user's verdict before step 4.

### Step 4 — contact between the two

- Extend the measure "frames with a part inside another" to parts of the other body, and report crossings between bodies.
- Extend R40 to the other body: a hand, foot or shin that lands inside the opponent is brought to the surface. Which body gives way is a choice to make with the user (the attacker's limb stops, or the one hit moves).
- Mark frames where a limb of one reaches the surface of the other as hits, for cues.
- Only if this proves too weak: try BUDDI as a prior on the pair, on a machine and under a licence that allow it.

No "done" line yet; it depends on what step 3 shows.

### Step 5 — library use

- Register a pair as two linked movements (an attack and its reaction).
- The composer's `facing: target` rule already assumes one opponent in front; a second character would stand where that target is.

## Risks and unknowns

- **Identity swaps** when the two cross or one hides the other. BoT-SORT's appearance matching is weakest when the two look alike (same clothes).
- **Occlusion.** A half-hidden body is read worse. Expect more wrong frames than in solo clips; masks from SAM 3.1 are the known help.
- **Depth.** The distance between two people along the line of sight is a single-camera guess in every method that takes one video.
- **Time.** Two people cost twice the model time per clip (about 1.8 s per frame per person on this Mac, half that on `mini4.local`).
- **SAM 3.1 on Apple Silicon** is unconfirmed.
- **Licences.** Human3R, BUDDI and PromptHMR depend on SMPL-X, which is licensed for non-commercial research. SAM 3D Body's weights are under Meta's SAM License, as before.

## Needed from the user

- A two-person clip: 2–4 s, fixed camera, both people fully in frame. The project has no such footage.
- What kind of scene it is. Sparring with contact needs step 4; two people moving side by side does not.

## Not in this plan

- More than two people.
- Moving cameras.
- A different body model.
- Changes to solo reconstruction.

## Sources

- ComfyUI SAM 3D Body tutorial: https://docs.comfy.org/tutorials/utility/sam3d-body
- `SAM3DBody_Predict` node: https://docs.comfy.org/built-in-nodes/SAM3DBody_Predict.md
- ComfyUI SAM 3 video segmentation tutorial: https://docs.comfy.org/tutorials/utility/video-segment-sam3
- Ultralytics on ByteTrack and BoT-SORT: https://academy.ultralytics.com/courses/yolo-in-production/tracking-with-bytetrack-and-botsort
- Human3R: https://www.alphaxiv.org/resources/2510.06219
- ROMP, BEV, TRACE: https://www.github.com/Arthur151/ROMP
- BUDDI (Generative Proxemics, CVPR 2024): https://openaccess.thecvf.com/content/CVPR2024/html/Muller_Generative_Proxemics_A_Prior_for_3D_Social_Interaction_from_Images_CVPR_2024_paper.html
- PromptHMR: https://arxiv.org/html/2504.06397v2
- Close human interaction from one video: https://arxiv.org/pdf/2507.02565 and https://arxiv.org/html/2404.11291v1
- SAM 3 on Apple Silicon, conflicting reports: https://huggingface.co/facebook/sam3/discussions/11 and https://codersera.com/blog/how-to-run-sam-3-locally-2026/amp/
