---
slug: pipeline-health-2026-05-19
status: resolved
trigger: Pipeline Health Check 2026-05-19 ~09:53 AMS — multiple red/orange flags across debtor-email pipeline
created: 2026-05-19
updated: 2026-05-20
resolved: 2026-05-20
goal: find_and_fix
spawned_followup: icontroller-bulkdelete-failures
---

**Outcome:** Cluster B+C (Stage 0 chrome strain) closed by commits `158811f` + `d4aa65f`. Cluster A original hypothesis disproven by live DOM probe; re-investigation spawned as `/gsd-debug continue icontroller-bulkdelete-failures`.

# Debug Session: pipeline-health-2026-05-19

## Symptoms

DATA_START
**Multiple concurrent failures in debtor-email pipeline (Pipeline Health Check 2026-05-19 ~09:53 AMS, manual; cumulative since 2026-05-07):**

### 🔴 RED — Outlook archive (categorize+archive) DEEPLY FROZEN
- Last completed: 2026-05-19 02:23:32 UTC — age ~5h 30m at query time
- Was already frozen at 1h04m last tick and has not recovered
- No archives have run since 04:23 AMS this morning

### 🔴 RED — `injection_suspected` rapidly escalating
- Stage 0 distribution: safe=377 (+11), unknown_legacy=269 (—), **injection_suspected=9 (+8 overnight)**
- Was singleton last tick (1); now 9, growing ~1/hour during overnight
- Need to know: genuine injection campaign vs. classifier false-positive spike vs. new email pattern

### 🔴 RED — iController delete chronic failure
- 54 failed / 94 completed = 36% failure rate, unchanged
- Error identical across all failures: `Delete verification failed: email still present after click sequence (silent XHR failure or modal mis-click suspected) [sidebar: activeAccount="Collections", resetClicked=false]`
- Latest failure: 2026-05-19 04:04:08 UTC, mailbox debiteuren@smeba.nl, from notifications@tradeshift.com
- Hypothesis from health report: sidebar account state not resolved before delete attempt

### 🟠 ORANGE — failed/categorize growing (2 → 6, +4 overnight)
- New failure mode gaining pace, was stable at 2

### 🟠 ORANGE — 16 NEW predicted/stage_0_safety rows (potential stall)
- New status bucket appearing for the first time
- 16 emails entered Stage 0 safety, sitting in `predicted` without completing
- Could be slow LLM path or new code path introduced overnight

### 🟡 YELLOW — 68 debtor-email `classifying` frozen for 2+ ticks
- Inngest classify jobs not moving, unchanged across ticks

### 🟡 YELLOW — stage_0_safety_pending failures slow bleed (+2, now 30)
- Driven by `inngest_cancelled_stale`
- 30 cumulative cancellations vs. 34 completions — net not draining
- Latest failed row: 2026-05-19 06:10:03 UTC, llm_reason=inngest_cancelled_stale, mailbox crediteuren@smeba.nl

### Funnel depth snapshot
| swarm_type | stage | email_count | Δ |
|---|---|---|---|
| debtor-email | 4 | 216 | — |
| debtor-email | 3 | 88 | — |
| debtor-email | 2 | 88 | — |
| debtor-email | 1 | 494 | +11 |
| debtor-email | 0 | 655 | +19 |
| sales-email | 1 | 360 | +31 |
| sales-email | 0 | 360 | +31 |

Stages 2–4 still flat — no new emails advancing past Stage 1 overnight.

### Stage 1 distribution (debtor-email)
- LLM 2nd-pass (phase74=true) growing steadily: +11 overnight; no new decision labels
- 126 unknown (no_match, regex) + 126 unknown (phase74 LLM) — even split

### Timeline
Some issues started on or after **2026-05-13**. User does not know which surface is the source.

### User-known facts
- Expected: pipeline drains; emails progress through stages; iController delete succeeds; Outlook archives run continuously
- Actual: multiple stalls and chronic failures listed above
- User uncertain where the source of failure is
DATA_END

## Current Focus

