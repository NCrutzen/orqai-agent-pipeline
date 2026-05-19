# Phase 85: Stage 3 prompt v3 — intent definitions, per-intent few-shot, and open-set output schema - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning
**Source:** Live `debtor-intent-agent` prompt fetched from Orq.ai 2026-05-19 (https://my.orq.ai/cura/agents/01KQECK191GE21CH8D8KEMTM9J)
**Milestone:** v8.1 "Validation + Visibility" — observe → understand → THEN automate. Phase 85 lifts the **classifier's expressivity** so V8.1's observations reflect what the agent actually knows, and so Phase 86 has a structured channel for novel-intent proposals.
**Depends on:** Phase 83 lands first (full-thread input makes prompt changes meaningful). Phase 84 can ship in parallel.

<domain>

## Phase Boundary

**Problem 1 — calibration is starving.** The live Stage 3 prompt has *no per-intent descriptions* and 3 few-shot examples covering 3 of 8 intents. Five intents (`payment_dispute`, `peppol_request`, `credit_request`, `contract_inquiry`, `other`) have **zero examples**. The agent leans almost entirely on key-name semantics. Consequence in May 2026 distribution: `payment_dispute` absorbs credit-note requests, PO-mismatch returns, and even portal status updates; `general_inquiry` and `other` become catch-alls.

**Problem 2 — closed-list is a vocabulary cap.** The output schema enforces `intent ∈ enum(...)` with no escape hatch. When an email genuinely doesn't fit (e.g. a WKA chain-liability data request, a Coupa PO notification, an acknowledgement), the agent is forced to pick the closest mismatch. We lose the signal that a *new* intent is needed.

**Solution:** ship a new prompt + schema version (intent_version = `2026-05-19.v3`) that:
1. Adds an `<intent_definitions>` block — one paragraph per existing intent describing what it covers, what it doesn't, and the boundary against neighbours (especially `credit_request` vs `payment_dispute` and `general_inquiry` vs `other`).
2. Adds at least one few-shot example per intent (8 examples minimum, focused on the disambiguation boundaries that hurt today).
3. Bumps the output schema to V3: adds `intent_proposal: string|null` and `proposal_reason: string|null`. Closed-list `intent` is unchanged — Stage 4 dispatch stays deterministic. The proposal fields are *additive* and consumed by Phase 86's capture surface.

**Scope: prompt + schema + agent config only.** No new infrastructure beyond what Phase 86 builds. Stage 4 dispatch is unaffected.

</domain>

<decisions>

## Implementation Decisions

### D-01 — Prompt v3 structure

Add a new `<intent_definitions>` block between `<intent_vocabulary>` and `<confidence_rubric>`. Format per intent:

```
<intent name="payment_dispute">
  Scope: sender disputes an invoice's amount, line items, references,
  or VAT — explicit rejection or hold on payment until corrected.
  Boundary: if the sender's primary ask is a credit note for an already-
  accepted invoice (correction by credit, not dispute), prefer
  credit_request. If the sender attaches a structured return-of-invoice
  template (PO mismatch, missing reference), this stays payment_dispute.
</intent>
```

One block per existing intent. Each block ends with a one-line "boundary" sentence against the nearest-neighbour intent. The disambiguation table (D-02) backs this.

### D-02 — Disambiguation table (authoritative boundaries)

Six boundary pairs that today's prompt cannot resolve. The prompt encodes the "if X then Y" rules:

| Pair | Rule |
|---|---|
| `payment_dispute` vs `credit_request` | If sender disputes amount and *also* requests a credit note → `payment_dispute` ranked-top, `credit_request` ranked-2nd. Pure credit note request without dispute → `credit_request` top. |
| `general_inquiry` vs `other` | `general_inquiry` = sender asks a question Moyne Roberts can answer (status, contact, process). `other` = informational, automated, or fundamentally off-topic. |
| `copy_document_request` vs `payment_dispute` | If sender asks for a copy *because* of a dispute → both ranked, `payment_dispute` top. If sender asks for a copy as routine administrative request → `copy_document_request` top. |
| `address_change` vs `general_inquiry` | Any explicit billing/delivery address update → `address_change` even when wrapped in other context. |
| `contract_inquiry` vs `general_inquiry` | `contract_inquiry` requires explicit reference to a contract / SLA / framework agreement. Generic "how do you handle X" stays in `general_inquiry`. |
| `peppol_request` vs `general_inquiry` | Any mention of Peppol identifier, e-invoicing setup, or routing → `peppol_request`. |

### D-03 — Few-shot examples target the boundaries

Existing prompt has 3 examples; all 3 are `copy_document_request` / `address_change` / `general_inquiry`. Add 8+ new examples weighted toward the boundaries from D-02:

- 2 × `payment_dispute` (one pure, one with credit-note ask)
- 1 × `credit_request` (pure, no dispute)
- 1 × `contract_inquiry` (with explicit contract reference)
- 1 × `peppol_request`
- 1 × `address_change` wrapped in copy-doc request
- 1 × `general_inquiry` (clarifying question, no specific intent)
- 1 × `other` (auto-reply or off-topic — must not be Stage 1 noise)

All examples sourced from real `email_pipeline.emails` rows, redacted, after Phase 83 lands (so the example body reflects what the agent will actually see).

### D-04 — Output schema V3 — adds `intent_proposal` + `proposal_reason`

New required keys at the top level of the ranked-intent output:

```json
{
  "ranked": [...],          // unchanged, still enum-constrained
  "language": "...",
  "urgency": "...",
  "intent_version": "2026-05-19.v3",
  "intent_proposal": null,           // NEW: free-text snake_case label or null
  "proposal_reason": null            // NEW: one-sentence justification, null when proposal is null
}
```

**Semantics:** `intent_proposal` is NON-NULL only when the agent judges that *none of the closed-list intents* covers the email well — confidence on the chosen top-1 would be `low` and the agent has a clear better label in mind. When `intent_proposal` is non-null, ranked top-1 is still required (best-fit), and `proposal_reason` explains why the closed list fell short.

**Schema constraint:** strict json_schema with `anyOf: [{type:string, maxLength:64, pattern:"^[a-z][a-z0-9_]*$"}, {type:null}]` — Orq.ai validator requires the anyOf form (CLAUDE.md rule).

### D-05 — Stage 3 dispatcher behaviour is unchanged

`stage-3-dispatcher.ts` continues to dispatch on the ranked-top `intent` (closed list). `intent_proposal` is *captured* by Phase 86 via `coordinator_runs.ranked_intents` JSONB extension or a new `intent_proposals` column on `coordinator_runs` — exact storage location decided in Phase 86 CONTEXT.

**Key: Phase 85 only changes the agent. Phase 86 changes the consumer.** Phase 85 can ship first and the proposal field is silently captured to logs until 86 builds the surface.

### D-06 — Orq.ai deployment workflow

Per CLAUDE.md:
1. `list_models` before update (validate model IDs against catalog).
2. `update_agent` (not create) — the agent already exists.
3. PATCH `model.parameters.response_format.json_schema.schema` with the V3 schema.
4. PATCH `instructions` with the new prompt v3.
5. `get_agent` after update to verify persistence.
6. Bump `intent_version` constant in `web/lib/automations/debtor-email/coordinator/types.ts` to `2026-05-19.v3`.
7. Update Zod schema (`intentAgentOutputSchemaV3`) in the same file.

### D-07 — Backward compat during transition

`coordinator-orchestrator.ts` accepts both V2 and V3 outputs for one release. If `intent_version === '2026-05-01.v2'` → ignore proposal fields. If V3 → persist proposal fields. Lets us roll back the Orq.ai prompt without breaking the consumer.

</decisions>

<scope>

## In scope

- Prompt v3 string (drafted in this phase, deployed via `update_agent`).
- json_schema V3 (strict, anyOf-nullable).
- ≥ 8 new few-shot examples drawn from real corpus.
- TS schema bump (`intentAgentOutputSchemaV3`) + INTENT_VERSION constant.
- Backward-compat parser in `coordinator-orchestrator.ts`.
- One smoke test via `mcp__orqai-mcp__invoke_agent` with a known-novel email confirming `intent_proposal` non-null path.

## Out of scope

- Storage surface for proposals → Phase 86.
- Promotion of proposals to `swarm_intents` → V9.0.
- Sales-email Stage 3 prompt — separate agent, separate phase (V10.0).

</scope>

<verification>

## Success criteria

1. **`get_agent` after deploy** returns prompt with `<intent_definitions>` block + 11+ few-shot examples + V3 json_schema + V3 intent_version literal.
2. **Smoke test:** invoke with the WKA-gegevens email (`Breman` sample from 2026-05-11) → `intent_proposal` is non-null and semantically reasonable (e.g. `wka_data_request` or similar).
3. **Smoke test (no false novelty):** invoke with a clean `copy_document_request` email → `intent_proposal` is null.
4. **Disambiguation regression:** the 12-email `payment_dispute` sample from 2026-05-19 session re-classifies with at most 1 of 12 changing top-1 (we're not breaking what works, just sharpening boundaries).
5. **No Stage 4 dispatch regression:** existing `invoice_copy_request` handler continues to receive its events.

</verification>

<dependencies>

## Depends on

- **Phase 83** must land first — otherwise the new prompt is reading the same impoverished input and the disambiguation rules can't be evaluated honestly.

## Enables

- **Phase 86** — proposal field is the input to the cluster/discovery surface.
- **Phase 87** — re-classification baseline needs the new schema.
- **V9.0 Learning Inbox** — proposals are the substrate the synthesis layer reads.

</dependencies>

<risks>

## Risks

- **R-01 — Over-eager proposals.** Agent fills `intent_proposal` on emails that *do* fit the closed list, inflating cluster noise. Mitigation: prompt v3 explicit rule "proposal_reason MUST start with: 'No closed-list intent fits because…'" + smoke test #3 above.
- **R-02 — Under-eager proposals.** Agent refuses to propose, keeps stuffing into `other`. Mitigation: one of the 11 few-shot examples explicitly demonstrates a non-null `intent_proposal`.
- **R-03 — Token budget tightens.** New `<intent_definitions>` block + 8 more examples adds ~2-3k input tokens per call. Sonnet 4.5 absorbs this without problem; cost impact is negligible at current volumes. Monitor `agent_runs.token_usage` post-deploy.
- **R-04 — Schema validator failure.** Orq.ai's json_schema validator has historically rejected `type:["string","null"]` (CLAUDE.md learning `3970bad9`). Mitigation: D-04 explicitly uses anyOf form.
- **R-05 — Catalog-invalid model ID.** Orq.ai accepts unknown IDs silently (CLAUDE.md learning `f980a2a1`). Mitigation: D-06 step 1 (`list_models` before update).

</risks>
