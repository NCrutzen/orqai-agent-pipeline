---
sketch: 004
name: stage-2-resolver-attribution
question: "How does the 4-step resolver chain (thread → sender-map → identifier → LLM tiebreaker) surface inside the locked inline-expand pane so the operator sees AT A GLANCE which step won and how confident it was?"
winner: "vertical chain w/ expanded winner step"
tags: [stage-2, customer, resolver, attribution, p2, req-05, detail-pane]
---

# Sketch 004 — Stage 2 resolver-source attribution

## What's already shipped (verified in code 2026-05-21)

- `Stage2Widget` customer combobox (Phase 71-04 REVW-02): debounced 250ms, min 2 chars, max 20 results, format `{customer_name} · {nxt_account_id}` ✓
- `searchCustomers` server action over `coordinator_runs DISTINCT customer_account_id, customer_name` ✓
- `Stage2OverrideWidget` wrapper (Phase 88 Plan 02): Textarea note + EvalTypeRadio + recordVerdict POST + optimistic removal via `useSelection()` ✓
- "Re-run downstream stages with the corrected customer" Switch (off by default — costs LLM tokens) ✓
- `resolve-debtor.ts` 4-step resolver pipeline for debtor swarm ✓
- `email_labels.corrected_customer_account_id` column exists in schema ✓

## Gap (REQ-05)

The UI today shows the override widget but does NOT visualize *which resolver step won*. The operator can't tell at a glance whether a customer match came from:
- a high-confidence sender-map (always trust)
- a deterministic identifier extraction (verify the identifier)
- a low-confidence LLM tiebreaker (verify the candidates)

This sketch defines the **resolver-chain visualization** in the LEFT/Read column.

## Locked decisions before sketching

- **Inline-expand 2-col layout** carried from sketch 002.
- **Section pattern + email body + body toolbar + thread modal** carried from sketch 003.
- **Resolver chain visualization** = vertical list of all 4 steps with status badges. Winner step is highlighted (orange left-border) and shows its full detail; misses/not-runs are dimmed.

## How to View
```
open .planning/sketches/004-stage-2-resolver-attribution/index.html
```
Tab between **A | B** at the top.

## Variants
- **A — Clean sender-map match**: Step 1 (thread) miss · Step 2 (sender-map) ✓ matched 100% · Steps 3-4 not run. Winner step shows the exact mapping row + backend + promotion history. 0¢ cost.
- **B — LLM tiebreaker fired**: Steps 1-2 missed · Step 3 found 2 conflicting candidates · Step 4 LLM adjudicates at 72% confidence. Winner step shows both candidates inline + LLM reasoning + model + cost. Right column flags the low-confidence pick and pre-enables the "Re-run downstream" switch.

## What to Look For

1. **Single-glance attribution**: the verdict-pill in the section head (`sender-map` blue · `LLM tiebreaker` purple) tells you the resolver-source instantly. The vertical chain shows the path.
2. **Winner highlighting**: orange left-bar on the winning step + auto-expanded detail. Other steps stay collapsed (miss / not-run states).
3. **LLM tiebreaker candidates**: in Variant B, the LLM step's detail shows BOTH candidates (picked one in blue ●, alternative in dim text ○) so operator can see what the LLM was choosing between without expanding anything.
4. **Re-run switch state**: in Variant A (clean match) it's OFF by default (no need to re-run). In Variant B (LLM pick) it's ON by default (operator likely to override the customer → downstream draft must regenerate). Auto-toggles on when operator starts typing a different customer in the combobox.
5. **Confirm vs Override button**: same green/amber pattern. Confirms a sender-map match = "Confirm customer". Confirms an LLM pick = "Confirm LLM pick". Override = changing the combobox.

## Implementation dependencies (for plan-phase)

Backend additions needed:
- **Resolver-chain step trace**. Today `agent_runs` and `coordinator_runs` capture the final customer match but not the per-step trace. Need a structured record of which steps ran, miss/match/conflict status, and (for LLM tiebreaker) the candidates considered. Recommend: add a `decision_details JSONB` payload to `pipeline_events` at `stage=2` carrying `{steps: [{step: 'thread'|'sender_map'|'identifier'|'llm_tiebreaker', status: 'miss'|'matched'|'conflict'|'picked'|'not_run', confidence, detail}], winner: 1..4}`.
- **LLM tiebreaker candidate logging**: when Step 4 fires, store the alternative candidates it considered (account_id + name + supporting identifier) so the UI can show the path-not-taken. Today only the picked customer persists.

UI additions:
- **Resolver chain component** — new vertical-list visualization with step-state markers (matched/miss/conflict/llm-picked/not-run/winner). Sketch 005 (Stage 3 ranked-intent reorder) will likely reuse the same step-list idiom for ranked-intent visualization.
- **Auto-toggle re-run switch**: when operator starts typing in the customer combobox (dirty state), automatically flip the "Re-run Stage 3+4" switch to ON. Reduces missed re-runs on customer overrides.

Already covered (reused):
- `Stage2Widget` combobox: shape preserved, wrapped in a "current selection visible" header for the locked-in case.
- `EvalTypeRadio`: reused as-is.
- Notes textarea: reuses existing pattern from sketch 003.
- Body toolbar + thread modal: reused from sketches 002/003.

Out of scope (covered by later sketches):
- Cross-row pattern detection ("3 emails this week resolved by LLM tiebreaker to Van den Berg — should we add a sender-map for partner-co.nl?") → sketch 006.
- Promotion-recommender handoff for promoting LLM-aided matches to deterministic sender-map rows → sketch 007.
