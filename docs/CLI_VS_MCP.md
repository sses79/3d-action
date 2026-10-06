# CLI versus MCP for Animation Studio

Investigated 2026-10-04. No production transport or authoring workflow was replaced. Read-only local benchmarks used list_actions with one discarded warmup followed by 12 alternating samples for each transport. The animation service remained running and actions were unchanged. Results exclude LLM thinking, Codex tool dispatch/approval overhead and browser inspection. Raw results: authoring/benchmarks/transport-2026-10-04.json.

| Path | Median per request |
| --- | ---: |
| Existing terminal helper: call.mjs → new MCP process → HTTP → running Studio | 91.78 ms |
| New Node process directly requesting Studio HTTP (CLI equivalent) | 56.15 ms |
| Persistent MCP process → HTTP → running Studio | 1.60 ms |
| HTTP from an already running process → running Studio | 0.90 ms |

A standalone process importing Studio and loading the project took 1,694.74 ms in one read-only sample. This is not a statistical estimate. The project is currently approximately 225 MiB and the bundled core approximately 25 MiB. Loading that core/project independently on every CLI command is a worse design than reusing the service; disk cache and machine state affect cold-load results.

## Findings

The existing fallback is already a shell command, but it launches an MCP adapter and initializes it for every operation. A direct HTTP CLI removes that extra process/handshake, saving approximately 35.63 ms (39%) per list_actions call in this benchmark. For 40 similarly small calls that is about 1.43 seconds. It does not explain a many-minute prompt-to-action session.

A normal long-lived MCP client amortizes startup. Its measured local overhead is already small; replacing it with a one-command-per-operation CLI is not an intrinsic speed gain. Model-facing latency/context costs were not measured here and cannot be inferred from the transport timings.

The actual authoring path still needs engine functions for rig sampling, validation, compilation, revision protection, persistence and preview. CLI and MCP are interfaces to those functions; neither replaces the motion engine or removes natural-motion inspection.

The previous knockback action needed multiple source/connection corrections, many agent/tool exchanges and visual checks. The new verification log contains only small read operations and browser/instrumentation work, so its five-minute elapsed time must not be used as an action-generation benchmark. The logger currently measures service time and total run time, not separate Codex dispatch, CLI process/transport and LLM time. Unmarked gaps remain unattributed.

## Recommended design if adding CLI

Use `LLM + skill → CLI → existing running Studio service → shared engine/storage/viewer`. Keep one owner of the project data; independent CLI processes must not open and rewrite the motion project behind the service.

Make the CLI useful at the workflow level: retrieve a filtered source shortlist with compact profiles, prepare variants and compile a draft recipe together, run boundary diagnostics in one request, return concise problems and inspection timestamps, and commit once after inspection. Batch logic belongs in the shared service so MCP can expose the same operation. CLI scripting can execute dependent deterministic stages without requiring an LLM turn after every small operation.

Retain run logging for either interface, tagging CLI/MCP transport correctly, and capture client request timing separately from service duration. Record browser checkpoints explicitly. Compare total elapsed, agent/tool exchange count, payload bytes, saves and revision count on the same prompt family; transport microbenchmarks alone are insufficient.

Before a wholesale migration, build the batch service operation and a thin CLI adapter, then compare against the same operation through persistent MCP. The likely larger benefits are fewer LLM/tool exchanges, smaller outputs, one save per batch and reusable reviewed motion recipes. Better source semantics and motion coverage remain necessary to reduce corrective iterations.

Skill instructions should describe stage-level inputs/outputs and inspection decisions for either interface. Simply renaming individual MCP tools as CLI commands preserves the current slow orchestration pattern.
