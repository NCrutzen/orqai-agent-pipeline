---
phase: 80
plan: 06
type: execute
wave: 5
depends_on: ["80-03", "80-04", "80-05"]
files_modified:
  - docs/agentic-pipeline/stage-3-coordinator.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "stage-3-coordinator.md documents the new state machine: classifying → predicted → {routed_human_queue | handler-owned}"
    - "Document includes a transition table (From/To/Writer/Trigger)"
    - "Document includes a 'Stuck-Status Meaning' monitoring table distinguishing classifier-bug vs dispatcher-bug vs expected-human-lane"
    - "Document includes a 'Cross-Swarm Dispatcher Contract' section locking wildcard '*/predicted' subscription + 'add a swarm = registry rows + classifier function' rule"
    - "Document's Architecture diagram is split into Stage 3 classifier + Stage 3.5 dispatcher boxes joined by '<swarm>/predicted' event"
    - "Document's Stage 3.5 Escalation section is reframed: gate now lives in dispatcher, hard-separation rule unchanged"
    - "Monitoring guidance reflects POST-backfill state (no stranded classifying rows)"
  artifacts:
    - path: "docs/agentic-pipeline/stage-3-coordinator.md"
      provides: "Updated RFC reflecting Phase 80 architecture as RFC-locked source of truth"
      contains: "## State Machine"
  key_links:
    - from: "stage-3-coordinator.md State Machine section"
      to: "Mermaid stateDiagram-v2 with classifying → predicted → terminal/handler edges"
      via: "stateDiagram-v2 mermaid block"
      pattern: "stateDiagram-v2"
    - from: "stage-3-coordinator.md Cross-Swarm Dispatcher Contract section"
      to: "wildcard predicted Inngest trigger"
      via: "explicit wildcard literal in doc"
      pattern: "predicted"
---

<objective>
Lock the new Stage 3 architecture into the RFC. Per project convention (CLAUDE.md "Canonical Architecture Docs"), this doc is the source-of-truth — code follows doc. Phase 80 changed the runtime; the RFC must reflect that change before the phase is verified.

**depends_on rationale (revised):** Now depends on 80-05 (backfill) in addition to 80-03 + 80-04, because the "Stuck-Status Meaning (Monitoring)" table and the SQL health-query examples must reflect the POST-backfill state. If this RFC shipped before 80-05, the example SQL would return ~407 stranded `classifying` rows in production, and the "page when classifying >5min" guidance would generate immediate false alarms. The RFC must be the locked truth of the steady-state runtime, which only exists after backfill completes.

Purpose: Ensure future planners reading `docs/agentic-pipeline/stage-3-coordinator.md` cannot drift back to the monolithic-coordinator pattern. Document the cross-swarm dispatcher contract so Phase 78 (sales-email) and any future swarm onboard cleanly.