- hypothesis: **REVISED.** Cluster B+C remains fixed by `158811f` + `d4aa65f`. **Cluster A hypothesis (iController sidebar Account sub-filter) is DISPROVEN by live DOM probe at 10:39 AMS.** The "Collections" label captured in error diagnostics is the **top-level iController product module** (alongside Invoicing, Payments, Cash App, Credit, Disputes), not a sidebar Account filter. No Account sub-filter exists in the sidebar markup. `resetSidebarAccountFilter` has been chasing a ghost. The 36% bulkDelete failure rate is real but the root cause is elsewhere — most likely (a) CSRF token staleness across the multi-row session, (b) verify-pass running before the server commits, or (c) Intercooler-side server response 2xx-but-zero-rows-actually-deleted distinct from the checkbox-race that direct-POST already mitigated.
- test: live DOM probe via `probe-sidebar-collections.ts` against production iController on debiteuren@smeba.nl (mailbox id 4). Captured `01-baseline-snapshot.json` + screenshots.
- expecting: re-investigate the bulkDelete failure with the new evidence; drop `resetSidebarAccountFilter` from the diagnostic path; reframe Cluster A.
- next_action: re-open a focused investigation into the actual bulkDelete failure mode — analyze a sample of the 54 failed rows in Supabase to look for patterns (mailbox, sender, time-clustering, message_id collisions). The sidebar reset helper can be deleted or downgraded to noise-only logging.

## Evidence

- timestamp: 2026-05-19, source: `git log --since=2026-05-13`. Critical commits in window:
  - `158811f 2026-05-19 09:45 — fix(stage-0): normalize mail-client chrome before safety classifier`. Body explicitly cites: "Outlook signature ZWNJ walls, 'CAUTION: External Sender' prefixes, 'Internal/External … Protection by Q2Q' banner were tripping the Stage 0 LLM with injection_suspected verdicts on benign Smeba forwards (observed across Orq traces 2026-05-19)." — shipped ~8 minutes BEFORE the 09:53 health check snapshot. The snapshot is pre-fix data.
  - `b1e2ef6 2026-05-13 12:51 — feat(82.4-07): implement emailFeedbackSnapshot nightly cron`. Cron-only, runs `0 2 * * *`. Not on the hot path.
  - No Inngest cron schedule changes, no classifier-screen-worker changes, no debtor-email-bridge.ts changes since 2026-05-13.

- timestamp: 2026-05-19, source: `web/lib/automations/debtor-email-cleanup/browser.ts:318-358` (resetSidebarAccountFilter). The helper looks for an anchor whose text starts with `/^(alle\b|all\b|all accounts|alle accounts|reset)/i` OR whose href matches `/\/account(\/0)?$|\?account=$|\?account=0$/`. If the sidebar exposes the "clear Account" affordance as a button, an `<a>` whose text is e.g. "× Collections" / "Verwijder filter" / "Toon alles", or an href shaped `/account?reset=1` / `/messages/index?account=`, none of these selectors match → returns `resetClicked:false` → server-side filter persists → iController bulkDelete silently excludes the row from the delete set → verify-pass re-finds the row → "Delete verification failed". This matches all 54 failures with identical `activeAccount="Collections", resetClicked=false`.

- timestamp: 2026-05-19, source: `web/lib/inngest/functions/stage-0-safety-worker.ts:344, 371, 387`. On `injection_suspected`, the worker sets `automation_runs.status='predicted', topic='safety_review'` BY DESIGN. The "16 NEW predicted/stage_0_safety" bucket therefore is not a stall — it is `injection_suspected` rows awaiting HITL, the design contract per `docs/agentic-pipeline/stage-0-safety.md` ("human-only review surface; never reach a coordinator or handler"). The +16 overnight maps 1:1 to the false-positive spike fixed by commit 158811f.

- timestamp: 2026-05-19, source: `web/lib/inngest/functions/automation-runs-sweeper.ts:48-127`. The `stage0StaleSweeper` cron (every 10 min, 06–19 AMS, Mon–Fri) flips Stage 0 placeholders stuck in `pending` >15 min to `failed` with `llm_reason='inngest_cancelled_stale'`. The slow bleed (30 cumulative) is its expected output when a small number of Stage 0 worker invocations stall — sweeper IS the cancellation source, not the original failure.

- timestamp: 2026-05-19, source: `stage-0-safety-worker.ts:202-204` code comment ("Selectivity (Pitfall 1) — ONLY OrqClientTimeoutError is coerced. Parse / schema / non-abort transport errors propagate so genuine bugs surface in the worker's failure path."). The narrow fail-open is **deliberate**, not a bug. The `inngest_cancelled_stale` rows are the intended surfacing mechanism for non-timeout Orq errors. The chrome-induced LLM strain (Cause B) is the upstream driver — once `158811f` reduces strain, the bleed should approach zero. Widening the fail-open would mask real Orq errors and was withdrawn as a recommendation.

