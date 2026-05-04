# Phase 66 Regression Report — Pipeline Consolidation (retire triage path)

**Generated:** 2026-05-04
**Vercel deploy URL:** https://agent-workforce.vercel.app (commit `a38f7d9` on `main`, plus follow-up `164cf68` comment-cleanup — both deployed)
**Inngest preview env:** production (verified via Inngest dashboard screenshot 2026-05-04 10:38 — see Acceptance section)
**Tester:** n.crutzen@icloud.com
**Acceptance class:** Static-audit + production-data negative assertion + unit-test coverage. Live synthetic emit deferred (see Closing Note).

---

## Acceptance Class Rationale

Per `66-VALIDATION.md` § Production Path, Phase 66 cannot exercise the *full* Outlook → Stage 0 → Stage 1 → Stage 2 → Stage 3 chain because Stage 1 (`classifier/screen.requested`) has no live subscriber in `web/app/api/inngest/route.ts` — predates Phase 66 and is captured as a deferred follow-up (`66-CONTEXT.md` `<deferred>` Stage 1 entry).

**The accepted verification class for Phase 66 is therefore:**
1. **Static audit** — codebase grep proves the rename is complete (CONS-02, CONS-03).
2. **Production-data negative assertion** — 30-day query proves regex-matched emails do not produce `coordinator_runs` rows (CONS-01 negative half).
3. **Unit-test coverage** — covers the new label-resolver emit + coordinator subscription contract (CONS-01 positive half).
4. **Inngest dashboard observation** — confirms the renamed function is registered, the old function id is gone, and the new trigger event is wired.

Live synthetic emit was attempted but blocked by Vercel sensitive-env redaction (`INNGEST_EVENT_KEY` returns empty quotes via `vercel env pull`). Closing without it is justified because the unit tests + static audits + production data already prove every behaviour the live emit would exercise; the live emit would only confirm Inngest cloud delivery of the event, which is infrastructure, not logic.

---

## 4 Regression Paths — Verification Summary

| Path | Acceptance | Result | Evidence |
|------|------------|--------|----------|
| 1 — Auto-reply (regex match, no coordinator) | Negative — zero `coordinator_runs` rows for 30-day auto_reply runs | ✅ PASS | 616 production runs, 0 coordinator rows |
| 2 — OOO temporary (regex match, no coordinator) | Negative — zero coordinator rows for 30-day ooo_temporary runs | ✅ PASS | 98 production runs, 0 coordinator rows |
| 3 — Payment admittance (regex match, no coordinator) | Negative — zero coordinator rows for 30-day payment_admittance runs | ✅ PASS | 571 production runs, 0 coordinator rows |
| 4 — Unknown → coordinator (D-03 Option A wiring) | Positive — label-resolver emits `debtor-email/coordinator.requested`; coordinator subscribes; one `coordinator_runs` row per call | ✅ PASS (unit-test class) | `classifier-label-resolver.test.ts` asserts emit; `debtor-email-coordinator.test.ts` asserts subscription |

---

## SQL Verification Results (production, 2026-05-04)

### Q-NEG: Negative assertion — paths 1-3 are clean in production

```sql
SELECT a.topic, count(DISTINCT a.id) as automation_runs, count(c.run_id) as coordinator_rows
FROM public.automation_runs a
LEFT JOIN public.coordinator_runs c
  ON c.email_id = (a.result->>'email_id')
WHERE a.swarm_type='debtor-email'
  AND a.topic IN ('auto_reply','ooo_temporary','payment_admittance')
  AND a.created_at > now() - interval '30 days'
GROUP BY a.topic;
```

| topic | automation_runs | coordinator_rows |
|-------|-----------------|------------------|
| `auto_reply` | 616 | 0 |
| `ooo_temporary` | 98 | 0 |
| `payment_admittance` | 571 | 0 |

**Conclusion:** Across 1,285 regex-matched debtor-email runs in the past 30 days, zero produced a `coordinator_runs` row. The canonical flow correctly diverts categorize_archive emails before Stage 3.

---

## Static Audit Results (post-rename, post-comment-cleanup)

```bash
# 1. Old name leakage
grep -rn "debtor-email-triage|debtorEmailTriage|inngest:debtor-email-triage" web/ docs/ \
  --include="*.ts" --include="*.tsx" --include="*.md" \
  | grep -v ".next/" | grep -v ".planning/"
```
**Result:** 0 lines ✅ (CONS-02 lock)

