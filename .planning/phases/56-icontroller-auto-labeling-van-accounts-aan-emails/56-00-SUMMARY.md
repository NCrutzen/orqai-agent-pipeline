---
phase: 56
plan: 00
subsystem: debtor-email-labeling
tags: [migration, scaffolding, wave-0, browserless, llm-tiebreaker, nxt-zap, inngest-cron]
requires:
  - public.classifier_rules CHECK (Phase 60-00)
  - debtor.email_labels base schema (20260423_debtor_email_labeling.sql)
  - lib/classifier/wilson wilsonCiLower (Phase 60)
  - lib/automations/icontroller/session openIControllerSession (Phase 55)
  - lib/browser captureScreenshot
provides:
  - probe-label-ui.ts source (operator runs in Wave 1, plan 56-03)
  - nxt-zap-client.ts (Bearer + lookup_kind + Zod-validated response)
  - llm-tiebreaker.ts (json_schema strict + post-validate selection in candidates)
  - resolve-debtor.ts (4-layer pipeline thread → sender → identifier → unresolved)
  - label-email-in-icontroller.ts skeleton (selectors TODO until probe lands)
  - labeling-flip-cron.ts skeleton (pure pickAction unit-tested; FLIP_N_MIN=50)
  - 9 vitest scaffolds under web/tests/labeling/ (10 real tests GREEN, 18 todos)
  - migration extending classifier_rules.kind to include 'label_resolver',
    additive columns on email_labels, label_dashboard_counts RPC
affects:
  - public.classifier_rules (CHECK extension; +1 seeded row)
  - debtor.email_labels (+6 columns, +3 indexes)
  - debtor.labeling_settings (+nxt_database column)
tech-stack:
  added:
    - Inngest scheduled function (per-mailbox flip cron)
  patterns:
    - Pre-fetched LLM context (D-12) - no agent tool-use loop
    - Cookie-shared Browserless session (cleanup + labeling reuse)
    - Wilson math reuse with INLINE N>=50 gate (Pitfall 3 protection)
    - Cron string in `//` comment, never `/** */` (Pitfall 4 protection)
key-files:
  created:
    - supabase/migrations/20260428_debtor_email_labeling_phase56.sql
    - web/lib/automations/debtor-email/probe-label-ui.ts
    - web/lib/automations/debtor-email/nxt-zap-client.ts
    - web/lib/automations/debtor-email/llm-tiebreaker.ts
    - web/lib/automations/debtor-email/resolve-debtor.ts
    - web/lib/automations/debtor-email/label-email-in-icontroller.ts
    - web/lib/inngest/functions/labeling-flip-cron.ts
    - web/tests/labeling/route.test.ts
    - web/tests/labeling/resolve-debtor.test.ts
    - web/tests/labeling/nxt-zap-client.test.ts
    - web/tests/labeling/llm-tiebreaker.test.ts
    - web/tests/labeling/label-email-in-icontroller.test.ts
    - web/tests/labeling/flip-cron.test.ts
    - web/tests/labeling/page.test.tsx
    - web/tests/labeling/drawer.test.tsx
    - web/tests/labeling/actions.test.ts
  modified: []
decisions:
  - Dual-write debtor_id + customer_account_id during D-27 transition (drop in follow-up phase).
  - Probe ships its source code in Wave 0; the operator-run + artifact happen in Wave 1 (56-03).
  - flip-cron.ts is NOT registered in the Inngest manifest yet (deferred to Wave 4 plan 56-07).
  - label module's apply path throws explicitly until probe artifact lands; idempotency branches GREEN early.
metrics:
  duration: ~25 min
  completed: 2026-04-28
---

# Phase 56 Plan 00: Wave 0 Pure-Code Scaffolding Summary

Wave 0 ships every pure-code artifact downstream waves consume: the additive migration SQL, the probe-script source code (operator runs it in Wave 1), six new module files (NXT-Zap client, LLM tiebreaker, resolve-debtor, label-email skeleton, flip-cron skeleton), and 9 vitest test scaffolds. No live-DB writes, no operator dependencies, no Browserless calls.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Additive migration + 9 vitest test scaffolds (RED) | `d93c84e` |
| 2 | Probe source + NXT-Zap client + LLM tiebreaker + resolve-debtor pipeline | `3ba7d0b` |
| 3 | Browserless label module skeleton + flip-cron skeleton | `25e05b6` |

## Files Created (16)

