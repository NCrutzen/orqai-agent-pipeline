# Phase 66: Pipeline consolidation (retire triage path) — Research

**Researched:** 2026-05-04
**Domain:** Inngest event-driven pipeline rename + dead-code consolidation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Big-bang rename in a single PR — no deprecation marker, no parallel-name period.
  - File: `web/lib/inngest/functions/debtor-email-triage.ts` → `web/lib/inngest/functions/debtor-email-coordinator.ts`.
  - Inngest function id: `"automations/debtor-email-triage"` → `"automations/debtor-email-coordinator"`.
  - Exported name: `debtorEmailTriage` → `debtorEmailCoordinator`.
  - Audit `updated_by` strings: `"inngest:debtor-email-triage"` → `"inngest:debtor-email-coordinator"`.
- **D-02:** Move `web/lib/automations/debtor-email/triage/` → `web/lib/automations/debtor-email/coordinator/` in the same PR. Update every import. `coordinator/` already exists (Phase 65 added 4 files into it); helpers move IN.
- **D-03:** OPEN — research must determine whether the coordinator's trigger event needs changing to remove a parallel-pipeline overlap. **Resolved by this research → see Trigger Wiring Recommendation.**
- **D-04:** Lock event taxonomy `debtor-email/<intent>.requested`. No event renames in this phase.
- **D-05:** Audit task — grep for any direct cross-handler invocation; only legal path is `inngest.send` from coordinator-orchestrator (escalation) or coordinator's single-shot fast path.
- **D-06:** Conservative move-or-delete of triage/ helpers; no shims; no deprecation markers; no commented-out blocks. Git history is the audit trail.
- **D-07:** `web/app/api/inngest/route.ts` registers the renamed function and removes the old export.
- **D-08:** Verification = static codebase audit (zero `debtor-email-triage` literals post-rename, plus no two Inngest functions on the same Stage-1-input event with overlapping behaviour) + live smoke regression reusing Phase 65's regression report scaffolding.
- **D-09:** Single PR, single deploy, no flag.
- **D-10:** Update `docs/debtor-email-pipeline-architecture.md` and `docs/agentic-pipeline/stage-3-coordinator.md` — remove every "triage" reference where it means the legacy function/pipeline (NOT human-operator triage).

### Claude's Discretion

- Codemod vs sed for import-path rewrites — planner picks.
- Whether to backfill historical `automation_runs.updated_by` strings. Default: leave history alone; only new writes use the new string.
- Test file rename ordering — both must land in the same PR to keep the suite green.

### Deferred Ideas (OUT OF SCOPE)

- `pipeline_events` runtime telemetry table → Phase 70 (TELE-*).
- `swarm_intents` registry replacing per-handler Inngest functions → Phase 68 (SWRM-*).
- iController DOM tagging side effect on canonical flow → Phase 67 (TAG-*).
- Cross-swarm canonical handler input shape → Phase 69 (CANO-*).
- Bulk Review override UI for ranked output / numeric thresholds / learning loop → Phase 71 (LERN-*).
- Backfill historical `updated_by` strings — intentionally not done.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONS-01 | Inbound debtor-email automatically goes through `regex → label-resolver → coordinator → handler` (single canonical flow) | **Trigger Wiring Recommendation** below proves no parallel pipeline exists today; the canonical flow IS the only flow because `debtor/email.received` has zero live producers. CONS-01 reduces to (a) verifying-and-documenting + (b) deleting the orphan trigger subscription. |
| CONS-02 | `debtor-email-triage` Inngest function retired; intent-agent role moves to Stage 3 coordinator slot | Mechanical rename of one file + one directory + one route.ts import + 2 `circuit-breaker.ts` audit-string write sites. Triage Directory Inventory below has the full move-or-delete table. |
| CONS-03 | All Stage 4 handlers invoked via canonical `debtor-email/<intent>.requested` events | Stage 4 Handler Invocation Audit below confirms zero cross-handler imports across `web/lib/inngest/functions/` (only legitimate emitters: coordinator single-shot dispatch + orchestrator fan-out). CONS-03 is **already satisfied today**; phase 66 just locks it via an audit task that asserts this stays true. |

</phase_requirements>

## Summary

Phase 66 turned out to be smaller and lower-risk than CONTEXT.md hedged. Two findings drive this:

1. **`debtor/email.received` has zero live producers in the codebase.** The only file that subscribes to it is `debtor-email-triage.ts:57`. Every other reference is either (a) the type catalogue in `web/lib/inngest/events.ts:313`, (b) the test file `__tests__/debtor-email-triage.test.ts:104`, (c) doc comments noting the *legacy* nature of the event, or (d) stale `.next/` build chunks (irrelevant). The actual Stage 0 → Stage 1 handoff event is `stage-0/email.received` (deliberately distinct, see `events.ts:252-254`). The actual Stage 2 → coordinator wiring goes through `swarm_categories.swarm_dispatch` resolved at runtime by the verdict-worker — and the seeded value for the `unknown` bucket is `debtor-email/label-resolve.requested` (label-resolver, not triage).