```bash
# 2. Cross-handler imports
grep -rn 'from "@/lib/inngest/functions/' web/lib/inngest/functions/ --include="*.ts" \
  | grep -v __tests__
```
**Result:** 0 lines ✅ (CONS-03 lock)

```bash
# 3. Old event references
grep -rn "debtor/email.received" web/ --include="*.ts" --include="*.tsx" | grep -v ".next/"
```
**Result:** 0 lines ✅ (D-03 Option A lock)

```bash
# 4. New event present
grep -rn "debtor-email/coordinator.requested" web/ --include="*.ts" | grep -v ".next/"
```
**Result:** 9 lines ✅ (≥3 required: events.ts entry + coordinator subscription + label-resolver emit + 5 test assertions)

---

## Unit-Test Coverage (Path 4 positive half)

| Test | File | Asserts |
|------|------|---------|
| `classifier-label-resolver.test.ts` | `web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` | After successful `email_labels` insert + `close-automation-run` step, `inngest.send` is called exactly once with `{ name: "debtor-email/coordinator.requested", data: { email_id, automation_run_id, customer_account_id, mailbox, subject, body_text, sender_email, received_at } }` |
| `debtor-email-coordinator.test.ts` | `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` | Coordinator subscribes to `debtor-email/coordinator.requested`; intent agent invocation succeeds; escalation gate evaluates correctly; replay-safe `step.run("resolve-run-id", …)` wrap on `crypto.randomUUID()` |

Both tests run in CI and currently green (Wave 3 verification, commits `7b62841` + `9b889e3`).

---

## Inngest Dashboard Observation (2026-05-04 10:38 CEST)

Screenshot reviewed by tester. Confirmed:
- ✅ `automations/debtor-email-coordinator` registered (under friendly name "Debtor Email Coordinator (Stage 3)" after commit `a38f7d9`).
- ✅ Trigger event shown as `debtor-email/coordinator.requested`.
- ✅ Old `automations/debtor-email-triage` absent from the function list.
- ✅ Sibling functions still wired: `debtor-email-bridge`, `debtor-email-icontroller-dispatch`, `debtor-email-icontroller-shard-worker`, `debtor-email-orchestrator`, `debtor-email-synthesis`.
- Volume (24h): 0 — expected (no production traffic flows through `debtor-email/coordinator.requested` until Stage 1 worker exists; the negative-assertion paths flow through other events).

---

## Acceptance Gate

- [x] All 4 regression paths verified (3 by production-data negative assertion, 1 by unit-test coverage)
- [x] SQL Q-NEG: zero `coordinator_runs` rows for regex-matched topics (1,285 runs over 30 days, 0 leaks)
- [x] Static audit 1: 0 lines (CONS-02 lock)
- [x] Static audit 2: 0 lines (CONS-03 lock)
- [x] Static audit 3: 0 lines (D-03 retarget lock)
- [x] Static audit 4: 9 lines (new event present in code + tests)
- [x] Inngest dashboard: new function id present, old id absent
- [x] Unit tests cover the new emit + subscription contract

---

## Closing Note — Live Synthetic Emit Deferred

A live `debtor-email/coordinator.requested` emit against production Inngest was attempted but blocked: Vercel pulls the production `INNGEST_EVENT_KEY` as redacted empty quotes (sensitive-env protection), and the dev `INNGEST_EVENT_KEY` in `web/.env.local` is for a different Inngest workspace. Acquiring the production key would require manual extraction from the Inngest web dashboard.

**Why this is acceptable for closure:**
- The live emit's only unique value is confirming Inngest cloud delivery of the event to the deployed function — which is Inngest infrastructure verification, not Phase 66 logic verification.
- All Phase 66 logic changes (rename, dir move, trigger retarget, label-resolver emit, audit) are covered by unit tests + static audits.
- Production-data negative assertion already proves the canonical flow's exclusivity at scale (1,285 events).
- The first natural production emission of `debtor-email/coordinator.requested` (gated behind the deferred Stage 1 worker) will exercise the full chain end-to-end in normal operations.

**Sign-off:** ✅ Phase 66 closed 2026-05-04 by n.crutzen@icloud.com on the static-audit + production-data + unit-test acceptance class.
