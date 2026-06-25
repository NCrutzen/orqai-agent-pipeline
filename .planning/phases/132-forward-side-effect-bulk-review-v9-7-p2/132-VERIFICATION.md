---
phase: 132-forward-side-effect-bulk-review-v9-7-p2
verified: 2026-06-18T12:00:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open the info-routing Bulk Review queue (/automations/info-routing/review) and confirm routing detail pane renders for an email that has a persisted RoutingVerdict — verify all 6 fields show (bucket, brand, target_mailbox, confidence, dedup status+layer, unrouted) plus a forward-status badge."
    expected: "6 verdict fields visible; forward-status badge shows 'held' (since all buckets are held by default); algemeen and unrouted rows show their badge label with Forward-now absent or disabled."
    why_human: "RTL tests verify the component logic; the hydration depends on live data in coordinator_runs.decision_details.routing that requires an actual info-routing run to have been processed through the Stage-3 coordinator."
  - test: "Confirm the info-routing swarm in the live DB has stage_4_forward_buckets = {} (all held). Flip one bucket to true for a test email, trigger a forward via the forward worker or the Forward-now operator action, and verify: (a) the forwarded mail arrives at the department mailbox; (b) the source info@ mail gains the AI: routed → <bucket> Outlook category; (c) the info_routing_forwards row records status='sent'; (d) re-triggering the same email produces decision=already-sent (no second forward)."
    expected: "One forward sent; category stamped; idempotency proven on replay."
    why_human: "End-to-end forward side-effect requires a live Outlook tenant + Graph credentials. The live send-scope smoke (Task 1, commit 45cbc576) confirmed the Graph call sequence works; this is the full pipeline smoke."
  - test: "Exercise the operator re-route action from the Bulk Review pane: select a different bucket, click Re-route, confirm a new operator-sourced verdict is written to coordinator_runs.decision_details.routing and the pane updates."
    expected: "New verdict persisted; pane refreshes showing the new bucket; run_id unchanged."
    why_human: "Requires live coordinator_runs rows and a running Next.js session with authenticated user."
---

# Phase 132: Forward Side-Effect + Bulk Review Verification Report

