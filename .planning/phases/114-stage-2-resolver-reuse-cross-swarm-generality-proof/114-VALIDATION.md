---
phase: 114
slug: stage-2-resolver-reuse-cross-swarm-generality-proof
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-04
---

# Phase 114 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (`vitest` ^4.1.0 in `web/package.json`) |
| **Config file** | `web/` workspace; convention `web/lib/**/__tests__/*.test.ts`. All commands run from `web/`. |
| **Quick run command** | `cd web && npm test -- web/lib/agentic-pipeline/resolve` (donor seam suite, ~28 tests) |
| **Full suite command** | `cd web && npm test` (= `vitest run`) |
| **Estimated runtime** | seam suite ~10s · full suite ~120-180s |

> Vitest positional args are path substrings. `npm test -- <path-fragment>` filters by file path. There is no watch flag in any command (`vitest run` is one-shot — required).

---

## Sampling Rate

- **After every task commit:** Run `cd web && npm test -- <task's scoped path>` (the per-task command below).
- **After every plan wave:** Run `cd web && npm test` (full) + `cd web && npm run codegen && git diff --exit-code` (no drift) + `cd web && npm run check:supabase` (0 ERROR, for waves touching migrations).
- **Before `/gsd:verify-work`:** Full suite green + `./scripts/no-engine-diff-check.sh` exits 0 (STAGE2-01).
- **Max feedback latency:** ~10s (scoped seam/unit run); ~180s (full suite, wave merge only).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 114-01-01 | 01 | 1 | STAGE2-01 | T-114-01 | No engine logic drift on transplant | shape | `test -f web/lib/swarms/dynamic.ts && grep -q STAGE2_RESOLVER_MODULES web/lib/swarms/dynamic.ts` | ✅ (verbatim transplant) | ⬜ pending |
| 114-01-02 | 01 | 1 | STAGE2-01 | T-114-02 | Debtor path behaviour-neutral after adapter refactor | typecheck | `cd web && npx tsc --noEmit 2>&1 \| grep -E "resolve-debtor\|stage-2-customer-resolver\|resolver-trace"` | ✅ | ⬜ pending |
| 114-01-03 | 01 | 1 | STAGE2-01 | T-114-01 | port-equivalence byte-equality holds | unit | `cd web && npm test -- web/lib/agentic-pipeline/resolve` | ✅ (donor suite) | ⬜ pending |
| 114-02-01 | 02 | 1 | STAGE2-01 | T-114-02b | stage_2_resolution gate fail-closed (missing=blocked) | unit | `cd web && npm test -- lib/pipeline-gating/dry-run-gate` | ❌ W0 (extend gate test) | ⬜ pending |
| 114-02-02 | 02 | 1 | STAGE2-01 | T-114-02a | resolution_audit RLS service_role-only, no anon | shape | `grep -q "ENABLE ROW LEVEL SECURITY" supabase/migrations/20260604_generic_resolution_audit.sql && ! grep -qE "TO (anon\|public)" supabase/migrations/20260604_generic_resolution_audit.sql` | ✅ | ⬜ pending |
| 114-02-03 | 02 | 1 | STAGE2-01 | T-114-02a | Migration applied to remote; check:supabase 0 ERROR | manual+gate | `cd web && npm run check:supabase` (post-apply, in checkpoint) | n/a (remote) | ⬜ pending |
| 114-03-01 | 03 | 1 | STAGE2-01 (D-14) | T-114-03c | has_attachments + sender fallback captured | typecheck+shape | `cd web && grep -q hasAttachments lib/outlook/client.ts && grep -q has_attachments app/api/automations/sales-email/ingest/route.ts && npx tsc --noEmit 2>&1 \| grep -E "outlook/client\|sales-email/ingest"` | ✅ | ⬜ pending |
| 114-03-02 | 03 | 1 | STAGE2-01 (D-14) | T-114-03c | from→sender fallback exercised | unit | `cd web && npm test -- lib/outlook` | ❌ W0 (new/extend client.test.ts) | ⬜ pending |
| 114-03-03 | 03 | 1 | STAGE2-01 (D-04) | T-114-03b | Identifier-mining denominator-corrected | shape+typecheck | `test -f web/scripts/sales-identifier-mining.ts && grep -q rows_with_sender_email web/scripts/sales-identifier-mining.ts && cd web && npx tsc --noEmit scripts/sales-identifier-mining.ts` | ✅ | ⬜ pending |
| 114-03-04 | 03 | 1 | STAGE2-01 (D-04) | T-114-03b | Frequency report artifact committed (D-04 data-driven gate) | checkpoint | operator confirms `web/scripts/output/sales-identifier-mining.json` (or md report) committed | n/a (artifact) | ⬜ pending |
| 114-04-00 | 04 | 2 | STAGE2-01 (D-10) | T-114-04b | PR #63 nxtRequest transport prod-deployed | checkpoint | operator confirms PR #63 merged + prod smoke green | n/a (prereq gate) | ⬜ pending |
| 114-04-01 | 04 | 2 | STAGE2-01, STAGE2-02 | T-114-04a | resolveEntity built; identifier regex before nxtRequest | unit | `cd web && npm test -- lib/automations/sales-email/resolve-customer` | ❌ W0 (new test) | ⬜ pending |
| 114-04-02a | 04 | 2 | STAGE2-01 | T-114-04d | resolution_config real; stage_2_resolution seeded | shape | `grep -q auto_safe_kinds supabase/migrations/20260604b_sales_resolution_config.sql && grep -q stage_2_resolution supabase/migrations/20260604b_sales_resolution_config.sql` | ✅ | ⬜ pending |
| 114-04-02b | 04 | 2 | STAGE2-01 | T-114-04e | Worker registry-driven; sales event wired; debtor neutral | unit | `cd web && grep -q loadStage2Resolver lib/inngest/functions/stage-2-customer-resolver.ts && grep -q "sales-email/stage-2.customer-resolve.requested" lib/inngest/functions/stage-2-customer-resolver.ts && npm test -- lib/inngest/functions/__tests__/stage-2-customer-resolver` | ❌ W0 (worker test) | ⬜ pending |
| 114-04-03 | 04 | 2 | STAGE2-01 | T-114-04d | Migration applied remote; D-06 deferral confirmed | checkpoint | operator: migration live + check:supabase green + D-06 path stated | n/a (remote+decision) | ⬜ pending |
| 114-05-01 | 05 | 3 | STAGE2-02 | T-114-05b | self-auth no-op + unresolved fall-through | unit | `cd web && npm test -- lib/automations/sales-email/__tests__/self-auth-noop-sales lib/automations/sales-email/__tests__/unresolved-fallthrough` | ❌ W0 (new tests) | ⬜ pending |
| 114-05-02 | 05 | 3 | STAGE2-01 | T-114-05a | no-Engine-diff guard precise scope | gate | `chmod +x scripts/no-engine-diff-check.sh && ./scripts/no-engine-diff-check.sh` | ❌ W0 (new guard) | ⬜ pending |
| 114-05-03 | 05 | 3 | STAGE2-01, STAGE2-02 | T-114-05a | Full phase gate + D-06 fast-follow todo asserted | gate+shape | `test -f .planning/todos/pending/2026-06-04-v82-rebase-after-enabler-merge.md && cd web && npm test` | ❌ W0 (rebase note) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

