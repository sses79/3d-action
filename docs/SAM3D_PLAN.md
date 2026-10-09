# SAM 3D Body as the main path — plan

Written 2026-10-09, after runs 35–41 showed the SAM 3D Body builds (`sam3d-<slug>`) beat the 35-rule pipeline on all 59 tricking clips. Agreed order with the user: (1) a direct person detector so the old 2D stage drops out, (2) SAM 3D Body as the default with the old pipeline as fallback, (3) joint rotations. Rule for this plan: use what ComfyUI already ships before writing our own.

## Status

- Step 1: done 2026-10-09 (run 42).
- Step 2: done 2026-10-09 (run 43): default, fallback, smoothing, jitter measure. MoGe field of view tried and not adopted (below). Single-frame pose jumps: fixed for runs of one or two frames (R38, run 44); longer wrong stretches in four twisting clips remain. Left over, not blocking step 3: the mini is used by hand (send person boxes, run `body.py`, copy `body-raw.npz` into `.authoring/sam3d-trial`), not yet as a configured runner.
- Step 3: first cut done 2026-10-09. `pose: rotations` drives 22 bones (spine, limbs, hands, feet, toes) from the model's joint rotations; built for three clips as `-rot` actions beside the position builds. Default is still positions until the user has compared them. User, same day: the rotation builds of Hook kick and Backflip (overtuck) are better "for sure". Second-look frames now carry rotations (run 45: Raiz and Sideswipe build on the rotation path). Fingers driven (run 46: 30 bones, from the whole-body pass; hand refinement not switched on). Seven clips on rotations after run 47; one regression (Cheat 720, left wrist in thigh for 3 frames), fixed by R40 in run 48 at the cost of 1.6 mm jitter on that clip. Left: the user's comparison of those, then the default.

## What ComfyUI ships and what we do with it

Checked in our checkout (`.authoring/comfyui`, commit 58b176f). "Use" means call it from our script, as we already do for Predict; none of it needs the ComfyUI interface.

| ComfyUI part | What it does | Decision |
|---|---|---|
| `SAM3DBody_Loader`, `SAM3DBody_Predict` | 3D body per frame from an image and person boxes or masks | In use |
| `SAM3DBody_Smooth` | Temporal smoothing of all pose outputs; Savitzky–Golay or Gaussian; switches itself off during fast spins (rotation threshold) | Use in step 2. Replaces writing our own smoother. We use none today. |
| `RTDETR_detect` (+ 0.12 GB weights) | Person boxes per frame | Candidate for step 1; see the choice below |
| `SAM3_VideoTrack` (+ 1.75 GB weights) | Tracks people through a video and gives masks; Predict takes them directly | Not now. Heavier, and SAM 3 is reported not to run on Apple Silicon. Revisit if boxes prove too weak for occluded or multi-person clips. |
| `LoadMoGeModel`, `MoGeGeometryToFOV` (+ 0.66 GB weights) | Estimates the camera's field of view from the picture; Predict takes it as `fov` | Try in step 2. We pass 0 (a default guess) today, which may be behind the backward lean in side views. |
| `MoGeInference` | Scene geometry (a point map) | Later. Could give the floor plane and camera tilt, and so a real check on jump heights. |
| Export helpers in `comfy_extras/sam3d_body/export/glb_shared.py`: `Rig`, `global_skel_state_from_pose_data`, `bone_locals_from_globals`, `quat_sign_fix_per_joint`, `unflip` | Turn the model's output into per-joint local rotations on its 127-joint rig, with the axis flip and quaternion continuity handled | Use in step 3. This is the hard part of rotations and it is already written. |
| `BuildPoseFile` → BVH | Mocap file with bone offsets and rotations, tested with Blender | Use in step 3 as an independent check: open the BVH in Blender and compare with our character. Not the delivery format. |
| `BuildPoseFile` → GLB (skeletal) | Animated mesh on the model's own rig | Not now. Studio is built on our character and Action v2. |
| `SAM3DBody_Render` | Renders the model's own mesh | Optional in step 2: a third row on review sheets, to tell model error from our mapping's error. |
| `SAM3DBody_FaceExpression` | Face blendshapes | Not needed; our character has no face rig. |
| Extensions `ComfyUI-SAM3DBody` (multi-person), `SAM3D BodyMod` (shape transfer, pose editing) | — | Not needed now; single performer, no body editing. |