**Phase Goal:** Ship the Stage-4 forward side-effect (route an info@ mail to the right department mailbox) for the info-routing swarm, plus the operator-facing info-routing Bulk Review surface — held-by-default (observe mode).
**Verified:** 2026-06-18T12:00:00Z
**Status:** human_needed — all automated checks pass; 3 items require live operator testing
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | forwardMessage(mailbox, messageId, toMailbox, originalSender) issues the 2-call draft flow (createForward → send; NO replyTo PATCH) and returns {success:false} on any non-ok Graph response | VERIFIED | `web/lib/outlook/client.ts` line 558: `export async function forwardMessage`. 2-call flow confirmed at lines 572/600: POST createForward then POST send. No PATCH anywhere in the function. JSDoc at line 549–551 documents why (Exchange strips replyTo). Non-ok paths at lines 586/594/606 all return `{ success: false, ... }` never throw. |
| 2 | buildRoutingCategory produces a stable, machine-parseable AI:-prefixed string per (status, bucket) | VERIFIED | `web/lib/outlook/routing-category.ts` lines 38–53: five status branches producing pinned strings. Re-exports `AI_CATEGORY_PREFIX` from intent-category.ts (single source, not redefined). `routing-category.test.ts` green (6 assertions per SUMMARY). |
| 3 | isForwardBucketReleased returns true ONLY when dry_run_config.stage_4_forward_buckets[bucket] === true (missing map/entry = held) | VERIFIED | `web/lib/pipeline-gating/dry-run-gate/index.ts` lines 120–134: `=== true` strict check; optional chain on all levels. JSDoc at lines 118–122 explicitly documents INVERSE POLARITY (TRUE=released, FALSE/MISSING=held). `forward-bucket-release.test.ts`: 5 tests covering missing config, missing map, per-bucket isolation, explicit false. |
| 4 | A routable verdict for a released bucket triggers exactly one forward; unrouted/algemeen/already_addressed verdicts never call Graph | VERIFIED | `stage-4-info-routing-forward.ts` lines 88–98: three hard skips read verdict fields (unrouted, target_mailbox===null, dedup.status==='already_addressed') before any Graph call. Worker test: 9 assertions covering all 3 skips (0 forwardMessage calls confirmed), held bucket, and routable path (1 call confirmed). |
| 5 | Replay / re-process with forward_state='sent' short-circuits before createForward (no double-forward, D-02) | VERIFIED | `stage-4-info-routing-forward.ts` lines 145–150: `step.run("check-forward-state")` reads `readForwardState` and returns `{decision:"already-sent"}` before the `do-forward` step. `do-forward` and `stamp-category` are SEPARATE step.run boundaries (lines 157/183 — replay-isolation for D-02). Worker test line 280 "D-02 replay" case: forwardMessageMock not called. |
| 6 | On successful forward, the source info@ mail is stamped with AI: routed → <bucket> | VERIFIED | Worker step `stamp-category` at line 183 calls `mergeRoutingCategory("forwarded", verdict.bucket)` and issues a PATCH. Worker test line 201: `expect(body.categories).toEqual(["Belangrijk", "AI: routed → storingen"])`. Category and forward live in SEPARATE step.run calls (D-02 replay isolation). |
| 7 | The coordinator emits pipeline/forward.requested after persisting the verdict; stage_3_routing stays held permanently | VERIFIED | `debtor-email-coordinator.ts` line 426: `step.run("emit-forward-request")` gated on `!verdict.unrouted && verdict.target_mailbox !== null && verdict.dedup.status === "routable"` AND `isForwardBucketReleased`. The `mark-routing-verdict-held` step (line 459) and `predicted_held` return (line 471) are present and unchanged. `coordinator-stage3-routing-gate.test.ts` confirmed green. |
| 8 | Zero swarm_type literal in the forward worker or coordinator emit (SWARM-02 static guard green) | VERIFIED | `grep -v "^\s*//"` on `stage-4-info-routing-forward.ts` returns 0 `swarm_type ===` matches. Same for `routing-actions.ts`. `coordinator-swarm-branch-guard.test.ts` SHARED_WORKERS includes both `stage-4-info-routing-forward.ts` and `routing-actions.ts` (lines 53–54). |
| 9 | Info-routing Bulk Review shows each email's 6-field verdict + forward status; algemeen/unrouted rows render with no active Forward-now control | VERIFIED | `BulkReviewRoutingSlot` defined in `types.ts` line 348 (bucket/brand/target_mailbox/confidence/dedup_status/dedup_layer/unrouted/forward_status/run_id). `routing-detail-pane.tsx` renders all 6 fields at lines 162–185. `data-testid="routing-forward-status"` at line 116. Forward-now absent when `target_mailbox===null \|\| unrouted \|\| forward_status==='forwarded'` (line 189–191). Pane test: "unrouted row" and "stays row" tests assert Forward-now is null or disabled. Stage4Decide renders RoutingDetailPane when `row.routing !== null` (line 98). |
| 10 | Operator can re-route / forward-now / don't-forward; forward-now honors dedup and refuses algemeen/unrouted; migration is live with all buckets held (D-04) | VERIFIED | `routing-actions.ts` exports `rerouteBucket` (line 93), `forwardNow` (line 156), `dontForward` (line 223). `forwardNow` hard-refuses `unrouted` (line 177), `target_mailbox===null` (line 184), `already_addressed` (line 191) before any send. Migration `20260618c_phase132_forward_buckets_and_state.sql` applied; 132-04-SUMMARY confirms SELECT showing `forward_buckets_seed: {}` (all held), RLS enabled, 0 anon policies. Full suite 2887 passed / 0 failed. |

**Score: 10/10 truths verified**

---

### Deferred Items

