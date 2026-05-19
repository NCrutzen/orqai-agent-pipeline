---
slug: stage-2-customer-mapping-stuck
status: root_cause_identified
trigger: Stage 2 rows appear to never trigger the customer-labelling SEARCH action (dry-run should still search, just not apply the label)
created: 2026-05-19
updated: 2026-05-19
goal: find_and_fix
---

# Debug Session: stage-2-customer-mapping-stuck

## Symptoms

DATA_START
**User-reported:**
- Stage 2 (customer mapping / label-resolver) rows appear to never trigger a customer-labelling action.
- The label-resolver is in dry-run mode — that explains why no labels appear in iController.
- BUT user expects the customer SEARCH action to still happen in dry-run (no write, just lookup).
- User does not see evidence of the search happening at all.

**Health-check baseline (2026-05-19 09:53 AMS):**
- Stage 2 funnel depth: 88 emails. Δ vs prior tick: 0 (flat).
- Stages 2-4 all flat overnight — no new emails advancing past Stage 1.
- Stage 1 LLM-2nd-pass is growing healthily, so upstream input is arriving but downstream is not draining or producing search activity.

**Hypothesis space:**
1. The label-resolver Inngest function never fires for Stage 2 rows — event-routing gap.
2. The label-resolver fires but exits early due to a dry-run guard that skips the search itself, not just the label-apply.
3. The label-resolver fires + searches, but logs/telemetry don't surface the search (it's silently working).
4. Stage 2 status mapping is wrong — rows that should be `pending` are in `predicted` or vice versa, and the dispatcher never picks them up.
DATA_END

## Current Focus

- hypothesis: most likely (1) or (2). The user's framing ("no actual label, but I'd expect a search") strongly implies the label-resolver isn't being observed at all — not even partial activity.
- test: (a) read `docs/agentic-pipeline/README.md` and `docs/debtor-email-pipeline-architecture.md` for the locked Stage 2 contract; (b) query Supabase to characterize the 88 Stage 2 rows (status distribution, timestamps, result fields); (c) read the label-resolver Inngest function for dry-run guards + trigger event.
- expecting: identify whether the function is firing at all (Inngest events / agent_runs telemetry) and whether dry-run prevents the search action.
- next_action: read architecture docs + query Supabase in parallel.

## Evidence

- timestamp: 2026-05-19 ~10:55 AMS, source: locked RFC `docs/agentic-pipeline/stage-2-entity.md` + code reading of `classifier-label-resolver.ts`. Stage 2 contract: trigger event `debtor-email/label-resolve.requested`, function `classifierLabelResolver`, runs `resolveDebtor()` for the NXT SQL customer lookup, writes `debtor.email_labels` row with `status='dry_run'`/`'pending'`/`'skipped'`. **Critical: `dry_run` does NOT skip the NXT search.** It only sets `email_labels.status='dry_run'` and `icontroller_tag_status='skipped_dry_run'` — the customer lookup still runs. User's expectation (search should fire in dry-run) is correct.

- timestamp: 2026-05-19, source: Supabase `swarm_noise_categories` + `debtor.labeling_settings`. Registry is correctly configured: `unknown.action='swarm_dispatch'` with `swarm_dispatch='debtor-email/label-resolve.requested'`, enabled=true. All 6 mailboxes have `nxt_database='nxt_benelux_prod'` and `dry_run=true`. So neither registry nor per-mailbox settings explain the stall.

- timestamp: 2026-05-19, source: Supabase `debtor.email_labels`. 133 rows in last 30 days, all `status='dry_run'` as expected (89 unresolved / 23 identifier_match / 12 sender_match / 9 llm_tiebreaker). **Most recent row: 2026-05-13T13:21:08.** Zero rows for the past 6 days. Confirms Stage 2 was working until 2026-05-13, then stopped.

- timestamp: 2026-05-19, source: Supabase `pipeline_events` stage=2. 88 total rows (matches funnel-depth count), 63 unresolved + 25 resolved. Most recent: 2026-05-13 13:21:08. Same drying-up pattern as `email_labels`.

- timestamp: 2026-05-19, source: `git log` cross-referenced with Stage 2 timeline.
  - `acd7634 2026-05-12 12:00 AMS — feat(82.2-06): Stage 1 worker owns debtor-email dispatch`. **Phase 82.2-06 break commit.** Refactored dispatch from the (now-deleted) ingest route into `classifier-screen-worker.ts`. The catch-all `if (!autoActionAllowed)` bulk-review branch swallowed `unknown` rows and returned early, never emitting `classifier/verdict.recorded` → verdict-worker never dispatched to label-resolver → Stage 2 silently dropped.
  - In-flight backlog drained slowly for ~27h after the break; last Stage 2 event at 2026-05-13 13:21.
  - `0a737f4 2026-05-18 20:19 AMS — fix(stage-1): exempt 'unknown' from bulk-review branch so Stage 2 gets dispatched`. **Partial fix.** Added `&& finalCategoryKey !== "unknown"` guard at line 497 to exempt unknowns from the bulk-review branch. But the fix only prevents unknowns from entering bulk-review — they then fall through to the Step 4 auto-action branch (line 547) where `DEBTOR_CATEGORY_LABEL["unknown"]` is undefined, triggering the `if (!label)` failure write at line 552-577 and returning before reaching the Step 5 emit-verdict at line 757.

