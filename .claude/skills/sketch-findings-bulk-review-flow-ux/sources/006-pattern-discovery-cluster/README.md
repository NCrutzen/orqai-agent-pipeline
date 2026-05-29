---
sketch: 006
name: pattern-discovery-cluster
question: "Where does pattern discovery live and how are clusters surfaced — stage-grouped or impact-ranked?"
winner: "A — Stage-grouped"
tags: [patterns, clustering, learning, p4, req-03, listing-surface]
---

## Locked decisions

- **Variant A — stage-grouped** wins. Operator's mental model is "I want to review the Stage 1 work today" more often than "give me the biggest €/mo first." Variant B kept for reference (could ship as a filter toggle in a real implementation).
- **Patterns is a third top-level mode** (purple `#b886ff`) on the locked sketch-001 mode-bar. Same gradient + box-shadow chrome, third slot.
- **Operator-facing terminology lock** (carries into 007): NO regex syntax, NO internal field names, NO statistical jargon visible to the operator. Translation lock-table below.

## Operator-facing terminology (LOCKED — carry into sketch 007)

| Internal / backend                        | Operator-facing                                          |
|-------------------------------------------|----------------------------------------------------------|
| `regex_rule` / "Stage 1 candidate rule"   | **Filter rule**                                          |
| `sender_mapping`                          | **Known sender**                                         |
| `prompt_tune` (Stage 3)                   | **AI tuning**                                            |
| `new_intent`                              | **New topic**                                            |
| `prompt_tune` (Stage 4 handler)           | **Draft style**                                          |
| `swarm_intents` / `swarm_noise_categories`| (never named — referred to as "topic list" / "filter list") |
| `eval_type`                               | (never shown to operator — engineering metadata)        |
| `confirm rate` · `Wilson-CI gate` · `LLM tiebreaker` · `coordinator_runs` | (never shown) |
| `events / 30d`                            | **N times this month**                                   |
| `expected_savings (€/mo)`                 | **est. saved**                                           |
| `status: open / in_review / approved / rejected / rolled_back` | **needs review · being reviewed · applied · dismissed** |
| `promotion candidate`                     | **suggestion** (e.g. "18 suggestions from your team's recent corrections") |
| `eval_type='intent-correction'`           | (never shown)                                            |
| `routed_human_queue`                      | "human queue" or "escalated for manual handling"        |
| Raw regex patterns (e.g. `Re:.+afwezig tot \d{2}/\d{2}`) | **Plain-English description** (e.g. "Out-of-office replies with a return date in the subject") |

# Sketch 006 — Pattern discovery clustering

## What's already shipped (verified in code 2026-05-21)

- **`candidate-rule-list.tsx`** in stage-1/ — lists Stage 1 regex rule candidates (`classifier_rules.status='candidate'`) with N, CI-lo. Detail pane handles promote/reject. **Partial pattern surface for Stage 1 only.** ✓
- **`promotion-recommender.md`** = STUB design memo (Phase 72 future work). Defines the cron + output table contract.
- **`pipeline_events`** (Phase 70) ✓ — single source of truth. Append-only. Partial index `pipeline_events_override_partial_idx` for override rows.
- **`graduated-automation.md`** Wilson-CI gate ✓ — the existing promotion gate for Stage 1 regex rules.

## What's NOT shipped (this sketch defines)

- **Cross-stage clustering view** spanning Stage 1/2/3/4 in one surface. Today only Stage 1 has a candidate list.
- **`promotion_candidates` table** (Phase 72 forward-ref) — not yet created.
- **Inngest cron** that reads `pipeline_events`, groups overrides into clusters, writes candidates.

## Locked decisions before sketching

- Patterns becomes a **third top-level mode** alongside Queue / History from sketch 001. Purple (`#b886ff`) accent — matches the LLM color, signals "learning loop".
- Mode-bar extends from 2 halves to **3 thirds** — same chrome treatment, third color slot.
- This sketch = LISTING/browse surface only. **Detail / approve flow** for a single cluster ships in sketch 007.

## How to View
```
open .planning/sketches/006-pattern-discovery-cluster/index.html
```
Tab between **A | B** at the top.

## Variants

- **A — Stage-grouped**: clusters bucketed under each pipeline stage (Stage 1 Noise · Stage 2 Customer · Stage 3 Topic · Stage 4 Action). Per-stage subtotals visible. Helps an operator who batches work by stage expertise.

- **B — Impact-ranked**: single flat list sorted by est. monthly savings. Top 3 highlighted with purple left-border + bolded rank numbers. Helps a time-constrained operator pick the highest-ROI candidates first.

Both variants share the cluster-card shape: `kind-badge` (regex_rule · sender_mapping · prompt_tune · new_intent) + `stage-label` + `signature` (1-line summary + 1-line evidence sub) + `volume` (N events / period) + `savings` (€/mo) + `status` (new · in review · promoted · dismissed) + "Review →" CTA.

## What to Look For

1. **Third-mode chrome works.** Top mode-bar now shows 3 thirds (Queue · History · Patterns). The same gradient + box-shadow treatment from sketch 001, just an extra slot. Purple accent reads as "different operational mode" without breaking the locked color semantics.

2. **Cluster card affordance.** Each card carries five pieces of info: WHAT (kind + stage), the SIGNATURE (what pattern was detected), the VOLUME (how often), the SAVINGS (€/mo), and the STATUS. All visible at a glance — no expansion needed at this level.

3. **Status pills.** `new` (purple) → `in review` (amber) → `promoted` (green) — terminal states or `dismissed` (grey). Operator's filter chips at the top mirror these states.