None — all roadmap success criteria for this phase are addressed within the phase.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/lib/outlook/client.ts` | forwardMessage 2-call Graph helper | VERIFIED | `export async function forwardMessage` at line 558; 2-call flow; never throws |
| `web/lib/outlook/routing-category.ts` | D-05 routing category vocabulary + strip-merge | VERIFIED | buildRoutingCategory + mergeRoutingCategory; AI_CATEGORY_PREFIX re-exported from intent-category.ts |
| `web/lib/pipeline-gating/dry-run-gate/index.ts` | isForwardBucketReleased + stage_4_forward_buckets field | VERIFIED | Interface field at line 73; helper at line 130; polarity pinned in JSDoc |
| `web/lib/inngest/functions/stage-4-info-routing-forward.ts` | Swarm-agnostic Stage-4 forward worker | VERIFIED | retries:0; pipeline/forward.requested; 3 hard skips; D-02 separate step.run boundaries |
| `web/lib/automations/info-routing/forward-state.ts` | info_routing_forwards idempotency store | VERIFIED | recordForwardState (upsert-on-conflict) + readForwardState (returns null, never throws) |
| `supabase/migrations/20260618c_phase132_forward_buckets_and_state.sql` | stage_4_forward_buckets seed + info_routing_forwards RLS table | VERIFIED | jsonb \|\| merge seed (empty = all held); RLS enabled; service_role FOR ALL + authenticated FOR SELECT; NO anon; applied to live DB |
| `web/app/(dashboard)/automations/[swarm]/_shell/components/routing-detail-pane.tsx` | 6-field verdict + forward-status badge + D-08 controls | VERIFIED | target_mailbox rendered; data-testid="routing-forward-status"; DESTINATION_KEYS_BY_SWARM (codegen, not hardcoded); Forward-now gated |
| `web/app/(dashboard)/automations/[swarm]/_shell/actions/routing-actions.ts` | re-route / forward-now / don't-forward server actions | VERIFIED | 3 exports; forwardNow refuses unrouted/algemeen/dedup; inline DynamicSend cast (not aliased); per-file no-destructure guard |
| `scripts/smoke/info-routing-forward-scope.ts` | BLOCKING live send-scope smoke | VERIFIED | Exists; 13 grep matches on createForward/--confirm-test-mailbox; operator confirmed 201/202 |
| `web/lib/inngest/functions/__tests__/stage-4-info-routing-forward.test.ts` | Forward worker test suite (filled in from Wave-0 scaffold) | VERIFIED | 9 substantive test cases covering all <behavior> branches; not just todo stubs |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `routing-category.ts` | `intent-category.ts` | `AI_CATEGORY_PREFIX` re-export | VERIFIED | `export { AI_CATEGORY_PREFIX } from "./intent-category"` at line 17 |
| `dry-run-gate/index.ts` | `swarms.dry_run_config.stage_4_forward_buckets` | jsonb map read | VERIFIED | `swarm?.dry_run_config?.stage_4_forward_buckets?.[bucket] === true` |
| `debtor-email-coordinator.ts` | `pipeline/forward.requested` | step.run after persist-routing-verdict, gated | VERIFIED | `step.run("emit-forward-request")` at line 426; gated on verdict fields + isForwardBucketReleased |
| `stage-4-info-routing-forward.ts` | `forwardMessage` | step.run("do-forward") | VERIFIED | `await forwardMessage({...})` inside `step.run("do-forward")` at line 157 |
| `web/app/api/inngest/route.ts` | `stage4InfoRoutingForwardWorker` | serve functions array | VERIFIED | Import at line 55; serve array at line 122 — 2 references confirmed |
| `hydrate.ts` | `decision_details.routing` | stage-3 event projection | VERIFIED | `stage3Event.decision_details.routing` at line 737; data-gated with `isRecord` guard |
| `stage-4-decide.tsx` | `routing-detail-pane.tsx` | `row.routing !== null` data-gate | VERIFIED | `if (row.routing !== null) return <RoutingDetailPane ...>` at line 98 |
| `routing-actions.ts` | `pipeline/forward.requested` | inline DynamicSend cast | VERIFIED | `await (inngest.send as unknown as DynamicSend)({name:"pipeline/forward.requested",...})` at line 203 |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `routing-detail-pane.tsx` | `row.routing` (BulkReviewRoutingSlot) | `hydrate.ts` reads `coordinator_runs.decision_details.routing` + `info_routing_forwards.status` | Yes — DB queries at lines 338/737 in hydrate.ts | FLOWING |
| `stage-4-info-routing-forward.ts` | `verdict` | `coordinator_runs` select by `run_id` at line 73 | Yes — live DB query inside `step.run("load-verdict-and-swarm")` | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| forwardMessage export exists | `grep -c "export async function forwardMessage" client.ts` | 1 | PASS |
| buildRoutingCategory export | `grep -c "export function buildRoutingCategory" routing-category.ts` | 1 | PASS |
| isForwardBucketReleased export | `grep -c "export function isForwardBucketReleased" dry-run-gate/index.ts` | 1 | PASS |
| stage_4_forward_buckets in DryRunConfig | `grep -c "stage_4_forward_buckets" dry-run-gate/index.ts` | 4 (interface + helper read + JSDoc) | PASS |
| Worker on pipeline/forward.requested | `grep -c "pipeline/forward.requested" stage-4-info-routing-forward.ts` | 1 | PASS |
| Worker registered in serve array | `grep -c "stage4InfoRoutingForwardWorker" route.ts` | 2 (import + serve) | PASS |
| Coordinator emits pipeline/forward.requested | `grep -c "pipeline/forward.requested" debtor-email-coordinator.ts` | 3 (comments + emit) | PASS |
| Migration: ENABLE ROW LEVEL SECURITY | `grep -c "ENABLE ROW LEVEL SECURITY" migration` | 1 | PASS |
| Migration: no anon policy | `grep -c "TO anon" migration` | 0 | PASS |
| Migration: jsonb merge (not replace) | `grep "dry_run_config \|\|"` | match found | PASS |
| No swarm_type literal in forward worker | comment-stripped grep for `swarm_type ===` | 0 | PASS |
| No swarm_type literal in routing-actions.ts | comment-stripped grep for `swarm_type ===` | 0 | PASS |
| inngest.send not aliased in routing-actions | `grep -c "const send = inngest.send"` | 0 | PASS |
| inngest.send not aliased in coordinator | `grep -c "const send = inngest"` | 0 | PASS |
| Separate step.run for forward and stamp | lines 157 and 183 are different step.run calls | confirmed | PASS |
| BulkReviewRoutingSlot defined | `grep -c "BulkReviewRoutingSlot" types.ts` | 2 (interface + optional field) | PASS |
| RoutingDetailPane wired in Stage4Decide | `grep -c "RoutingDetailPane" stage-4-decide.tsx` | 2 (import + render) | PASS |
| DESTINATION_KEYS_BY_SWARM used (no hardcoded buckets) | import present; no bucket string literals in options | PASS | PASS |
| All 10 task commits exist | `git log` on all 10 hashes | all found | PASS |

---

### Probe Execution

Step 7c: SKIPPED — no conventional probe-*.sh scripts declared in PLAN files; smoke in `scripts/smoke/info-routing-forward-scope.ts` is a manual operator checkpoint (arg-guarded against accidental execution), not a probe script. Operator confirmation of the smoke is recorded in 132-01-SUMMARY.md.

---

### Requirements Coverage

All FWD-* IDs are phase-local (not in global REQUIREMENTS.md — per instruction, do not fail for their absence there).

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| FWD-01 | 132-01, 132-02 | forwardMessage calls Graph draft flow exactly once for a released routable verdict | SATISFIED | Worker + test: routable+released → forwardMessage called 1×; non-routable → 0× |
| FWD-02 | 132-01, 132-02 | forwardMessage 2-call draft flow, never throws | SATISFIED | client.ts lines 572/600; all error paths return {success:false} |
| FWD-03 | 132-01, 132-04 | Per-bucket graduated release gate (fail-closed) | SATISFIED | isForwardBucketReleased; migration seeds empty map; DB confirmed {} |
| FWD-04 | 132-02 | unrouted/algemeen verdicts never call Graph | SATISFIED | Three hard skips in worker; test cases 213–236 |
| FWD-05 | 132-02 | already_addressed dedup skip | SATISFIED | third hard skip at worker lines 95–98; test line 239 |
| FWD-06 | 132-01, 132-02 | AI: routed → <bucket> stamp-back on successful forward | SATISFIED | stamp-category step; routing-category.ts vocabulary; worker test line 201 |
| FWD-07 | 132-02 | Zero swarm_type literal in forward worker | SATISFIED | comment-stripped grep = 0; SWARM-02 guard covers both new files |
| FWD-08 | 132-03, 132-04 | Bulk Review surface shows 6-field verdict + forward status | SATISFIED | BulkReviewRoutingSlot; hydrate projection; RoutingDetailPane; Stage4Decide wiring |
| FWD-09 | 132-03 | Operator re-route / forward-now / don't-forward | SATISFIED | routing-actions.ts; 3 server actions; forwardNow hard-refuses before send |
| FWD-10 | 132-01, 132-02 | env_id='BX' brand filter carried through verdict | SATISFIED | Worker reads `verdict.brand` (line 210); no re-implementation; carried from Phase-131 resolver |

---

### Anti-Patterns Found

No TBD, FIXME, or XXX markers found in any phase-modified files. No TODO/HACK/PLACEHOLDER or stub indicators found in source files (not test scaffolds). No empty implementations in the forward path.

Informational notes (not blockers):

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/lib/outlook/client.ts` | — | `OUTLOOK_CONNECTION_ID = "56014785"` hardcoded literal | INFO | Intentional on this branch — env-var fix on main (PR #112). The live pipeline runs off main. Not a defect for this branch. |
| `web/lib/bulk-review/hydrate.ts` | 178 | Pre-existing `swarm_type === "debtor-email"` (isDebtor) | INFO | Pre-existing line, not introduced by this phase. Phase-132 hydration is data-gated; no new swarm literal added. |

---

### Human Verification Required

#### 1. Bulk Review pane renders with live data

**Test:** Open `/automations/info-routing/review` after at least one info-routing email has been fully processed through the Stage-3 coordinator (so a RoutingVerdict exists in `coordinator_runs.decision_details.routing`). Inspect the Stage-4 column.
**Expected:** Routing detail pane renders with all 6 verdict fields (bucket, brand, target_mailbox, confidence, dedup status, unrouted flag) plus a forward-status badge showing "held" (all buckets held by default). Algemeen and unrouted rows show their badge label; Forward-now button is absent or disabled for those rows.
**Why human:** RTL tests verify component logic; live rendering requires real coordinator_runs data from a completed pipeline run.

#### 2. End-to-end forward smoke (release one bucket, trigger forward, verify delivery + idempotency)

**Test:** On the live DB, set `dry_run_config.stage_4_forward_buckets.storingen = true` for the info-routing swarm. Send a test email to info@ that routes to the storingen bucket. Observe: (a) the Stage-4 forward worker fires; (b) the forwarded mail arrives at storingen@smeba.nl (or the designated test mailbox); (c) the original sender appears in the forward comment ("Doorgestuurd via info-routing — oorspronkelijke afzender: ..."); (d) the source mail gains the Outlook category `AI: routed → storingen`; (e) `info_routing_forwards` row shows `status='sent'`; (f) re-processing the same email produces `decision='already-sent'` (no second forward). Reset the bucket to false after the test.
**Expected:** One forward delivered; category stamped; idempotency proven.
**Why human:** Requires live Outlook tenant + Graph send scope + a controllable test email. The send-scope smoke (commit 45cbc576) confirmed Graph call viability; this is the full pipeline integration test.

#### 3. Operator re-route action (live Bulk Review session)

**Test:** From the Bulk Review pane on a held info-routing row, select a different bucket from the re-route dropdown, add an audit note, and click Re-route. Then verify `coordinator_runs.decision_details.routing` for that email contains a new verdict with `operator_sourced:true` and the new bucket.
**Expected:** New verdict written; pane shows updated bucket; run_id unchanged.
**Why human:** Requires an authenticated browser session + a live coordinator_runs row. The `rerouteBucket` server action test (mocked) covers the logic; this confirms the wiring to the real DB.

---

### Gaps Summary

No gaps. All 10 observable truths are VERIFIED by codebase evidence. The 3 human verification items are integration/live-data checks that require a running system, not indicators of incomplete implementation.

**Key design decisions confirmed in code:**
- D-01 sender-in-comment fallback: `forwardMessage` is a 2-call flow with NO replyTo PATCH — Exchange strips it (confirmed by smoke). The original sender is in the forward comment.
- D-02 replay isolation: `do-forward` and `stamp-category` are separate step.run boundaries; `readForwardState` short-circuits before Graph call on replay.
- D-03/D-04 per-bucket fail-closed gate: `isForwardBucketReleased` with inverse polarity (TRUE=released); migration seeds `{}` (all held); DB confirmed empty map.
- SWARM-02: zero swarm_type literals in forward worker and routing-actions.ts; both covered by the static grep guard.
- Plan 04 migration naming: plan said `20260617e`, actual file is `20260618c` (collision rename documented in 132-02-SUMMARY). The content is identical to spec; the live DB confirms the correct migration was applied.

---

_Verified: 2026-06-18T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
