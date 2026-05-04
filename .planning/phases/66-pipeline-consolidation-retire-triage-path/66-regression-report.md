# Phase 66 Regression Report — Pipeline Consolidation (retire triage path)

**Generated:** 2026-05-04 (placeholder; awaiting Vercel-preview synthetic-emit smoke)
**Vercel deploy URL:** _to be filled_
**Inngest preview env:** _to be filled_
**Deploy timestamp (UTC):** _to be filled_
**Tester:** _to be filled_

---

## Acceptance Class

Per `66-VALIDATION.md` § Production Path (Stage 1 gap), Phase 66 acceptance is
**Vercel-preview synthetic emit covering 4 regression paths**. Stage 1
(`classifier/screen.requested`) has no live subscriber; the full Outlook → Stage 0
→ Stage 1 → Stage 2 → Stage 3 chain cannot be exercised in this phase. Same
verification class Phase 65 used.

---

## 4 Synthetic-Emit Regression Paths

For each path: emit one Inngest event from the dashboard preview env, capture
screenshots + Supabase row counts, paste into the per-path block below.

### Path 1 — Auto-reply (regex match, categorize_archive)

- **Email shape:** subject contains an out-of-office pattern (e.g. "Out of office: I will be back…")
- **Emit:** synthetic `stage-0/email.received` (or upstream equivalent) for a fixture row
- **Expected:** regex matches; verdict-worker action='categorize_archive'; outlook label set; **no `coordinator_runs` row**
- **email_id:** _to be filled_
- **Result:** ⬜ pending

### Path 2 — OOO temporary (regex match, categorize_archive)

- **Email shape:** "I am temporarily out of the office until <date>"
- **Expected:** same as Path 1 — regex match, categorize_archive, no coordinator run
- **email_id:** _to be filled_
- **Result:** ⬜ pending

### Path 3 — Payment admittance (regex match, categorize_archive)

- **Email shape:** subject contains a "we will pay" pattern
- **Expected:** regex match, categorize_archive, no coordinator run
- **email_id:** _to be filled_
- **Result:** ⬜ pending

### Path 4 — Unknown → coordinator (Option A retarget under test)

- **Email shape:** human prose with no regex match (e.g. invoice copy request)
- **Expected:**
  1. regex misses
  2. `swarm_categories.unknown.swarm_dispatch = "debtor-email/label-resolve.requested"` fires
  3. `classifierLabelResolver` writes `email_labels`
  4. `classifierLabelResolver` emits `debtor-email/coordinator.requested` (NEW per Phase 66 D-03 Option A)
  5. renamed `debtorEmailCoordinator` runs intent agent + escalation gate
  6. emits exactly one downstream event (`debtor-email/<intent>.requested` for single-shot OR `debtor-email/orchestrator.requested` for escalation)
- **email_id:** _to be filled_
- **Result:** ⬜ pending

---

## SQL Verification Queries (run against Supabase post-smoke)

Replace `<deploy_ts>` and `<4 smoke email ids>` before running.

```sql
-- 1. Confirm exactly one coordinator_runs row per "unknown" smoke email.
select run_id, email_id, escalation_decision, expected_handlers, completed_handlers, completed_at
from public.coordinator_runs
where email_id in (<4 smoke email ids>)
order by created_at desc;
-- Expected: 1 row for the unknown-bucket email; 0 rows for the 3 categorize_archive emails.

-- 2. Confirm no orphan rows on the OLD function id.
select count(*) from public.automation_runs
where triggered_by = 'inngest:debtor-email-triage'
  and created_at > '<deploy_ts>';
-- Expected: 0.

-- 3. Confirm new audit string is being written (or 0 if circuit-breaker.ts deleted).
select count(*) from public.automation_runs
where triggered_by = 'inngest:debtor-email-coordinator'
  and created_at > '<deploy_ts>';
-- Expected: > 0 if circuit-breaker still in use; 0 if deleted (both correct per inventory).

-- 4. Confirm no parallel-pipeline duplicate execution.
select email_id, count(*) as run_count
from public.coordinator_runs
where created_at > '<deploy_ts>'
group by email_id
having count(*) > 1;
-- Expected: 0 rows. Any row here = a parallel pipeline emitted twice.
```

**Result paste-in:**

```
Q1: <paste>
Q2: <paste>
Q3: <paste>
Q4: <paste>
```

---

## Static Audit Results (run from repo root post-rename)

```bash
# 1. Zero hits for old name in app code.
grep -rn "debtor-email-triage\|debtorEmailTriage\|inngest:debtor-email-triage" web/ docs/ --include="*.ts" --include="*.tsx" --include="*.md" \
  | grep -v ".next/" | grep -v ".planning/"
# Expected: 0 lines.

# 2. Zero cross-imports between Inngest function files.
grep -rn 'from "@/lib/inngest/functions/' web/lib/inngest/functions/ --include="*.ts" \
  | grep -v __tests__
# Expected: 0 lines (CONS-03 lock).

# 3. Zero references to the deleted event.
grep -rn "debtor/email.received" web/ --include="*.ts" --include="*.tsx" \
  | grep -v ".next/"
# Expected: 0 lines.

# 4. New event present.
grep -rn "debtor-email/coordinator.requested" web/ --include="*.ts" \
  | grep -v ".next/"
# Expected: ≥3 lines (events.ts entry + coordinator subscription + label-resolver emit).
```

**Result paste-in:**

```
1: <paste>
2: <paste>
3: <paste>
4: <paste>
```

---

## Acceptance Gate

- [ ] All 4 synthetic-emit paths produced expected outcome
- [ ] SQL Q1: exactly one coordinator_runs row for Path 4; zero for Paths 1-3
- [ ] SQL Q2: zero orphan rows on old function id
- [ ] SQL Q4: zero duplicate coordinator_runs rows per email_id
- [ ] Static audit: command 1 returns 0 lines (CONS-02 lock)
- [ ] Static audit: command 2 returns 0 lines (CONS-03 lock)
- [ ] Static audit: command 3 returns 0 lines (D-03 retarget lock)
- [ ] Inngest dashboard shows new function id present, old id absent

**Sign-off:** _pending_
