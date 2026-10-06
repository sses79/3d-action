# One-call action timing revisions

`revise_action_recipe` revises and recompiles an existing composed action through one MCP call. It reads the stored revision-pinned recipe, applies timing changes, validates/bakes the action, keeps the previous action as reference and seeks Studio to the changed movement plus adjoining connections. Source movements and their revision IDs remain unchanged.

Use `list_actions` to obtain the current action revision and compact recipe; no full joint-track download is needed for timing-only changes. Identify zero-based movement indices in `recipe.steps` and submit changes:

```json
{
  "actionId":"block-counter",
  "expectedRevision":1,
  "changes":[
    {"step":1,"duration":0.4},
    {"step":2,"speed":1.2}
  ],
  "playing":false
}
```

This example extends the defensive hold to 0.40 seconds and plays the entire counter movement, including follow/recovery, at 1.2× its variant speed. Duration excludes connections; it resolves to source duration / requested duration. Both speed and resolved duration must fit the 0.5–1.5 playback-speed bounds. A longer hold outside those bounds requires preparing a longer source variant. A step cannot specify speed and duration together.

A change may also set incoming `transition` (first step 0, later steps >0 and <=1 s). Duplicate/out-of-range indices, stale action or pinned source revisions, archived sources, no-op edits and actions exceeding the existing 4 s/256-key limit are rejected before action mutation. Source replacement and arbitrary subphase/joint edits continue through composition/movement-building tools.

The response returns the updated revision/recipe, before/after step settings, previous/new inspection ranges, duration, viewer URL and elapsed service milliseconds. Default preview is paused at the start of the affected region with looping off; `playing:true` starts playback there. It does not add bounded-region looping. Compare and Undo retain their existing behavior. Inspection ranges are timeline ranges, not automatic evidence of physical correctness.

Composition now saves the final action and recipe in one full-project write rather than two. Preview focus persists in its small sidecar. The action-composition skill uses this shortcut for routine timing requests.

A separate `block-counter-timing-demo` was created and revised to preserve the original block-counter action. The live single-call revision took **985 ms** including compilation/save, changed the hold from 0.28 to 0.40 s and increased counter playback speed by 20%. Its total duration is 1.717 s; the original is its reference. This is one local service measurement, not a promised total prompt-to-review latency. LLM selection, tool transport, browser graph preparation and visual review add time.

Verification: 14 authoring tests and editor TypeScript checks pass. New coverage checks source immutability, prior-action reference, persisted recipe/preview, stale/invalid patch rejection, and no partial changes on compilation limits. Browser comparison verifies the extended hold against the previous release timing. One first test run aborted in a native Node async-callback assertion; the complete rerun passed all 14 tests.
