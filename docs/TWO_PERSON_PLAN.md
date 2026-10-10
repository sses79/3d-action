# Two performers in one video — plan

Written 2026-10-10, after the line drawn at the end of Phase 6's first round (four video movements registered, four composed chains, facing options in the composer). The user asked whether a video with two characters can be handled and asked for a search of what exists before planning. Rule carried over from `SAM3D_PLAN.md`: use what is already installed or published before writing our own.

Nothing in this plan is built into the pipeline yet. A first experiment was run on 2026-10-10 with scratch scripts; see the next section.

## First experiment (2026-10-10)

Clip: 1.70 s (51 frames at 29.97 per second) cut from a fight highlight video the user supplied, 54.65–56.35 s: two fighters, one low kick that lands on the other's leg, a crowd behind, no referee in shot. The camera pans and zooms during it, which the plan had hoped to avoid. The cut is in untracked `.authoring/two-person/kc-kick.mp4`; no footage or frames are in this repository.

- **Identities (BoT-SORT in Ultralytics, YOLO26s pose, 960 px):** both fighters keep one identity each for all 51 frames, through the kick where their boxes overlap. The two largest tracks by box area are the fighters; spectators are far smaller. Checked on a sheet of 12 frames with the boxes drawn.
- **Bodies (`SAM3DBody_Predict` with two boxes per frame):** two bodies in every frame; 191 s for 102 bodies on this Mac (1.87 s each). Drawn over 12 frames, each skeleton follows its own fighter, the kicking leg included.
- **Shared space (`pred_cam_t`):** the distance between the two along the floor goes from 1.36 m to 0.94 m at the kick and back to 1.34 m. At frame 35, the kick, one fighter's ankle is 0.12 m from the other's shin in camera space, which is two limbs touching. So the per-person camera positions are consistent enough between the two bodies to show the contact.
- **Not checked:** depth between the two (it swings from -0.40 m to +1.07 m over the clip, some of which may be the zooming camera and not the fighters); anything in motion; our character, since no action was built; clips where the two cross over or clinch; the referee as a third person.
- **Side effect:** Ultralytics installed the `lap` package (0.5.13) into `.authoring/vision-venv` by itself the first time tracking ran.

**Step 1 built the same day.** `observe.py --subject left|right` follows one of the two largest identities from BoT-SORT (named by where they stand at the start; 960 px input); `reconstruct_motion` takes `subject`; the summary reports the other performer (`observations.otherPerformer`: frames missing, frames where the two boxes overlap). Raw-result reuse is off for these windows, because it matches by frame numbers, which the two performers share. Built from the kick clip, straight from the source video: `pair-kc-kick-left` (white trousers, the one kicked) and `pair-kc-kick-right` (black trousers, the kicker), 1.70 s each, both on rotations, 0 frames with a part inside another, jitter 5.4 and 8.2 mm, no frames missing, boxes overlapping in 11 frames (1.11–1.44 s). Review sheets read for both, eight poses each: the right fighter's action shows the guard, the step in and the low kick at 1.21 s; the left fighter's shows the guard, the reaction with an arm thrown up and the fall starting at 1.70 s. Each follows its own performer. Not judged in motion. Each action stands at its own origin; nothing places the two together yet (step 2). Known nuisance: one build takes longer than the command-line client waits, so the client reports a timeout while the service finishes and saves the action.

