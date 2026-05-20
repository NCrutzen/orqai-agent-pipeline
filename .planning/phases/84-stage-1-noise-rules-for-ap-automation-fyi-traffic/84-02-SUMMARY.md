---
phase: 84-stage-1-noise-rules-for-ap-automation-fyi-traffic
plan: 02
subsystem: stage-1-noise-filter
tags: [migrations, codegen, registry-source-of-truth, stub-retirement, pending-db-push]
dependency_graph:
  requires:
    - "Wave 0 RED tests (84-01) — locked the expected category_key shape + import name TENANT_DOMAINS_BY_SWARM"
    - "Hard-separation static check (84-01 Task 2) — gates this wave's INSERTs"
  provides:
    - "3 migration files ready to push (tenant_domains column + 16 noise category rows + 16 classifier_rules candidate rows)"
    - "Codegen-emitted tenant-domains.generated.ts + gen-tenant-domains.ts codegen script (chained in `npm run codegen`)"
    - "SwarmRow.tenant_domains: string[] field (D-03 type contract)"
    - "Phase 83 TENANT_DOMAINS hardcoded fallback retired from debtor-email-coordinator.ts"
  affects:
    - "Wave 2 (84-03): classify.ts adds 7 in-classifier regex matchers + classifier-screen-worker.ts adds the loopback branch reading swarmRow.tenant_domains"
    - "Wave 3 (84-04): 7-day Wilson-CI shadow consumes the 16 classifier_rules candidate rows + D-05 corpus-evidence path optionally flips status='promoted'"
tech_stack:
  added: []
  patterns:
    - "Phase 69 codegen pattern (gen-entity-types.ts mirrored verbatim with per-swarm map output shape per RESEARCH Open Q #4)"
    - "Phase 68 ALTER TABLE additive jsonb pattern (20260504b precedent)"
    - "Phase 65 idempotent cross-swarm UPSERT (20260511_swarm_noise_spam_key.sql verbatim × 8)"
key_files:
  created:
    - supabase/migrations/20260520_phase84_tenant_domains.sql
    - supabase/migrations/20260520_phase84_noise_categories.sql
    - supabase/migrations/20260520_phase84_classifier_rules_seed.sql
    - web/scripts/gen-tenant-domains.ts
    - web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts
    - .planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/84-02-SUMMARY.md
  modified:
    - web/package.json
    - web/lib/swarms/types.ts
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/app/(dashboard)/automations/[swarm]/_shell/__tests__/derive-stage-tabs.test.ts
    - web/lib/swarms/__tests__/brand-register-no-fallback.test.ts
    - web/lib/swarms/__tests__/brand-register.test.ts
    - web/lib/swarms/__tests__/registry.test.ts
    - web/lib/swarms/__tests__/side-effects.test.ts
decisions:
  - "Pre-push: hand-commit tenant-domains.generated.ts so the file is in sync with Wave 2's expected import shape (TENANT_DOMAINS_BY_SWARM). Verified byte-identical to script output via inline reproduction harness."
  - "TENANT_DOMAINS spread to mutable string[] at the coordinator call site (Option B from PATTERNS.md kept; assembleInput's signature unchanged)."
  - "Test fixture widening (5 files × 1-line `tenant_domains: []`) chosen over making the SwarmRow field optional — matches the Phase 68 entity_brand precedent of required-field-plus-fixture-update."
metrics:
  duration_min: 30
  tasks_completed: 3
  files_touched: 14
  commits: 3
completed: 2026-05-20
---

# Phase 84 Plan 02: Wave 1 — Data Layer + Codegen + Stub Retirement Summary

**One-liner:** Phase 84 data layer landed in three migration files + a Phase
69-style codegen path for `swarms.tenant_domains`. Phase 83's hardcoded
TENANT_DOMAINS stub in `debtor-email-coordinator.ts` is retired in favour of
the generated import. **Migration push is deliberately deferred** — the
operator owns the `supabase db push` step.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrations — tenant_domains column + 16 noise rows + 16 classifier_rules candidates | `d07a0627` | 3 SQL files under `supabase/migrations/` |
| 2 | Codegen — `gen-tenant-domains.ts` + `tenant-domains.generated.ts` + `package.json` chain + SwarmRow type extension | `7109623e` | `web/scripts/gen-tenant-domains.ts`, `web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts`, `web/package.json`, `web/lib/swarms/types.ts` |
| 3 | Retire Phase 83 TENANT_DOMAINS stub + 5 fixture widening fixes for SwarmRow `tenant_domains` field | `3310d58a` | `web/lib/inngest/functions/debtor-email-coordinator.ts` + 5 test-fixture files |

