# Depth reference packages — improvement plan (2026-10-20)

From the first full test of a depth package through keyframes to a video: the V.8 fight cut (5 s, six shots, 1.2×), six painted keyframes and Jimeng take 2069 (Seedance, 4 s). Evidence: `s-video/outputs/macbeth/act-5-scene-8-fight-test/review/` (result-v1-review.md, result-2069/review.md, preflight-review-v1.md) and the K5 and K6 revision records.

## What the test showed

**Held:**
- The cuts: four of five within 0.05 s.
- Positions and framing in shots 1, 3 and 5.
- Both identities, the closed helm, the courtyard and the light.
- No tint or grey leaking into the picture.
- Hand ownership where the keyframe drew it clearly (K6: Macduff's gauntlet on Macbeth's throat, Macbeth's bare hands on Macduff's arm).

**Failed:**
1. **Actions became poses.** The chain grab never yanked and the lift never lifted. Keyframes freeze a moment; the depth video gives places, not force. Nothing told the model *what changes* between keyframes.
2. **The video followed a wrong keyframe** (K5 v1, below).
3. **A half-second shot lost its beat** (shot 4, grin to fear). The model added an extra cut at 3.25 s to deliver the fear it had skipped.
4. **Durations disagreed.** The guide and prompt were 5 s, the output was set to 4 s. The last shot got 0.18 s and the clip ended rushed.
5. **A 0.88 s line could not be spoken in its window.** It was spoken over the next shot.

**Why K5 v1 went wrong.** The keyframe showed Macduff holding the chain while Macbeth reached up in a wrist contest. The scene has no such action, but the video copied it faithfully at 2.88–3.25 s. There were four causes:
- **The keyframe was taken at a moment, not a beat.** 3.04 s fell in the arms-locked shot. Its source frame shows a chain dangling from a fist, between the chain grab and the throat grip, so it is ambiguous out of context.
- **The keyframe text came from the source moment** ("their arms locked, the gauntlet closing"), not from the story. The prompt then described the wrong contact.
- **Nothing tied it to its neighbours.** K5 was generated without K4 or K6 in view, so its contact could not follow theirs.
- **The depth still helped least where it mattered most.** From below, the shapes are unreadable, and the hand at the throat was tinted with the wrong person.

## The principle: beats first

Start every package from a **video summary written as beats**, not from the source's shots. For this test the summary is three beats:

> **A grabs B → A locks B's throat → A lifts B into the air.**

Each beat states:
- who acts;
- the contact ("A's right hand on B's throat");
- the change it causes ("B's feet leave the ground").

**Duration and beats must match.** A beat needs about 1.5–2.5 s to read, so a 5 s clip holds 2–3 beats and a 4 s clip 2 at most (`floor(duration / 1.5)`). Under 1.2 s is a fault. **One beat over 4–5 s usually needs no control video**: a keyframe and the prompt carry it, unless the camera moves, someone travels or a contact must land at a time (the control rule decides).

Everything else follows from the beats: which source segments to cut, where the cuts fall, where the keyframes go, what each keyframe and prompt line says, and what the check looks for. A source moment that doesn't serve a beat is cut out, however good it looks.

## Rules for the package

### Length and timing

- **Duration:** the guide's duration *is* the output duration. Pick a whole number of seconds (4, 5, 10 or 15), make the depth video exactly that long, and write it in the package. The hand-over tells the user which duration to set in the generator.
- **Speed:** 1.0–1.2×. Speed only fills small gaps. 1.2× didn't look hurried in this take, but don't go higher.
- **Shots:** at least 1.0 s, ideally 1.5 s or more. A 5 s clip carries 2–4 shots, not 6. A beat gets one shot, or two if the camera change *is* the point.
- **Cuts:** within 0.15 s of a whole second, where the trim allows. Seedance reads timestamps in whole seconds, so a cut at 2.39 s against "2-3s" in the prompt leaves the model guessing.

### Camera

