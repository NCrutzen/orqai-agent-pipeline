---
phase: 63
plan: 02
subsystem: docs/agentic-pipeline
tags: [rfc, docs-only, stage-docs, debtor-email]
requires:
  - "Wave 1 contracts (63-01): context-shape-contract.md, override-model.md, graduated-automation.md"
provides:
  - "Stage 0 input-safety doc (forward-ref Phase 64 SAFE-01..04 + BUDG-01)"
  - "Stage 1 regex routing doc (cites classify.ts + classifier-verdict-worker.ts)"
  - "Stage 2 entity enrichment doc (cites resolve-debtor.ts; emits PipelineStageContext)"
  - "Stage 3 ranked-intent coordinator doc (Stage 3.5 escalation as principle + placeholder)"
  - "Stage 4 handler doc (cites zapier_tools migration + nxt-zap-client.ts; allowed_for_intents forward-ref)"
affects:
  - "Wave 3 (63-03) README will index these five files"
  - "CLAUDE.md update in 63-03 promotes docs/agentic-pipeline/README.md to canonical"
tech-stack:
  added: []
  patterns:
    - "ATX-headed markdown matching docs/debtor-email-pipeline-architecture.md style"
    - "ASCII flow diagrams using glyphs ↓ ├─ │ └─ ┌─ ┐ from existing debtor doc"
    - "Cross-references to Wave 1 contracts (no field duplication)"
key-files:
  created:
    - docs/agentic-pipeline/stage-0-safety.md
    - docs/agentic-pipeline/stage-1-regex.md
    - docs/agentic-pipeline/stage-2-entity.md
    - docs/agentic-pipeline/stage-3-coordinator.md
    - docs/agentic-pipeline/stage-4-handler.md
  modified: []
decisions:
  - "Stage 2 omits Anthropic citation entirely (plan permitted: 'cite ONCE only if helpful, otherwise omit') -- Stage 2 is pre-LLM enrichment that feeds the chained workflow, not itself an Anthropic pattern"
  - "Real debtor-email category keys cited verbatim from web/lib/debtor-email/classify.ts: auto_reply, ooo_temporary, ooo_permanent, payment_admittance, unknown (verified at write-time)"
  - "Reference handler agent name debtor-copy-document-body-agent stated as the worked example per CONTEXT D-07"
  - "Stage 3.5 escalation rendered as ASCII decision diamond inline (Claude's discretion per CONTEXT) -- principle + placeholder, not full design (deferred to Phase 65)"
metrics:
  duration: "~5m"
  tasks_completed: 5
  files_created: 5
  files_modified: 0
  commits: 5
  completed: "2026-04-30"
---

# Phase 63 Plan 02: Per-Stage Architecture Docs Summary

Five self-contained per-stage architecture docs that together describe the v8.0 funnel shape: Stage 0 input safety (forward-ref Phase 64), Stage 1 regex routing (shipped today, debtor-email worked example), Stage 2 entity enrichment (shipped today, emits the Wave 1 contract), Stage 3 ranked-intent coordinator (Phase 65, escalation principle + placeholder here), Stage 4 handler agents (zapier_tools registry shipped, allowed_for_intents Phase 64). Wave 1 contracts are cross-referenced, never duplicated.

## What Was Built

### `docs/agentic-pipeline/stage-0-safety.md`

Input safety stage as Constitutional Classifier in front of the chained workflow. Three verdicts: `safe`, `injection_suspected` (human-only review, never reaches downstream LLMs), `over_budget`. Today-state is honest: NOT YET SHIPPED, Phase 64 implements `SAFE-01..04` plus per-run cost ceilings under `BUDG-01`. Anthropic URL cited once. Implementation patterns linked out to `../orqai-patterns.md`. ASCII diagram uses the canonical glyph set from `docs/debtor-email-pipeline-architecture.md`.

### `docs/agentic-pipeline/stage-1-regex.md`

