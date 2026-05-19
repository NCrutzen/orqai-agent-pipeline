---
phase: 83
plan: 06
subsystem: stage-3 / coordinator / orq.ai input adapter
tags: [stage-3, coordinator, orq-ai, input-adapter, phase-83, d-04, d-06, d-08, d-09, d-10]
requires:
  - email_pipeline.emails.body_full_text (Plan 83-01)
  - email_pipeline.conversation_context (Plan 83-01)
  - body_full_text populated by ingest writer (Plan 83-03) + backfill (Plan 83-05)
provides:
  - assembleInput helper for Stage 3 (wrapped XML + truncation + telemetry)
  - Stage 3 prompt input is body_full_text-based with conversation_context priors
  - coordinator_runs / pipeline_events decision_details.input_size telemetry (D-09)
affects:
  - downstream Phase 85 (prompt v3 anchors on the wrapped <inbound_message>/<quoted_thread> shape)
  - downstream Phase 84 D-03 (static TENANT_DOMAINS list to swap for swarms.tenant_domains registry lookup)
  - downstream Phase 87 (retro-classification reads same body_full_text + conversation_context surface)
tech-stack:
  added: []
  patterns:
    - "Pure helper + deterministic SELECT inside step.run for Inngest replay-safety (CLAUDE.md §Inngest)"
    - "XML-tagged wrapped prompt structure (CLAUDE.md §Orq.ai)"
    - "Static literal list with TODO pointer to registry migration (Phase 84 D-03)"
key-files:
  created:
    - web/lib/automations/debtor-email/coordinator/assemble-input.ts
    - web/lib/automations/debtor-email/coordinator/__tests__/assemble-input.test.ts
  modified:
    - web/lib/automations/debtor-email/coordinator/invoke-intent.ts
    - web/lib/automations/debtor-email/coordinator/__tests__/invoke-intent-v2.test.ts
    - web/lib/inngest/functions/debtor-email-coordinator.ts
decisions:
  - "D-04 / D-06: Stage 3 prompt input is the wrapped <inbound_message>+<quoted_thread> XML structure"
  - "D-08: truncation prefers oldest non-tenant inbound prior + current inbound; drops middle priors with literal marker"
  - "D-09: hard cap 8000 chars; truncated flag + input_chars persisted on decision_details.input_size"
  - "D-10: coalesce body_full_text -> body_text -> event.data.body_text for not-yet-backfilled rows"
  - "TENANT_DOMAINS shipped as static list (smeba.nl, smeba-fire.be, moyneroberts.com) until Phase 84 D-03 lands swarms.tenant_domains"
metrics:
  duration_minutes: 12
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 3
  completed_date: 2026-05-19
---

# Phase 83 Plan 06: Stage 3 Input Adapter Summary

Stage 3 input adapter now reads `body_full_text` (with `body_text` fallback) and inlines `conversation_context` priors into a wrapped `<inbound_message>` + `<quoted_thread>` XML structure. D-08 truncation preserves the oldest non-tenant inbound prior plus the current inbound at the 8000-char hard cap (D-09); telemetry (`input_chars`, `truncated`) lands on `pipeline_events.decision_details.input_size` per the single-writer rule.

## RFC Compliance

Hard separation rule UNCHANGED. This plan touches only the Stage 3 **input shape**:
- No `swarm_noise_categories` reads (Stage 1 stays a noise-only filter).
- No `swarm_intents` writes (Stage 3 dispatcher behaviour unchanged).
- `docs/agentic-pipeline/stage-3-coordinator.md` ranked-intent contract is honoured — the classifier still returns `IntentAgentOutputV2`, ranked-intent persistence is unchanged.

## What Shipped

### Task 1 — `assembleInput` helper (commits `cd07143` RED + `1609235` GREEN)

Pure helper that takes `(subject, bodyFull, priors, tenantDomains, capChars)` and emits:

```
<inbound_message>
  <subject>{escaped}</subject>
  <body>{escaped}</body>
</inbound_message>
<quoted_thread>
  <prior position="1" from="…" received="…">…</prior>
  <prior position="2" from="…" received="…">…</prior>
</quoted_thread>
```

Truncation logic (D-08):
1. Baseline render ≤ cap → `truncated=false`, return.
2. Over cap → scan priors in REVERSE position order (highest position = oldest). Pick the first prior whose sender domain is NOT in `tenantDomains` (lowercase equality). Re-render with that prior as the only kept prior; insert literal marker `[truncated: N messages dropped from middle of thread]`.
3. No non-tenant prior identifiable → greedy keep-most-recent, insert `[truncated: kept most recent {N} priors]`. Hard-slice to cap as last-resort safeguard.

Telemetry returned: `{ text, inputChars, truncated }`.

**Tests:** 7/7 vitest pass (empty priors, 2 priors ASC, below cap, over cap with non-tenant origin, fallback newest-first, tenant detection edge, `inputChars=text.length`).

### Task 2 — `invoke-intent` prompt switch (commit `7ccb07f`)

`InvokeIntentInput.assembled_input` is now required. `buildUserMessage` emits a `<context>` XML block (email_id, run_id, sender_email, sender_domain, mailbox, entity) followed by `assembled_input` and the return-instruction. No more `JSON.stringify(promptVars)` blob in the prompt body — the prior key-sorted JSON path is gone (`grep -c "JSON.stringify"` inside `buildUserMessage` returns 0).

