---
phase: 69
plan: 05
wave: 5
status: complete
applied_at: 2026-05-04
operator: n.crutzen@icloud.com
---

# Phase 69 Wave 5 — Orq.ai prompt PATCH (live agent)

## What was applied

### Pre-flight: model catalog validation

`mcp__orqai-mcp__list_models` confirmed all 5 IDs on the live agent are in the catalog:

- Primary: `aws/eu.anthropic.claude-opus-4-6-v1` ✓
- Fallback chain: `openai/gpt-4o`, `google-ai/gemini-2.5-pro`, `anthropic/claude-sonnet-4-5-20250929`, `mistral/mistral-large-2411` (all ✓)

RESEARCH.md A5 had flagged `mistral/mistral-large-latest` as a potential issue based on the in-repo spec file; the LIVE agent already had the correct dated pin (`mistral-large-2411`). No model fix needed during this PATCH.

### Baseline capture

`mcp__orqai-mcp__get_agent debtor-copy-document-body-agent` (agent_id `01KQECMBEMRKX28E0F0T64A43K`) appended verbatim to `orq-baseline-prompt.txt` under the `WAVE 5 LIVE CAPTURE` heading.

### PATCH applied

`mcp__orqai-mcp__update_agent` invoked with `versionDescription = "Phase 69 (CANO-01): swap hardcoded entity_register block for parameterised brand_register; bump body_version 2026-04-23.v1 → 2026-05-04.v2; data-driven brand list per swarms.entity_brand registry."`

**Changes vs live baseline:**

1. **`<body_version>` bump:** `2026-04-23.v1` → `2026-05-04.v2`. Matches `BODY_VERSION` constant in `web/lib/automations/debtor-email/coordinator/types.ts` (Wave 3 commit `a94b5b1`).
2. **Removed:** `<entity_register>` block hardcoding 5 brands (smeba, berki, sicli-noord, smeba-fire, sicli-sud) with prose register treatment per brand.
3. **Added:** `<brand_register>` block describing the per-invocation `brand_register` input object (code, display_name, register_language, register_dialect, signoff_phrase, formal_address) and how to use each field. Team-line construction parameterised by `register_language`.
4. **`<task_handling>`:** "Match entity register: NL-NL (Smeba, Berki) vs Flemish-BE…" line replaced with "Match register, dialect, pronoun, signoff, and team line strictly per the `<brand_register>` block — values come from the per-invocation `brand_register` object on the input."
5. **`<closing_matrix>`:** Closing structure made explicit (service line → `<br>` → signoff_phrase → `<br>` → team line). Brand-specific closing rules removed; signoff is now driven by `brand_register.signoff_phrase`.
6. **`<constraints>`:** Added "Do NOT mention or speculate about brands other than the one in `brand_register`." Guards against cross-brand context bleed (T-69-02 threat).
7. **Examples (3):** Updated input shorthand to include the new `brand_register` object; output `body_version` literals bumped to `2026-05-04.v2`; example 2 demonstrates `en-GB` dialect with "Kind regards" signoff (proves CANO-04 works for a non-pre-seeded brand-form on smeba); example 3 (sicli-sud) updated to use `Cordialement,<br>` signoff line.

**Preserved verbatim** (per CLAUDE.md `cba7352b` learning):
- `model.id` and `model.fallback_models` (5 IDs)
- `settings.max_iterations=1`, `settings.max_execution_time=45`, `settings.max_cost=0`, `settings.tool_approval_required=respect_tool`, `settings.tools=[]`
- `display_name`, `description`, `role`
- `memory_stores=[]`, `knowledge_bases=[]`, `team_of_agents=[]`

### Verification

`mcp__orqai-mcp__get_agent` post-PATCH returned the new instructions verbatim. Confirmed:
- `<body_version>2026-05-04.v2</body_version>` present in 4 places (header, output_format, 3 example outputs).
- `<brand_register>` block present at expected position.
- No `<entity_register>` block remains.
- Model chain unchanged from baseline.
- Settings unchanged from baseline.

## Sequencing notes

Per CONTEXT.md D-19: Vercel deploy (Wave 4 code → production via push to main, GH Actions run `25322335725`, deploy confirmed by operator at 14:30 CEST) preceded Orq PATCH by ~10 min. Window of risk where Vercel runs new shape against old prompt: zero — the deploy was confirmed before PATCH was applied.

## Requirements satisfied

- **CANO-01** — `debtor-copy-document-body-agent` accepts the canonical context shape; entity_register block parameterised; cross-swarm reusable.

## Outstanding

- The in-repo spec `Agents/debtor-email-swarm/agents/debtor-copy-document-body-agent.md` still carries the OLD prompt text (786 lines). It is the paste-source for re-syncing to Orq Studio; if it diverges from live, future re-pastes would regress. Wave 7 (docs) brings the spec into alignment.
- Wave 6 (LIVE_SMOKE=1 — 1 debtor + 1 sales-stub + 1 UK live invocation) still pending. Operator-gated.

## Threat-model coverage

- **T-69-01** (prompt injection via brand_register field values) — mitigated: brand_register fields are server-set from `swarms.entity_brand` registry; values are operator-controlled, not user-controlled. The `Do NOT mention or speculate about brands other than the one in brand_register` constraint reinforces against any in-band attack.
- **T-69-02** (cross-brand context bleed) — mitigated: prompt only ever sees ONE brand's metadata per invocation; explicit constraint forbids speculation about other brands.
- **T-69-15** (Orq PATCH drops response_format) — N/A: agent has no `model.parameters.response_format` set; response_format enforced per-call by `client.ts` via `jsonSchemaName`. Verified preserved (still empty/unset post-PATCH).
- **T-69-16** (stale `mistral-large-latest` ID) — mitigated: `list_models` pre-flight confirmed all 5 IDs valid; live agent already had the correct dated pin.
