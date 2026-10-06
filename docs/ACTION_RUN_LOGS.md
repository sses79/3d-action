# Prompt-to-action tracking

Animation Studio stores timestamped authoring runs independently of animation data. Open **Run logs** in the Studio header to choose a run and inspect every recorded event. The panel refreshes while open, including active operations. The viewer's motion state/polling payload does not contain logs.

## LLM workflow

1. Call `begin_action_run` with the user's original prompt, and optionally the planned action ID. Keep the returned UUID. Start this before capability/source discovery. One run is active across the local service at a time; inspect an existing active run instead of silently replacing it.
2. Perform the usual MCP authoring workflow. Calls are automatically recorded with server UTC start/finish, monotonic service duration, completed/failed status, target ID and resulting revision when available. Nested internal calls count once. Tracking tools do not recursively log themselves.
3. Use `append_action_run_event` for decisions and browser inspections. For a lengthy stage, add a note at its start and another when it finishes. These are LLM-reported checkpoints, not automatically observed browser events. Notes use the current server time; timestamps cannot be backdated.
4. Call `finish_action_run` with completed/failed/cancelled status, a final note and the resulting action ID when applicable. A linked completed action must exist; its current revision is recorded. An error in one MCP call does not close the whole run because the LLM may correct it.
5. Fetch summaries with `list_action_runs` (optional actionId filter), and full events with `get_action_run` (runId).

```json
{"prompt":"React to a heavy hit, stagger backward and return to guard.","actionId":"knockback-recovery"}
```

Use this payload with `begin_action_run`. A decision note:

```json
{"runId":"<returned UUID>","phase":"selection","note":"Choose the standing chest reaction; reject the source that ends lying down."}
```

Use this payload with `append_action_run_event`. Finish:

```json
{"runId":"<returned UUID>","status":"completed","actionId":"knockback-recovery","note":"Inspected recoil, catch step and final guard."}
```

Use the existing `node authoring/call.mjs TOOL arguments.json` fallback when MCP tools are not loaded in a conversation. Installed Animation Studio skills and MCP initialization instructions include tracking guidance.

## Timing and persistence

- Total elapsed starts at the begin operation and ends at finish. It includes gaps between calls, but excludes any work before begin (such as initial LLM thinking and transport).
- MCP service duration uses the monotonic performance clock and includes logging overhead. It excludes the calling agent's thinking, external tool transport and browser work.
- Tool-duration sum can exceed wall time when calls overlap. Unmarked gaps do not identify their cause.
- Events retain an increasing index and UTC timestamp, plus time since start. Failed operations retain a bounded error message. Full tracks, full tool arguments and results are not duplicated in logs.
- Data lives at `.authoring/project.json.runs.json` by default (or `<STUDIO_STATE_PATH>.runs.json`). Atomic writes are independent of the large motion project. It survives browser/service restarts. After a service restart, unfinished MCP operations are marked interrupted with unknown duration; the active run stays open for explicit resumption or closure.
- Initial bounds: 1,000 runs and 5,000 events per run; the service rejects further additions rather than silently dropping history. Logs are retrieved separately and are not included in motion project import/export. Preserve the runs file when backing up the Studio.
- Browser GET `/api/runs` returns summaries; GET `/api/run?id=<UUID>` returns a full run, under the same loopback/origin restrictions as the authoring service.

Historical runs cannot acquire accurate timestamps retroactively. The existing Knockback Recovery has revision notes, but it was created before this instrumentation. The first live log is explicitly labelled as a tracking verification run.
