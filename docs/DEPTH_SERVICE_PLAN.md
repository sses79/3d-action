# Depth references as a service (plan, proposed 2026-10-24)

What this is for: Tim's own agents and projects (Codex, s-video sessions, other local sessions) ask for a depth reference for a scene and get a package they can use, without Tim at the Depth library page. Footage is brought by the caller (their own shoot, licensed stock, or a reference they may use privately); there is no shared library of third-party film. It runs on this Mac, with mini4 taking the heavy jobs. No accounts, rented machines or billing.

## Where it stands

The pieces exist but are driven by hand.
- The service (`authoring/server.mjs`, port 5174) serves 72 tools to MCP, the CLI and `POST /api/tool`. 22 of them are for depth references; the rest are the animation studio.
- The steps that make a good package are all there:
  - ingest, shots and clips;
  - build (tinted depth) and fix (renames, hand boxes);
  - beats, cut planning and keyframe picking;
  - contact marks, the keyframe check and cast/hand-over;
  - result review and verdict, stars and package status.
- What made V.8 work was not one tool but a person and an agent chaining about fifteen calls, with scripts in between:
  - copying packages to s-video;
  - writing the task file;
  - building the lead/continuation package;
  - joining takes.

  Those scripts were thrown away each time.
- Weak points for unattended use:
  - **Fragile service.** The service is started by hand and must be rebuilt and restarted after code changes.
  - **Lost jobs.** Jobs live in memory and vanish on restart.
  - **Short waits.** The CLI gives up after a few minutes while a build runs on.
  - **No write protection.** Packages have no revision, so two agents can overwrite each other.
  - **Hand-built packages.** The judgement steps (describe, beats, hand marks) need someone in a session.

## The service contract

A caller should need four calls and files on disk, nothing else:

