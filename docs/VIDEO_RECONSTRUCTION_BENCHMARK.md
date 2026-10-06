# Side-kick reconstruction benchmark

5 October 2026. **Benchmark completed; recognizable lateral-kick target failed.** The draft reproduces a gathering step, raised knee/chamber and return, but never delivers the defining lateral extension. Saved Studio action: `video-side-kick-draft`, revision 1, “Video · Side kick estimate (extension failed)”. It is an experimental action, not an approved library movement.

## Pipeline and evidence

Original reference was preserved. Analyze recording time 11.45–13.75 seconds; cached detector observations are resampled to 70 uniform 30 Hz frames. COCO17 is mapped to H36M17, including synthetic pelvis/spine/neck/head landmarks. A three-sample median filter precedes flip-averaged MotionBERT Lite inference. Raw observations, prepared input and raw-input model predictions remain available.

The adapter converts camera-space joints into parent-relative Quaternius rotations. It keeps local bone translations/scales, bakes 65 rotation tracks plus one root-position track, and uses reference timing for seven phases. Image-pelvis X travel and lowest-ball-joint floor placement are approximate heuristics. Depth, twist, mirroring, metric travel and foot orientation remain uncertain. This adapter is bounded to this 2.3-second fixture, not generic retargeting.

[Contact sheet](../authoring/reviews/video/kick-reference/reconstruction-small/sheet.jpg) shows nine times from front and side. [Machine-readable benchmark](../authoring/reviews/video/kick-reference/reconstruction-benchmark.json), [estimated motion IR](../authoring/reviews/video/kick-reference/reconstruction-small/motion-ir.json), [baked action](../authoring/reviews/video/kick-reference/reconstruction-small/action.json) and [rig diagnostics](../authoring/reviews/video/kick-reference/reconstruction-small/quality.json) retain evidence.

## Measurements

CPU, two Torch threads, one clip; warm results are medians of three trials. These are stage measurements, not production latency promises.

| Stage | Full-frame nano | Cropped nano | Full-frame small |
|---|---:|---:|---:|
| 2D predictions, 67 frames | 2.684 s | 4.148 s | 4.307 s |
| Warm 3D inference, 70 frames | 0.250 s | 0.286 s | 0.217 s |
| Retarget and bake | 24.5 ms | 18.6 ms | 17.0 ms |

Small-model path: imports 1.117 s, preparation 12 ms, model load 363 ms, first inference 257 ms. Its 2.710 s Python measurement includes first inference, three warm repetitions and a separate raw-input inference; it is **not one inference's latency**. Asset load was 62 ms. Eighteen offline screenshots took 4.812 s wall time, including 3.874 s browser startup; rendering itself took 55 ms. Setup/model download and human/LLM review are outside these stage totals. The tracked run records development and review time separately.

Official OneDrive weights were inaccessible (HTTP 403). The author's Hugging Face checkpoint downloaded successfully (~64 MB). Download timing was not independently instrumented; no cold-install latency claim is made.

## Quality findings

Nano and crop trials collapse the kicking leg into a bent-knee pose. The small detector gives better 2D ankle placement around the real extension at 12.85–12.883 s, but the lifted right-knee angle is only about 62° at 12.85 s, versus a visibly near-straight leg in the source. Raw-input prediction also stays bent (~72°). Thus median filtering alone does not explain the failure. Coordinate mapping, synthesized landmarks, normalization, occlusion and model generalization require further examination; this benchmark does not isolate one cause.

Retargeting preserves bone lengths; the actual-rig inspection has three configured motion flags and status `review-needed`. No contact, balance or anatomical naturalness approval was issued. Sparse captures establish this extension failure; they do not constitute full-motion acceptance.

Three tests cover parent-relative direction math, degenerate frame rejection, and actual-asset baking with finite/quaternion-continuous keys and unchanged bone translations/scales. All pass. Existing composition/compiler code was unchanged.

## Reproduction

Requires cached vision environment, official model code and checkpoint under `.authoring`; no new pip packages were installed in this benchmark.

```sh
.authoring/vision-venv/bin/python authoring/reviews/video/kick-reference/pose_small.py
.authoring/vision-venv/bin/python authoring/reconstruction/lift.py --pose authoring/reviews/video/kick-reference/pose-small/pose-report.json --out authoring/reviews/video/kick-reference/reconstruction-small
npm run build:retarget
npm run reconstruction:retarget -- authoring/reviews/video/kick-reference/reconstruction-small
node authoring/reconstruction/capture-draft.mjs authoring/reviews/video/kick-reference/reconstruction-small/frames authoring/reviews/video/kick-reference/reconstruction-small/capture.json authoring/reviews/video/kick-reference/reconstruction-small/action.json --follow-root
npm run test:reconstruction
```

Retarget/capture writes local evidence; it does not register approved movements. The source-specific detector scripts select this pilot's person/window. Next: check skeleton/normalization against the official input convention, then compare a second reconstruction method or an observation-constrained IK fit on the same extension window. Do not repair this benchmark with hand-authored kick angles and present that as estimated motion.