2. **Stage 4 handler invocation is already event-only.** Across `web/lib/inngest/functions/`, no Inngest function imports another Inngest function. The only code paths emitting `debtor-email/<intent>.requested` are (a) `debtor-email-triage.ts:217-228` single-shot dispatch via registry, (b) `coordinator-orchestrator.ts:90-108` template-literal fan-out, (c) `coordinator-complete.ts:56` synthesis trigger. CONS-03 is satisfied today; the audit task only locks it.

What remains is a mechanical rename + dead-code delete. The `debtor/email.received` event subscription on the coordinator is dead wiring (no one fires the event in production) — Phase 66 should change the trigger to align with the canonical flow.

**Primary recommendation:** Treat Phase 66 as `rename + delete + retarget the dead trigger subscription`. Three categories of work:
1. **Rename** (D-01, D-02, D-07, D-10): file + dir + Inngest id + exported const + audit string + route.ts + 2 doc files.
2. **Delete dead code** (D-06): `triage/circuit-breaker.ts` (zero callers) and `triage/invoke-body.ts` (zero callers post-Phase 65). Plus delete the `"debtor/email.received"` entry from `events.ts` once the coordinator's trigger is retargeted.
3. **Retarget the dead trigger** (D-03 resolution): change the coordinator's `{ event: "debtor/email.received" }` to `{ event: "classifier/screen.requested" }` — see Trigger Wiring Recommendation for the rationale and alternatives.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Inbound email ingest | API (`/api/automations/debtor-email/ingest`) | — | Webhook-driven; emits `stage-0/email.received` synchronously. |
| Stage 0 input safety | Inngest (`stage-0/safety-worker`) | Orq.ai LLM | Subscribes to `stage-0/email.received`; emits `classifier/screen.requested` on safe verdict. |
| Stage 1 regex classifier | Inngest (`classifier/verdict-worker`) | Orq.ai (only on `unknown`) | Subscribes to `classifier/verdict.recorded` (operator/auto-approve); registry-driven `swarm_dispatch`. |
| Stage 2 entity enrichment | Inngest (`classifier/label-resolver`) | NXT-Zap | Subscribes to `debtor-email/label-resolve.requested`; resolves customer; writes `email_labels`. |
| Stage 3 coordinator (intent + escalation) | Inngest (renamed `automations/debtor-email-coordinator`) | Orq.ai | Subscribes to TBD trigger (see D-03 resolution); calls intent agent; evaluates escalation gate. |
| Stage 4 handler invocation | Inngest event bus (`debtor-email/<intent>.requested`) | — | Coordinator single-shot OR orchestrator fan-out emits; handler functions subscribe. No direct calls. |

## Current Event Flow (live, post-Phase 65)

```
[ /api/automations/debtor-email/ingest/route.ts ]
        |
        | inngest.send({ name: "stage-0/email.received" })          [route.ts:554]
        v
[ stage0SafetyWorker ]                                              [stage-0-safety-worker.ts:39]
   - regex screen + LLM verdict + budget check
   - on safe:    emit "classifier/screen.requested"                 [line 158]
   - on suspect: persist topic='safety_review'; STOP
   - on breach:  emit "pipeline/budget_breached"; STOP              [line 110]
        |
        | classifier/screen.requested
        v
[ ??? Stage 1 worker ]    <-- NOT YET WIRED in this codebase
        |
        | (intended: emit "classifier/verdict.recorded" after
        |  regex match + spotcheck/auto-approve)
        v
[ classifierVerdictWorker ]                                         [classifier-verdict-worker.ts:30]
   subscribes: "classifier/verdict.recorded"
   - on action='swarm_dispatch':
        loadSwarmCategories(...) -> category.swarm_dispatch
        inngest.send({ name: category.swarm_dispatch, ... })        [line 162-174]
        |
        | for category_key='unknown':
        |   swarm_dispatch = "debtor-email/label-resolve.requested"
        |   (seeded by migration 20260429h_swarm_categories_unknown_dispatch.sql)
        v
[ classifierLabelResolver ]                                         [classifier-label-resolver.ts:24]
   subscribes: "debtor-email/label-resolve.requested"
   - resolveDebtor (4-layer)
   - INSERT debtor.email_labels
   - close automation_run
   - !! EMITS NOTHING DOWNSTREAM !!                                 [confirmed by grep — zero inngest.send sites in this file]

[ debtorEmailTriage / Coordinator V2 ]                              [debtor-email-triage.ts:57]
   subscribes: "debtor/email.received"
   - !! ZERO LIVE PRODUCERS of this event !!
   - On dev-server / synthetic emit only:
       intent agent -> ranked output -> escalation gate
       single_shot:   inngest.send({ name: category.swarm_dispatch, ... })
                      where swarm_dispatch = "debtor-email/<intent>.requested"
       orchestrator:  inngest.send({ name: "debtor-email/orchestrator.requested" })

[ coordinatorOrchestrator ]                                         [coordinator-orchestrator.ts:34]
   subscribes: "debtor-email/orchestrator.requested"
   - planner -> N x inngest.send "debtor-email/${intent}.requested" [line 90-108]

[ classifierInvoiceCopyHandler ]                                    [classifier-invoice-copy-handler.ts:46]
   subscribes: "debtor-email/invoice-copy.requested"
   - on success/fail: notifyCoordinatorComplete(...) which fires
     "debtor-email/synthesis.requested" when expected_handlers met  [coordinator-complete.ts:56]

[ coordinatorSynthesis ]                                            [coordinator-synthesis.ts:40]
   subscribes: "debtor-email/synthesis.requested"
   - synthesis agent -> draft + email_labels write
```

