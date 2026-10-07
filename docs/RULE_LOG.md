# Rule log: video-to-action reconstruction

Started 7 October 2026. This is the running record of every rule added to the reconstruction pipeline: what was seen, what caused it, what the rule does, and what it did to the other clips. Add an entry each time a rule changes. The numbers behind the scoreboard are in `authoring/reviews/video/tricking-basics/runs.json`.

A "rule" here is any fixed behaviour of `observe.py`, `lift.py`, `fit.py`, `retarget.ts` or the skill that decides how video evidence becomes motion.

## How to use it

After changing a rule, with the Studio service running:

```sh
python3 authoring/reconstruction/batch.py run --catalog authoring/reviews/video/tricking-basics --rule "what changed and what prompted it"
```

It rebuilds the catalogued clips, appends a run to `runs.json` (git commit, options, per-clip numbers, sheet paths) and prints which clips changed against the previous run. Add `--decisions` to use the vision model and `--clips 3,19` for a subset. `batch.py compare --runs 9,10` reprints any comparison.

Then: read the sheets of every clip marked LOOK, record grades in `batch-upright.json`, and add an entry below. The comparison says where to look. It does not say whether a change is better.

## Scoreboard

Twenty clips from the tricking-basics video, graded by the LLM from eight front-view poses per clip. Grades are not playback review. Fit error is the median projection error (lower follows the image more closely; constraints raise it on purpose).

| Run | Rule change | Ran | Good | Fair | Partial | Poor | Not upright | Swapped frames | Median fit error |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | First batch | 11 | – | – | – | – | – | 40 | 0.019 |
| 2 | Performer tracking (R10) | 20 | 4 | 3 | 8 | 3 | 2 | 86 | 0.019 |
| 3 | Lost-leg jump and arc bridge (R11) | 20 | 9 | 5 | 3 | 1 | 2 | 86 | 0.018 |
| 4 | Limb turns with parent; kick in front (R12, R13) | 20 | 9 | 5 | 3 | 1 | 2 | 86 | 0.022 |
| 5 | Leg identity between clear frames (R14) | 20 | 9 | 5 | 3 | 1 | 2 | 69 | 0.021 |
| 6 | Swing smoothness (R15) | 20 | not graded | | | | | 69 | 0.022 |
| 7 | Reappearing leg (R16) | 20 | 12 | 4 | 1 | 1 | 2 | 69 | 0.022 |
| 8 | Limb roll continuity (R17) | 20 | 12 | 4 | 1 | 1 | 2 | 69 | 0.022 |
| 9 | Knee direction; own side (R18) | 20 | 12 | 4 | 1 | 1 | 2 | 69 | 0.025 |
| 10 | Turn continuity; relabel before overlap (R19, R20) | 20 | 12 | 4 | 1 | 1 | 2 | 95 | 0.024 |
| 11 | Vision veto, wide (R21 first version) | 20 | not graded; Pop 360 broke | | | | | 47 | 0.023 |
| 12 | Vision veto, narrowed (R21) | 20 | 12 | 5 | 0 | 1 | 2 | 63 | 0.023 |
| 13 | Relabel after a pinned overlap; swing keeps its rotation (R22, R23) | 20 | 13 | 4 | 0 | 1 | 2 | 97 | 0.023 |

Run 10 kept the same counts but two clips got worse and one better; counts hide that, which is why the per-clip comparison exists.

## Rules

Status: **kept**, **kept with a known cost**, **replaced**, or **off**.

### Before the batch (single clips: karate side kick, flying side kick, triple kick)