## Step 1 — person boxes without the old lift

Today the SAM path runs observe (YOLO26 pose) then lift (MotionBERT plus all leg rules) and uses only the boxes, the times and a scale. The lift is the fragile part; it crashed on two clips.

Choice to make:

- **A. Keep `observe.py` as the detector (recommended).** It already finds and follows the performer through crossfades (R10) on all 59 clips and needs no download. Only its boxes and frame times are used; lift and decide are skipped.
- **B. `RTDETR_detect`.** One environment for everything (useful on the mini), but we would have to redo "which box is the performer" on its output, and it needs a 0.12 GB download. Take this only if A's boxes turn out to be a problem.

Work for A: a `body` stage in `pipeline.mjs` after observe; the converter takes its scale from a fixed body height instead of the lift; times come from the pose report. Done when all 59 clips build with the lift stage never run.

## Step 2 — default path, with fallback

- `reconstruct_motion` gains `source: 'body' | 'rules'`. Default `body` when the ComfyUI environment and weights are present; otherwise, or when the body stage fails, `rules` with a note in the summary saying so.
- The body stage is cached like the others and can run here or on a remote runner (`mini4.local`) chosen by an environment setting; the queue script there already exists.
- Scripts move from `authoring/reconstruction/trials/` to `authoring/reconstruction/`; `externalJoints` stays as a test hook.
- Add `SAM3DBody_Smooth` inside the stage. Add a jitter measure (frame-to-frame acceleration of joints) to the rig report first, so smoothing is judged by a number and by the spin clips, not by feel.
- Try MoGe field of view on three clips and look at the side-view lean before adopting it.
- Tests: the pipeline test gets a stub body stage; the 87 tests must pass with no ComfyUI installed.
- Docs: `RECONSTRUCT_MOTION.md`, the skill, `CURRENT_STATE.md`.

Done when a batch run with no options builds all 59 from SAM 3D Body, and removing the weights makes the same run fall back to the rules and say so.

## Step 3 — rotations

Today we pass 17 joint positions and rebuild each bone's direction; twist is guessed (knee hinge, limb-turn rules) and hands and feet are not driven.

- Get per-joint world rotations from ComfyUI's helpers (table above).
- Map the model's joints to our character's bones by name or index. Open question: whether the ComfyUI port exposes joint names; if not, take the order from Meta's MHR repository.
- Retarget by rotation: each mapped bone turns from its rest pose by the same world rotation as the model's joint turns from its own rest pose. Unmapped bones keep rest.
- Order of work: spine and limbs first, then feet, then hands.
- Keep the position path as the fallback and compare the two on the same measures (parts inside, crossings, jitter) plus the BVH-in-Blender check.

Done when rotation builds are at least as good as position builds on all 59 clips by the measures and the user's review, with feet and hands driven.

## Not in this plan

- Jump-height verification (needs the floor plane; see `MoGeInference` above).
- Removing the rule pipeline. It stays as the fallback until the body path has been the default for a while.
- Phase 6 of `NEW_PLAN.md` (registering a video-derived movement) is unaffected and can follow step 2.

## Unknowns

- Speed and memory of Smooth and MoGe on these Macs.
- Whether Predict's results change materially with a field of view supplied.
- Licence: the weights are under Meta's SAM License; outputs are not restricted beyond law and trade controls, but the text does not explicitly address commercial use.

## Finding: field of view (MoGe), 2026-10-09

Tried on Hook kick, Backflip (overtuck) and Round(house) kick, first 12 frames each, `moge_2_vitl_normal_fp16` (0.66 GB, 16–18 s per clip on this Mac). MoGe reads a vertical field of view of 36–40°. Passing it to Predict moves the estimated distance to the performer from 5.2–5.7 m to 3.6–4.2 m, and changes the trunk's lean in depth by 0.1–2.3°. So it changes scale, which we do not use, and not pose. Not adopted. The backward lean seen in side views during kicks is therefore not a field-of-view effect; it is either real counter-lean or the model's depth guess, and is still unexplained. The weights stay in `.authoring/comfyui/models/geometry_estimation` for a later floor-plane check of jump heights.