**Critical observation:** the live ingest path stops at the label-resolver. The label-resolver writes `email_labels` and closes the run; **it does not fan out to the coordinator**. The coordinator's `debtor/email.received` subscription is functionally dead in production — the only emits in the repo come from the test file (`__tests__/debtor-email-triage.test.ts:104`) and the Phase 65 manual smoke (Inngest dev-server console fires). This is consistent with Phase 65's verification status: CORD-01..04 verified live "via the four synthetic Inngest dev-server events" per `65-regression-report.md:44-45` and the Phase 65 SUMMARY mentions this explicitly. There is **no parallel triage pipeline in production** — there is only the new coordinator, currently not yet wired into the live ingest stream.

## Trigger Wiring Recommendation (D-03 resolution)

**Verdict:** Case (a) and case (b) from CONTEXT.md are both partially wrong. The reality is **case (c): the coordinator is currently not wired into the live ingest path at all** — and Phase 66 is the right phase to wire it.

CONS-01 says: "Inbound debtor-email automatically goes through `regex → label-resolver → coordinator → handler`." Today the live flow stops at label-resolver. The coordinator runs only via dev-server synthetic events. So Phase 66 must (1) retarget the coordinator's trigger event to the canonical Stage 2 → 3 seam and (2) emit that event from the label-resolver after Stage 2 closes.

**Recommended trigger:** subscribe the renamed `debtorEmailCoordinator` to `classifier/screen.requested` — the existing Stage 0 → Stage 1 seam — **OR** keep the coordinator subscribed to a Stage-2-output event and have the label-resolver emit it. The trade-off:

| Option | Trigger event | Emitter | Pros | Cons |
|---|---|---|---|---|
| **A. Stage 1 fan-in to label-resolver only via registry; new event for Stage 2 → 3** | `debtor-email/coordinator.requested` (NEW — must be added to `events.ts` and seeded into `swarm_categories.swarm_dispatch` for the `unknown` bucket OR emitted directly from label-resolver) | `classifierLabelResolver` (after `email_labels` insert, ~line 152) | Clean Stage 2 → 3 seam; coordinator receives a `customer_account_id` already resolved; phases 67/68 can read this contract. | Adds a new event to the catalogue. Requires either a `swarm_categories` row UPDATE *or* a hard-coded `inngest.send` in label-resolver. |
| **B. Coordinator subscribes to existing event and Stage-2 output flows differently** | `classifier/screen.requested` | `stage0SafetyWorker` (existing) | Zero new events; coordinator runs in parallel with verdict-worker on the same stream. | Re-introduces the parallel-pipeline shape CONS-01 forbids. **Reject.** |
| **C. Coordinator subscribes to `debtor-email/label-resolve.requested`** | (existing) | `classifierVerdictWorker` (existing, registry-driven) | Zero migrations. | Two functions on the same event = parallel-path dup. **Reject.** |

**Recommendation: Option A.** Concrete shape:

1. Add to `web/lib/inngest/events.ts`:
   ```ts
   "debtor-email/coordinator.requested": {
     data: {
       email_id: string;
       automation_run_id?: string;
       run_id?: string;            // coordinator_runs PK; if absent the coordinator synthesises one
       budget_run_id?: string;
       agent_run_id?: string;
       entity?: string | null;
       subject: string;
       body_text: string;
       sender_email: string;
       sender_domain?: string;
       mailbox: string;
       received_at: string;
       graph_message_id?: string;
       customer_account_id?: string | null;  // Stage 2 hand-off enrichment
       customer_name?: string | null;
     };
   };
   ```
2. Change `debtor-email-coordinator.ts` (renamed from triage) line 57 from `{ event: "debtor/email.received" }` to `{ event: "debtor-email/coordinator.requested" }`. Field accessors at lines 59-67 stay valid because the new event preserves the same shape.
3. In `classifierLabelResolver` (`classifier-label-resolver.ts`), after the `close-automation-run` step (~line 184), emit:
   ```ts
   await step.run("emit-coordinator", async () =>
     inngest.send({
       name: "debtor-email/coordinator.requested",
       data: {
         email_id: emailRow.id,
         automation_run_id,
         entity: settingsRow?.entity ?? null,
         subject: emailRow.subject ?? "",
         body_text: emailRow.body_text ?? "",
         sender_email: emailRow.sender_email ?? "",
         mailbox: emailRow.mailbox,
         received_at: new Date().toISOString(),
         graph_message_id: message_id,
         customer_account_id: result.customer_account_id,
         customer_name: result.customer_name,
       },
     }),
   );
   ```
4. **Delete** the `"debtor/email.received"` event entry from `events.ts:313` (and the test that emits it gets updated to fire the new event name).
5. **No `swarm_categories` row change** — Option A keeps Stage 2 fan-out hard-coded in the label-resolver because the label-resolver always emits to the coordinator (there is no per-category branching at this seam — every email that survives Stage 2 goes to Stage 3).

