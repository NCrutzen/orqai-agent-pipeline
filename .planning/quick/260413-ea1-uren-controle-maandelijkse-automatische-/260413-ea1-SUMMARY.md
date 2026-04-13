---
phase: quick-260413-ea1
plan: 01
subsystem: automations/uren-controle
tags: [automation, inngest, supabase, excel, hr, review-dashboard]
dependency_graph:
  requires: [supabase-auth, inngest-client, automation-files-bucket, automation_runs-table]
  provides: [uren-controle-pipeline, uren-controle-dashboard, uren-controle-rules-engine]
  affects: [web/app/api/inngest/route.ts, web/lib/inngest/events.ts]
tech_stack:
  added: [exceljs]
  patterns: [base64-file-delivery, inngest-step-isolation, environment-banner, tdd-rules-engine]
key_files:
  created:
    - supabase/migrations/20260413_uren_controle.sql
    - web/lib/automations/uren-controle/types.ts
    - web/lib/automations/uren-controle/excel-parser.ts
    - web/lib/automations/uren-controle/rules.ts
    - web/lib/automations/uren-controle/rules.test.ts
    - web/lib/automations/uren-controle/known-exceptions.ts
    - web/lib/automations/uren-controle/README.md
    - web/lib/automations/uren-controle/__fixtures__/sample.xlsx
    - web/lib/inngest/functions/uren-controle-process.ts
    - web/app/api/automations/uren-controle/route.ts
    - web/app/api/automations/uren-controle/review/route.ts
    - web/app/(dashboard)/automations/uren-controle/page.tsx
    - web/app/(dashboard)/automations/uren-controle/flagged-row.tsx
    - web/app/(dashboard)/automations/uren-controle/review-actions.tsx
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
    - web/package.json
    - web/package-lock.json
    - web/vitest.config.ts
decisions:
  - exceljs over xlsx/sheetjs for Office 365 OOXML accuracy and licensing clarity
  - base64 file delivery via Zapier eliminates SharePoint auth from our stack
  - opmerking column (not verzuim) contains type indicators for BCS duplicate detection
  - kantoor category enriched from mutaties functie column via keyword heuristic
  - environment DEFAULT acceptance per CLAUDE.md test-first pattern
metrics:
  duration: ~73min
  completed: 2026-04-13
  tasks: 3/3
  files_created: 14
  files_modified: 5
  test_count: 19
  test_pass: 19
---

# Quick 260413-ea1: Uren Controle Summary

Hybrid automation replacing ~8hr/month manual hour checking: Zapier delivers base64 Excel via webhook, Inngest pipeline parses 4 tabs with exceljs, runs 4 detection rules (T&T mismatch, verschil outlier, weekend flip, verzuim BCS duplicate), persists flagged rows, and presents them in an authenticated review dashboard with accept/reject actions and environment banner.

## Task Completion

| Task | Name | Status | Commit | Key Files |
|------|------|--------|--------|-----------|
| 1 | Schema + Zapier trigger + Inngest wiring | PASS | 3870b45 | migration, types, events, routes, README |
| 2 | Excel parser + rules engine + TDD tests | PASS | ae28f29 | excel-parser, rules, rules.test, fixture |
| 3 | Review dashboard + accept/reject + banner | PASS | 8d70bd3 | page.tsx, flagged-row, review-actions, review route |

## What Was Built

### Database (supabase/migrations/20260413_uren_controle.sql)
- `uren_controle_runs` — one row per processed Excel, with `environment DEFAULT 'acceptance'`
- `uren_controle_flagged_rows` — one row per detected issue, linked to run
- `uren_controle_reviews` — HR accept/reject decisions, unique per flagged row
- `known_exceptions` — suppression rules per (employee, rule_type), seeded with placeholder

### Pipeline
- **API webhook** (`/api/automations/uren-controle`) — validates x-automation-secret + base64 payload, normalizes environment, sends Inngest event
- **Inngest function** (`process-uren-controle`) — 4 durable steps: decode-upload, create-run-record, parse-and-flag, log-success
- **File delivery** — Zapier sends base64 in webhook body; no SharePoint auth in our stack

### Excel Parser (excel-parser.ts)
- Parses all 4 tabs: `uren` (3778 rows), `storingsdient`, `mutaties`, `bonus`
- Handles Excel serial time values (Date objects with 1899-12-30 base)
- Employee category enrichment from mutaties `functie` column
- Period extraction from `jaar` + `periode` columns

### Detection Rules (rules.ts)
| Rule | Threshold | Fixture Hits | Notes |
|------|-----------|-------------|-------|
| `tnt_mismatch` | >30 min | Multiple (Medewerker_204, etc.) | Compares 4 i*/u* time pairs |
| `verschil_outlier` | >2 hrs | 5+ (Medewerker_89: 9.5h, etc.) | Severity: warning for negative |
| `weekend_flip` | Friday empty + Sat filled | 0 in fixture | Rule implemented, untested on prod data |
| `verzuim_bcs_duplicate` | ziek + verlof in opmerking | 3 (rows 906, 1527, 3001) | v1 heuristic on opmerking text |

Kantoor employees excluded from tnt_mismatch and verschil_outlier.