**Step 2 built the same day.** `body.py` writes `cameraHip`: the hip centre in the camera's space (keypoints plus `pred_cam_t`; they project onto the model's own 2D keypoints with 0.0 px error on the 102 bodies of the experiment). For a build with `subject`, the retarget takes sideways and depth travel of the root from it, from that performer's own first frame, and records the first-frame position (`action.scene` in the summary, `build.scene` on the entry). Solo builds are unchanged. New operations `set_pair` and `list_pairs`: a pair names two actions from the same video window and stores the right performer's offset from the left one at the first frame; neither action is changed. Pair `pair-kc-kick` (both actions at revision 2): the right fighter starts 1.29 m to the side and 0.40 m nearer the camera. Measured from the two saved actions plus that offset: the distance between the characters is 1.35 m at the start, 0.86 m at 1.10 s (the kick) and 1.37 m at the end. Projected back through the model's lens, the gap between the two hip centres in the picture is within 2.4 px on average and 7.2 px at worst of the body model's own 2D hips over the 51 frames (the gap is about 343 px), so the saved pair keeps what the model saw. That comparison is against the model's 2D reading, which was looked at drawn on 12 frames, not against a hand measurement. Not checked: whether the two characters face each other as the fighters do (both take their orientation from the same camera frame, so they should); the depth travel each action now has (1.37 m for the left fighter, 0.59 m for the right), part of which is the camera zooming; anything in motion, since Studio cannot show two characters yet (step 3).

**Step 3 built the same day.** Studio (`editor/main.tsx`): when the selected action is one side of a current pair, the other side's action is fetched and played by the viewer's first character (blue, normally the reference) at the pair's offset, on the same clock; a Pair button in the view bar turns it off and on. It also shows during Video review, so the source frame, the selected performer and the partner are on screen together. Seen in the browser on `pair-kc-kick-right` at 1.10 s, front view: the two characters stand facing each other, the kicker's leg is at the other's leg, and the video frame beside them shows the same moment with the same left and right. That is two stills; playback has not been judged. Not built: notes that name the other performer; a pair entry of its own in the sidebar (a pair is reached through either of its actions); the pair in Compare or Reference view.

## Clinch clip and SAM 3.1 (2026-10-10)

Second clip from the same video, 26.15–29.95 s (114 frames; untracked `.authoring/two-person/kc-clinch.mp4`): the fighters square up, one punches, they clinch and turn round each other, so they swap sides and one hides the other.

- **BoT-SORT on it:** both identities hold through the punch and into the clinch (to about frame 65), then the fighter who goes behind is lost; from about frame 70 only one identity remains, and a new identity number appears later. So step 1 as built does not cover a clinch.
- **SAM 3.1 video tracking** (`sam3.1_multiplex_fp16.safetensors`, 1.75 GB, downloaded with the user's approval into `.authoring/comfyui/models/checkpoints`; `SAM3_Detect` on the first frame from the two fighters' boxes, then `SAM3_VideoTrack`): it runs on this Mac, on the GPU and on the CPU, so the reports that it cannot run on Apple Silicon do not hold for ComfyUI's port. Two problems. It is slow: 9.5–10 s per frame, 19 minutes for the 114 frames. And it does not work here: the first-frame masks are good (two clean masks of about 50,000 and 66,000 pixels) and stay good for 7 frames, then every mask is empty for the rest of the clip. Same result in four runs: GPU with starting masks, CPU with starting masks, GPU with starting masks plus the text prompt "person", GPU with the text prompt alone (four objects found, all gone at frame 7). Seven frames is the tracker's memory length, so this looks like a fault in how the tracker carries on past its first memory window in our ComfyUI checkout (commit 58b176f), or in how these scripts drive it. Cause not found.
- **Removed the same day at the user's request:** the SAM 3.1 weights file is deleted from `.authoring/comfyui/models/checkpoints`. Nothing in the pipeline uses SAM 3.
- **Not tried:** a newer ComfyUI checkout (it would also change the SAM 3D Body code our mapping was checked against); the mini; Meta's own SAM 3 code.

This is one easy case. It says step 1 and the start of step 2 are as reachable as hoped; it says nothing yet about occlusion.

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
| Identities across frames | `SAM3_VideoTrack` with SAM 3.1 (1.75 GB): tracks with masks; the route ComfyUI's tutorial uses for multi-person clips | Tried 2026-10-10 and dropped for now: about 10 s per frame here and every track lost after 7 frames (see "Clinch clip and SAM 3.1"). Weights removed. |
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