**Caveats:**
- This wiring change makes Phase 66 a non-trivial behavioural change, not just a rename. Live smoke verification (D-08) must cover the full Stage 0 → Stage 1 → Stage 2 → Stage 3 → Stage 4 chain, not just the dev-server synthetic emit.
- Stage 1 (the `???` box in the diagram) is still missing as a real Inngest function — `classifier/screen.requested` is emitted by Stage 0 but no function in the live registration list subscribes to it. This is OUT OF SCOPE for Phase 66 (it predates this phase) but is a hidden CONS-01 blocker that the planner should call out: in the current production codebase **the live ingest stream does not reach the coordinator at all** because the chain breaks at Stage 0 → Stage 1. Phase 66 cannot satisfy CONS-01 acceptance until either (a) the missing Stage 1 worker is built, or (b) Phase 66's scope is expanded to wire Stage 1 too.

**Risk assessment of this caveat:** the planner should treat the Stage 1 gap as a **discovered blocker** that needs an explicit decision before plan-phase commits a wave structure. Possible resolutions: (i) confirm Phase 56.x already shipped a Stage 1 worker that's in some branch but not registered in `route.ts:39-69` (verify); (ii) add a Phase 66 scope expansion to wire Stage 1; (iii) descope Phase 66's CONS-01 live-smoke acceptance to `synthetic-emit verified` and defer the Stage-1 build to a sibling phase. Recommendation: planner asks the user before writing the plan.

## Stage 4 Handler Invocation Audit

**Goal:** confirm CONS-03 — every Stage 4 handler is invoked only via `inngest.send({ name: "debtor-email/<intent>.requested", ... })` from the coordinator (single-shot) or the orchestrator (fan-out).

**Method:** grep across `web/lib/inngest/functions/` for inter-function imports.

```bash
grep -rn "from \"@/lib/inngest/functions/" web/lib/inngest/functions/ \
  --include="*.ts" | grep -v __tests__
```

**Result:** zero matches. **No Inngest function imports another Inngest function.** CONS-03 is structurally satisfied today.

**Stage 4 handlers registered today:**
| Handler | File | Subscribes to | Emitters |
|---------|------|---------------|----------|
| `classifierInvoiceCopyHandler` | `web/lib/inngest/functions/classifier-invoice-copy-handler.ts:46` | `debtor-email/invoice-copy.requested` | (a) `debtor-email-triage.ts:217-228` single-shot via `category.swarm_dispatch`; (b) `coordinator-orchestrator.ts:90-108` template-literal fan-out |
| `coordinatorOrchestrator` | `coordinator-orchestrator.ts:34` | `debtor-email/orchestrator.requested` | `debtor-email-triage.ts:259-272` escalation path |
| `coordinatorSynthesis` | `coordinator-synthesis.ts:40` | `debtor-email/synthesis.requested` | `coordinator-complete.ts:56` (RPC-fan-in driven) |

**Future handlers** (event entries seeded in `events.ts:386-480`, no function yet): `copy_document_request`, `payment_dispute`, `address_change`, `peppol_request`, `credit_request`, `contract_inquiry`, `general_inquiry`, `other`. Phase 66 does not implement these.

**CONS-03 plan task:** add a static-audit task to the verification wave that re-runs `grep -rn "from \"@/lib/inngest/functions/" web/lib/inngest/functions/ --include="*.ts" | grep -v __tests__` and asserts zero output. Cheap, fast, regression-proof.

## Triage Directory Inventory

Per-export grep audit of `web/lib/automations/debtor-email/triage/` (results from 2026-05-04). Every import below is from live source — `__tests__` and `.next/` excluded except where called out.

| File | Lines | Live importers | Action |
|------|-------|----------------|--------|
| `agent-runs.ts` | 124 | `debtor-email-triage.ts:22-27` (the renamed file itself) | **MOVE → coordinator/agent-runs.ts** |
| `invoke-intent.ts` | 162 | `debtor-email-triage.ts:21` | **MOVE → coordinator/invoke-intent.ts** |
| `types.ts` | 198 | `debtor-email-triage.ts:28-31`; `classifier-invoice-copy-handler.ts:32-37`; `coordinator/orchestrator-types.ts:3`; `handlers/output-adapter.ts:7` | **MOVE → coordinator/types.ts** (and update 4 import statements) |
| `detect-emotion.ts` | 55 | `classifier-invoice-copy-handler.ts:31` | **MOVE → coordinator/detect-emotion.ts** (and update 1 import) |
| `circuit-breaker.ts` | 87 | **zero live importers** (verified by grep) | **DELETE** — confirm by grep `circuit-breaker\|circuitBreaker` returns 0 in `web/` outside this file. The 2 `"inngest:debtor-email-triage"` audit-string sites at lines 61, 82 die with the file. |
| `invoke-body.ts` | 176 | **zero live importers** post-Phase 65 (Phase 65 moved body-agent calls into the synthesis path; the legacy v1 single-label flow that called this is gone) | **DELETE** — verify with `grep -rn "invokeBodyAgent\|invoke-body" web/` (currently shows only the file itself). |

**Test files (`web/lib/automations/debtor-email/triage/__tests__/`):** the planner should follow the same per-file grep methodology — move tests for files that move, delete tests for files that delete. Planner scope.