| # | Seen | Cause | Rule | Where | Status |
| --- | --- | --- | --- | --- | --- |
| R1 | Kick leg drops to the floor mid-recoil | Detector redraws a blurred leg on the other leg | A leg merged onto the other at low confidence after a jump is lost and bridged | `lift.py` | kept; extended by R11, R15, R16 |
| R2 | Standing knee locked at 180°, or crouched at 110° | Straight-knee prior was all or nothing | Only a raised leg is pulled straight; a planted knee is kept above 160° | `fit.py` | kept |
| R3 | Kick lower than the video | Blurred ankle point slides up the shin | Restore hip-to-ankle reach of a raised straight leg from neighbouring frames | `lift.py` | kept |
| R4 | Torso leans less than the video | Spine squared to the shoulder line | Torso frame keeps the pelvis-to-neck direction | `retarget.ts` | kept |
| R5 | Knees pass through each other in a cross-step | Nothing said legs are solid | Sampled points on the two legs must keep their radii apart | `fit.py` | kept; clearance fell from 10 to 6 cm at one frame after R19 |
| R6 | Knee twitches in a held pose | A prior gated by a threshold toggled for single frames | The planted-knee floor follows the observed angle, no gate | `fit.py` | kept |
| R7 | Character cannot leave the floor | Lowest foot pinned to the floor every frame | `airborne`: lift from the lowest ankle's image height, with a 20–40 cm tiptoe allowance | `retarget.ts` | kept; heights unverified (1.87 m on Backside 900 looks too high) |
| R8 | Flying kick leg tilted 45° into depth | Fixed segment lengths read a short-looking leg as depth | Relax segment length on a raised straight leg | `fit.py` | kept |
| R9 | Upper body swings after the kick; head faces the chest | Trunk depth is barely constrained; head not driven | Trunk depth stays with the smoothed lift; head turns from nose and ear | `fit.py`, `lift.py`, `retarget.ts` | kept; trunk part superseded by R19 for spins |

### During the batch

**R10. Follow the performer who stays** (run 2). *Seen:* 9 of 20 clips failed. *Cause:* the tallest figure in the first frame was the fading performer of the previous clip. *Rule:* chain boxes by overlap and take the longest chain. *Result:* 20 of 20 run; earlier clips reproduce exactly. **Kept.**

**R11. A leg that jumps is lost; bridge it along an arc** (run 3; user: Pop 360 (crescent) high kick missing at 0.68–0.89 s). *Cause:* the first dropout frame missed the "merged" test by 0.01, was trusted, and straight-line bridging dragged the leg through the body. *Rule:* a one-frame ankle jump over a limit (0.5 body heights at half speed) starts a lost run that ends only after two good frames; bridge by swinging knee and ankle about the hip on the side away from the other leg. *Result:* good 4 → 9. **Kept.** The path inside a bridge is inferred, not observed.

**R12. A limb turns with what it hangs from** (run 4; user: upper body turned, lower body still faced front). *Cause:* each limb's twist was taken from the rest pose in world space. *Rule:* carry the limb with its parent's rotation, then swing it onto its direction. *Result:* toes within about 10° of the pelvis facing. **Kept**, refined by R17.

**R13. A bridged kick passes in front of the body** (run 4; user rule). *Cause:* a bridged leg has no observed depth and the lift put it behind. *Rule:* inside a bridge, knee and ankle stay on the chest side of the pelvis. *Result:* Pop 360 leg crosses in front. **Kept with a known cost:** the leg reads short from the front while vertical (Cheat 360 crescent, Feilong, Backside 900). The margin (ankle one hip width forward) is a guess.

**R14. Judge which leg is which only between clear frames** (run 5; user: J-step swing 540 swinging leg became the support leg). *Cause:* my own swap repair compared against frames where the legs overlapped. *Rule:* skip overlapped frames; correct identity only between adjacent clear frames. *Result:* J-step swaps 14 → 0. *Mistake on the way:* the first version compared across the gap and added false swaps to three other clips (0 → 10, 1 → 13, 0 → 7). The batch numbers caught it before review. **Kept.**

**R15. A swing does not reverse** (run 6; user rule: three positions along a swing must be smooth). *Cause:* a leg pointing away from the camera was redrawn on the other leg with a jump under the limit. *Rule:* snapping onto the other leg against the direction of travel counts as lost; stay lost while overlapped or drawn as a stub; straight-line bridge when the leg is foreshortened. *Result:* J-step dip gone; Hook kick high kick appears. **Kept.**