- **The depth video sets the camera.** Keep its framing simple enough to read: in a shot from below or a very tight shot, the depth shapes don't explain the action. Prefer the source shots where each beat's contact is visible. An unreadable angle needs a readable keyframe beside it.
- **Keyframe crops:** a keyframe image has the depth still's crop exactly (same aspect and framing). Image generators drift wider (K5 v3 went wide and had to be redone). The prompt states the crop, and the review checks it against the depth still.

### Keyframes: how many and where

- **Count:** one keyframe per beat, at the beat's peak, plus the opening frame. For 5 s and three beats that is 3–4 keyframes. That is about one every 1.2–2 s; more than one per second over-constrains the video and multiplies the chances of an error like K5.
- **Placement:** a keyframe sits inside a shot, at least 0.3 s from a cut, at the moment its beat reads most clearly. Its contact is visible and unambiguous in the source frame. If it isn't, that is the wrong source moment for the beat.
- **Timing:** the keyframe's time is a whole second where possible (it binds to a timestamp in the prompt). Its depth still and source frame are cut from exactly that frame.

### Support images for each keyframe

Each keyframe gets three support images:
1. **Depth still.** The frame of the depth video at the keyframe time: positions, nearness, framing.
2. **Source frame.** The original frame: room, architecture, camera angle, light, and who holds what. It is a layout reference only: every person is replaced, no likeness is taken, and it never goes to the video model.
3. **Contact card (new).** The source frame darkened, with each person outlined in their colour and labelled **A** or **B**, and each visible hand marked with an arrow to what it touches ("A right hand → B throat"; "B both hands → A forearm"). The pose detector already gives each person's wrists. The card answers "whose hand, on which arm, touching whose body" before the image model has to guess. At a beat's contact frame the depth still is checked to agree with the card: the contact hand in the actor's colour, fixed with a hand box if not.

### The keyframe image prompt (template)

1. **Beat:** "Beat 3 of 3: A lifts B by the throat; B's feet are off the ground."
2. **Contact table:** A's right gauntlet on B's throat. B's two bare hands on A's same forearm. A at screen left, B at screen right. **Exactly two arms per person**, each hand connected to a visible arm.
3. **Change from the previous keyframe:** "since K2, A's arm has straightened upward and B has risen about 30 cm". Pass the previous approved keyframe as an image, and generate keyframes **in order**, each from the last approved one.
4. **Layout authority:** Image 1 is the depth still (framing, positions). Image 2 is the source frame (room, angle, light, contact). Image 3 is the contact card. Then the character sheets.
5. **Do not copy from the source frame:** props or actions that aren't in the beat. Name them (the dangling chain, a raised arm, onlookers' faces).
6. **Crop:** the same crop as the depth still, and how tight it is.

### Review gate before the video

Every keyframe passes before any video run:
- **Beat:** does it show its beat, and only that?
- **Limbs:** count the arms per person; trace every hand to an arm and its owner.
- **Agreement:** does it match the contact card and the depth still (who is where, the crop)?
- **Continuity:** is it consistent with the keyframe before (sides, which arm, what is held)?

A keyframe that fails is redone before the video, never "tested to see".

### The video prompt

- **Timeline:** one line per beat, in whole seconds matching the cuts. Say the action as a change with direction and force: "1-2s: A seizes B by the coat and pulls him close. 2-3s: A's hand closes on B's throat. 3-5s: A lifts B upward until his feet leave the ground; B claws at A's forearm."
- **Speech:** none in the first runs. Add it in the edit, or as a separate test once motion works. A line needs about 2 s per five words.
- **Images:** state each keyframe's time and beat in the prompt. Change one variable per run.

## Changes to build in codex-3d (the depth service)