**Import-rewrite scope outside the triage/ dir:**
1. `web/lib/inngest/functions/debtor-email-triage.ts` — 3 import lines (already moves with the file).
2. `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` — lines 31, 37.
3. `web/lib/automations/debtor-email/coordinator/orchestrator-types.ts` — line 3.
4. `web/lib/automations/debtor-email/handlers/output-adapter.ts` — line 7.
5. `web/lib/automations/debtor-email/handlers/__tests__/output-adapter.test.ts` — line 7.
6. `web/tests/labeling/classifier-invoice-copy-handler.test.ts` — line 98 (`vi.mock` path).
7. `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` — line 31 (`vi.mock` path).
8. `web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts` — lines 9, 75, 83.

Total: **8 files to edit** for the import-path rewrite (in addition to the source files moving).

**No `coordinator/` collisions:** the existing `coordinator/` files are `coordinator-complete.ts`, `escalation-gate.ts`, `orchestrator-types.ts`, `synthesis-types.ts` — none collide with the moved `agent-runs.ts`, `invoke-intent.ts`, `types.ts`, `detect-emotion.ts`.

## Inngest Rename Mechanics

Citing Inngest docs (verified via Inngest function lifecycle — function id is the immutable key for run history and concurrency partitioning):

1. **Function id change = new function.** When `id: "automations/debtor-email-triage"` becomes `id: "automations/debtor-email-coordinator"` and is deployed, Inngest treats them as two separate functions. The old id stops accepting new event invocations the moment the new code lands; the new id starts accepting them. There is **no migration of run history** — the dashboard will show two function tiles, with the old one going quiet.
2. **In-flight runs on the old id continue to completion.** Already-started runs keyed by the old id finish on the version of code they were started under (Inngest snapshots the function code at run-start time). Concurrency limits keyed on the old id continue to hold for those runs.
3. **Trigger event names are independent of function ids.** `inngest.send({ name: "X" })` finds *every* function subscribed to `X` at the moment the send executes. Renaming the function does not break send sites — only resubscribing to a different event would. CONTEXT.md D-04 forbids event renames; this phase changes only the function id (and, per Trigger Wiring Recommendation, the *subscribed* event for the coordinator alone).
4. **Deploy-window risk.** Between the moment the old function id is removed from `route.ts` exports and the moment the new function id is registered, there is a sub-second window where `debtor/email.received` (or its replacement event) has no subscribers. Inngest holds undelivered events in its retry queue and re-attempts delivery; the standard Vercel atomic-deploy guarantees this window stays sub-second.
5. **`route.ts` registration is the source of truth.** Functions not present in the `serve({ functions: [...] })` array are unknown to Inngest — they don't exist from Inngest's perspective. The rename touches `web/app/api/inngest/route.ts` lines 26 (import) and 57 (array entry).
6. **Concurrency keys (`event.data.entity`, `event.data.run_id`) are scoped per function id.** When the function id changes, the concurrency partitioning resets — but since there should be zero in-flight runs at the moment the rename ships (Phase 65 verified live with 4 synthetic events, not steady-state production traffic), this is a non-issue.

**Source notes:**
- Inngest function lifecycle [CITED: docs.inngest.com — function configuration § id]
- Concurrency keys per-function [CITED: docs.inngest.com — concurrency configuration]
- Atomic deploy on Vercel [VERIFIED: project uses Vercel hosting per CLAUDE.md]

## Doc Update Inventory

**Per-line grep result for "triage" in canonical docs:**

```
docs/agentic-pipeline/README.md:                    0 matches
docs/agentic-pipeline/stage-0-safety.md:            0 matches
docs/agentic-pipeline/stage-1-regex.md:             0 matches
docs/agentic-pipeline/stage-2-entity.md:            0 matches
docs/agentic-pipeline/stage-3-coordinator.md:       0 matches
docs/agentic-pipeline/stage-4-handler.md:           0 matches
docs/agentic-pipeline/context-shape-contract.md:    0 matches
docs/agentic-pipeline/override-model.md:            0 matches
docs/agentic-pipeline/graduated-automation.md:      0 matches
docs/agentic-pipeline/case-layer.md:                0 matches
docs/debtor-email-pipeline-architecture.md:         2 matches
```

**Both matches in `debtor-email-pipeline-architecture.md` refer to HUMAN triage (operator manual review), NOT the Inngest function:**

- Line 411: "`unknown → unresolved` → still creates Kanban card (operator must triage)" — operator action verb, leave as-is.
- Line 413: "drafts-needing-send + unresolved-needing-triage" — same; operator workflow, leave.

**D-10 mechanical doc rewrite is a no-op for the canonical agentic-pipeline docs** (zero matches) and a leave-as-is for `debtor-email-pipeline-architecture.md` (both matches are about human triage workflow, semantically different from the Inngest function name).

**However**, the planner should still verify these docs describe the Stage 3 coordinator using the *new* terminology and not the old function id. Specific tasks:
1. Read `docs/debtor-email-pipeline-architecture.md` end-to-end and update any reference to `debtor-email-triage` (the Inngest function) to `debtor-email-coordinator`. The grep returned 0 such matches today, but the file may reference the function by description rather than by literal id — a manual read confirms.
2. Read `docs/agentic-pipeline/stage-3-coordinator.md` end-to-end and confirm it describes the coordinator with the canonical name.
3. Cross-reference docs in `docs/agentic-pipeline/` that mention specific Inngest function ids — none today (verified by grep).