**R16. In an overlapped stretch, the lost leg is the one that reappears far away** (run 7). *Cause:* Tornado kick, Feilong: both legs drawn down the hanging leg for 10–15 frames, and the forward rules blamed the wrong leg. *Rule:* after an unbroken overlapped stretch with a one-frame snap in or out, the leg that reappears more than 0.3 body heights away is bridged across the whole stretch. *Result:* good 9 → 12. *Mistake on the way:* without the snap condition it fired on ordinary stances; caught on the regression clips. **Kept.**

**R17. Limb roll is continuous** (run 8; user: Cheat 720 legs appear to swap at 0.82 s). *Cause:* positions were right; a leg kicked straight up points opposite its rest direction and its roll flipped 160° in two frames. *Rule:* carry each limb's orientation from the previous frame, eased back toward the rest-anchored roll. *Result:* largest toe turn per step 83° → 29°. **Kept.** Changes how every limb is rolled; invisible on small front-view sheets.

**R18. Knees bend forward; each leg stays on its own side** (run 9; user screenshots, Cheat 720 at 0.54–0.66 s). *Cause:* side-on, the lift exchanged the legs' depths; in the back view a tucked knee pointed behind. *Rule:* two penalties in the fit, using front and left from the hips. *Result:* right foot depth −0.31 → −0.02 m; knees forward. **Kept with a known cost:** median fit error 0.022 → 0.025. These rules depend on the hips' facing being right, which made R19's mistakes more visible.

**R19. A spinning body keeps turning the same way** (run 10; user screenshots, Backside 900: upper body wrong at 0.60 s, legs at 0.63 s). *Cause:* side-on, the lift flipped the shoulders front to back in one frame; the clip turned 447° of 900°. *Rule:* read the size of the turn from shoulder width in the image, follow the lift's direction unless it jumps, hips follow shoulders. *Result:* Backside 900 turns 810°, chest and hips within 20°. **Kept with a known cost:** karate cross-step clearance 10.2 → 6.0 cm at one frame.