4. **Variant A vs B mental model.**
   - A treats Patterns as **stage-specialist work**: "I'm in regex-mode this hour, show me Stage 1 candidates only."
   - B treats Patterns as **highest-leverage triage**: "I have 30 min, what's the biggest savings I can lock in."
   - Both could ship together as filter modes (toggle "group by stage" / "rank by impact") — but for the sketch we contrast them as variants.

5. **Aggregate header line.** Both variants show the total opportunity (€127/mo across 18 candidates) — gives operator a one-glance impact for the milestone.

## Implementation dependencies (for plan-phase)

### Savings-estimation formula (HARDENED SPEC — must be in plan-phase)

The `est. €N / mo` displayed per cluster is the **single highest-stakes number** in this surface — it drives operator prioritization. Cannot be hand-waved. Must be deterministic, auditable, and reproducible.

**Per-candidate calculation** (computed at cron-write time, persisted in `promotion_candidates.expected_savings`):

```
expected_savings_cents_per_month =
    (matched_event_count_30d / 30)            -- events per day this candidate would have caught
  × 30                                          -- days in a month
  × (avg_llm_cost_cents_for_replaced_path - avg_cost_cents_for_promoted_path)
  × clip(confirm_rate, floor=0.5, ceil=1.0)   -- discount by operator-confirm rate
```

Component definitions:
- `matched_event_count_30d` = count of `pipeline_events` rows in the candidate's evidence set (`evidence_event_ids` from `promotion_candidates`) over the trailing 30 days. **Trailing window, not calendar month** — stabilizes against month-end edge effects.
- `avg_llm_cost_cents_for_replaced_path` = mean `cost_cents` from `pipeline_events` for the **stage(s) the candidate would short-circuit**. E.g. a Stage 1 `Filter rule` would replace the Stage 1 LLM 2nd-pass call (`avg_cost_cents` of Pass-2 events) PLUS the downstream Stages 2-4 that would never run (since auto-archive is terminal).
- `avg_cost_cents_for_promoted_path` = cost of the deterministic path the candidate creates. **Regex / sender-map / new noise-key = 0.0¢** (deterministic, no LLM). **AI tuning / new topic / draft style = revised LLM cost** based on a sampled rerun. For v1, only ship promotions that are FULLY deterministic (savings_delta = full LLM cost). Defer AI-tune savings estimation to v2.
- `confirm_rate` = (operator confirms / (confirms + overrides)) across the evidence set. Used as a multiplier to penalize candidates the operator team is uncertain about. Floor at 0.5 means "even 50% confirm is enough to show the candidate."

**Aggregation rules**:
- Total opportunity (the €127/mo header number) = `SUM(expected_savings)` across all candidates with `status IN ('open', 'in_review')` — exclude already-applied or dismissed.
- Per-stage subtotal (the €42/mo / €48/mo / €27/mo / €10/mo lines) = `SUM(expected_savings) WHERE stage = N`.

**Precision rules** (operator-facing):
- Round to whole €. Never show cents.
- Show "—" if `matched_event_count_30d < 3` (insufficient evidence). Do not surface near-zero candidates.
- Cap displayed savings at €99/mo per candidate. Anything larger triggers an engineering review (the formula is wrong or the candidate is mis-clustered).

**Backend tasks**:
- `promotion_candidates` schema needs the `expected_savings` column to be `NUMERIC(10,4)` (per the stub) — accommodate fractional cents internally, present as whole € in UI.
- Re-compute on every cron run with the trailing-30d window. **Idempotent**: same evidence set → same savings within float tolerance.
- Add a `savings_calculation_version` int column so the formula can evolve without invalidating historical candidates (v1 = "deterministic only" rule above; v2 = include AI-tune resampling).
- Server action `recomputeCandidateSavings(candidate_id)` exposed for engineers to manually re-run when re-clustering.

### Other backend deps

- **`promotion_candidates` table** per `promotion-recommender.md` stub: id · kind · swarm_type · stage · expected_volume · expected_savings · evidence_event_ids · proposed_change (jsonb) · status · approved_by · approved_at · **+ savings_calculation_version (new)**.
- **Inngest cron** scanning `pipeline_events` for override-driven candidates. Reads via the partial index. Writes new rows to `promotion_candidates`. Idempotent — re-runs the same window produce same candidates with updated `expected_volume` and `expected_savings`.
- **Plain-English signature generator**: turns raw clustering predicates (regex patterns, sender domains, intent flips) into the operator-facing strings shown in the cluster card. Must run server-side (so historical candidates don't drift if UI strings change). Suggest storing the rendered string in `promotion_candidates.proposed_change.display_signature` alongside the structured payload.

UI (this sketch's contribution to the milestone):
- **Third-mode chrome** — extends the locked sketch-001 mode-bar from 2 to 3 modes. Backwards-compatible: existing Queue/History routing unchanged; Patterns is a new route `/automations/[swarm]/patterns` (or query param `?mode=patterns`).
- **Cluster-card component** — reusable shape across both variants. Fed by a `promotion_candidates` row.
- **Filter chip strip** — by status (new · in review · promoted · dismissed). Default = "all".
- **Per-stage subtotals** (Variant A) or **rank-marker + impact highlighting** (Variant B). Both rendering paths off the same data — operator can flip with a toggle in a real implementation.

Out of scope (next sketch):
- Detail pane / approve flow for a single cluster — sketch 007.
- Cross-swarm correlation — explicitly out of v1 per `promotion-recommender.md` non-goals.