**Bonus doc-touch zone (not in scope but flagged):** `web/lib/inngest/events.ts:309-311` carries inline comments saying "Debtor email swarm — triage (phase 1) / Phase 65 coordinator (in-place rewrite per D-10)." If the `debtor/email.received` event is deleted (per D-03 Option A), the surrounding comment goes with it. Otherwise the comment should be updated.

## Verification Scaffolding

**Reusable from Phase 65:**

- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-regression-report.md` — template structure for live-smoke results. Copy-and-adapt for Phase 66's `66-regression-report.md`.
- `scripts/phase-65-regression-backfill.ts` — referenced in the Phase 65 report as ready-to-run; reads `web/.env.local` for credentials. Phase 66 likely doesn't need this script (it backfills v1 → v2 intent agreement, which is Phase 65's concern). Phase 66 needs **forward-direction smoke**, not backfill.
- The four synthetic-emit paths Phase 65 used: `auto_reply` (single-shot via `categorize_archive`), `ooo_temporary` (single-shot), `payment_admittance` (single-shot), `unknown→coordinator` (label-resolver path).

**Phase 66 live-smoke spec (input to plan):**

Send 4 inbound emails through the *full* live chain (post-rename, post-deploy):
1. **Auto-reply path:** subject contains an out-of-office pattern. Expect: regex matches; `verdict-worker` action='categorize_archive'; outlook label set; **no coordinator run row**.
2. **OOO temporary path:** same shape as auto-reply.
3. **Payment admittance path:** subject contains a "we will pay" pattern. Expect: same — categorize_archive, no coordinator run.
4. **Unknown → coordinator path:** subject is human prose with no regex match. Expect: regex misses; `swarm_categories.unknown.swarm_dispatch = "debtor-email/label-resolve.requested"` fires; `classifierLabelResolver` writes `email_labels`; **NEW (Option A): emits `debtor-email/coordinator.requested`**; renamed `debtorEmailCoordinator` runs intent agent + escalation gate; emits exactly one downstream event (`debtor-email/<intent>.requested` for single-shot OR `debtor-email/orchestrator.requested` for escalation).

**SQL verification queries** (run against Supabase post-smoke):

```sql
-- 1. Confirm exactly one coordinator_runs row per "unknown" smoke email.
select run_id, email_id, escalation_decision, expected_handlers, completed_handlers, completed_at
from public.coordinator_runs
where email_id in (<4 smoke email ids>)
order by created_at desc;
-- Expected: 1 row for the unknown-bucket email; 0 rows for the 3 categorize_archive emails.

-- 2. Confirm no orphan rows on the OLD function id.
select count(*) from public.automation_runs
where triggered_by = 'inngest:debtor-email-triage'
  and created_at > '<deploy timestamp>';
-- Expected: 0.

-- 3. Confirm new audit string is being written.
select count(*) from public.automation_runs
where triggered_by = 'inngest:debtor-email-coordinator'
  and created_at > '<deploy timestamp>';