- timestamp: 2026-05-19, source: Supabase `automation_runs` since 2026-05-18 18:19 UTC (post-fix window). **17 rows with status='failed', topic='unknown', result.stage='categorize', error_message='no Outlook label for category unknown'.** These are the partial-fix's new failure mode. Also: Stage 1 pipeline_events show 4 new unknown decisions since the fix landed — yet 0 corresponding `email_labels` rows. Confirms the auto-action branch is swallowing unknowns.

- timestamp: 2026-05-19, source: code structure analysis of `classifier-screen-worker.ts:413-722`. The `if (settings) { … }` block contains: idempotency-precheck (returns if alreadyLabeled), whitelist gate, Step 3 bulk-review branch, Step 4 auto-action branch. Step 5 emit-verdict at line 728+ is OUTSIDE the `if (settings)` block. The intended path for `unknown` is to fall through to Step 5 where `gateClearsForAutoArchive` includes `finalCategoryKey === "unknown"` and emits `classifier/verdict.recorded` → verdict-worker → `swarm_dispatch` → Stage 2. The 82.2-06 refactor blocks both possible exit paths inside the `if (settings)` block for unknowns.

## Eliminated

- timestamp: 2026-05-19. **Eliminated:** registry misconfiguration. `swarm_noise_categories.unknown` row has correct action='swarm_dispatch' and swarm_dispatch event name.
- timestamp: 2026-05-19. **Eliminated:** per-mailbox `nxt_database` missing. All 6 mailboxes have it set. Resolver would not short-circuit to `runThreadInheritanceOnly`.
- timestamp: 2026-05-19. **Eliminated:** dry_run gating the customer search. Code reading + `email_labels.method` distribution proves the resolver DOES run NXT SQL (23 identifier_match, 12 sender_match, 9 llm_tiebreaker) when it fires. Dry_run only affects what `status` is written.
- timestamp: 2026-05-19. **Eliminated:** auto_label_enabled=false on a mailbox. `unknown` is exempt from the auto_label gate at line 497 (post-fix); `unknown` never depended on auto_label_enabled.
- timestamp: 2026-05-19. **Eliminated:** label-resolver function itself broken. `classifier-label-resolver.ts` is unchanged since before the break window. The function works; it's never being invoked.

## Resolution

### Root Cause

Two-stage regression introduced in Phase 82.2-06 and partially fixed in 0a737f4:

**Original break (`acd7634`, 2026-05-12 12:00 AMS):** Stage 1 worker dispatch refactor placed an `if (!autoActionAllowed)` catch-all that swallowed `unknown` rows into the bulk-review branch (`status='predicted'`) and returned early. The verdict-emit at Step 5 never ran for unknowns → `classifier/verdict.recorded` never fired → verdict-worker never dispatched the registry-driven `swarm_dispatch` to `debtor-email/label-resolve.requested` → `classifier-label-resolver` never invoked → Stage 2 silently dropped.

**Partial fix (`0a737f4`, 2026-05-18 20:19 AMS):** Exempted `unknown` from the bulk-review branch via `&& finalCategoryKey !== "unknown"`. But unknowns then fell into the Step 4 auto-action branch where `DEBTOR_CATEGORY_LABEL["unknown"]` is undefined, hitting the `if (!label)` failure write (line 552-577) and returning with `dispatch: "failed_no_label"`. Still no Step 5 emit-verdict, still no Stage 2 dispatch.

### Fix

`web/lib/inngest/functions/classifier-screen-worker.ts:483-721` — wrap Steps 3+4 (bulk-review + auto-action) in an outer `if (finalCategoryKey !== "unknown")` guard so `unknown` skips BOTH branches and falls through to Step 5 (emit-verdict at line 757), where the existing `gateClearsForAutoArchive` logic correctly handles `unknown` via the verdict-worker's swarm_dispatch path.

Also simplify the now-redundant `&& finalCategoryKey !== "unknown"` in the bulk-review condition at line 497 — once the outer guard is in place, the inner clause is dead code.

### Verification Plan

- Forward: after the fix ships, monitor `debtor.email_labels` for new dry_run rows. Expectation: rows resume within 2-10 minutes of the next Stage 1 unknown classification (Tue 2026-05-19 business-hours cron tick is firing now, ~4-5 unknowns/hour observed in the 4 post-partial-fix events).
- Backfill: the existing pre-break Stage 2 backlog has been overwritten by the partial fix's "failed_no_label" rows. Either (a) re-emit `debtor-email/label-resolve.requested` events for the affected emails by replaying their `pipeline_events.email_id` against the resolver entry point, or (b) accept the gap and rely on future arrivals — same emails will re-trigger Stage 1 on the next webhook? Probably not; Outlook ingest is one-shot per message_id. Operator manual re-emit or a one-off backfill cron is needed.
- Spot-check: pick one of the 17 `failed/categorize/unknown` rows from the post-partial-fix window. After the fix ships and a replay event fires, the row's `automation_run_id` should produce an `email_labels` insert with `status='dry_run'`.

### Telemetry note

The fix doesn't change Inngest function code, only the dispatch routing in Stage 1. Stage 2's `classifier-label-resolver` has been correct throughout. Once dispatch is restored, the existing dry_run + NXT search behavior the user expects will resume automatically.