### Dashboard (/automations/uren-controle)
- Server component behind Supabase auth via (dashboard) layout
- Environment banner: amber for acceptance/test, red for production
- Flagged rows grouped by employee with rule type badges
- Accept button (no reason required) + Reject button (reason required, opens textarea)
- Suppressed rows shown greyed/strikethrough with "Uitzondering" badge
- Reviewed rows show decision badge with reviewer info

### Unit Tests (19 passing)
- `parseHourCalculationExcel` — fixture parsing validity
- `detectTnTMismatch` — flag/no-flag/kantoor exclusion (3 tests)
- `detectVerschilOutlier` — flag above/below/within threshold + kantoor exclusion (4 tests)
- `detectWeekendFlip` — flag/no-flag on fabricated data (2 tests)
- `detectVerzuimBcsDuplicate` — flag dual/single ziekte/vakantie (4 tests)
- `runAllRules` against fixture — validates all 3 active rule types fire (1 test)
- Known exceptions suppression — matching/non-matching employee/rule + case insensitivity (4 tests)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excel structure differs from plan assumptions**
- **Found during:** Task 2
- **Issue:** Plan assumed verzuim column contains text indicators; actual fixture has numeric hours in `verzuim` (col 19) and text indicators in `opmerking` (col 14)
- **Fix:** Adapted DayData type to include `opmerking` field; `detectVerzuimBcsDuplicate` checks `opmerking` instead of `verzuim`
- **Files modified:** types.ts, excel-parser.ts, rules.ts
- **Commit:** ae28f29

**2. [Rule 3 - Blocking] Sheet name typo in fixture**
- **Found during:** Task 2
- **Issue:** Plan references 'storingsdienst' but fixture has 'storingsdient' (missing 's')
- **Fix:** Parser tries both sheet names with fallback
- **Files modified:** excel-parser.ts
- **Commit:** ae28f29

**3. [Rule 1 - Bug] Buffer type incompatibility with Node.js 24**
- **Found during:** Task 2
- **Issue:** ExcelJS `wb.xlsx.load()` type expects older `Buffer` type, Node.js 24 has `Buffer<ArrayBufferLike>`
- **Fix:** Used `as any` cast with eslint-disable comment
- **Files modified:** excel-parser.ts
- **Commit:** ae28f29

**4. [Rule 3 - Blocking] Vitest config only included __tests__/ directories**
- **Found during:** Task 2
- **Issue:** Existing vitest.config.ts only matched `**/__tests__/**/*.test.ts`; our test file lives in the automation directory
- **Fix:** Added `**/*.test.ts` to include patterns
- **Files modified:** vitest.config.ts
- **Commit:** ae28f29

### Pre-existing Build Issue (Out of Scope)
- `npm run build` fails on `/api/automations/box-upload` route (commit ca6f030, not our code) — requires SUPABASE_URL env var at build time
- Logged as out-of-scope; our files compile clean via `tsc --noEmit`

## Known Stubs

None. All data flows are wired end-to-end. The known_exceptions seed uses `Medewerker_01` with `active=false` as a placeholder — this is intentional design per the plan, not a stub.

## Outstanding Items for User

### Before Production Rollout
1. **Apply migration** — run `supabase/migrations/20260413_uren_controle.sql` against the database
2. **Create Supabase Storage bucket** — ensure `automation-files` bucket exists (may already exist from prolius-report)
3. **Configure Zapier Zap** — SharePoint trigger + base64 encode + webhook POST (see README for full Zap configuration)
4. **Seed real known exceptions** — replace `Medewerker_01` placeholder with actual employee names + rule types via Supabase update, set `active=true`
5. **Test end-to-end** — POST fixture to webhook, verify Inngest processes, check dashboard
6. **HR sign-off** — confirm flagged rows match manual review expectations
7. **Flip to production** — change Zap body `"environment":"production"` after HR approval

### Future Improvements (v2)
- Direct T&T API integration (currently T&T times come from Excel i* columns)
- Excel writeback of corrected hours to CouchDrop/SharePoint
- Machine-learning loop for known_exceptions (currently hardcoded)
- `detectVerzuimBcsDuplicate` refinement if production BCS signatures differ from v1 heuristic
- Dashboard filtering/sorting by rule_type, employee, date
- Bulk accept for an employee
- CSV export of flagged rows

## End-to-End Manual Verification Steps

1. **Unit tests:** `cd web && npx vitest run lib/automations/uren-controle/rules.test.ts` — expect 19 pass
2. **TypeScript:** `cd web && npx tsc --noEmit` — expect clean
3. **Migration:** Apply migration, verify 4 tables exist in Supabase
4. **Manual trigger:**
   ```bash
   B64=$(base64 -i web/lib/automations/uren-controle/__fixtures__/sample.xlsx)
   curl -X POST http://localhost:3000/api/automations/uren-controle \
     -H "x-automation-secret: $AUTOMATION_WEBHOOK_SECRET" \
     -H "Content-Type: application/json" \
     -d "{\"filename\":\"sample.xlsx\",\"contentBase64\":\"$B64\"}"
   ```
5. **Inngest:** Check http://localhost:8288 for function completion
6. **Database:** `SELECT status, environment, flagged_count FROM uren_controle_runs ORDER BY created_at DESC LIMIT 1;`
7. **Dashboard:** Login and visit `/automations/uren-controle` — verify environment banner + flagged rows
8. **Review actions:** Accept one row, reject another with reason — verify persistence