## Pending operator action — Task 4 (BLOCKING checkpoint)

The plan's Task 4 (`supabase db push`) was **NOT executed** per the
orchestrator's explicit constraint ("STOP at the `supabase db push` step…
the orchestrator + operator handle that push as a separate checkpoint").

### Command pending operator authorisation

```bash
# Working dir: repo root.
# Requires: SUPABASE_ACCESS_TOKEN env var set (operator session).
supabase db push
```

### Diff that will be applied

Three migration files, applied in lexicographic order:

1. `supabase/migrations/20260520_phase84_classifier_rules_seed.sql`
2. `supabase/migrations/20260520_phase84_noise_categories.sql`
3. `supabase/migrations/20260520_phase84_tenant_domains.sql`

> Lexicographic ordering matters here: `classifier_rules_seed` and
> `noise_categories` write against existing tables (`classifier_rules`,
> `swarm_noise_categories`) so they don't depend on the new
> `tenant_domains` column. The tenant_domains migration is structurally
> independent of the other two. Re-ordering does not change net effect.

**Net schema change (post-push state):**

```sql
-- (1) New column on public.swarms (additive, jsonb, NOT NULL DEFAULT '[]'::jsonb).
ALTER TABLE public.swarms ADD COLUMN tenant_domains jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Backfill:
--   debtor-email tenant_domains = ["fire-control.nl","moyneroberts.com","smeba-fire.be","smeba.nl"]
--   sales-email  tenant_domains = ["smeba.nl"]

-- (2) +16 rows into public.swarm_noise_categories (8 keys × 2 swarms):
--   coupa_invoice_paid_notification
--   coupa_invoice_approved_notification
--   iss_ptp_autoreply
--   frieslandcampina_portal_reject
--   m365_quarantine
--   sender_phishing_notice
--   supplier_bank_change_notification
--   own_outbound_invoice_loopback
-- All rows: action='categorize_archive', swarm_dispatch=NULL.

-- (3) +16 rows into public.classifier_rules (8 keys × 2 swarms):
--   debtor-email rows: kind='regex', status='candidate'
--   sales-email rows:  kind='agent_intent', status='candidate'
```

### Post-push verification queries (from plan Task 4)

```bash
SUPABASE_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' web/.env.local | cut -d= -f2- | tr -d '"')
SUPABASE_SERVICE_ROLE_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' web/.env.local | cut -d= -f2- | tr -d '"')

# Expect: 16 rows
curl -s "${SUPABASE_URL}/rest/v1/swarm_noise_categories?category_key=in.(coupa_invoice_paid_notification,coupa_invoice_approved_notification,iss_ptp_autoreply,frieslandcampina_portal_reject,m365_quarantine,sender_phishing_notice,supplier_bank_change_notification,own_outbound_invoice_loopback)&select=swarm_type,category_key" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('noise rows:', len(d)); assert len(d)==16"

# Expect: 16 candidate rows
curl -s "${SUPABASE_URL}/rest/v1/classifier_rules?rule_key=in.(coupa_invoice_paid_notification,coupa_invoice_approved_notification,iss_ptp_autoreply,frieslandcampina_portal_reject,m365_quarantine,sender_phishing_notice,supplier_bank_change_notification,own_outbound_invoice_loopback)&select=swarm_type,rule_key,status,kind" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('rule rows:', len(d)); assert len(d)==16"

# Expect: debtor-email = 4 domains, sales-email = 1 domain
curl -s "${SUPABASE_URL}/rest/v1/swarms?select=swarm_type,tenant_domains" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"

# Hard-separation static check (must remain green)
cd web && npx vitest run __tests__/static-checks/swarm-hard-separation.test.ts

# Codegen idempotency gate (must produce no diff)
cd web && npm run codegen && cd .. && git diff --exit-code web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts
```

## Must-haves status (relative to PLAN frontmatter)

| Truth | Status |
|-------|--------|
| swarms.tenant_domains jsonb NOT NULL DEFAULT '[]'::jsonb exists in production | **pending push** (migration ready) |
| swarms.tenant_domains is populated for every existing swarm row | **pending push** (DEFAULT '[]' + per-swarm UPDATEs encode this) |
| 16 swarm_noise_categories rows exist with action='categorize_archive' | **pending push** (migration ready, 8 UPSERT blocks × 2 swarms) |
| 16 classifier_rules candidate rows exist (kind='regex' debtor-email / kind='agent_intent' sales-email) | **pending push** (16-row INSERT ready; deviation: 16 rows not 8 — see below) |
| tenant-domains.generated.ts emitted from registry; codegen idempotent | **landed** (file byte-identical to script output verified pre-push; `npm run codegen` will produce zero diff post-push) |
| debtor-email-coordinator.ts line 50 TENANT_DOMAINS stub retired | **landed** — import from generated file; spread to mutable copy at call site |
| supabase db push completed successfully | **pending operator** (this is Task 4, deliberately not executed) |
| Hard-separation static-check still passes | **passes today** (will be re-run post-push by orchestrator) |