### Migration (1)
- `supabase/migrations/20260428_debtor_email_labeling_phase56.sql` — extends `classifier_rules.kind` CHECK to include `label_resolver`; adds `nxt_database` to `labeling_settings`; adds `nxt_database`, `customer_account_id`, `reviewed_by`, `reviewed_at`, `screenshot_before_url`, `screenshot_after_url` to `email_labels`; 3 indexes; seeds `resolver:invoice_legacy_regex` row; defines `public.label_dashboard_counts(p_nxt_database text DEFAULT NULL)` RPC.

### Modules (6)
- `web/lib/automations/debtor-email/probe-label-ui.ts` (~150 lines) — read-only label-DOM probe. Uses default `openIControllerSession`. Outputs `candidates.json` + 3 screenshots into `.planning/briefs/artifacts/debtor-email-label-probe/`.
- `web/lib/automations/debtor-email/nxt-zap-client.ts` — single sync caller with `LookupKind = "sender_to_account" | "identifier_to_account" | "candidate_details"`. Bearer auth, 25s `AbortController` timeout, Zod-validated response (`NxtZapResponseSchema`).
- `web/lib/automations/debtor-email/llm-tiebreaker.ts` — Orq.ai client. `response_format: { type: "json_schema", json_schema: { ..., strict: true } }`. Zod boundary on output; post-validates `selected_account_id ∈ candidates` (T-56-00-03 prompt-injection guard). 45s timeout.
- `web/lib/automations/debtor-email/resolve-debtor.ts` — 4-layer pipeline (thread → sender → identifier → unresolved). Single-hit short-circuit (D-03); multi-candidate hits escalate to LLM with pre-fetched candidate details (D-12).
- `web/lib/automations/debtor-email/label-email-in-icontroller.ts` — Browserless module skeleton. Reuses default `openIControllerSession` (cookie-share with cleanup). Idempotency branches (`already_labeled`, `skipped_conflict`) execute before any mutation. Apply path throws explicitly until probe selectors land in Wave 2.
- `web/lib/inngest/functions/labeling-flip-cron.ts` — per-mailbox Wilson flip cron. Pure `pickAction({n, ci_lo, dry_run, mutate})` exported for unit-test reuse. Cron literal `TZ=Europe/Amsterdam 0 6 * * 1-5` in `//` comment + `createFunction` config arg (no JSDoc — Pitfall 4). Inline `FLIP_N_MIN=50`, `FLIP_CI_LO_MIN=0.95`, `DEMOTE_CI_LO_MAX=0.92` — does NOT import promote/demote helpers (Pitfall 3 protection). Mutation target = `debtor.labeling_settings.dry_run`. NOT registered in Inngest manifest yet (Wave 4).

### Tests (9)
- `web/tests/labeling/route.test.ts` (4 todos)
- `web/tests/labeling/resolve-debtor.test.ts` (4 todos)
- `web/tests/labeling/nxt-zap-client.test.ts` (4 real tests, all GREEN)
- `web/tests/labeling/llm-tiebreaker.test.ts` (2 real tests GREEN, 1 todo for timeout)
- `web/tests/labeling/label-email-in-icontroller.test.ts` (3 todos)
- `web/tests/labeling/flip-cron.test.ts` (4 real tests GREEN — incl. **N=49 rejection** Pitfall 3 guard, 1 todo)
- `web/tests/labeling/page.test.tsx` (2 todos)
- `web/tests/labeling/drawer.test.tsx` (1 todo — channel name `automations:debtor-email-labeling:stale`)
- `web/tests/labeling/actions.test.ts` (2 todos)

## Acceptance Evidence

### Grep counts (per-task acceptance criteria)

```
Task 1:
  label_resolver in migration                              = 5 (>= 3 ✓)
  label_dashboard_counts in migration                      = 4 (>= 2 ✓)
  test files under web/tests/labeling/                     = 9 (== 9 ✓)
  drawer test contains "automations:debtor-email-labeling:stale" ✓
  flip-cron test contains "rejects N=49"                   ✓

Task 2:
  lookup_kind in nxt-zap-client.ts                          = 3 (>= 3 ✓)
  json_schema in llm-tiebreaker.ts                          = 3 (>= 1 ✓)
  thread_inheritance in resolve-debtor.ts                   = 3 (>= 1 ✓)
  sender_match in resolve-debtor.ts                         = 3 (>= 1 ✓)
  openIControllerSession in probe-label-ui.ts               = 3 (>= 1 ✓)

Task 3:
  FLIP_N_MIN = 50 in labeling-flip-cron.ts                  = 1 (== 1 ✓)
  DEMOTE_CI_LO_MAX = 0.92 in labeling-flip-cron.ts          = 1 (== 1 ✓)
  shouldPromote|shouldDemote in labeling-flip-cron.ts       = 0 (== 0 ✓ Pitfall 3)
  TZ=Europe/Amsterdam in labeling-flip-cron.ts              = 2 (>= 1 ✓)
  cron-string lines preceded by /** in flip-cron            = 0 (== 0 ✓ Pitfall 4)
  icontroller_message_url in label module                   = 2 (>= 1 ✓)
  already_labeled|skipped_conflict in label module          = 4 (>= 2 ✓)
```

