---
id: SEED-002
status: dormant
planted: 2026-05-20
planted_during: v8.0 closure / docs/collaboration.md introduction
trigger_when: two active parallel workspaces fight on `.planning/STATE.md` semantic merge — OR — second developer onboards and needs to run a milestone in parallel with an ongoing one
scope: Medium
---

# SEED-002: Restructure `.planning/STATE.md` to be per-workstream

`.planning/STATE.md` currently tracks ONE current milestone + ONE current phase as scalar fields (`milestone: vX.Y`, `phase: NN`). This assumed a single linear stream of work. As of 2026-05-20 the repo is moving to multi-developer; the immediate workaround is "one workspace per active phase, merged back through PR" (see `docs/collaboration.md`). That works while phases sequence cleanly. It breaks when two streams genuinely run in parallel.

## Why This Matters

The single-scalar STATE assumption is load-bearing:
- `/gsd-progress`, `/gsd-next`, and `/gsd-resume-work` all read STATE as the source of truth for "what's happening now."
- Sub-agents (`gsd-executor`, `gsd-planner`) write back to STATE on phase boundaries.
- Workspace merge semantics today: workspace owns STATE for the phase, merges back on PR. If two workspaces both mutate STATE in non-overlapping ways (different milestones, different phases), git will line-merge them into incoherent garbage that LOOKS clean.

## When to Promote

Triggers (any one):
1. Two workspaces are open against different milestones (e.g. V8.1 phase 84 in one, V9.0 spike work in another) and STATE merge produces semantic conflict.
2. A second developer onboards and needs to run a milestone in parallel with an existing one.
3. `.planning/MILESTONES.md` adoption of concurrent milestone status (a milestone marked `running` while another is also `running`).

Until one of those fires, the current STATE shape is fine and the workspace rule in `docs/collaboration.md` handles the existing single-stream case.

## Likely Shape (Strawman, Not Locked)

```yaml
# .planning/STATE.md (proposed v2)
gsd_state_version: 2.0
active_streams:
  - stream_id: v81-cross-swarm-prep
    milestone: v8.1
    phase: 84
    workspace: ws-v81-tenant-domains
    owner: nickcrutzen
    started: 2026-05-22
  - stream_id: v9-learning-inbox-spike
    milestone: v9.0
    phase: spike
    workspace: ws-v9-clusterer-spike
    owner: teammate
    started: 2026-05-23
trunk_milestone: v8.1  # the milestone considered "current" on main when no workspace context
```

`/gsd-progress` and friends would default to the workspace's `stream_id` when invoked inside a worktree, fall back to `trunk_milestone` on `main`.

## Why Not Now

- We do not yet have a concrete parallel-workstream pain point — restructuring without that signal risks designing for the wrong shape.
- Restructure touches gsd tooling (subagent reads/writes) — coordinated change, not isolated.
- Cheaper to do once with the actual shape in hand than to retrofit a guess.

## Origin

Surfaced during the 2026-05-20 collaboration-doc design session. User raised the question; deferred to a seed rather than locking the design without a forcing function.
