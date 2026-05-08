---
phase: 80
plan: 04
type: execute
wave: 3
depends_on: ["80-03"]
files_modified:
  - web/lib/automations/swarm-bridge/sync.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "agent_runs rows in status='predicted' render in the 'progress' triage stage (not the default 'backlog')"
    - "agent_runs rows in status='predicted' surface 'Stage 3 Dispatcher' as the agent label"
    - "automation_runs.status='predicted' Bulk Review code paths (Phase 60 feature) are UNCHANGED"
  artifacts:
    - path: "web/lib/automations/swarm-bridge/sync.ts"
      provides: "Updated triage mapping that recognizes 'predicted' as a transient progress state on agent_runs"
      contains: "case \"predicted\""
  key_links:
    - from: "swarm-bridge/sync.ts:triageStageFromStatus"
      to: "agent_runs.status='predicted' → 'progress'"
      via: "case 'predicted': return 'progress'"
      pattern: "case \"predicted\".*progress"
---

<objective>
Add the missing `case "predicted":` arms to `triageStageFromStatus` and `triageAgentFromStatus` in `swarm-bridge/sync.ts` so `agent_runs` rows newly entering the `predicted` state surface in the right Kanban lane.

Purpose: RESEARCH §"UI Impact Analysis (Q5)" found `triageStageFromStatus` has NO `case "predicted":` — it falls through to the default `"backlog"` branch. Once Wave 2 ships, every classifier-completed row briefly shows in backlog while the dispatcher routes it. Healthy dispatcher = sub-second transient; unhealthy dispatcher = stuck-in-backlog (wrong, alarming). Map `predicted` to `"progress"` so:
- Healthy rows pass through invisibly to operators (progress lane shows in-flight work).
- Stuck rows are visible to dev monitoring without contaminating the operator backlog view.
- `routed_human_queue` continues to land in `"review"` (already mapped — no change).

Output: Two case arms added. Bulk Review (`automation_runs.status='predicted'`, Phase 60 feature) paths at lines 35, 64, 588, 663 are NOT touched.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-CONTEXT.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-RESEARCH.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-PATTERNS.md
@web/lib/automations/swarm-bridge/sync.ts

<interfaces>
<!-- From sync.ts:220-266 (triageStageFromStatus) -->
- Reads agent_runs.status (NOT automation_runs.status — different table)
- case "classifying" / "fetching_document" / "generating_body" / "creating_draft": return "progress"
- case "routed_human_queue" / "copy_document_drafted" / "copy_document_needs_review" / "copy_document_failed_not_found": return "review"
- default: return "backlog" ← THIS catches 'predicted' today (wrong)

<!-- From sync.ts:242-256 (triageAgentFromStatus) -->
- Same input domain
- Returns the human-readable agent label per status

<!-- DO NOT TOUCH (lines 35, 64, 588, 663) -->
- automation_runs.status='predicted' Bulk Review code (Phase 60) — different table, different feature.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add 'predicted' case to triageStageFromStatus and triageAgentFromStatus</name>
  <read_first>
    - web/lib/automations/swarm-bridge/sync.ts lines 1-300 — orient on imports + the two functions
    - 80-RESEARCH.md §"UI Impact Analysis (Q5)" — full audit table with exact lines
    - 80-PATTERNS.md §"MODIFIED web/lib/automations/swarm-bridge/sync.ts" — exact placement of new cases
    - 80-CONTEXT.md §"UI Semantics Audit" — locked recommendation
  </read_first>
  <files>web/lib/automations/swarm-bridge/sync.ts</files>
  <action>
    1. Locate `triageStageFromStatus` (around line 220). The body is a `switch (status)`. Find the existing arm group that returns `"progress"` (currently includes `classifying`, `fetching_document`, `generating_body`, `creating_draft`). Add `case "predicted":` to that group:

       ```ts
       case "classifying":
       case "predicted":           // NEW (Phase 80): Stage 3 classifier emitted; dispatcher about to route.
       case "fetching_document":
       case "generating_body":
       case "creating_draft":
         return "progress";
       ```

       Add a brief comment on the new line: `// Phase 80: dispatcher transient — sub-second under healthy conditions; only routed_human_queue surfaces to review`.

    2. Locate `triageAgentFromStatus` (around line 242). Add a `case "predicted":` arm returning a sensible label:

       ```ts
       case "predicted":
         return "Stage 3 Dispatcher";
       ```

       Place it adjacent to whichever case currently returns "Stage 3 Coordinator" or similar — keep ordering parallel to the stage function for readability.

    3. CRITICAL — verify these edits target the `agent_runs.status` mappers, NOT the Bulk Review `automation_runs.status='predicted'` paths at lines 35, 64, 588, 663. Per RESEARCH §"UI Impact Analysis", those paths are unaffected by Phase 80 and must stay verbatim. Confirm with grep that line counts at 35, 64, 588, 663 still match the original `case "predicted": return "review";` etc. text.

    4. Run `npx tsc --noEmit` to confirm the Status type (now including `predicted` from plan 80-01) accepts the new case arms cleanly.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit 2>&1 | grep "swarm-bridge/sync" | head -10 ; grep -nE "case \"predicted\"" web/lib/automations/swarm-bridge/sync.ts</automated>
  </verify>
  <acceptance_criteria>
    - At least one new `case "predicted":` line is followed by `return "progress";` (the triage stage mapper) — verify with: `grep -A1 'case "predicted"' web/lib/automations/swarm-bridge/sync.ts | grep -c "return \"progress\""` returns >= 1
    - At least one new `case "predicted":` is followed by `return "Stage 3 Dispatcher";` — verify with: `grep -A1 'case "predicted"' web/lib/automations/swarm-bridge/sync.ts | grep -c "Stage 3 Dispatcher"` returns >= 1
    - The Bulk Review path still maps `predicted` → `"review"` — verify with: `grep -B1 -A1 'case "predicted"' web/lib/automations/swarm-bridge/sync.ts | grep -c 'return "review"'` returns >= 1
    - `cd web && npx tsc --noEmit 2>&1 | grep "swarm-bridge/sync"` returns no errors
    - `cd web && npx vitest run` (full suite) — no new failures introduced

    > Note: The brittle total-count assertion (e.g. `wc -l` of `case "predicted"` >= 4) is intentionally OMITTED. The contextual greps above (return-progress arm + Stage-3-Dispatcher arm + return-review arm preserved) are stronger evidence than a count, because they verify the *meaning* of each new arm, not just the count.
  </acceptance_criteria>
  <done>Two new case arms added; triage mapper now classifies predicted as 'progress'; agent label is 'Stage 3 Dispatcher'; Bulk Review paths untouched; tsc + full suite clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

None. Pure UI mapping change.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-80-07 | Information Disclosure | Wrong lane could surface in-flight rows to operators | accept | Mapping `predicted → progress` ensures rows do NOT surface to operator review lane during the sub-second transient; only `routed_human_queue` (terminal) lands in review. |
</threat_model>

<verification>
- `cd web && npx vitest run` clean.
- `cd web && npx tsc --noEmit` clean.
- Manually load the swarm Kanban view in dev: a fresh debtor-email run should briefly show in the progress lane before disappearing into review (or handler-owned). Manual-verify deferred to /gsd-verify-work.
</verification>

<success_criteria>
- predicted is mapped consistently for both triage helpers.
- No regression to Bulk Review predicted-row queue.
- Full test suite remains green.
</success_criteria>

<output>
After completion, create `.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-04-SUMMARY.md` with: diff snippet, grep evidence that Bulk Review paths untouched, vitest pass output.
</output>
