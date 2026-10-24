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

### Step 3: delivery to a project folder (about a day)

- **Writing the folder.** `deliverTo` writes the folder described above, from templates in `authoring/templates/` (the task, the upload steps, the generation prompt).
  - It never copies source frames into anything meant for the video model, and says so in the upload steps.
- **Re-delivery.** A re-delivery after a change writes `-v2` files beside the old ones instead of overwriting them, and lists what changed.
- **Joining takes.** A `join` option on `review_depth_result` cuts and joins takes with both sound tracks (as `v8-final-fight-2069+1215.mp4` was made). It warns when the join frame differs from the guide, which is why V.8 was joined at the first cut.
- **Done when:** an s-video session can go from "I need a depth reference for this beat" to the uploads and prompt without anyone writing files by hand.

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
