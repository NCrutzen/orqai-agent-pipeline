# Review-Signal → Learning: live-data verification & gap notes

**Status:** VERIFICATION + ADDENDUM to **V10.0 P0 "Cross-Stage Learning Loop · Spine"** — NOT a new proposal. · **Date:** 2026-06-29

> **This belongs to V10.0 P0, which already scopes it.** The "bridge" below is exactly V10.0 P0's **`SPINE-02`** (project `swarm_review_signals` approve/reclassify → the `correction_event` contract) + **`SPINE-04`** (re-point the Phase-72 promotion pipeline off the dead bulk-review-override source onto the ambient source). Don't build this as a separate thing.
> - Charter: `docs/v10-cross-stage-learning-loop-proposal.md`
> - Requirements: `.planning/REQUIREMENTS.md` → "V10.0 — Cross-Stage Learning Loop · Phase 0" (on branch `workspace/v10-phase-0`, single-writer — fold these notes in there, don't fork)
>
> **What this doc ADDS** (verified live 2026-06-29 — worth folding into V10.0 P0):
> 1. **Live confirmation of the thesis:** 772 ambient signals vs ~0 usable bulk-review verdicts — ambient dominates (matches the charter's "131:1").
> 2. **Swarm-asymmetry evidence** — the "dead channel" isn't globally empty: `human_verdict` = 408 rows but **100% debtor-email**; info-routing & sales = **0**. So `SPINE-04` isn't an optimisation, it's the unblock for the swarms doing the work *now*.
> 3. **Producer→consumer file:line matrix** (§2) — an implementation reference for SPINE-02/04.
> 4. **Checked against the full charter (the "good round", 2026-06-29):**
>    - **(a) anti-AI-grading → PARTIALLY covered → ADD.** Every promotion runs through supervisor `APPROVE` + `MUTATE` shadow-eval/regression gate (charter §2.5–2.7), which structurally blocks AI auto-promotion. BUT the charter lists `ai_diagnosis` as a first-class `correction_event` SOURCE (§2.1/§7) and never states that **AI-sourced events must NEVER count as ground-truth in the Wilson/efficacy statistics**. Make that explicit, else `intent_proposals_v1` (the AI's own open-set proposals) could be miscounted as confirmation. Small, important.
>    - **(b) intent consumer → COVERED.** Charter §3 (Stage-3 → `new_intent` → `swarm_intents`) + §8 roadmap **P4** (intent adapter, after the Stage-1 noise adapter) + **P5** (residual discovery). Not missing — just sequenced behind noise. My "needs a promoter not just a bridge" = the charter's shared spine applied to intent in P4.
>    - **(c) forward-Wilson volume (13 < n=20) → OUT of V10 scope.** That gate is a V9.7-routing concern (`info-routing-forward-autoflip`), not part of the V10 learning spine (stages 1–4). Flag to whoever owns routing, separately.
>    - **(d) NEW, genuine add → the dead channel is a SECOND consumer too.** Charter §11.1 measured the dead source via `pipeline_events.override → promotion_candidates`. This doc adds: the **`classifier_rule_telemetry → agent_runs.human_verdict`** consumer (Stage-1 noise promotion) is *also* dead — 408 rows but **100% debtor-email, 0 for info-routing/sales**. So `SPINE-04`'s "re-point off the dead source" must cover this consumer too, not only `promotion_candidates`. (The migration `20260618_crossswarm_noise_shared_scope.sql` already left the seam: "source-agnostic on human_verdict so a future Outlook-delta verdict source feeds it.")

## Context (the gap this confirms)
Operators review heavily, but that feedback reaches almost none of the learning loops because it lands in `swarm_review_signals` while the loops read the near-dead `agent_runs.human_verdict`. The rest of this doc is the supporting detail behind the four points above.

---

## 1. The problem
Operator feedback lands in **two channels that no consumer unifies**:

| Channel | Table/column | Live volume (14d) |
|---|---|---|
| **Bulk Review** | `agent_runs.human_verdict` (+ `corrected_category`) | 408 rows all-time — **100% `debtor-email`**; info-routing & sales = **0** |
| **Outlook-Delta** | `swarm_review_signals` | **772 rows**, ramping (23→216/day last week) |

The starvation is **swarm-asymmetric**: the channel the learning loops read (`human_verdict`) is alive only for the now-dormant debtor swarm; for the swarms doing the work today (info-routing, sales) it is **zero**. Meanwhile 772 real operator actions sit in `swarm_review_signals` mostly unread.

`swarm_review_signals` breakdown: `approve_handled` 302, `reclassify`/`category_edited` 193, `approve_replied` 186, `forward_observed_no_verdict` 78, `forward_observed` 13. The `reclassify` rows carry the operator's should-be category in `category_key` (`signal-derive.ts:120-125`).

## 2. Current wiring (facts, file:line)

**Producers → where they write:**
- Bulk Review override → `pipeline_events` + `agent_runs.corrected_category` + `human_verdict='rejected_other'` (`bulk-review/write-override.ts:121-147`); intent axis writes `pipeline_events` only (`:189-208`).
- Debtor feedback route → `email_feedback`; on Stage-1 override → `human_verdict='edited_minor'` (`debtor-email/feedback/route.ts:73-119`).
- **Outlook-Delta watcher** → `swarm_review_signals` (`approve_handled`/`approve_replied`/`reclassify`/`correctie_false_positive`/`weak_seen`) (`swarm-behavior-sync.ts:846-881` via `signal-derive.ts deriveSignals`).
- **Forward-autoflip capture** → `swarm_review_signals` (`forward_observed*`), real destination in `observed_meta.observed_bucket` (`info-routing-forward-autoflip.ts:144-299`).

**Consumers (learning loops) → what they read, fed or starved:**

| Loop | Reads | Fed? |
|---|---|---|
| Stage-1 noise promotion (`classifier-promotion-cron.ts:185`) | view `classifier_rule_telemetry` = `human_verdict` | **STARVED** for live swarms (0 rows info-routing/sales); reads none of the 772 signals; also shadow unless `CLASSIFIER_CRON_MUTATE=true` |
| Stage-3 "intent proposals" (`intent-proposals-refresh.ts:54`) | view `intent_proposals_v1` = **AI's own** `intent_proposal` emits | Fed by AI, **not operator feedback** — looks like learning, isn't |
| Forward-Wilson autoflip (`info-routing-forward-autoflip.ts:305`) | `swarm_review_signals.forward_observed` | **Only loop on the live channel** — but itself blocked: 13 graded < `MIN_OBSERVED_N=20`, 78 no_verdict excluded |
| Stage-3 intent-label writer (`stage-3-intent-label-worker.ts:113`) | `swarm_review_signals category_edited` | **Guard only** (don't clobber an operator relabel) — not learning |

## 3. The gaps
- **Gap 1 — noise promotion is blind to the live channel.** The only verdict source is `human_verdict` (0 for live swarms). The migration even anticipated the fix: `20260618_crossswarm_noise_shared_scope.sql:17-18` — *"Source-agnostic on human_verdict so a future Outlook-delta verdict source (P112.5/P117) feeds it with zero rework."* No writer ever populated it.
- **Gap 2 — Stage-3 intent learning has NO operator-feedback input at all.** The 193 `reclassify` signals (operator says "should be intent X") are read only as a clobber-guard. There is no intent promoter consuming verdicts.
- **Gap 3 — 681 of 772 signals drive nothing.** Only the 13 `forward_observed` are consumed. The bulk `approve_*` / `reclassify` confirmations build no per-category confidence anywhere.

## 4. Proposed design — a general bridge

**Core principle:** translate each **operator** review signal into the verdict shape the relevant learning loop already reads — and ONLY operator actions, never AI self-output.

### 4.1 The signal → learning mapping (the broad version)
| `swarm_review_signals` signal | On a mail Stage-1-classified as… | Bridged verdict |
|---|---|---|
| `approve_handled` / `approve_replied` / `weak_seen` | a **noise** category | **agree** for that noise rule (operator confirmed junk) |
| `reclassify` (`category_key` null = label removed) / `correctie_false_positive` | a **noise** category | **disagree** — false-positive noise |
| `reclassify` (`category_key` = an **intent**) | anything | **"should-be intent = X"** → Stage-3 intent ground truth |
| `approve_replied` / `approve_handled` | an **intent** category | **agree** for that intent (precision signal) |
| `forward_observed` (+`observed_bucket`) | info-routing | already → forward-Wilson (keep) |

### 4.2 Architecture — reuse the anticipated seam where it exists
- **Noise (Gap 1): write-back into the source the promoter already reads.** A small idempotent worker derives noise agree/disagree from `swarm_review_signals` and writes a verdict row keyed to the rule — exactly what `classifier_rule_telemetry` consumes. Per the migration comment this is **zero-rework on the consumer side**: the existing Wilson promotion cron just starts seeing data for info-routing/sales. Decide the target: extend the telemetry view to UNION an Outlook-Delta verdict source, vs. populate `human_verdict` directly (cleaner: a dedicated `review_verdicts` source table both Bulk Review and the bridge write, with the view UNION-ing it — avoids overloading `human_verdict`'s two-writer ambiguity, see §6).
- **Intent (Gap 2): needs a bridge AND a new consumer.** The `reclassify→should-be-intent` signal is real ground truth, but there is no intent Wilson promoter to consume it. P2 builds that promoter (mirror the noise Wilson) reading the bridged intent verdicts.
- **Forward (Gap 3 volume): mostly wired, under-fed.** The bridge raises signal volume; revisit whether `forward_observed_no_verdict` (78) can be partially counted and whether `MIN_OBSERVED_N=20` is right per bucket.

## 5. Phasing
- **P1 — Noise bridge (highest leverage, lowest effort).** Idempotent worker: `swarm_review_signals` (noise-category signals) → verdict source the promotion cron reads. Unblocks noise learning for info-routing/sales. ~migration + 1 worker + tests. Ship **shadow-first** (write verdicts, keep `CLASSIFIER_CRON_MUTATE=false`) and watch Wilson counts move before enabling promotion.
- **P2 — Intent bridge + intent promoter.** Consume `reclassify→intent` as ground truth; build the Stage-3 intent Wilson promoter. Larger (new consumer).
- **P3 — Forward volume / approve-confidence.** Use `approve_*` to build per-category precision; tune forward-Wilson `n`.

## 6. Guardrails (load-bearing)
1. **Anti-AI-grading — absolute.** The bridge translates ONLY real operator actions (Outlook moves/edits/replies). It must NEVER ingest `intent_proposals_v1` or any AI self-output as a verdict — that hollows out every Wilson-CI gate. (`intent_proposals_v1` is easy to mistake for feedback; it is the AI's own proposals.)
2. **Verdict semantics.** `human_verdict` already has two writers with opposite meaning — Bulk Review `rejected_other` (disagree) vs feedback `edited_minor` (agree); the telemetry view counts only `approved`/`edited_minor` as agree. A bridge writing here must map to the correct agree/disagree or it corrupts agree-rates → prefer a dedicated `review_verdicts` source over reusing `human_verdict`.
3. **Idempotency.** `swarm_review_signals.dedupe_key` exists — the bridge must be replay-safe (one verdict per (signal, rule)).
4. **Provenance + reversibility.** Tag bridged verdicts with `source='outlook_delta'` so they're distinguishable from Bulk Review and a bad bridge is one DELETE to roll back.
5. **Shadow-first.** Promotion stays in shadow until the bridged Wilson counts are sane.

## 7. Risks
- **Approve ≠ correct-classification.** "Moved to afgehandeld" means handled, not necessarily that the AI category was right. Treat `approve_*` as a weaker agree than an explicit `reclassify`; don't let approves alone promote a shaky rule.
- **Per-swarm category namespaces.** A `category_key` in a signal must map to the right swarm's rule/intent (cross-swarm noise scope work is relevant). Mis-mapping promotes the wrong rule.
- **Forward volume floor.** Even bridged, forward-Wilson may stay under `n=20` for low-traffic buckets — a volume problem the bridge doesn't solve.

## 8. Open questions (decide before P1)
1. Bridge target: extend `classifier_rule_telemetry` to UNION a new `review_verdicts` table, vs. write into `human_verdict`? (Recommendation: new `review_verdicts` source — avoids the two-writer ambiguity.)
2. Do `approve_handled`/`approve_replied` count toward noise-rule agree, or only `reclassify`/`weak_seen`? (Affects how fast rules promote.)
3. Scope P1 to info-routing first (where the gap bites), or all swarms at once?

---
**Effort (rough):** P1 ≈ 1 migration + 1 worker + telemetry view change + tests (small-medium). P2 ≈ new promoter + dataset (medium). P3 ≈ tuning (small).
**Next:** on go, P1 as a normal phase (workspace + plan), shadow-first.