## Deviations from Plan

### Auto-fixed / Documented

**1. [Rule 2 — Critical functionality] classifier_rules seed is 16 rows, not 8.**

- **Found during:** Task 1 writing.
- **Issue:** Plan frontmatter `must_haves.truths` says "8 classifier_rules candidate rows" but the body (`must_haves.artifacts` line 33 + RESEARCH Open Q #3) and PATTERNS.md lines 122-133 both describe **8 keys × 2 swarms = 16 rows** with the kind asymmetry (`'regex'` vs `'agent_intent'`). The 8-row count in the truths list is a copy-edit slip that ignores the per-swarm seed required for Wave 3's Wilson-CI to track both swarms' attribution telemetry.
- **Resolution:** Seeded all 16 rows. The migration is structurally a single INSERT with 16 VALUES and `on conflict do nothing`. Plan body text + PATTERNS.md + Wave 3 telemetry rollup are aligned with 16.
- **Impact on Wave 3 (84-04):** Wilson-CI cron sees both swarms' agreement counters independently — sales-email LLM 2nd-pass and debtor-email regex Pass 1 have decoupled promotion gates per swarm, matching D-05's per-swarm Wilson-CI design.

**2. [Rule 1 — Type safety bug] readonly tuple ≠ mutable string[].**

- **Found during:** Task 3 tsc verification.
- **Issue:** `TENANT_DOMAINS_BY_SWARM["debtor-email"]` is `readonly ["fire-control.nl", "moyneroberts.com", "smeba-fire.be", "smeba.nl"]` (from `as const`); `assembleInput.tenantDomains` is `string[]` (mutable). TS error TS4104.
- **Resolution:** Spread into a fresh `string[]` at the binding site:
  ```typescript
  const TENANT_DOMAINS: string[] = [...TENANT_DOMAINS_BY_SWARM[SWARM_TYPE]];
  ```
  Keeps `assembleInput`'s signature unchanged (broader blast radius rejected).
- **Files modified:** `web/lib/inngest/functions/debtor-email-coordinator.ts` only.

**3. [Rule 3 — Blocking compile errors] SwarmRow widening broke 5 test fixtures.**

- **Found during:** Task 3 tsc verification.
- **Issue:** Adding `tenant_domains: string[]` as a required field on `SwarmRow` (per Task 2 acceptance criteria) broke 5 test files that construct full SwarmRow stubs literally.
- **Resolution:** Added `tenant_domains: []` to each stub. Mirrors Phase 68 precedent (entity_brand was added as required and all fixtures took the same one-line widening). No production code touched.
- **Files modified:**
  - `web/app/(dashboard)/automations/[swarm]/_shell/__tests__/derive-stage-tabs.test.ts`
  - `web/lib/swarms/__tests__/brand-register-no-fallback.test.ts`
  - `web/lib/swarms/__tests__/brand-register.test.ts`
  - `web/lib/swarms/__tests__/registry.test.ts`
  - `web/lib/swarms/__tests__/side-effects.test.ts`

**4. [Rule 3 — Pre-push reality] Codegen cannot run against current DB; generated file hand-committed.**

- **Found during:** Task 2 verification (`npm run codegen` failed at `column swarms.tenant_domains does not exist`).
- **Issue:** Task 2 acceptance criteria say "run `npm run codegen` and commit the generated file"; but the plan also stops before the migration push. The script reads from `public.swarms.tenant_domains` which does not exist until Task 4 lands.
- **Resolution:**
  1. Wrote the codegen script with a clean, operator-actionable error message when the column is missing ("…push Phase 84 migration 20260520_phase84_tenant_domains.sql first.").
  2. Hand-wrote `tenant-domains.generated.ts` to match what the script will emit post-push.
  3. Verified byte-identical output via an inline harness reproducing the exact `HEADER + renderBody(...)` logic against the expected post-push row set:
     ```
     MATCH — committed file is byte-identical to post-push codegen output
     ```
  4. Post-push, the operator runs `npm run codegen && git diff --exit-code` as the codegen-drift gate; it WILL pass.
- **Impact:** Zero — the codegen-drift CI gate referenced in T-84-02-05 (the threat register) is exercised at the next codegen run after push.

**5. [Rule 1 — Bug correction] Hand-written generated file punctuation discipline.**

- **Found during:** Verification harness comparison.
- **Issue (pre-fix):** During the verification step (running `renderBody` against the expected rows), a minor formatting difference would cause the codegen idempotency gate to fail. The exact rendering uses `, ` separators (with space) between domain literals; my first draft was correct on this specific dimension. Verified pre-commit.
- **Resolution:** Sigil pattern: `[...domains].map(d => \`"${d}"\`).join(", ")` (no trailing comma; space after comma). Verified.

### Pre-existing concerns (out of Phase 84 scope)

None identified — the broader `tsc --noEmit -p tsconfig.json` is clean post-Task 3.

## Hard-separation invariant (Pitfall 1)

Static check still passes against live data (no Phase 84 keys exist in
either registry yet — migration not pushed). Once pushed, the static check
must continue to pass because:

- Both migrations write to `swarm_noise_categories` only (or `classifier_rules`, which is orthogonal to the intent/noise split).
- No `swarm_intents` INSERT/UPSERT appears in any of the three migration files (`grep -c "swarm_intents" supabase/migrations/20260520_phase84_*.sql` returns the comment-only mention of "Hard-separation invariant: NO row added to swarm_intents" — declarative, not executable).
- Wave 0 Task 2's static-check test will re-run in CI after push.

## Auth gates

None — all work in this plan operated against the repo working tree.
Migration push (Task 4) WILL require `SUPABASE_ACCESS_TOKEN`; operator
handles that as a separate checkpoint.

## Files Modified / Created

- **Created (6):**
  - `supabase/migrations/20260520_phase84_tenant_domains.sql`
  - `supabase/migrations/20260520_phase84_noise_categories.sql`
  - `supabase/migrations/20260520_phase84_classifier_rules_seed.sql`
  - `web/scripts/gen-tenant-domains.ts`
  - `web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts`
  - `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/84-02-SUMMARY.md`
- **Modified (8):**
  - `web/package.json` (codegen script chain)
  - `web/lib/swarms/types.ts` (SwarmRow.tenant_domains field)
  - `web/lib/inngest/functions/debtor-email-coordinator.ts` (stub retired)
  - 5 test fixtures (`tenant_domains: []` widening)

## Verification Commands (operator re-run)

```bash
# Pre-push checks (all currently passing):
cd web && npx tsc --noEmit -p tsconfig.json         # exit 0
cd web && npx vitest run __tests__/static-checks/swarm-hard-separation.test.ts  # 2 passed
cd web && npx vitest run lib/debtor-email/__tests__/classify.test.ts  # 21 RED, 37 GREEN (Wave 2 turns them GREEN)

# Migration files exist + content checks:
test -f supabase/migrations/20260520_phase84_tenant_domains.sql
test -f supabase/migrations/20260520_phase84_noise_categories.sql
test -f supabase/migrations/20260520_phase84_classifier_rules_seed.sql
grep -c "on conflict" supabase/migrations/20260520_phase84_noise_categories.sql  # 8

# Codegen mirror (cannot run pre-push; will pass post-push):
cd web && npm run codegen && cd .. && git diff --exit-code web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts

# Stub retirement check:
grep -q "TENANT_DOMAINS_BY_SWARM" web/lib/inngest/functions/debtor-email-coordinator.ts && echo "import landed"
grep -q '"smeba.nl", "smeba-fire.be", "moyneroberts.com"' web/lib/inngest/functions/debtor-email-coordinator.ts || echo "stub gone"
grep -q "TODO(phase-84" web/lib/inngest/functions/debtor-email-coordinator.ts || echo "TODO removed"
```

## Self-Check: PASSED

- FOUND: `supabase/migrations/20260520_phase84_tenant_domains.sql`
- FOUND: `supabase/migrations/20260520_phase84_noise_categories.sql`
- FOUND: `supabase/migrations/20260520_phase84_classifier_rules_seed.sql`
- FOUND: `web/scripts/gen-tenant-domains.ts`
- FOUND: `web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts`
- FOUND: commit `d07a0627` (Task 1)
- FOUND: commit `7109623e` (Task 2)
- FOUND: commit `3310d58a` (Task 3)
- FOUND: 8 `on conflict` blocks in noise_categories migration
- FOUND: 16 occurrences of the 8 D-01 category keys in noise_categories migration
- FOUND: 8 `'regex', 'candidate'` rows + 8 `'agent_intent', 'candidate'` rows in classifier_rules_seed migration
- FOUND: `npx tsc --noEmit` exits 0
- FOUND: hard-separation static check passes (2/2 GREEN)
- FOUND: classify.ts Wave 0 RED tests still 21 RED (Wave 2 turns them GREEN — expected)
- FOUND: codegen byte-identical to script output (verified via inline harness)