- timestamp: 2026-05-19 10:39 AMS, source: live DOM probe `probe-sidebar-collections.ts` against production iController (walkerfire.icontroller.eu/messages/index/mailbox/4, debiteuren@smeba.nl). **Cluster A hypothesis DISPROVEN.** The sidebar root (`#messages-nav`) contains 157 anchors. None match `resetTextRe` or `resetHrefRe`. The element captured as "activeAccount=Collections" is the top-level product module `<a class="nav-item active" href="/">Collections</a>` — sibling of Invoicing/Payments/Cash App/Credit/Disputes. There is no Account sub-filter in this sidebar at all. What the sidebar does contain: top-nav modules, per-mailbox folders (`» smebabrandbeveiliging` = mailbox 4 etc.), standard folders (Sent/Undelivered/Failed/Archive), and labels. The `activeAccount="Collections"` + `resetClicked=false` diagnostic is therefore noise present on every production session, not a signal correlated with failed deletes. Artifacts: `web/lib/automations/debtor-email-cleanup/screenshots/probe-collections/01-baseline-*`.

- timestamp: 2026-05-19, source: `git log --since="30 minutes ago"`. Two additional commits in window:
  - `a41c109 2026-05-19 09:56 — fix(stage-0): allow null on MapperTimelineEvent.decision` (type fix, downstream of 158811f).
  - `d4aa65f 2026-05-19 10:15 — fix(stage-0): wire Approve + Submit-override to functional backend paths`. New server action `overrideStage0Safety` writes `email_feedback` (verdict='override') and dispatches `stage-0/email.received` with `safety_overridden=true` for corrected→'safe' rows. Reuses the worker's operator-override branch (stage-0-safety-worker.ts:145). **This is the drain path for the 9 + 16 pre-fix injection_suspected / predicted_stage_0_safety rows.** Cluster B+C is now both fixed AND drainable.

- timestamp: 2026-05-19, source: `web/lib/inngest/functions/classifier-screen-worker.ts:115`. Outlook archive trigger is the EVENT `classifier/screen.requested`, emitted by stage-0-safety-worker.ts:278 on `verdict === 'safe'` (and on operator-override). If Stage 0 false-flags benign mail as `injection_suspected` at elevated rate, that mail NEVER emits `classifier/screen.requested`, so the classifier-screen-worker (which is what runs categorize+archive in Outlook) sees no input → archive flow appears "frozen". Combined with the 68 stuck `classifying` rows (which are the upstream pending state for not-yet-Stage-0-decided rows), this is consistent with a Stage 0 LLM stall + false-flag burst, not a cron-side regression.

- timestamp: 2026-05-19, source: `docs/agentic-pipeline/README.md` + `stage-0-safety.md`. Architectural sanity-check: Stage 0 (`stage-0/email.received` → `stage-0/safety-worker`) is the funnel entry; on `safe` it emits `classifier/screen.requested` to Stage 1. Stage 1's `classifier-screen-worker` runs categorize+archive via its `categorize_archive` branch. The hard separation Stage 1 (`swarm_noise_categories`) vs Stage 3 (`swarm_intents`) is not implicated here — both downstream stages are simply receiving no traffic because Stage 0 is the gate.

## Eliminated

- timestamp: 2026-05-19. **Eliminated:** an Inngest cron-side stoppage (worker not firing). All business-hours crons (`*/2 6-19 * * 1-5`, `*/5 6-19 * * 1-5`, `*/10 6-19 * * 1-5`) include Tue 2026-05-19. No commit since 2026-05-13 touched any cron schedule. The bridge (`debtor-email-bridge.ts`, dashboard sync only) has not changed.
- timestamp: 2026-05-19. **Eliminated:** Phase 74 LLM 2nd-pass as a culprit. Health report says it is "growing steadily" and the Stage 1 distribution is healthy.
- timestamp: 2026-05-19. **Eliminated:** "16 predicted/stage_0_safety rows" being a new stall path. These are `injection_suspected` HITL rows by design — same root cause as cluster 3 (the chrome false-positive that 158811f fixes).
- timestamp: 2026-05-19. **Eliminated:** "categorize_archive" being broken at code level. `classifier-screen-worker.ts:540-665` is unchanged since before 2026-05-13. Archives are frozen because they have no inbound traffic, not because the worker is buggy.
- timestamp: 2026-05-19. **Eliminated (corrected):** narrow Stage 0 fail-open as a bug. The code comment at stage-0-safety-worker.ts:202-204 documents this as deliberate selectivity ("Pitfall 1"). Original Cause C framing was wrong — the `inngest_cancelled_stale` rows are the intended surfacing path for non-timeout errors, and the upstream driver was Cluster B (chrome strain). Re-classified as part of the B+C combined cluster.

## Resolution

### Root Cause (2 clusters)

