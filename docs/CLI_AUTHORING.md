# Animation Studio CLI

The CLI uses the existing running Studio service. It does not load the large project into a second process or replace MCP. Engine validation, revision history, preview updates and logs are shared.

```sh
npm run start:authoring
npm run studio -- tools
npm run studio -- call list_actions
npm run studio -- batch authoring/plans/block-counter.json --out /private/tmp/action-report.json
```

The sample creates a separately named action and retains its tracked run for visual review (`finish:false`). Check the returned run ID, inspect the viewer, append inspection checkpoints, and finish the run with the existing tracking tools through `call` or MCP. Do not execute the sample twice against revision 0: read the destination's actual revision before revising it.

Individual commands accept `--args file.json` or `--args -` for JSON stdin. Batch accepts `plan.json` or `-`. `--out` saves a JSON report; `--full` retains motion arrays that normal output omits. Reports include service-call client durations; total client time includes begin/finish calls. Whole CLI process startup/output time is separately measured by the benchmark parent, not by the batch report. `STUDIO_URL` supports only local HTTP loopback hosts.

Plans have `prompt`, optional `actionId`, optional boolean `finish` (default true) and 1–64 steps. Each step has `name`, an arguments object, and a unique `as` alias. A value containing only `{"$ref":"alias.revision"}` is replaced by that previous result field. Arrays/objects work recursively. No expressions or shell commands are evaluated. The plan is validated before opening a run; individual tools still apply their normal validation/revision checks.

The command runs all steps sequentially in one client process; it still sends one request per operation and persists each mutation under the existing semantics. This is scripting/batching, not an atomic service-side transaction or one-save implementation. A failed operation stops later steps, closes the run as failed and emits a report with completed steps. Earlier changes stay saved. Inspect revisions before resuming, rather than restarting blindly. If opening a run fails (for example another run is active), that pre-existing run is left untouched.

CLI and MCP are tagged distinctly in the Studio Run logs panel. The old stored event source identifier remains compatible; a transport field distinguishes CLI events. Server service durations, client request durations and total elapsed time are different measurements. Scripted completion does not establish natural motion or replace visual inspection.

## Complete scripted action comparison

Run with `node authoring/benchmarks/compare-action-runs.mjs /private/tmp/studio-action-comparison`. It creates/revises only two named benchmark copies, never the original Block Counter. Each run has 11 operations: source discovery, four source reads, compile/save, three rig diagnostics, preview, full action read. Begin/finish tracking is also included. Runs alternate CLI and persistent MCP across three paired trials. Motion hashes compare the full baked action excluding its destination ID/name.

Measured 2026-10-04:

| Trial | CLI, including process startup/output | Persistent MCP client workflow | Identical motion |
| --- | ---: | ---: | --- |
| 1 | 1.742 s | 2.580 s | yes |
| 2 | 1.853 s | 1.614 s | yes |
| 3 | 2.099 s | 2.088 s | yes |

The first MCP composition initializes the service's rig asset cache. Later trials share a warm service. Median CLI process time is 1.853 s; median MCP workflow is 2.088 s, but three trials, cold-start asymmetry and varying service/save times do not establish a CLI speed advantage. The later paired results show CLI slightly slower or essentially tied. All six runs have the same motion hash. Raw timings and run IDs are in `authoring/benchmarks/action-runs-2026-10-04.json`; full step reports stayed in the temporary benchmark directory to avoid duplicating animation payloads in the repository.

This is a complete scripted recipe execution, not a fresh LLM prompt-to-action comparison. It excludes LLM source selection, desktop dispatch, corrective decisions and visual inspection. The clear workflow benefit is that CLI can execute 11 prepared operations from one shell invocation. The same stages could also be scripted through persistent MCP. Keep both interfaces until tracked real prompt runs show a worthwhile improvement. Service-side batching and fewer full-project saves remain separate future optimizations.