### TypeScript

`cd web && pnpm tsc --noEmit` — **0 errors** (clean across the whole workspace).

### Vitest

`cd web && pnpm vitest run tests/labeling`:
- 3 test files passing (nxt-zap-client, llm-tiebreaker, flip-cron)
- 6 test files skipped (todos for downstream waves — not yet executable)
- 10 real tests passing, 18 todos
- Notable green: **N=49 rejection at CI-lo=0.99** (Pitfall 3 canary), candidates-list post-validation guard (T-56-00-03), Zod boundary on NXT-Zap response.

## Threat-Model Coverage (mitigations applied)

| Threat ID | Disposition | Implemented in this plan |
|-----------|-------------|---------------------------|
| T-56-00-01 (migration order) | mitigate | All ALTERs are `DROP+ADD CHECK` / `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`. |
| T-56-00-03 (prompt injection) | mitigate | `llm-tiebreaker.ts` throws when `selected_account_id` not in candidates. Test `rejects when selected_account_id not in candidates` passes. |
| T-56-00-04 (NXT-Zap response forgery) | mitigate | `nxt-zap-client.ts` returns `NxtZapResponseSchema.parse(json)`. Test `Zod-validates response` passes. |
| T-56-00-05 (Wilson threshold confusion) | mitigate | `flip-cron` inlines N>=50; never imports promote/demote helpers. Test `rejects N=49 even at CI-lo=0.99` passes. |

## Deviations from Plan

None — plan executed as written. The only stylistic adjustment: the doc-comment in `labeling-flip-cron.ts` originally referenced the names `shouldPromote/shouldDemote` to explain the Pitfall 3 reason. Acceptance criterion required `grep -c "shouldPromote\|shouldDemote"` to equal 0 (to catch accidental imports). The comment was rephrased to "the Phase 60 promote/demote helpers in lib/classifier/wilson" to satisfy the literal grep while preserving the documented intent.

## Open TODOs in Code

| File | Marker | Resolved by |
|------|--------|-------------|
| `label-email-in-icontroller.ts` | `// TODO(probe-artifact): apply label using selectors from .planning/briefs/artifacts/debtor-email-label-probe/candidates.json` | Wave 2 (after probe runs in Wave 1) |
| `label-email-in-icontroller.ts` | `// TODO(probe-artifact): replace with selector(s) from probe candidates.json` (in `readCurrentLabel`) | Wave 2 |

These TODOs are intentional skeleton stubs, not unresolved deferred items. The apply path throws so callers fall back gracefully if invoked before Wave 2 lands.

## Known Stubs

The label module's apply path is intentionally stubbed (throws "label-DOM selectors pending probe artifact"). Phase 60-style D-22 forbids modifying classify.ts; this plan does not touch it. No other stubs.

## Threat Flags

None — no new security-relevant surface beyond what is in the locked threat register.

## Self-Check: PASSED

Files created (all confirmed via `test -f`):
- FOUND: supabase/migrations/20260428_debtor_email_labeling_phase56.sql
- FOUND: web/lib/automations/debtor-email/probe-label-ui.ts
- FOUND: web/lib/automations/debtor-email/nxt-zap-client.ts
- FOUND: web/lib/automations/debtor-email/llm-tiebreaker.ts
- FOUND: web/lib/automations/debtor-email/resolve-debtor.ts
- FOUND: web/lib/automations/debtor-email/label-email-in-icontroller.ts
- FOUND: web/lib/inngest/functions/labeling-flip-cron.ts
- FOUND: 9 test files under web/tests/labeling/

Commits (confirmed via `git log --oneline`):
- FOUND: d93c84e
- FOUND: 3ba7d0b
- FOUND: 25e05b6

Ready for Wave 1 BLOCKING gates (56-01 schema push, 56-02 NXT-Zap, 56-03 probe-run).