1. **Beats in the package.** `beats: [{actor, verb, target, contact, change, start, end}]` and a one-line `summary` (for example "A grabs B, locks B's throat, lifts B into the air"). The page shows them on the timeline; `cast_depth_clip` writes the prompts from beats, not from shot descriptions.
2. **Cut planner.** From the beats and the chosen duration, pick source segments (one per beat, each long enough), choose a speed of 1.0–1.2×, and nudge trims so the cuts fall near whole seconds. It warns when a shot is under 1 s or a beat has no shot that shows its contact. This replaces cutting by hand.
3. **Keyframe picker.** One keyframe per beat, at the peak of its contact (from the detector's wrist and box positions), inside the shot, on a whole second where possible. It warns when the moment is ambiguous (contact unclear, or the next beat's prop already in play).
4. **Contact card** (`key-N-contact.jpg`): outlines, letters and hand arrows from the pose detector's boxes and wrists, corrected by the package's people letters. The page has a check-and-correct step for the arrows.
5. **Keyframe gate in the check.** At each keyframe: both actors of the beat in their colour, and the contact hand in its owner's colour. A failure is a fault, not a note. The fix is a hand box at that frame.
6. **Hand-over.** `keyframeGeneration` lists for each keyframe its beat, contact table, previous keyframe, the four references in order and the prompt from the template. `videoGeneration` states the exact output duration to select.
7. **Result review helper.** Given a result video: its length against the guide, cut times against the guide's cuts (extra or missing cuts flagged), and a side-by-side sheet at each keyframe time. That gives each run the review table from result 2069 automatically.

## Order of work

1, 2, 3 and 6 first: beats, the cut planner, the keyframe picker and the hand-over. These address failures 1–4. Then 4 and 5, the contact card and the keyframe gate, which address K5 and K6. Then 7, the review helper.

To test it, cut a new package for the same three beats, "A grabs B, locks B's throat, lifts B into the air": 5 s, three shots of at least 1.4 s, three or four keyframes, no speech. Then run it at 5 s. Judge it on whether the lift reads as a lift.

## Built

### Step 1, beats in the package (2026-10-20)

`set_depth_beats {package, summary, beats: [{actor, verb, target?, contact?, change?, start, end}]}` stores a package's beats and one-line summary (in `package.json` and its spec, so a repack keeps them) and checks them with `beatRule` (`runtime/depth-prompts.ts`): at most floor(duration/1.5) beats, each at least 1.2 s (notes under 1.5 s), whole-second starts preferred, the whole clip covered, and one beat over 4 s or more flagged as possibly needing no control. When a package has beats, the video prompt opens with the summary and has one line per beat in whole seconds (actor, verb, target, contact, change, with people's names said as their colours and the cuts inside the beat in brackets), and each keyframe's image prompt starts with "Beat i of n: …". `cast_depth_clip` returns the beats and their check, or a note to set them. The page shows the summary in the package's header, a Beats row on its timeline and a BEATS panel with the check. Tried on the 5 s V.8 test: one beat per shot (six) is rejected (too many, five too short); "Macduff grabs Macbeth, locks his throat, lifts him into the air" in three beats passes with two notes (beat 1 is 1.27 s; beat 2 starts at 1.27 s, not on a whole second); one beat over 5 s is flagged as maybe not needing control.

### The V.8 test as two 4 s clips at normal speed (2026-10-20)