-- Expected: > 0 if circuit-breaker.ts is being invoked at all (note: file may be DELETE'd per inventory above — in which case this query returns 0 and that is also correct).

-- 4. Confirm no parallel-pipeline duplicate execution.
select email_id, count(*) as run_count
from public.coordinator_runs
where created_at > '<deploy timestamp>'
group by email_id
having count(*) > 1;
-- Expected: 0 rows. Any row here = a parallel pipeline emitted twice.
```

**Static audit queries** (shell, run from repo root, post-rename):

```bash
# Zero hits for old name in app code.
grep -rn "debtor-email-triage\|debtorEmailTriage\|inngest:debtor-email-triage" web/ docs/ --include="*.ts" --include="*.tsx" --include="*.md" \
  | grep -v ".next/" | grep -v ".planning/"
# Expected: 0 lines.

# Zero cross-imports between Inngest function files.
grep -rn "from \"@/lib/inngest/functions/" web/lib/inngest/functions/ --include="*.ts" \
  | grep -v __tests__
# Expected: 0 lines (CONS-03 lock).

# Zero references to the deleted event (only if Option A picked).
grep -rn "debtor/email.received" web/ --include="*.ts" --include="*.tsx" \
  | grep -v ".next/"
# Expected: 0 lines.
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing — confirmed by `__tests__` dir patterns + `web/tests/` siblings) |
| Config file | `web/vitest.config.ts` (existing — existing Phase 65 tests use it) |
| Quick run command | `cd web && pnpm exec vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` |
| Full suite command | `cd web && pnpm exec vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONS-01 | Single canonical flow — coordinator runs exactly once per inbound `unknown` email | integration (live smoke) | manual — see live-smoke spec above | ❌ Wave 0 (66-regression-report.md template) |
| CONS-01 | No two Inngest functions subscribe to the same Stage seam event | static | `grep -rn "{ event:" web/lib/inngest/functions/*.ts \| sort -t: -k3 \| uniq-by-event-check` | ❌ Wave 0 (audit script) |
| CONS-02 | `debtor-email-triage` literal absent from codebase | static | `grep -rn "debtor-email-triage\|debtorEmailTriage" web/ docs/ --include="*.ts" --include="*.md" \| grep -v ".next/" \| grep -v ".planning/"` (expect 0 lines) | ❌ Wave 0 (verification task) |
| CONS-02 | Renamed function id registered in `route.ts` | static | grep `debtorEmailCoordinator` in `web/app/api/inngest/route.ts` (expect 1 import + 1 array entry) | ❌ Wave 0 |
| CONS-02 | Existing coordinator unit tests pass under new file/import paths | unit | `pnpm exec vitest run web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` | ✅ (renamed from `debtor-email-triage.test.ts`) |
| CONS-03 | No cross-handler imports between Inngest functions | static | `grep -rn "from \"@/lib/inngest/functions/" web/lib/inngest/functions/ --include="*.ts" \| grep -v __tests__` (expect 0 lines) | ❌ Wave 0 |
| CONS-03 | Every `<intent>.requested` emit comes only from coordinator or orchestrator | static | `grep -rn "debtor-email/.*\.requested" web/ --include="*.ts" \| grep "inngest.send\|name:"` and review every emit site against allowlist (`debtor-email-coordinator.ts`, `coordinator-orchestrator.ts`, `coordinator-complete.ts`) | ❌ Wave 0 (audit checklist) |

### Sampling Rate
- **Per task commit:** `cd web && pnpm exec vitest run` (full Vitest suite — small enough for the rename diff).
- **Per wave merge:** full suite + the static-audit grep block above.
- **Phase gate:** full suite green + 4-email live smoke against deployed Vercel preview before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `.planning/phases/66-pipeline-consolidation-retire-triage-path/66-regression-report.md` — adapt from Phase 65 template; capture the 4-email smoke results.
- [ ] Static-audit shell script (or inline checklist in plan) for the four grep commands above.
- [ ] No new framework install — Vitest already configured.

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | Stage 1 worker missing in production blocks CONS-01 live verification | HIGH (verified by `route.ts` grep — no function subscribes to `classifier/screen.requested`) | HIGH (acceptance fails) | Planner consults user before plan-phase: descope to synthetic-smoke verification, OR expand scope to include Stage 1 wiring. |
| R2 | Trigger retarget (D-03 Option A) is a behavioural change, not a rename — risks live-traffic regression on first deploy | MEDIUM | HIGH | Single-deploy + Vercel instant-rollback (D-09) covers it; verify all 4 smoke paths in Vercel preview before promoting to production. |
| R3 | In-flight events on the old function id during cutover | LOW (no live producers of `debtor/email.received` per grep audit) | LOW | None needed — the trigger event has zero live producers, so there is nothing in flight on the old id. |
| R4 | Inngest registration race (sub-second window of no subscriber on the trigger event) | LOW | LOW | Inngest retry queue handles this; Vercel atomic deploy keeps the window sub-second. |
| R5 | Imports missed by find-and-replace — TypeScript catches at build time, but a typo in one of the 8 import-path rewrite sites can fail tsc | LOW | LOW | `tsc --noEmit` in CI; planner should make this a per-task verification step. |
| R6 | `circuit-breaker.ts` audit-string change alters semantics of historical `automation_runs` queries | LOW (file slated for delete; only 2 write sites; no SELECT site found in repo) | LOW | Either delete the file (recommended per inventory) or accept the historical mismatch — D-06 closes this with "leave history alone." |
| R7 | Orphaned `swarm_categories` rows pointing at the old function id | NONE | — | Verified: `swarm_categories.swarm_dispatch` stores **event names**, not function ids. Function rename does not affect the registry. |
| R8 | Test files not renamed in lock-step with source files break the suite mid-PR | LOW | MEDIUM | Same-PR rule (D-09); CI gates the merge. |
| R9 | `events.ts` deletion of `"debtor/email.received"` breaks the Phase 65 test that emits it | LOW | LOW | Update the test to emit `"debtor-email/coordinator.requested"` instead — small, mechanical; same shape. |
| R10 | `coordinator/` and `triage/` `__tests__/` directories collide on file move | LOW | LOW | Verify no name collisions before move; if any, rename the moved test file. |

## Out-of-Scope Confirmations

Verified by reading CONTEXT.md `<deferred>` block and cross-checking REQUIREMENTS.md / ROADMAP.md:

| Out of scope | Where it lives | Confirmation |
|--------------|----------------|--------------|
| `swarm_intents` registry replacing per-handler Inngest fns | Phase 68 (SWRM-*) | ✓ — Phase 66 keeps existing per-handler wiring. |
| iController DOM tagging side effect on canonical flow | Phase 67 (TAG-*) | ✓ — TAG-01..03 are explicit Phase 67 scope. |
| Cross-swarm canonical handler input shape | Phase 69 (CANO-*) | ✓ — data contract stays as Phase 65 left it. |
| `pipeline_events` runtime telemetry / "exactly one path" runtime assertion | Phase 70 (TELE-*) | ✓ — Phase 66 verifies via codebase audit + live smoke, not runtime metric. |
| Bulk Review override UX / numeric confidence thresholds / learning loop | Phase 71 (LERN-*) | ✓ — REVW-* and LERN-* are explicitly later phases. |
| New intent handlers (dispute, address-change, peppol, credit, contract, general, other) | Future phases — events are seeded but functions not built | ✓ — Phase 66 only renames + audits; new handlers ride on this wiring later. |
| New Orq.ai agent or `update_agent` call | None | ✓ — verified zero changes to `orq_agents` rows are needed; rename is pure Inngest/code-shape. |
| Backfill historical `automation_runs.updated_by` = `inngest:debtor-email-triage` strings | None — intentionally not done | ✓ — git history is the audit trail; new writes get the new string. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Inngest treats a function-id change as a new function with separate run history | Inngest Rename Mechanics | LOW — well-documented behaviour; verify via Inngest dashboard after deploy |
| A2 | Vercel atomic deploy keeps the no-subscriber window sub-second | Inngest Rename Mechanics R4 | LOW — standard Vercel behaviour; if false, Inngest retry queue still covers it |
| A3 | Stage 1 (`classifier/screen.requested`) has no live subscriber in production | Trigger Wiring Recommendation caveat | HIGH if wrong — but verified by reading `route.ts:39-69` (no function in the registered list subscribes to this event); confirmed by grep returning only the producer side |
| A4 | The 4 smoke email shapes used by Phase 65 produce the listed regex categories | Verification Scaffolding | LOW — regex patterns are stable; spot-check live before running smoke |
| A5 | `coordinator/` and `triage/` `__tests__/` directories have no file-name collisions | Triage Directory Inventory | LOW — easy to verify before moving |

## Open Questions

1. **Is there a Stage 1 worker subscribed to `classifier/screen.requested` somewhere I missed?**
   - What we know: zero matches in `web/app/api/inngest/route.ts` registered functions; `stage-0-safety-worker.ts` is the only emitter; no subscriber found by grep.
   - What's unclear: whether a worker exists in a feature branch / WIP / outside the registered list.
   - Recommendation: planner asks user before committing to a wave structure. If no Stage 1 worker exists, Phase 66's CONS-01 live-acceptance is structurally unreachable without expanding scope.

2. **Should the renamed `coordinator/types.ts` keep importing from itself or be re-exported through a barrel?**
   - What we know: 4 external importers of `triage/types.ts` (see Triage Directory Inventory).
   - What's unclear: whether the planner prefers individual import-path rewrites (clearer diff) or a barrel `coordinator/index.ts` (smaller diff, fewer lines).
   - Recommendation: Claude's discretion (D-01 catch-all). Default = individual rewrites; the diff is small (8 sites).

## Sources

### Primary (HIGH confidence)
- Codebase grep audit (2026-05-04, working tree at `main` branch HEAD `62e9415`) — every claim about live producers/consumers, importers, and registrations.
- `web/lib/inngest/functions/debtor-email-triage.ts` (live source, lines 21-303).
- `web/lib/inngest/functions/classifier-label-resolver.ts` (live source, lines 1-272).
- `web/lib/inngest/functions/classifier-verdict-worker.ts` (live source, lines 1-215).
- `web/lib/inngest/functions/stage-0-safety-worker.ts` (live source, lines 1-181).
- `web/lib/inngest/functions/coordinator-orchestrator.ts` (live source, lines 1-135).
- `web/app/api/inngest/route.ts` (live source, lines 1-71).
- `web/lib/inngest/events.ts:218-489` (event catalogue).
- `supabase/migrations/20260429h_swarm_categories_unknown_dispatch.sql` (registry seed).
- CONTEXT.md `66-CONTEXT.md` (locked decisions).
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-CONTEXT.md` D-10 (Phase 65 promise of rename).
- `.planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-regression-report.md` (smoke template).
- Phase 65 commits `dd2583a` (replay-safe id), `dae6276` (this-binding), `62e9415` (replay-safety doc).

### Secondary (MEDIUM confidence)
- Inngest function-id semantics [CITED: docs.inngest.com — function configuration]
- Inngest event-subscription decoupling [VERIFIED: by reading multiple production Inngest functions in this repo that share event names by convention not by function id]

### Tertiary (LOW confidence)
- None — every load-bearing claim was verified by grep against the live source tree.

## Metadata

**Confidence breakdown:**
- Trigger topology / D-03 resolution: HIGH — exhaustive grep confirms zero live producers of `debtor/email.received`; unambiguous.
- Triage directory inventory: HIGH — per-file grep ran against working tree; 8 import sites enumerated explicitly.
- Stage 4 handler invocation audit: HIGH — single grep across function dir returns zero cross-imports.
- Inngest rename mechanics: MEDIUM — claims A1/A2 are based on documented Inngest behaviour; first time the rename mechanic is exercised in this repo.
- Stage 1 worker gap: HIGH that the gap exists; HIGH that it's outside Phase 66's locked scope; needs user adjudication.
- Doc updates: HIGH — grep returned 0 mechanical-rename matches in canonical agentic-pipeline docs.

**Research date:** 2026-05-04
**Valid until:** 2026-05-18 (rename code remains stable on short timescales; if any new Inngest function lands in `web/lib/inngest/functions/` the cross-import audit must re-run).

## RESEARCH COMPLETE