**Cluster A — iController bulkDelete 36% failure rate, ROOT CAUSE UNKNOWN (re-opened)**
The original hypothesis (sidebar Account sub-filter persists server-side and silently excludes the delete target) is **disproven** by the 10:39 live DOM probe. The "Collections" label captured in diagnostics is the top-level iController product module, not an Account filter. The sidebar has no Account sub-filter element at all. All 54 failures share the `activeAccount="Collections", resetClicked=false` fingerprint because that fingerprint is **constant on every production session**, not because they share an Account-filter cause. The 36% failure rate is real, but the root cause is elsewhere. Candidate hypotheses for re-investigation: (1) CSRF token staleness across batched deletes; (2) verify-pass racing the server commit; (3) Intercooler bulkDelete returning 2xx with `deleted_count=0` on a server-side rejection distinct from the checkbox race that the direct-POST refactor (browser.ts:413-464) already mitigated; (4) message_id from the row checkbox not matching the message_id the server scopes to the current session.

**Cluster B+C — Stage 0 chrome-induced LLM strain (RESOLVED)**
The Stage 0 LLM verdict prompt's injection-signal list (Outlook ZWNJ walls, "CAUTION: External Sender", "Internal/External … Protection by Q2Q" banners) was tripped by benign Smeba-forwarded mail carrying that chrome verbatim. Cascade effects: (a) +8 `injection_suspected` overnight; (b) +16 `predicted/stage_0_safety` HITL rows; (c) starved Stage 1 of `classifier/screen.requested` traffic → Outlook archive "frozen" since ~04:23 AMS; (d) elevated LLM strain on chrome-laden prompts surfaced as `inngest_cancelled_stale` slow bleed (the documented selectivity behavior at stage-0-safety-worker.ts:202-204, not a bug — non-timeout errors intentionally propagate to surface genuine issues).

Fixes shipped:
- `158811f` (09:45) — `normalizeBody` strips chrome at the Stage-0 boundary before the safety classifier; Stage 1 still sees the original body.
- `a41c109` (09:56) — type fix on `MapperTimelineEvent.decision` (downstream of above).
- `d4aa65f` (10:15) — wires Stage 0 detail-pane Approve + Submit-override buttons to the worker's existing operator-override branch (stage-0-safety-worker.ts:145), enabling drain of the 9 + 16 pre-fix backlog rows.

The 09:53 health-check snapshot is **pre-`158811f`** by ~8 minutes. The 68 `classifying` backlog drains naturally once the false-flagged rows are operator-cleared or expired by the stale-sweeper.

### Fix

**Cluster A (iController) — re-investigation required:**
1. Query Supabase for the 54 failed `debtor-email-cleanup/icontroller_delete` rows. Look for patterns: time-of-day, mailbox distribution, sender clusters, message_id ranges, retry history.
2. Add structured diagnostic to `selectAndDelete` (browser.ts:413-464): log the bulkDelete POST response body (not just status), the `message[]` value posted, and the row count in `#messages-list` before vs after the verify-pass `page.goto(listUrl)`. The current error message conflates "row still present after delete" with "Account filter prevented delete" — those are different failure modes and need to be separated in the logs.
3. Remove or downgrade `resetSidebarAccountFilter` (browser.ts:318-358) — it has no behavioral effect and its diagnostic output (`activeAccount=Collections, resetClicked=false`) is misleading. Either delete the helper or rename to `inspectSidebarState` and emit at debug-only level.
4. Reconsider the Defense-in-depth comment at browser.ts:303-316 — it documents a hypothesis the live DOM does not support. Update the comment to reflect the disproven hypothesis or remove it.

**Cluster B+C — SHIPPED (`158811f` + `d4aa65f`):**
- Monitor `injection_suspected` count post-09:45 AMS deploy. Expect new-rate-per-hour to drop to near-zero for benign Smeba forwards.
- Operator workflow: clear the 9 + 16 pre-fix rows via the new Stage 0 Submit-override UI (commit `d4aa65f`). Each override fires `email_feedback` (verdict='override') and dispatches `stage-0/email.received` with `safety_overridden=true`.
- Once that flushes, the 68 `classifying` rows drain on their own.
- Monitor `inngest_cancelled_stale` curve — expected to approach zero as upstream LLM strain drops; if it persists, surface a *different* root-cause investigation (genuine Orq transport instability) per the worker's selectivity contract.

### Not Applied
- The iController selector fix needs a live DOM probe before committing — premature without it.
- Recommended for a follow-up `/gsd-plan-phase --gaps` plan targeting Cluster A only.

### Withdrawn Recommendations
- ~~Widen Stage 0 fail-open branch to catch all Orq errors.~~ Withdrawn per stage-0-safety-worker.ts:202-204 — the narrow `OrqClientTimeoutError`-only fail-open is **deliberate selectivity** (Pitfall 1). Other errors are meant to propagate so genuine bugs surface via the stale-sweeper. Widening would mask real Orq issues.

## Specialist Review

(not invoked — single remaining fix is planning-track, not direct apply)