The user found the first test's cause: 7 s of V.8 (4.97-12.2 s) had been squeezed into 5 s at 1.2x with part of a shot cut, which is why it had six shots. Now the same stretch at 1.0x, 4.97-12.97 s, is two 4 s packages split inside the arms-locked shot, so part B starts on part A's last frame and can be generated as its continuation:
- `macbeth-v8-part-a` (shots: struggle 0.5 s, grin 1.06, chain 1.31, fear 0.63, arms lock 0.5): beats "Macduff holds Macbeth, who taunts him, then seizes him by the chain" (0-1.56, 1.56-4.0); keyframes 0.15, 1.0, 2.2; check passes (a watching soldier untinted at 1.0).
- `macbeth-v8-part-b` (arms locked from below 1.74 s, held up by the throat 1.63, the helm 0.63): beats "Macduff closes his grip on Macbeth's throat and lifts him into the air" (0-1.74, 1.74-4.0); keyframes 0.2, 1.0, 3.0. At 3.0 Macduff's gripping hand is tinted with Macbeth (the known throat-shot problem): the check reports him missing.
Both beat sets pass the rule, with a note each that beat 2 starts off a whole second (the source's cut times; the cut planner of step 2 is for that).

### Step 2, the cut planner (2026-10-20)

`authoring/render/depth-plan-cut.py PLAN.json [--dry]` and the service operation `plan_depth_cut {id, name, from, duration, summary, beats: [{actor, verb, target?, contact?, change?, from, to}], dry?}`: from a built package and a whole-second duration, one segment per beat. Each beat gets whole seconds of output in proportion to its source span (at least 2 s when the duration allows); its span is trimmed evenly to play at no more than 1.2x, or widened inside its own shots (spilling into the next shot left 0.18 s slivers in the first try) to play at 1.0x, slower down to 0.85x with a warning. Every beat starts on a whole second; shots inside a beat keep the source's cuts. Keyframes: the opening and one whole second per beat at least 0.3 s from a cut. The package carries the beats, `derivedFrom.speeds` per segment (the keyframe check maps through them), and the warnings in its notes.
- V.8 tried three ways, "grab, lock the throat, lift": in 5 s the lift gets 1 s (warned); in 6 s the lift's only shot holds 1.63 s, so 2 s means 0.81x (warned as too slow); as two beats in 5 s, "Macduff grabs Macbeth, then locks his throat and lifts him into the air", it fits with no warnings: `macbeth-v8-plan-5s`, 0-2 s the grab (shot 26 at 1.07x), 2-5 s the throat and lift (shots 34 and 35 at 1.2x, a cut at 3.75 s), keyframes 0.15, 1 and 3 s, beat rule clean.
- Seen in it and left for step 3: the grab's source shot is over a watching soldier's shoulder, so Macduff is a narrow orange strip and the contact is hidden (a beat's span should show its contact); beat 2's keyframe lands in the arms-locked shot, not at the lift's peak (the picker should take the peak, from the detector's positions).

### Step 3, the keyframe picker (2026-10-20)

`authoring/render/depth-pick-keys.py PACKAGE [--dry]` and the service operation `pick_depth_keys {package, dry?}`: the opening frame and one keyframe per beat. Every frame of a beat at least 0.3 s from a cut is scored from the tint: both people's areas and the contact of the actor's colour (widened 2% of the width) with the target's, sqrt(min(actor, target)) x (1 + 40 x contact), or sqrt(target)/2 where the actor has no colour; a beat with a change weighs later frames up to 1.4x. A beat's `peak` (now taken by `set_depth_beats`) replaces the score. The best frame moves to a whole second within 0.35 s that scores at least 85% of it. Keyframes are written into the package and its spec, with summaries from the beats, the stills are made again, and the beats kept.
- Warnings: the contact is hidden (the actor never covers 3% of the picture in the beat), the actor has no colour at the keyframe, a shot of the beat where the actor has no colour at all and so cannot be ranked.
- `macbeth-v8-plan-5s`: on the scores alone the lift beat's keyframe went to the arms-locked shot (3.2 s): the lift shot has no orange (Macduff's hand is tinted with Macbeth there), which the picker now names. With the beat's peak at 4.5 s the keyframes are 0.15 (opening), 1.4 (the grab: best score, 1.0 scored under 85% of it) and 4.5 s (held up by the throat), with the warning that Macduff has no colour at 4.5. Part B dry: 1.0 and 3.97 s, the same unrankable-shot warning for its throat shot.
- What the measure cannot see: a lift, a change of expression, force. It finds where both people are visible and touching; the peak of an action that shows as change over time is the beat's `peak`. The opening and beat 1's keyframe can fall in the same shot and look alike (0.15 and 1.4 here).