These artifacts do NOT exist yet and are CREATED by the tasks that own them (in-plan Wave 0 — each test ships alongside its production code in the same plan):

- [ ] `web/lib/pipeline-gating/dry-run-gate/__tests__/dry-run-gate.test.ts` — 4 fail-closed cases for `stage_2_resolution` (Plan 02 Task 1, tdd)
- [ ] `web/lib/outlook/__tests__/client.test.ts` — fetch-shape + from→sender fallback (Plan 03 Task 2, tdd)
- [ ] `web/scripts/sales-identifier-mining.ts` + frequency report artifact (Plan 03 Task 3 + Task 4 checkpoint)
- [ ] `web/lib/automations/sales-email/__tests__/resolve-customer.test.ts` — offerte hit / unresolved / self-auth no-op / identifier-format reject (Plan 04 Task 1, tdd)
- [ ] `web/lib/inngest/functions/__tests__/stage-2-customer-resolver*.test.ts` — worker registry dispatch + sales event + debtor neutral (Plan 04 Task 2b)
- [ ] `web/lib/automations/sales-email/__tests__/self-auth-noop-sales.test.ts` + `unresolved-fallthrough.test.ts` (Plan 05 Task 1, tdd)
- [ ] `scripts/no-engine-diff-check.sh` — precise-scope STAGE2-01 guard (Plan 05 Task 2)

Pre-existing infrastructure that is RUN (not created): the donor seam suite (`web/lib/agentic-pipeline/resolve/__tests__/*`) arrives verbatim with the Plan 01 cherry-pick and is green on the donor branch (28/28).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `resolution_audit` table live on remote | STAGE2-01 | Schema push to remote Supabase is out-of-band of the test runner; typecheck/tests pass without it (schema_push false-positive) | Plan 02 Task 3 checkpoint: apply migration, `select count(*) from email_pipeline.resolution_audit` returns 0 no-error, `npm run check:supabase` 0 ERROR |
| sales `resolution_config` live on remote (real, not placeholder) | STAGE2-01 | Same schema_push reason | Plan 04 Task 3 checkpoint: query `swarms WHERE swarm_type='sales-email'` → `auto_safe_kinds:[]` + precedence array, `dry_run_config.stage_2_resolution=true` |
| PR #63 `nxtRequest` prod-deployed | STAGE2-01 (D-10) | Deploy state lives in GitHub/Vercel, not the repo; sales lookups unit-test green against mocks but fail in prod if transport undeployed | Plan 04 Task 0 checkpoint: confirm PR #63 merged + smoke `POST /api/automations/nxt/proxy` (or STATE.md confirmation) |
| Identifier-mining frequency report | STAGE2-01 (D-04) | Corpus query needs `SUPABASE_SERVICE_ROLE_KEY`; report content (not just file existence) is the D-04 data-driven input | Plan 03 Task 4 checkpoint: operator confirms committed `web/scripts/output/sales-identifier-mining.json` (or md) with per-kind frequencies + dual denominators |
| D-06 corroboration deferral path | STAGE2-01 / D-06 (CTO req) | Design decision: precedence-only now vs corroboration-before-gate | Plan 04 Task 3 checkpoint: state "deferred" (→ fast-follow todo) or "required now"; Plan 05 Task 3 asserts the todo exists if deferred |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an explicit checkpoint/Wave-0 dependency (mapped above)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (checkpoints interleave with automated tasks)
- [x] Wave 0 covers all created-from-scratch test files (in-plan, alongside production code)
- [x] No watch-mode flags (`vitest run` only)
- [x] Feedback latency < 180s (full suite, wave merge); < 10s scoped
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