`body_text`, `subject`, `received_at` remain in the Orq `variables` payload for trace visibility but are NOT interpolated into the prompt text. Replay-safety holds because `assembled_input` is deterministic for a given `(email_id, conversation_context state)` pair.

**Tests:** invoke-intent-v2 fixture extended with `assembled_input`; full coordinator vitest suite (26/26) green.

### Task 3 — Coordinator Inngest wiring + D-09 telemetry (commit `49e202a`)

Inside the existing `classify-intent` step.run boundary:

1. SELECT `emails(body_full_text, body_text)` by `email_id`. `bodyFull = body_full_text ?? body_text ?? event.data.body_text ?? ""` (D-10 fallback).
2. SELECT `conversation_context(position, sender_email, subject, received_at, body_text)` ordered `position ASC`.
3. Call `assembleInput` with `TENANT_DOMAINS = ["smeba.nl", "smeba-fire.be", "moyneroberts.com"]` and `capChars=8000`. TODO comment points at Phase 84 D-03 swap to `swarms.tenant_domains` registry lookup (T-83-19 mitigation).
4. Pass `assembled.text` as `assembled_input` to `invokeIntentAgent`.

Telemetry (D-09): the existing pipeline_events emit inside `persist-ranked` gains `decision_details.input_size = { input_chars, truncated }`. No second `decision_details` writer was introduced (the single-helper rule in the plan).

**Replay-safety:** the two SELECTs + `assembleInput` + `invokeIntentAgent` call all live inside the SAME `classify-intent` step.run. No `crypto.randomUUID()` or `Date.now()` is introduced outside step boundaries.

## Verification

- `cd web && ./node_modules/.bin/vitest run lib/automations/debtor-email/coordinator/__tests__ lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` → 35 passed / 13 skipped (skipped are pre-existing Phase 80 Wave-2 migrations).
- `cd web && ./node_modules/.bin/tsc --noEmit` → clean on all three touched files (one pre-existing unrelated error in `lib/stage-0/strip-quoted-history.ts` for the missing `email-reply-parser` dep — out of scope per the plan's scope-boundary rule).
- Acceptance greps all met:
  - `assemble-input.ts` — `inbound_message` ×3, `quoted_thread` ×3, `messages dropped from middle of thread` ×1, `kept most recent` ×3
  - `invoke-intent.ts` — `assembled_input` ×8, `JSON.stringify` inside `buildUserMessage` = 0
  - `debtor-email-coordinator.ts` — `body_full_text` ×6, `assembleInput` ×3, `conversation_context` ×3, `input_size` ×2

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Truncation test fixture mis-aligned with D-08 rule**

- **Found during:** Task 1 GREEN run
- **Issue:** The RED test fixture placed "ORIGINEEL DEBITEUR BERICHT" at position=3 with a separate non-tenant prior at position=4. The plan's D-08 rule mandates scanning priors in REVERSE position order and picking the FIRST non-tenant — that's position=4, not position=3. Test contradicted the rule it was meant to pin.
- **Fix:** Swapped the fixture so position=3 is a tenant-domain prior (`info@smeba.nl`) and position=4 is the originating non-tenant debtor message. Now the deterministic rule picks the intended prior. No logic change — the helper already matched the plan's stated semantics; only the fixture was wrong.
- **Files modified:** `web/lib/automations/debtor-email/coordinator/__tests__/assemble-input.test.ts`
- **Commit:** `1609235` (folded into Task 1 GREEN)

**2. [Rule 3 - Blocking] Missing `node_modules` in worktree**

- **Found during:** Task 1 RED run
- **Issue:** Worktree had no `web/node_modules/` so `vitest` failed at startup.
- **Fix:** Symlinked `web/node_modules` → main repo's `web/node_modules`. Pure local-dev unblock — not committed (untracked symlink).
- **Files modified:** none committed.

### Out-of-Scope Observations

- `lib/stage-0/strip-quoted-history.ts` references `email-reply-parser` with no installed types/module. Pre-existing — not in scope for this plan (Stage 0 file; this plan only touches Stage 3 input adapter). Logged here for visibility; deferred to its owning phase.

## Known Stubs

None. The static `TENANT_DOMAINS` constant is an intentional D-08 fallback documented inline with a TODO pointer at Phase 84 D-03 (T-83-19 mitigation in the threat model).

## Threat Flags

No new trust boundaries introduced beyond those already in the plan's `<threat_model>`. Wider PII surface (T-83-18) and token-bloat (T-83-20) mitigations are wired (D-09 cap + telemetry).

## Self-Check: PASSED

- `web/lib/automations/debtor-email/coordinator/assemble-input.ts` — FOUND
- `web/lib/automations/debtor-email/coordinator/__tests__/assemble-input.test.ts` — FOUND
- `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` — modified (assembled_input ×8)
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — modified (body_full_text ×6)
- Commit `cd07143` (RED) — FOUND
- Commit `1609235` (Task 1 GREEN) — FOUND
- Commit `7ccb07f` (Task 2) — FOUND
- Commit `49e202a` (Task 3) — FOUND

## TDD Gate Compliance

- RED gate: `test(83-06): pin assembleInput contract (RED)` — commit `cd07143`.
- GREEN gate: `feat(83-06): assembleInput — D-04 wrap + D-08/D-09 truncation` — commit `1609235`.
- REFACTOR gate: not required (helper implemented in a single GREEN pass; no follow-up clean-up commit needed).