Output: One updated RFC document with new sections + reframed existing sections per RESEARCH §"State-Machine Doc Update Plan (Q7)".
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-CONTEXT.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-RESEARCH.md
@docs/agentic-pipeline/stage-3-coordinator.md
@docs/agentic-pipeline/README.md
@docs/agentic-pipeline/stage-1-regex.md
@web/lib/inngest/functions/stage-3-dispatcher.ts
@web/lib/inngest/functions/debtor-email-coordinator.ts
@CLAUDE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update stage-3-coordinator.md with new architecture sections</name>
  <read_first>
    - docs/agentic-pipeline/stage-3-coordinator.md (full) — orient on existing sections
    - 80-RESEARCH.md section "State-Machine Doc Update Plan (Q7)" — full target structure with mermaid diagram + tables verbatim-ready
    - 80-PATTERNS.md section "MODIFIED docs/agentic-pipeline/stage-3-coordinator.md" — section-level change list
    - 80-CONTEXT.md section "State-Machine Doc Lock" — locked requirements
    - web/lib/inngest/functions/stage-3-dispatcher.ts (final shipped version) — verify the doc's described behavior matches the code (event payload field names, step.run names, etc.)
    - .planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-05-SUMMARY.md (if present) — confirm backfill completed and reflect post-backfill steady-state in the monitoring section
  </read_first>
  <files>docs/agentic-pipeline/stage-3-coordinator.md</files>
  <action>
    Update docs/agentic-pipeline/stage-3-coordinator.md. Use verbatim content from RESEARCH section "State-Machine Doc Update Plan (Q7)" as the starting point.

    A. ADD new section "## State Machine" (insert after the existing "Architecture" section) containing a Mermaid stateDiagram-v2 block with these transitions:
       - [start] --> classifying (classifier creates agent_runs row)
       - classifying --> predicted (classifier finishes Intent Agent + emits swarm/predicted)
       - classifying --> failed (classifier exception)
       - predicted --> routed_human_queue (dispatcher resolves placeholder intent)
       - predicted --> fetching_document (dispatcher emits handler_event for registered single-shot)
       - predicted --> generating_body (dispatcher emits handler_event for registered generation)
       - fetching_document --> ... (handler-owned transitions)
       - routed_human_queue --> [end] (terminal)
       - failed --> [end] (terminal)

    B. ADD new section "## Transition Table" with columns From | To | Writer | Trigger and rows for each transition above. Writers: classifier, dispatcher, Stage 4 handler.

    C. ADD new section "## Stuck-Status Meaning (Monitoring)" with a table mapping stuck-status duration to meaning to action. Reflect POST-backfill steady-state (Plan 80-05 already executed):
       - classifying >5 min → classifier bug or LLM outage → page; check Inngest dashboard for automations/debtor-email-coordinator failures (post-backfill: zero baseline; ANY non-zero count is anomalous)
       - predicted >5 min → dispatcher bug or Inngest delay → page; check Inngest dashboard for automations/stage-3-dispatcher
       - routed_human_queue indefinitely → expected human lane → NO alert
       - handler-owned status >N min → Stage 4 handler bug; per-handler runbook (out of RFC scope)

       Include a SQL health-query example block with the two stuck-status queries (classifying-stuck and predicted-stuck) using `now() - interval '5 minutes'`. Add a footnote: "Pre-Phase-80 there were ~407 stranded `classifying` rows in production; these were resolved by `web/scripts/backfill-stuck-classifying-stage3.ts` on {date}. Steady-state baseline = 0 stranded rows."

    D. ADD new section "## Cross-Swarm Dispatcher Contract" locking these statements:
       - Dispatcher subscribes via Inngest wildcard trigger on the predicted event family (single function, all swarms).
       - Event name format: `{swarm_type}/predicted` (lowercase, hyphenated swarm_type).
       - Event payload schema lists: swarm_type, run_id, agent_run_id, email_id, automation_run_id, budget_run_id, ranked, language, urgency, entity.
       - Routing source-of-truth: swarm_intents (swarm_type, intent_key) → handler_status, handler_event.
       - Adding a new swarm: INSERT into swarms + swarm_intents rows + classifier function that emits the predicted event. NO dispatcher code change.
       - Hard-separation rule (lock): dispatcher reads swarm_intents ONLY; never swarm_noise_categories. Stage 1 owns noise; Stage 3 owns intents.

    E. UPDATE existing sections:
       - "## Goal" — soften wording that says "single-shot default in coordinator" so the goal reflects single-shot dispatch now in dispatcher.
       - "## Architecture" diagram — split the existing single Stage 3 box into "Stage 3 classifier" and "Stage 3.5 dispatcher" joined by an arrow labeled with the predicted event. Update prose alongside.
       - "## Stage 3.5 Escalation" (if present) — reframe: the gate (evaluateEscalationGate) now lives in the dispatcher; same rules, different home; hard-separation rule unchanged (gate consumes SwarmIntentRow[], never SwarmNoiseCategoryRow[]). Per Phase 76 D-07 both decisions collapse to dispatch decisions; orchestrator fan-out reserved as a dormant re-enable seam.

    F. Add `Last revised: 2026-05-08 (Phase 80)` near the top of the doc (alongside any existing version stamp; create one if absent).

    G. No CLAUDE.md edit required — CLAUDE.md already references this doc as canonical.
  </action>
  <verify>
    <automated>grep -c "## State Machine" docs/agentic-pipeline/stage-3-coordinator.md ; grep -c "## Transition Table" docs/agentic-pipeline/stage-3-coordinator.md ; grep -c "## Stuck-Status Meaning" docs/agentic-pipeline/stage-3-coordinator.md ; grep -c "## Cross-Swarm Dispatcher Contract" docs/agentic-pipeline/stage-3-coordinator.md ; grep -c "stateDiagram-v2" docs/agentic-pipeline/stage-3-coordinator.md ; grep -c "2026-05-08" docs/agentic-pipeline/stage-3-coordinator.md</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "## State Machine" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 1
    - `grep -c "## Transition Table" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 1
    - `grep -c "## Stuck-Status Meaning" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 1
    - `grep -c "## Cross-Swarm Dispatcher Contract" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 1
    - `grep -c "stateDiagram-v2" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 1
    - `grep -c "predicted" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 8 (state name appears throughout the new sections)
    - `grep -c "routed_human_queue" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 3
    - `grep -c "swarm_intents" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 3
    - `grep -c "swarm_noise_categories" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 1 (in the hard-separation lock statement)
    - `grep -cE "Last revised.*2026-05-08|Phase 80" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 1
    - `grep -c "stage-3-dispatcher" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 2
    - `grep -cE "backfill|stranded|steady-state" docs/agentic-pipeline/stage-3-coordinator.md` returns >= 1 (post-backfill monitoring footnote present)
  </acceptance_criteria>
  <done>RFC contains all four new sections, mermaid state-diagram, transition table, monitoring table (post-backfill steady-state), cross-swarm contract, version stamp; existing Architecture/Goal/Escalation sections updated to reflect classifier/dispatcher split.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

None. Documentation only.

## STRIDE Threat Register

(no applicable threats — markdown documentation; no runtime, no inputs, no auth)
</threat_model>

<verification>
- All grep checks pass.
- Markdown renders correctly (mermaid blocks fenced; tables aligned).
- Cross-references to dispatcher code path-correct.
- The doc reads as authoritative — a future planner could implement Phase 80 just from this RFC plus the registries.
</verification>

<success_criteria>
- RFC reflects shipped runtime as locked source-of-truth.
- All required sections present with grep evidence.
- Document version-stamped 2026-05-08 / Phase 80.
- Phase 78 (sales-email) can implement against the cross-swarm contract section without code spelunking.
- Monitoring guidance reflects post-backfill steady-state (no stranded `classifying` rows expected).
</success_criteria>

<output>
After completion, create `.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-06-SUMMARY.md` with: section-by-section diff summary, mermaid block excerpt, all grep verification outputs, link to the rendered diff in the commit.
</output>