Anthropic "routing" pattern made concrete: `swarm_categories.action` is the dispatch switch (`categorize_archive` vs `swarm_dispatch`). Worked example cites [`web/lib/debtor-email/classify.ts`](../../web/lib/debtor-email/classify.ts) and [`web/lib/inngest/functions/classifier-verdict-worker.ts`](../../web/lib/inngest/functions/classifier-verdict-worker.ts) with real category keys verified at write-time: `auto_reply`, `ooo_temporary`, `ooo_permanent`, `payment_admittance`, `unknown`. Sales-email parallel block is 5 lines (well under the 10-line limit) with illustrative-only categories `new_lead`, `follow_up`, `unsubscribe` tagged `(illustrative -- Phase 73 ships actual sales-email categories)`. Axis 1 + regex-rule promotion cross-refs to Wave 1 docs.

### `docs/agentic-pipeline/stage-2-entity.md`

Deterministic-first enrichment pipeline (thread -> sender map -> identifier extraction -> LLM tiebreaker). Cites [`web/lib/automations/debtor-email/resolve-debtor.ts`](../../web/lib/automations/debtor-email/resolve-debtor.ts). Per-brand routing today: `debtor.labeling_settings.brand_id` (2-letter NXT code) + `debtor.labeling_settings.nxt_database`. Output contract is linked to [`./context-shape-contract.md`](../../docs/agentic-pipeline/context-shape-contract.md) -- not duplicated (verified `grep -E "interface PipelineStageContext"` returns nothing). Cross-swarm pluggability section explains how a SugarCRM-backed sales swarm reuses the same shape. Anthropic citation omitted per plan permission.

### `docs/agentic-pipeline/stage-3-coordinator.md`

Ranked intent list per CORD-01; single-shot default plus Stage 3.5 escalation. Stage 3.5 rendered as an ASCII decision diamond covering the three escalation conditions (confidence < threshold OR intent_count >= 3 OR `requires_orchestration` flag), then a one-line "spawn orchestrator-worker -> see Phase 65". The mechanics are **not** designed here; that's Phase 65 (CORD-02..04). Sales-email parallel block: `qualify_lead`, `schedule_demo`, `route_to_account_owner` tagged illustrative. Axis 3 honest: NOT YET CAPTURED today.

### `docs/agentic-pipeline/stage-4-handler.md`

Bounded single-shot handler pattern. Reference agent `debtor-copy-document-body-agent`. Tool registry cites [`supabase/migrations/20260429_zapier_tools_registry.sql`](../../supabase/migrations/20260429_zapier_tools_registry.sql) with all today columns enumerated; canonical client cites [`web/lib/automations/debtor-email/nxt-zap-client.ts`](../../web/lib/automations/debtor-email/nxt-zap-client.ts). Seeded NXT tool rows named: `nxt.contact_lookup`, `nxt.identifier_lookup`, `nxt.candidate_details`, `nxt.invoice_fetch`. `allowed_for_intents` explicitly marked as Phase 64 (BUDG-02) forward-reference -- column does NOT exist today. Stack constraints section enumerates `playwright-core` not `playwright`, NXT-S3 via Zapier SDK, Orq.ai Router for LLM calls. Output plumbing single line cross-links to `../swarm-bridge-contract.md` (sibling concern, UI plumbing).

## Verification

All 5 plan tasks' acceptance criteria pass. Plan-level verification:

- All five files exist under `docs/agentic-pipeline/`.
- No `smeba-uk` / `smeba-ie` strings anywhere in `docs/agentic-pipeline/`.
- No stack-violation strings (Netlify / Railway / Firebase / Neon / Puppeteer) anywhere in `docs/agentic-pipeline/`.
- Anthropic URL appears at most once per file (counts: 0-safety=1, 1-regex=1, 2-entity=0, 3-coordinator=1, 4-handler=1).
- Sales-email parallel blocks present only in stage-1 + stage-3, both tagged `(illustrative -- Phase 73 ships ...)`.
- Stage 0 + Stage 4 today-state honest (Stage 0 NOT YET SHIPPED; Stage 4 zapier_tools real, allowed_for_intents forward-ref).
- Wave 1 contracts cross-referenced, not duplicated (`grep -E "interface PipelineStageContext"` returns zero hits in stage-2 and stage-3 docs as required).

