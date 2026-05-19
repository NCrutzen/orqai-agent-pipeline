# Phase 82.9 — Stage 2 audit-panel evidence expansion

**Status:** Planned (logged 2026-05-19). Not yet executed.
**Source:** Operator UAT 2026-05-19 — "For stage 2 I want to see all the input and AI reasoning as well." Same expansion plan applied inline for Stage 3 (no phase needed there because the data already lived in `decision_details.ranked[]`).

## Why this needs a phase (not inline)

Stage 3's audit-panel expansion was a UI-only unlock — the runtime already wrote per-intent reasoning, sub_type, and document_reference into `pipeline_events.decision_details.ranked[]`. Showing it required no writer change and zero risk to live runs.

Stage 2 is the opposite: today's writer (`classifier-label-resolver.ts:209-222`) persists only `{method, customer_account_id, customer_name, candidates_considered: number}` — the candidate list (with names), matched invoice identifiers, sender email, and LLM tiebreaker reasoning are computed in `resolve-debtor.ts` but **dropped before the INSERT**. To surface them, we must widen the writer payload — that's a runtime change, deserves a real plan + verification, and should land alongside a backfill decision.

## D-codes

- **D-01** `ResolveResult` widened with `inputs` (per-path) + `candidates: [{id, name}]` + LLM tiebreaker `reason` / `confidence_label` / `model`
- **D-02** `classifier-label-resolver.ts` writer copies the new fields into `decision_details` (pipeline_events)
- **D-03** `Stage2AuditPayload` extended; `Stage2EvidencePanel.tsx` adds INPUTS section + REASONING section (LLM path only) + full candidate list
- **D-04** `build-stage-audit-map.ts` Stage 2 bridge reads the new keys; legacy rows still degrade to the existing chip-only render
- **D-05** No backfill — Stage 2 candidate detail is reconstructible from NXT but expensive (per-row Zapier round-trip). Document the historical-row UX delta in the panel ("legacy run — limited evidence captured") instead.
- **D-06** Vitest coverage for the mapper bridge across all 5 method paths (thread_inheritance / sender_match / identifier_match / llm_tiebreaker / unresolved)

## Depends on

- Phase 82.3 (audit panel infra)
- Stage 2 mapper bridge — commit `35c2bed` (`fix(stage-2): bridge label-resolver evidence into audit panel`)

## Out of scope

- Stage 2 confidence chip mapping (already lands via existing `pipeline_events.confidence` column — Phase 82.x fix `d9e5f05` widened the SELECT)
- Stage 4 handler audit panel (no panel exists today; tracked separately if needed)
- Cross-swarm Stage 2 (sales-email swarm has no entity resolver yet)

## When to plan

After Phase 88 (next sequential roadmap item) — Phase 82.9 is a polish/observability phase, not a blocker. Operator workflow continues to function with the existing chip-only panel.
