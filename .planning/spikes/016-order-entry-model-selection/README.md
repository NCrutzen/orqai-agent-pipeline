---
spike: 016
name: order-entry-model-selection
type: standard
validates: "Which LLM (cost / speed / quality) to use for PASS 2 of spike 012 — classifying the ~30k order@smeba.nl corpus into shape {order_work|forward|archive} + intent. Shootout over EU-hostable candidates on a 10-email stratified sample; quality = shape-agreement with the strongest EU model (Opus 4.7 EU) as reference, since Koen's labels are excluded by design."
verdict: "DECIDED 2026-06-22 — workhorse = aws/eu.anthropic.claude-haiku-4-5 (clean JSON, ~$11/30k, EU). Highest quality = google/eu.gemini-3.5-flash (9/10 vs ref) but ~7x cost + slow (reasoning NOT suppressible via effort:none) → reserve for ambiguous escalation, not the full sweep. ministral-3b: format fixed by tool-enforcement but quality 3/10. nova-lite + nemotron-nano: return EMPTY tool args even with enforcement → unusable here. Prereq before PASS 2: sharpen the order_work-vs-forward definition (that's where models split, and where the two strongest models — gemini+opus — agree the boundary is order_work, supporting the order-feeding shape from spike 012)."
related: [012, 013]
idea: order-entry-act-proof
tags: [order-entry, v10.5, llm, model-selection, cost, orq, eu, pii]
---

# Spike 016: order-entry-model-selection

## Why this exists

PASS 2 of spike 012 needs an LLM to classify the ~30,469-email `order@smeba.nl` corpus. The model
choice drives cost (30k × per-email), speed, and quality. Constraints: **EU-hosting (customer PII)**,
strict structured output, Dutch. All calls via the **Orq.ai Router** (repo rule — no direct provider
keys). Quality is scored as **shape-agreement with a strong EU reference (Opus 4.7 EU)** because
Koen's labels are deliberately excluded (see [[012-order-entry-live-corpus-shape]]).

Method: a 10-email stratified sample (own-domain forwards · Coupa/Ariba portals · external customer ·
offerte · opzegging), one batch call per model, temp 0. **Round 1** = prompt-only JSON. **Round 2** =
schema-enforced via a forced `classify_emails` function tool (`anyOf` nullable per CLAUDE.md).

> ⚠️ Sample = 10 emails. Directional, not statistically tight. Latency not precisely measured
> (Orq MCP gives no wall-clock; reasoning-token volume used as the speed proxy). Confirm the
> finalist on a larger sample inside PASS 2.

## Results

Cost = USD for the 10-email batch (from Orq usage). →30k = per-email × 30,469. Quality = shape
matches vs Opus-4.7-EU reference (`1F 2OW 3A 4OW 5F 6OW 7OW 8OW 9OW 10OW`).

| Model | EU | R1 prompt-only | R2 tool-enforced | →30k | Shape vs ref | Verdict |
|---|---|---|---|---|---|---|
| `mistral/ministral-3b` | ✅ | ❌ prose, no JSON | ✅ valid tool-call | **~$0.13** | 3/10 | format OK, **quality too low** |
| `aws/eu.amazon.nova-lite` | ✅ | ❌ prose | ❌ empty `{}` args | — | — | **unusable** (no data) |
| `aws/nvidia.nemotron-nano-3-30b` | ✅ | ❌ md table, wrong scheme | ❌ empty `{}` args | — | — | **unusable** (no data) |
| `aws/eu.anthropic.claude-haiku-4-5` | ✅ | ✅ clean JSON | — | **~$11** | 4/10* | ✅ **workhorse** |
| `google/eu.gemini-3.5-flash` | ✅ | ✅ ($0.032, reasoning) | ✅ ($0.025, reasoning **still on** w/ effort:none) | ~$75 | **9/10** | best quality, costly/slow → escalation only |
| `google/eu.claude-opus-4-7` | ✅ | ✅ clean JSON | — | ~$53 | reference | quality anchor, too pricey for sweep |

\* Haiku's 6 "misses" are all the **order_work-vs-forward** boundary (it reads portal-POs and
internal "raise an order" forwards as `forward`; gemini+opus read them as `order_work`). Not random
error — it's the unresolved label definition (see Prereq).

## Findings

1. **Structured-output adherence is the first filter.** Prompt-only JSON failed the 3 cheapest
   models; a forced function-tool fixed ministral-3b, but **nova-lite and nemotron-nano still
   returned empty `{}`** — they cannot do this task reliably on the Orq Router today. Drop them.
2. **`gemini-3.5-flash` reasoning is NOT suppressible** via `reasoning.effort: "none"` (2,254
   reasoning tokens regardless) → it stays ~7× Haiku's cost and slow. Great quality (9/10), wrong
   tool for a 30k sweep. (Flag for the team — `effort:none` is silently ignored for this model.)
3. **The two strongest models (gemini + opus) agree** that portal-POs (Coupa/Ariba) and internal
   "raise an order in Valtimo" forwards are **`order_work`**, not `forward`. This corroborates spike
   012's PASS-1 finding that the shape is **order-feeding, not pure Router** — and it means Haiku's
   "forward" lean is the minority reading, fixable by a sharper definition.
4. **ministral-3b** is ~85× cheaper than Haiku but 3/10 — only viable as a cheap tier-1 in a cascade
   (obvious portal-POs) with escalation, not as the sole classifier.

## Decision

- **PASS 2 workhorse → `aws/eu.anthropic.claude-haiku-4-5`** (EU, ~$11 for the full 30k, reliable
  JSON). Re-confirm on a larger sample in PASS 2.
- **Escalation / adjudication → `google/eu.gemini-3.5-flash`** for the ambiguous residue only.
- **Reference / spot-audit → `google/eu.claude-opus-4-7`** (or Opus 4.8 if enabled + EU).
- **Drop** nova-lite, nemotron-nano (no structured output); **park** ministral-3b as a possible
  cascade tier-1 if cost ever dominates.

## Prereq before PASS 2 (load-bearing)

**Sharpen the `order_work` vs `forward` definition.** The models split exactly there, and per
operator input much "forward" is really customers-on-the-wrong-address → order_work after
quoted-body recovery. Lock the rule (likely: portal-PO + internal "maak order" = order_work;
forward only when a different department genuinely owns it) before the sweep, else PASS 2 measures
model noise, not corpus reality.

## Out of scope
- The actual 30k PASS 2 sweep (next step, once the definition is locked).
- Fine-tuning / few-shot prompt engineering (separate optimization).
- Non-EU models (PII); ran none on real data.