**R20. Relabel the legs before an overlapped stretch when the reappearing leg was the other one** (run 10, added for Backside 900's kick). *Result:* Backside 900 kick goes over the top. **Harmful on its own:** it exchanged correct labels in Outside crescent kick (swapped 0 → 8, fit error 0.027 → 0.055) and Cheat 360 crescent (1 → 9, first kick lost). **Kept only under R21's veto**; without `decisions` it is still active and still wrong on those two clips.

**R21. Vision decisions veto repairs** (runs 11–12; user proposal: add a vision-model decision check). *What was tried:* (a) facing answers steering the turn: agreed with R19 already, no change; (b) leg answers relabelling legs: made things worse, answers flip between frames, **off**; (c) a confident, repeated leg answer that agrees with the detector pins those labels against the swap repairs. *Result of (c):* Cheat 360 crescent swapped 9 → 1 and its first kick is the left leg again; Outside crescent kick fit error 0.055 → 0.028; Cheat 900 and Pop 720 fewer swaps. *Mistake on the way:* the first veto pinned a label on a blurred, half-lost leg and broke Pop 360 (crescent), a clip the user had confirmed; narrowed to detections with all four leg points at 0.9 confidence or more, and the frame plus its neighbours. **Kept, opt-in** (`decisions: true`; $0.14 for the 20 clips).

**R22. If the labels before an overlap are pinned, relabel after it** (run 13; user: why did Cheat 360 crescent get worse, can we roll back). *Found by* rebuilding the clip with the pipeline at ten earlier commits: no version had the whole kick. The detector names the kicking leg left before the gap and right after it. R20 renamed the frames before (run 10: high part present, first kick lost, wrong leg); R21's veto undid that (first kick back, high part lost). *Rule:* when R21 pins the labels before the stretch, the frames from the stretch to the end of the next clear run are relabelled instead, unless they are pinned too. *Result:* Cheat 360 crescent is the left leg throughout, fit error 0.046 → 0.026. Outside crescent kick rises to vertical at 0.54–0.58 s but comes down early and its fit error rose 0.028 → 0.046. **Kept; needs `decisions`.** Without decisions R20 still acts alone.

**R23. A bridged swing keeps its direction of rotation** (run 13). *Cause:* the bridge took the short way round, which reversed the leg's rotation about the hip. *Rule:* if the leg was rotating one way going into the gap by more than 3° a frame, and not the other way coming out, the bridge continues that way even when it is the long way. *Result:* Cheat 360 crescent's bridge is 227° over the top, vertical beside the head at 0.64–0.67 s as in the clip. No other clip's bridges changed. **Kept.** This is R15's principle applied to the bridge itself.

## Rolling back

- **One action:** each rebuild keeps the previous revision (up to 100). `restore_revision` with the action id, its current revision and the revision wanted.
- **One rule:** `git revert` the rule's commit (the scoreboard and `runs.json` give the commit of each run), rebuild core, run `batch.py`. This also removes what the rule fixed elsewhere.
- **Finding which rule changed a clip, without changing anything:** `git worktree add <dir> <commit>`, link `node_modules` and `.authoring` into it, build `authoring/core.js` there and rebuild the clip into a temporary project. Stage caches are keyed by script content, so versions do not collide. Remove the worktrees afterwards.

## What the log teaches

1. **Most faults were in my repairs, not in the detector.** R14, the first R16, R20 and the first R21 each broke a clip that was right. A repair that relabels evidence needs an independent check before it acts, which is what the veto in R21 is.
2. **The first guess at a cause was often wrong.** After run 10 I blamed the regressions on leaning shoulders. The per-clip numbers already said "swapped 0 → 8" and "1 → 9": a relabelling rule, R20. Read the comparison before theorising.
3. **Grade counts hide regressions.** Run 10 had the same counts as run 9 with two clips worse. Compare per clip, and look at every clip whose repairs or fit error moved.
4. **A rule tuned on one clip must be run on all of them before it is called a fix.** Every rule since R11 changed at least one clip it was not written for.
5. **Rules that state what a body cannot do last longer than rules that guess what the detector did.** R5, R12, R13, R15, R17, R18 and R19 (solid legs, limbs follow parents, kicks pass in front, swings do not reverse, roll is continuous, knees bend one way, a spin keeps its direction) needed little rework. Detector-pattern rules (R1, R11, R16, R20) needed several rounds.
6. **The user's eye in playback found what sheets could not:** leg roll (R17), depth exchange (R18), swing dips (R15), turn direction (R19). Still sheets confirm poses; they do not confirm motion.
7. **Each constraint costs fit to the image.** Median fit error rose from 0.018 to 0.025 as constraints were added. That is intended, but a rise on one clip of more than about half (0.027 → 0.055) has so far always meant a wrong repair.
8. **Bisect before blaming a rule.** Cheat 360 crescent looked like a regression to roll back; rebuilding it at ten commits showed that no version had been right and that two rules were each half right. The fix was a third rule, not a rollback.
9. **A vision model is useful as a second opinion, not as a labeller.** Its facing answers were steady; its left/right leg answers were not reliable enough to act on directly.

## Open

- Outside crescent kick comes down about 0.06 s early after R22.
- R20 is wrong on two clips when decisions are off; it should require decisions or be reworked.
- R13's front margin shortens vertical kicks seen from the front.
- R7 jump heights are unverified.
- Back sweep, and the 39 inverted or hands-on-floor tricks, are outside what the rules cover.
- Grades are LLM judgements of still poses. The user has reviewed Pop 360 (crescent), J-step swing 540, Cheat 720, Backside 900 and Cheat 360 crescent in Studio, each in an earlier revision.
