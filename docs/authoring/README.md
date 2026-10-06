# Animation Studio authoring service

Current local setup and API entry points. For the feature inventory, storage ownership and end-to-end data flow, see [Current state](../CURRENT_STATE.md).

## Start

Run from the repository root:

```sh
npm ci
npm run build:authoring
npm run build:editor
npm run start:authoring
```

Open http://127.0.0.1:5174/editor/. A port-5173 editor also connects when served locally. The service binds to loopback; LAN previews are playback-only. It does not expose source files through public demo routes.

## MCP and CLI

The MCP stdio adapter is `authoring/mcp.mjs`. Register it with your actual Node executable and repository path; the workspace installation previously used:

```sh
codex mcp add animation-studio -- /Users/tim/.nvm/versions/node/v26.7.0/bin/node /Users/tim/Yun/codex-3d/authoring/mcp.mjs
```

The calling LLM uses [animation-authoring](../../skills/animation-authoring/SKILL.md), [movement-building](../../skills/movement-building/SKILL.md) and [action-composition](../../skills/action-composition/SKILL.md). Their installed copies are under `~/.codex/skills/`.

The direct CLI shares the running service:

```sh
node authoring/cli.mjs tools
node authoring/cli.mjs call get_capabilities
node authoring/cli.mjs call list_actions
```

For structured calls use `--args file.json`; see [CLI authoring](../CLI_AUTHORING.md) for batching and output options. `authoring/call.mjs` remains an MCP-handshake fallback. CLI/MCP do not independently load and rewrite the project on every call.

## Capabilities and persistence

There are 37 operations; `get_capabilities` provides current schemas, rig manifest and limits. Custom Action v2 supports 65 rig joints and root transforms, named source phases and impact cues. Movement composition pins source revisions and uses explicit connections; typed specs add source hashes and curated policies. Timing-only changes use `revise_action_recipe`.

Writes persist automatically; stale revisions and invalid data are rejected. Selected/reference data is sent to the viewer with compact library summaries. Preview writes use a small sidecar, separate from motion saves. Project, review and tracking storage paths are documented in [Current state](../CURRENT_STATE.md#data-and-ownership). Back up the project and sidecars together.

Manual duration controls are disabled while service-connected to avoid divergent state. Playback/inspection controls remain available. Save/export produces motion JSON for the supported rig/player, not arbitrary GLB animation or model import. Existing offline localStorage projects can be imported into the service through Load saved.

## Reference guides

- [Movement library](../MOVEMENT_LIBRARY.md) and [UAL2 sync](../UAL2_LIBRARY.md)
- [Profiles](../MOVEMENT_PROFILES.md), [typed contracts](../MOVEMENT_CONTRACTS.md) and [current coverage](../LIBRARY_CONTRACT_REVIEW.md)
- [Velocity/travel connections](../VELOCITY_CONNECTIONS.md) and [timing revisions](../RECIPE_REVISIONS.md)
- [Motion quality](../MOTION_QUALITY.md), [review storage](../CONTRACT_REVIEWS.md) and [run logs](../ACTION_RUN_LOGS.md)

Arbitrary-rig retargeting, general IK, mesh/material editing, physical collision and game input state machines are outside the implementation. Numeric validity is not visual or physical approval.