[Official MotionBERT source](https://github.com/Walter0807/MotionBERT), commit `705d3a95354db8bdb696b3492e47a3b5537174ff`; source checkout contains Apache-2.0 license. [Author's checkpoint](https://huggingface.co/walterzhu/MotionBERT/blob/main/checkpoint/pose3d/FT_MB_lite_MB_ft_h36m_global_lite/best_epoch.bin), SHA256 `9811155371db4ca5d20f31a36a232d41012e12e1333882888a564d741861148f`. Source license and checkpoint provenance are recorded separately; this benchmark does not establish all downstream redistribution rights.


## Follow-up — input verification and observation-constrained fit

The [convention check](../authoring/reviews/video/kick-reference/reconstruction-fitted/convention-check.json) compared the pinned official Halpe-to-H36M mapping, flip indices and crop equation with our adapter. Limb indices agree. COCO synthesized axial landmarks, confidence, resampling and filtering remain differences; this does not prove model input equivalence.

An orthographic landmark fit follows the confidence-weighted 2D observations while retaining a soft depth prior, clip-wide segment lengths and temporal regularization. Image fitting alone only raises the peak knee from 61.8° to 79.6°: a straight image silhouette still permits a folded leg in depth. The second fit adds an **explicit side-view assumption**: a confidently near-straight observed knee is favored near-straight in 3D. It is derived from the observed triplet, not a manually authored kick keyframe, but is an additional ambiguity prior. It must not be applied blindly to other camera angles or occlusions.

This produces a recognizable first draft with lateral extension and recoil. Saved as **video-side-kick-fitted**, revision1, “Video · Side kick fitted draft”; previous failed draft retained. At12.85s estimated knee is179.9°; fit400iterations took0.524s, Python process3.001s including imports/setup, retarget/bake19.7ms. These are one-trial measurements, not a warm median. ProjectionRMS .00684 and segment-lengthRMS .00835 are normalized estimated units, not meters. Runtime rig lengths remain unchanged.

[Fit report](../authoring/reviews/video/kick-reference/reconstruction-fitted/fit-report.json), [full-frame captures](../authoring/reviews/video/kick-reference/reconstruction-fitted/full-frames/frames.json), [dense extension review](../authoring/reviews/video/kick-reference/reconstruction-fitted/extension-sheet.jpg), [preview video](../authoring/reviews/video/kick-reference/reconstruction-fitted/preview.mp4), and [motion diagnostics](../authoring/reviews/video/kick-reference/reconstruction-fitted/quality.json) retain evidence. Full capture140images/70times/two cameras took7.683s including browser startup. Preview is30fps,70frames (2.333s including final sample); action duration2.3s. Offline capture uses the candidate's original ID; the saved fitted action has a separate ID/name and identical motion tracks.

**Still review-needed:** five velocity flags around0.25,1.05,1.33,1.47,1.7seconds. Dense extension frames show directional changes as noisy observations and depth ambiguity affect the leg; floor placement can also vary. No contacts, joint limits, balance or loop continuity approved. Sparse start/end similarity does not make an action cyclic. Four reconstruction tests now pass, including preservation of the fitted fixture's timestamps, provenance and raw estimates.

```sh
.authoring/vision-venv/bin/python authoring/reconstruction/fit.py --input authoring/reviews/video/kick-reference/reconstruction-small/motion-ir.json --out authoring/reviews/video/kick-reference/reconstruction-fitted
npm run reconstruction:retarget -- authoring/reviews/video/kick-reference/reconstruction-fitted
npm run test:reconstruction
```

Next quality work: confidence/outlier and temporal-depth consistency around extension/recoil, followed by foot/root review. Keep sharp real kick timing. A second independent backend remains untested; this follow-up compared unconstrained and constrained fitting of the same model estimate. Synchronized source/video review is the next product milestone once the uncertainty contract is explicit.


## Stability revision

Saved **video-side-kick-stable**, revision1, “Video · Side kick stabilized draft”; earlier estimates remain available. `fit.py --stable` adds stronger depth acceleration regularization, a continuous rather than binary straight-knee prior, a conservative isolated-observation rule, and a five-sample binomial filter for approximate image-root travel. No observations met the rejection rule in this fixture. Joint timestamps and peak inspection time12.85s are unchanged; smoothing may still change motion shape and must be reviewed against video.

Fit400steps took0.570s (2.790s Python process); retarget/bake20.2ms. Temporal second-difference RMS in normalized estimated coordinates: depth .05147→.00517 (~90% lower), full positions .03903→.02132. Image-pelvis second-difference RMS12.01→2.16pixels (~82% lower). These are variation metrics, **not accuracy, physical jerk or naturalness scores**. Peak knee remains179.9°. [Comparison data](../authoring/reviews/video/kick-reference/reconstruction-stable/comparison.json).

Full70-frame/two-camera capture and dense extension inspection show a recognizable kick with less depth variation. Configured actual-rig flags5→3; remaining windows centered1.33,1.47,1.7s. No bone-length change. Five tests pass. [Dense frames](../authoring/reviews/video/kick-reference/reconstruction-stable/extension-sheet.jpg), [preview](../authoring/reviews/video/kick-reference/reconstruction-stable/preview.mp4), [diagnostics](../authoring/reviews/video/kick-reference/reconstruction-stable/quality.json).

Foot review remains open. A **hypothetical** left support interval1.05–1.7s measured maximum horizontal drift .270→.345m: displacement worsens even though path1.695→.916m and peak speed7.47→2.80m/s decrease. These are normalized runtime meters; the root camera scale is approximate. [Foot comparison](../authoring/reviews/video/kick-reference/reconstruction-stable/foot-comparison.json) explicitly marks contact intent unconfirmed. No foot anchoring, IK or support approval was added. Reduced temporal variation does not solve world travel/contact reconstruction.

```sh
.authoring/vision-venv/bin/python authoring/reconstruction/fit.py --stable --input authoring/reviews/video/kick-reference/reconstruction-small/motion-ir.json --out authoring/reviews/video/kick-reference/reconstruction-stable
npm run reconstruction:retarget -- authoring/reviews/video/kick-reference/reconstruction-stable
npm run test:reconstruction
```

Next: version the reference/estimated-motion bundle and carry uncertainty/contact hypotheses into synchronized video/character review. Further contact correction needs reviewed support intervals and explicit camera/root assumptions, rather than silently anchoring an estimated foot.
