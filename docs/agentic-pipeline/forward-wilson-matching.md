# Forward-match Wilson ground-truth (info-routing)

> **Status:** DESIGN + core implementation (feat/forward-wilson-matching). Not yet applied/deployed.

## Why

In dry-run, info-routing routes each mail to a bucket and stamps `AI: held → <bucket>`; the forward stays held until a bucket proves trustworthy. The existing gate (`info-routing-forward-autoflip`) measures trust from **operator label corrections** (`swarm_review_signals.category_edited`, the 112.5 Outlook-delta) at a flat match-rate ≥ 0.85.

Operator insight (2026-06-24): staff at `info@` **already forward** most mail to the right department. So the **actual forward destination is ground truth** for the correct route — passively, with zero operator effort. This is a second, stronger ground-truth channel.

## What

Compare the AI's held verdict bucket against the bucket the mail was **actually forwarded to**, accumulate per-bucket agree/disagree, gate the forward release on a **Wilson score lower bound** (conservative on small samples — a flat ratio green-lights a lucky 1/1; Wilson does not).

```
held verdict (coordinator_runs.decision_details.routing: bucket, brand, target_mailbox)
   └─ join email_pipeline.emails.conversation_id
        └─ match info@ Sent-Items forward (same conversationId) → To address
             └─ resolveObservedBucket(To, routing_destinations.target_mailbox) → observed bucket
                  └─ agree = predicted_bucket === observed_bucket
                       └─ per-bucket Wilson lower bound ≥ 0.85 AND n ≥ 20  → release stage_4_forward_buckets[bucket]=true
```

## Components

| Piece | File | Notes |
|---|---|---|
| Pure Wilson + grader + bucket resolver | `web/lib/automations/info-routing/forward-wilson.ts` | `wilsonLowerBound`, `gradeBucketsByWilson`, `resolveObservedBucket`. IO-free, unit-tested. |
| Graph reader + matcher | `web/lib/automations/info-routing/forward-observer.ts` | `fetchForwardsByConversation` (Sent-Items, IO), `isForwardSubject`/`pickForwardRecipient`/`buildForwardObservations` (pure). |
| Observations table | `supabase/migrations/20260625_info_routing_forward_observations.sql` | `info_routing_forward_observations` (email_id PK; RLS: service_role ALL + authenticated SELECT, no anon). |
| Cron | `web/lib/inngest/functions/info-routing-forward-observe.ts` | id `info-routing/forward-observe`, cron `15,45 6-19 * * 1-5` (offset from autoflip), + event `info-routing/forward-observe.requested`. |

## Gate parameters

- `FORWARD_WILSON_GATE = 0.85` (mirrors `MATCH_RATE_GATE`), `WILSON_Z_95 = 1.96`, `MIN_OBSERVED_N = 20`.
- Release-only + idempotent: a bucket is only ever set `true`; never `false`. Consumed by `isForwardBucketReleased` (`web/lib/pipeline-gating/dry-run-gate`), inverse polarity (missing/false = held).

## Composition with `info-routing-forward-autoflip`

Both crons release `swarms.dry_run_config.stage_4_forward_buckets`, both release-only + idempotent, so their releases **union** safely. They run on **offset cron minutes** (autoflip `:00/:30`, observe `:15/:45`) to avoid contending on the `dry_run_config` read-modify-write; a rare lost update self-heals on the next tick (re-read-inside-step merge). The two channels are independent evidence — label corrections (active) and forwards (passive). A future consolidation could AND/OR them in one authority; today they OR.

## Assumptions & coverage gaps

- **Forward from the shared mailbox.** Only forwards sent **from** `info@` (landing in its Sent Items) are observed. A forward from a staffer's personal mailbox is invisible — a coverage gap the Wilson `MIN_OBSERVED_N` + lower-bound conservatism keep from green-lighting a bucket prematurely.
- **conversationId linkage.** Outlook threads forwards into the inbound's `conversationId`; the ingest persists `email_pipeline.emails.conversation_id`. A forward that breaks threading (new conversation) is unmatched → no observation (silent under-count, never a false agree).
- **First-recipient rule.** The forward destination = first To recipient; multi-recipient forwards to no routing mailbox grade ungraded.
- **Graph SPOF.** Reads go through the single hardcoded Zapier connection — a disconnect halts this observer too.

## Verification plan

1. **Unit (done):** `forward-wilson.test.ts` (11) + `forward-observer.test.ts` (6) — Wilson bounds, MIN_N floor, ungraded exclusion, conversation matching, agree/disagree. `npx vitest run …` green.
2. **Migration:** apply `20260625_…` to acceptance, `npm run check:supabase` (advisor green — RLS present).
3. **Dry observe:** trigger `info-routing/forward-observe.requested`; assert rows land in `info_routing_forward_observations` with correct `observed_bucket`/`agree` for a handful of known forwarded threads; assert NO bucket flips while n < 20.
4. **Gate:** seed/replay ≥20 high-agreement observations for one bucket; assert `grade-and-release` flips only that bucket's `stage_4_forward_buckets` to `true` (release-only; siblings preserved).
5. **Compose:** run alongside `info-routing-forward-autoflip`; assert no `false` writes and that releases union.