## Cross-References to Wave 1 (Verified)

- `stage-2-entity.md` -> `./context-shape-contract.md` (producer; output shape link only).
- `stage-3-coordinator.md` -> `./context-shape-contract.md` (consumer; input shape link only).
- `stage-1-regex.md`, `stage-2-entity.md`, `stage-3-coordinator.md`, `stage-4-handler.md` each link the matching axis in `./override-model.md` (axes 1, 2, 3, 4 respectively).
- All four LLM-touching stages (1, 2, 3, 4) link the matching hook in `./graduated-automation.md`.

## Real Names Verified at Write-Time

| Item | Verification | Source |
|---|---|---|
| `classify.ts` category keys | `grep "category:" web/lib/debtor-email/classify.ts` | Returned `auto_reply`, `ooo_temporary`, `ooo_permanent`, `payment_admittance`, `unknown`. |
| `resolve-debtor.ts` exists at cited path | `test -f` | Confirmed. |
| `nxt-zap-client.ts` exists at cited path | `test -f` | Confirmed. |
| `20260429_zapier_tools_registry.sql` exists at cited path | `test -f` | Confirmed. |
| `swarm-bridge-contract.md` cross-link target exists | `test -f` | Confirmed. |
| `debtor-copy-document-body-agent` | RESEARCH.md "Existing handler agents in Orq.ai" + plan D-07 | Named exactly per plan/CONTEXT. |

## Deviations from Plan

### Auto-fixed Issues

None. The plan was followed exactly as written.

### Plan-Permitted Choices Made

**1. Stage 2 omitted Anthropic citation entirely.**

The plan stated: "this is NOT a pattern from the Anthropic post -- it's pre-LLM enrichment that feeds the chained workflow. Cite the Anthropic URL ONCE only if helpful (paraphrase: 'tools-first, LLM only when tools are insufficient'). Otherwise omit citation." Stage 2 has no Anthropic URL because the citation would not have added value in that file -- the "tools-first" framing was paraphrased into our own voice without a URL. This is exactly the path the plan permitted.

**2. Stage 3.5 rendered as ASCII decision diamond plus one-line spawn.**

CONTEXT explicitly left this to Claude's discretion: "default: include the principle + a placeholder, full design lands in Phase 65." A 7-line ASCII diamond covering the three escalation conditions plus a single line "spawn orchestrator-worker (Phase 65)" hits the principle + placeholder shape without front-running Phase 65's mechanics design.

## Authentication Gates

None. Docs-only phase with no external services touched.

## Threat Flags

None. Docs-only phase introduces no new network endpoints, auth paths, file-access patterns, or schema changes. Phase scope explicitly precludes any executable surface.

## Self-Check: PASSED

- `docs/agentic-pipeline/stage-0-safety.md` exists.
- `docs/agentic-pipeline/stage-1-regex.md` exists.
- `docs/agentic-pipeline/stage-2-entity.md` exists.
- `docs/agentic-pipeline/stage-3-coordinator.md` exists.
- `docs/agentic-pipeline/stage-4-handler.md` exists.
- Commit `124ff21` exists in `git log` (Task 1).
- Commit `6bff222` exists in `git log` (Task 2).
- Commit `7425e6f` exists in `git log` (Task 3).
- Commit `1f1f5b7` exists in `git log` (Task 4).
- Commit `046a91b` exists in `git log` (Task 5).
- Phase-wide grep checks pass: no `smeba-uk`/`smeba-ie`, no stack-violation strings, Anthropic URL count <= 1 per file.
