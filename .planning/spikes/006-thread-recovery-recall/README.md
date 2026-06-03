---
spike: 006
name: thread-recovery-recall
type: standard
validates: "Given an unresolved Stage 2 miss, when we check whether its (now-backfilled) conversation_id shares a thread with a resolved label, then thread_inheritance recovers it (Lever 2) — plus quoted-body sender recovery for forwarded internal mail"
verdict: VALIDATED — thread_inheritance recovers 17.8% of all misses post-fix; combined floor across all mechanisms = 32.4%
related: [005]
tags: [stage-2, entity-resolution, recall, thread-inheritance, debtor-email, measurement]
idea: stage-2-resolution-recall
---

# Spike 006: thread-recovery-recall (Lever 2)

## What This Validates

Two recovery mechanisms that depend on the thread, both newly possible after Lever 1 (commit `976d42d6`) fixed `conversation_id` ingest + backfilled 2,450 rows:

1. **Thread inheritance** — `resolve-debtor.ts` layer 1 already inherits the customer from a prior resolved label on the same `conversation_id`. It fired **0 times** before the fix because `conversation_id` was 100% null on zapier-ingested rows. This spike measures how much it now recovers.
2. **Quoted-thread sender recovery** — for forwarded internal mail (colleague forwards a customer email into the debtor inbox; 92% of internal misses look forwarded), parse the quoted body for the original sender's address and resolve *that*. Internal-sender is the **trigger**, never a terminal "no customer" (per operator correction 2026-05-29).

## Measurement Method

Same ground-truth proxy as Spike 005 (our own resolution history; conservative floor). Three boolean mechanisms scored per miss, then unioned (deduped per label):
- `via_thread` — conversation_id shares a thread with any label that resolved to a customer.
- `via_sender_domain` — external sender domain in the confident domain→customer map (Lever 3 floor).
- `via_quoted_body` — body contains an external email whose domain is in the confident map (quoted-thread parsing floor).

## Results

**Verdict: VALIDATED.** Window: 30 days. Total unresolved misses = **247**.

| Mechanism | Misses recovered (floor) | % of all misses |
|---|---:|---:|
| `via_thread` (inheritance) | 44 | 17.8% |
| `via_sender_domain` (Lever 3) | 35 | 14.2% |
| `via_quoted_body` (Lever 2 parsing) | 44 | 17.8% |
| **Union (any mechanism)** | **80** | **32.4%** |

- **246 of 247 misses now carry a `conversation_id`** — confirms Lever 1's backfill landed.
- `via_thread` = 44: thread inheritance, dead before the fix, now recovers ~18% of all misses for free. Standalone justification for Lever 1.
- **Combined floor = 80/247 (32.4%).** Current Stage 2 resolved rate is ~35% (132/379); adding 80 lifts it to ~**56%** — roughly doubling recall — and this is the *floor* (own-history only; live NXT + Lever 4 push higher).

## Conclusion / What It Means for the Build

- Lever 1 (shipped) already buys ~18% via thread inheritance — verify in production over the next few weeks as new threads accrue resolved siblings.
- Lever 2 quoted-body parsing recovers a distinct ~18% (overlap aside), validating the operator's point that forwarded internal mail is customer-bound and recoverable.
- Levers 2+3 together (floor 32.4%) justify a "Stage 2 Resolution Recall" milestone before V9.0.
- **Open question carried from Spike 005:** the 127 never-seen domains need a live NXT probe to convert floor → real estimate.

## Queries

See `queries.sql` in this directory.

## Investigation Trail

- 2026-05-29 — post-backfill confirmed 246/247 misses now have conversation_id.
- 2026-05-29 — measured via_thread=44 (17.8%) standalone.
- 2026-05-29 — unioned thread + sender-domain + quoted-body → 80/247 (32.4%) combined floor.