1. **`make_depth_reference`**: hand in a video file and the scene.
   - Inputs:
     - `video`, and `window` (start, end; optional);
     - `scene` (one line), `beats` (actor, verb, target, contact, change, rough times; optional: drafted if missing);
     - `cast` (person → description) and `style`;
     - `duration` (whole seconds);
     - `lead` (a previous take's last frame; optional) and `deliverTo` (a folder).
   - It answers at once with a job ID.
2. **`get_depth_job`**: poll the job. Its state is one of: queued, running (with the step it is on), `needs_input`, done or failed.
   - `needs_input` says exactly what is wanted. For example: "keyframe 3: whose hand is on the throat? mark it" (a hand mark), "is this person A or B?", or "this beat is hidden in every shot: pick another span".
   - The caller answers with the existing tools (`set_contact_marks`, `fix_depth_clip`, `set_depth_beats`) and the job carries on.
3. **The delivered folder**: everything `deliverTo` needs, in the form that worked for V.8:
   - `depth.mp4`;
   - per keyframe, the depth still, the source frame and the contact card;
   - `TASK.md`: keyframes to make, in order, with references and prompts; a lead frame is marked "given";
   - `upload-steps.md` and `generation-prompt-v1.txt`, in the fight test's format (`@Video1`, `@ImageN`, `[STYLE] [ANCHORS] [SHOTS] [SOUND] [LIMITS]`);
   - `package.json` and the hand-over JSON.
4. **`review_depth_result`** with a verdict, when a take comes back. It is already built, and it now keeps the take.
   - With `join: {previous, at}`, it also joins a continuation to the earlier take at the new take's first cut.

Everything else stays available for fine control, as now.

## Steps

### Step 1: a service that stays up (about a day)

- **launchd agent.** A user launchd agent (`~/Library/LaunchAgents/…codex3d.plist`) runs the service with Node 26 and `OPENROUTER_ENV_FILE`. It restarts on a crash and keeps its log in `.authoring/logs/`.
  - `npm run deploy:authoring` builds `core.js` and the editor, runs the tests, then restarts the agent. This ends the "rebuilt but forgot to restart" trap.
- **Health route.** `GET /api/health` returns the version (git commit), uptime, the job queue, and whether Python, ComfyUI, the OpenRouter key and mini4 are reachable.
- **Jobs on disk.** Jobs are kept in `.authoring/jobs/<id>.json`, so they survive a restart; a running step is resumed or marked failed.
  - The CLI and the MCP adapter return the job ID instead of waiting.
- **Package revisions.** Every package gets a `revision`. Writes take `expectedRevision` (as actions already do) and refuse a stale one.
- **Done when:** a restart in the middle of a build loses nothing; two agents cannot overwrite each other's package; the tests cover the job file and the revision refusal.

**Built 2026-10-24.**
- **Jobs.** `authoring/jobs.mjs`: jobs are kept on disk in `.authoring/jobs/<id>.json` and run one at a time; the server and the bundle share the folder.
  - A job left running by a stopped service is failed on the next start ("the service stopped while this job was running").
  - Done and failed jobs older than 14 days are removed.
  - Ingest and build run in this queue.
  - Any tool call that outlasts 240 s (`STUDIO_SYNC_WAIT_MS`), or is sent with `async: true`, is answered with a job ID; `get_depth_job` reads it.
- **Package revisions and locks.** Revisions live in `.authoring/depth-library/package-revisions.json`; a package first seen is revision 1.
  - `set_depth_beats`, `pick_depth_keys`, `set_contact_marks`, `fix_depth_clip`, `describe_depth_clip`, `build_depth_clip`, `plan_depth_cut` and `cast_depth_clip keep` add one, under a lock file in the package folder.
  - Given `expectedRevision`, they refuse a stale one: "stale: package … is at revision N"; the page answers 409.
  - The page sends the revision it read. Agents may leave it out for now: optional, not yet required.
- **Health.** `GET /api/health` returns:
  - the version and process;
  - `restartNeeded` when `core.js`, `depth-library.mjs`, `jobs.mjs` or `server.mjs` changed after the start;
  - the jobs;
  - checks for the vision Python, ComfyUI, the OpenRouter key file (only whether it is there) and mini4 over SSH.
- **launchd agent.** `authoring/service/service.mjs` (`npm run service:install | deploy:authoring | service:status`) installs `~/Library/LaunchAgents/com.sses79.codex3d.authoring.plist`: Node 26, `OPENROUTER_ENV_FILE`, the log in `.authoring/logs/service.log`, a restart when it stops.
- **Checked.** 4 new tests (93 in all).
  - Killed with `kill -9`, the service was back in 16 s.
  - `deploy` built, tested and restarted it in 28 s.
  - A review job interrupted by a restart came back failed with the reason.
  - A stale `set_contact_marks` was refused, and the right revision went through (1 → 2).

### Step 2: one call from footage to package (2–3 days)

- **The pipeline.** `make_depth_reference` runs the existing steps in order:
  1. ingest (or reuse a source already ingested by its SHA-256);
  2. shots and the control rule;
  3. build the window;
  4. describe the people and the clip with an LLM;
  5. beats (the caller's, or drafted by the LLM from the scene and the description, then checked by the beat rule);
  6. the cut planner, if the window is longer than `duration`;
  7. the keyframe picker, contact cards and the keyframe check;
  8. cast and hand-over.
- **LLM steps.** They go through OpenRouter, as `reconstruct_motion` does, with a vision model reading the keyframe stills.
  - Their answers are stored on the package with `by: model`, so a person can see and overrule them.
- **The gates become `needs_input`, not silent guesses:**
  - a fault in the keyframe check;
  - a beat whose contact is hidden;
  - a person the detector cannot name;
  - a contact the detector cannot see (armour, arms from below).
  - Notes, such as bystanders or a person out of shot, pass through as notes.
- **Continuations.** `lead` builds a continuation the way the V.8 lift was built: the image held about 0.5 s, its depth tinted from the caller's marks or the detector, keyframe 1 given.
  - The lead tinting by hand becomes a step that asks for two boxes when the detector fails.
- **Done when:** the V.8 lift package can be remade from the source file, a beat list and the cast with one call plus the hand marks it asks for, and it matches the hand-built one: the same shots, keyframes within 0.2 s, and the check clean.

**Built 2026-10-24 (parts 2a–2d, then 2e below).**
- **The request.** `make_depth_reference` (`authoring/depth-request.mjs`) runs twelve steps as one job:
  - source (reused by its SHA-256, or ingested) and window (a clip of the source for exactly that span, made when needed);
  - build (reused if built) and check;
  - describe, cast and beats;
  - cut (the request's own package, through the cut planner; a redo remakes it), keys and contact;
  - check again, then the hand-over (`cast_depth_clip`).
  - Each step's outcome is stored in `.authoring/depth-library/requests/<id>.json`.
- **Stopping and carrying on.** A step that needs a person returns questions, and the job ends as `needs_input`; `get_depth_job` lists them with what to answer.
  - `make_depth_reference {request, answers}` carries on without rerunning finished steps; `redo` starts again from a step.
  - The stops:
    - a fault in either check (accept or fix);
    - who plays whom when the model is not sure;
    - beats that break the rule;
    - beats that get 1 s of the take;
    - a window too short for the take;
    - a contact the detector cannot see on a keyframe where a beat person is in shot.
- **Drafts.** `authoring/render/depth-draft.py` (OpenRouter, `DEPTH_DRAFT_MODEL`, default `openai/gpt-6-luna`) writes the description, the cast mapping and the beats.
  - Beats are drafted at 2 s or more each (the planner gives whole seconds).
  - Drafts are stored with `by: model:…`.
- **Tried on Ramsay 026 as Duncan's murder (5 s).**
  - The model mapped the older lord to Duncan and the son to Macbeth.
  - Its first beats (three) gave 1 s beats; after the change, two: approach and embrace 3 s, the stab 2 s.
  - It stopped for hand marks, and then for a real fault: the marked hand (Macbeth's, on Duncan's back) is inside Duncan's blue tint.
  - Package `duncan-embrace-5s-2`, hand-over written.
  - Steps that ran: the drafts, cut, keys, contact cards, both checks and hand-over. The source, build and description were reused.
- **Open.**
  - A reused description with no shot cameras leaves "not described" in the prompts.
  - A redo from beats drops the hand marks made on the earlier cut.
  - The contact stop also asks at a beat's first keyframe, before the contact happens (answer `contact-N: skip`).

**2e and the step 2 check (2026-10-24).**
- **Continuing a take.** `lead {image, seconds?, boxes?}` continues a previous take.
  - `authoring/render/depth-lead.py` makes the frame's tinted depth: Depth Anything 3, people from the caller's boxes (as fractions; several per person), or from the detector when it finds exactly one person per name. Otherwise the request asks, listing what the detector found.
  - The cut planner takes the lead as the start of the first beat; beats keep the take's length.
  - `derivedFrom.lead` is set, so keyframe 1 is "given".
- **Changes made while checking:**
  - **Reuse a covering package.** A window inside a built package of the same source is cut from that package, the rated, fixed one first, instead of built again. The fresh build of the V.8 window left the lift shot untinted and split Macbeth in two; `got-standoff-req1` is marked stopped.
  - **Filmed timing kept.** When the beats follow one another and fill the take at 0.95–1.1×, the planner keeps the filmed timing as one segment, with beats where they fall rather than on whole seconds. The whole-second plan had sped the lift up to 1.2× and slowed the held shot to 0.82×.
  - **Too slow stops.** Slower than 0.85× is now a stop, like 1 s beats.
  - **Peaks.** Beat peaks pass through to the keyframe picker.
- **The check passed.** `make_depth_reference` was run with:
  - the source film and the window (80.15–83.65 s);
  - the lead frame with boxes;
  - two beats with their peaks;
  - the cast;
  - 4 s.

  It cut `macbeth-v8-lift-remake` from `macbeth-v8-fight` (5 stars) in 20–25 s.
  - Its shots, beats and keyframes are the same as the hand-built `macbeth-v8-part-b-lift`: shots 0–0.5, 0.5–2.37 and 2.37–4; keyframes at 0.15, 1, 2 and 3 s.
  - It asked for hand marks at the four keyframes; given the hand-built ones, the final check passed with no faults.
  - After the lead, the depth video is identical (mean difference 0.02 grey levels); the lead differs by its rough boxes.
  - Without the peaks, the last keyframe fell at 2.62 and 3.53 s instead of 3 s.

### Step 3: delivery to a project folder (about a day)

- **Writing the folder.** `deliverTo` writes the folder described above, from templates in `authoring/templates/` (the task, the upload steps, the generation prompt).
  - It never copies source frames into anything meant for the video model, and says so in the upload steps.
- **Re-delivery.** A re-delivery after a change writes `-v2` files beside the old ones instead of overwriting them, and lists what changed.
- **Joining takes.** A `join` option on `review_depth_result` cuts and joins takes with both sound tracks (as `v8-final-fight-2069+1215.mp4` was made). It warns when the join frame differs from the guide, which is why V.8 was joined at the first cut.
- **Done when:** an s-video session can go from "I need a depth reference for this beat" to the uploads and prompt without anyone writing files by hand.

**Built 2026-10-25.**
- **The delivery.** `deliver_depth_package {package, to, cast, style?, scene?, sheets?, sound?, rights?}` (`authoring/depth-deliver.mjs`) writes into the project folder:
  - `references/package-vN/`: the depth video, each keyframe's depth still, source frame and contact card, the lead frame, `package.json` and the check;
  - `TASK-vN.md`: the V.8 task's rules and the one-at-a-time approval order; per keyframe the beat, its references as paths in the folder (the previous approved keyframe, or the given first frame) and its prompt; a lead keyframe is "given";
  - `upload-steps-vN.md`: `@Video1`, then the sheets, the first frame and the keyframes as `@ImageN`, and what never to upload;
  - `generation-prompt-vN.txt`: `[STYLE] [ANCHORS] [SHOTS] [SOUND] [LIMITS]`, shots in seconds with the beat and contact in the characters' names;
  - `handover-vN.json`.
- **Re-delivery.** A second delivery writes `-v2` files beside the first. `delivery.json` keeps each version's file hashes and prompts, and the task opens with what changed (the revision, which stills, which prompts, or "nothing in the package changed").
- **From a request.** `make_depth_reference` ends with a `deliver` step when given `deliverTo` (with `sheets`, `sound`, `rights`).
- **Joining takes.** `review_depth_result` takes `join {previous, at, from?, out?}`: `authoring/render/join-takes.py` joins the previous take up to `at` and the new one from its first cut after the lead, with both sound tracks.
  - It is re-encoded at the previous take's average frame rate; the containers of these takes say 60 fps while playing at 24.15.
  - It reports the difference between the frames that meet, with a warning when the join is not on a cut.
- **Checked.**
  - The remade V.8 lift was delivered twice into a test folder; the second delivery said "nothing in the package changed".
  - Take 1215, reviewed against `macbeth-v8-lift-remake` with `join {previous: take 2069, at: 2.857}`, gave a 6.46 s film from the 0.5 s cut. That is 156 frames against the hand-joined film's 154, mean difference 4.8 grey levels.
  - A delivery test was added (95 tests in all).

### Step 4: mini4 as a worker (about a day)

- **What runs there.** The heavy steps (Depth Anything 3 over a window, SAM 3 tracks, SAM 3D Body) run on mini4 when it answers; otherwise they run here.
  - The service sends the clip window and gets the depth back over SSH and rsync (key login as `tim`, as `body.py` already does for SAM 3D Body).
- **Health.** The health route shows which worker took each job and how long it took.
- **Done when:** a 12 s build runs on mini4 when it is up and here when it is not, with the same output.

### Step 5: learning from results (ongoing)

- **Ranking.** `find_depth_clips` ranks by what worked: a person's stars, `used` and `good` verdicts, and the beats and labels of packages whose takes were used.
- **Overview page.** A small overview page lists all packages with status, stars, results and the last take, and links each to its project folder.
- **Done when:** a search for "throat grab, lift, low camera" puts the 5-star lift package first, with its take.

## What stays out

- **No shared third-party library.** The Game of Thrones sources stay as Tim's private reference. A caller's footage stays on this Mac, in the caller's own source entry.
  - Ingest records a `rights` line ("own shoot", "licensed: …", "private reference only"); delivery copies it into the task.
  - No source frame goes to a video model.
- **No accounts, logins, hosting or billing.** It answers on 127.0.0.1 only, as now.
- **The animation studio's tools are left as they are.** Splitting the depth tools into a service of their own is not needed while both run in one process on one machine.

## Order and checks

Steps 1 → 2 → 3 in that order (each relies on the one before); 4 and 5 can follow in either order.

Each step is checked on three clips, not the whole library:
- the V.8 lift (a continuation, hidden contact);
- the courtyard standoff (a moving camera, several people);
- Ramsay 026 (an approach and embrace).

After each step, `docs/HANDOFF.md` gets a section and the `scene-to-depth` skill is brought up to date.
