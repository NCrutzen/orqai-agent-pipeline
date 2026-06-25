# Forward-match Wilson ground-truth (info-routing)

> **Status:** ONE-SHOT backfill (feat/forward-wilson-backfill). No persistent table, no cron. Not yet applied/deployed.

## Why

In dry-run, info-routing routes each mail to a bucket and stamps `AI: held → <bucket>`; the forward stays held until a bucket proves trustworthy. The existing cron (`info-routing-forward-autoflip`) measures trust from **operator label corrections** (`swarm_review_signals.category_edited`) at a flat match-rate ≥ 0.85.

Operator insight (2026-06-24): info@ already has **months of staff forwards** = a ready ground-truth dataset. So instead of an ongoing observer, run a **one-shot retroactive backfill** that grades the AI's routing against where staff *actually* forwarded each mail, computes a **Wilson score lower bound** per bucket, and sets the forward-release flags for buckets that clear. The historical sample is fixed → one pass is enough; no persistent table (keeps the DB lean), no recurring cron.

## What

```
historical info@ Sent-Items forward (lookback, default 180d)
   └─ match to inbound original via email_pipeline.emails.conversation_id
        ├─ PREDICTED bucket = existing held verdict (coordinator_runs.decision_details.routing)
        │                     ELSE re-classify the original (info-routing-coordinator agent →
        │                     parseAgentOutputOrUnrouted → buildRoutingVerdict) so older mail counts
        └─ OBSERVED bucket = resolveObservedBucket(forward To-address → routing_destinations.target_mailbox)
             └─ agree = predicted === observed
                  └─ per-bucket Wilson lower bound ≥ 0.85 AND n ≥ 20 → clears
                       └─ (--apply) release stage_4_forward_buckets[bucket]=true
```

## Components

| Piece | File | Notes |
|---|---|---|
| Pure Wilson + grader + bucket resolver | `web/lib/automations/info-routing/forward-wilson.ts` | `wilsonLowerBound`, `gradeBucketsByWilson`, `resolveObservedBucket`. IO-free, unit-tested. |
| Graph reader + pure matchers | `web/lib/automations/info-routing/forward-observer.ts` | `fetchForwardsByConversation` (Sent-Items, IO) + `isForwardSubject`/`pickForwardRecipient` (pure). No persistence — returns matches. |
| **One-shot backfill** | `web/scripts/forward-wilson-backfill.ts` | reads forwards → matches → predicts (verdict or re-classify) → grades → reports → (`--apply`) releases. |

> Removed in the one-shot redesign: the `info-routing-forward-observe` cron, the `info-routing/forward-observe.requested` event, and the `info_routing_forward_observations` table/migration (never applied to prod — no cleanup, just deleted).

## How to run

```bash
# Dry-run report (default) — prints the per-bucket Wilson table, writes nothing:
npx tsx web/scripts/forward-wilson-backfill.ts

# Apply — release the clearing buckets' flags (release-only, idempotent):
npx tsx web/scripts/forward-wilson-backfill.ts --apply

# Options:
npx tsx web/scripts/forward-wilson-backfill.ts --lookback-days 365    # default 180
npx tsx web/scripts/forward-wilson-backfill.ts --max-reclassify 200   # cap Orq re-classify calls (default 1000)
npx tsx web/scripts/forward-wilson-backfill.ts --mailbox info@smeba.nl
```

Re-classification runs at concurrency 5 and is capped by `--max-reclassify`. Existing held verdicts are reused (no Orq call). `--apply` is **release-only + idempotent**: it only ever sets a bucket `true` (never un-releases), merging `dry_run_config.stage_4_forward_buckets` the same way `info-routing-forward-autoflip` does, so sibling flags are preserved. Safe to re-run.

## Gate parameters

`FORWARD_WILSON_GATE = 0.85`, `WILSON_Z_95 = 1.96`, `MIN_OBSERVED_N = 20`. Consumed downstream by `isForwardBucketReleased` (`web/lib/pipeline-gating/dry-run-gate`), inverse polarity (missing/false = held).

## Sample report shape

```
[forward-wilson-backfill] DRY-RUN · lookback 180d (since 2025-12-27T…) · mailboxes info@smeba.nl, info@fire-control.nl
  info@smeba.nl: 412 forwarded conversation(s)
  info@fire-control.nl: 87 forwarded conversation(s)
  re-classifying 233 forward(s) with no existing verdict (pool 5)…

Sources: 266 reused verdict(s), 233 re-classified · skipped 41 (no inbound match), 12 (router unrouted)

Per-bucket Wilson (gate ≥ 0.85, n ≥ 20):
  bucket             n   agree   rate    wilson_lower  clears
  inspecties        58     55     95%        0.862    ✅ YES
  order_entry       31     24     77%        0.605    —  no
  sollicitaties     22     22    100%        0.821    —  no
  verkoop          141    133     94%        0.892    ✅ YES

Buckets that clear: inspecties, verkoop

DRY-RUN: would release inspecties, verkoop. Re-run with --apply to write the flags.
```

## Assumptions & coverage gaps

- **Forward from the shared mailbox.** Only forwards sent **from** info@ (in its Sent Items) are observed; a forward from a staffer's personal mailbox is invisible — a coverage gap the Wilson `MIN_OBSERVED_N` floor + lower-bound conservatism keep from green-lighting a bucket prematurely.
- **conversationId linkage.** Outlook threads forwards into the inbound's `conversationId`; the ingest persists `email_pipeline.emails.conversation_id`. A forward that breaks threading is unmatched → no observation (silent under-count, never a false agree).
- **Re-classify drift.** Re-classifying old mail uses today's agent/registry; a since-changed prompt could grade historical mail slightly differently than it was (or would be) routed live. Acceptable for a one-shot trust estimate; reused live verdicts are exact.
- **Graph SPOF.** Reads go through the single hardcoded Zapier connection — a disconnect halts the backfill.

## Verification plan

1. **Unit (done):** `forward-wilson.test.ts` (11) + `forward-observer.test.ts` (4) — Wilson bounds, MIN_N floor, ungraded exclusion, subject/recipient parsing. `npx vitest run …` green.
2. **Dry-run:** `npx tsx web/scripts/forward-wilson-backfill.ts` against acceptance — assert the report lists per-bucket n/agree/Wilson and that no bucket with n<20 clears.
3. **Spot-check:** for a handful of known forwarded threads, confirm `observed_bucket` matches the actual To-mailbox and `agree` is correct.
4. **Apply:** `--apply` → assert only clearing buckets flip `stage_4_forward_buckets` to `true`, siblings preserved, and a second `--apply` is a no-op (idempotent).
