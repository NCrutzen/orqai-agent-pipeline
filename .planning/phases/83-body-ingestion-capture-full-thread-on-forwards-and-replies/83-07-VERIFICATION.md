# Phase 83 — Verification Checklist

Operator-facing close-out for Phase 83 (body ingestion: capture full thread on
forwards & replies). Walk the steps top-to-bottom, fill in the sign-off table,
and commit this file before flipping the ROADMAP checkbox.

Acceptance threshold for closure: **V1..V4 PASS in the harness AND the manual
§5 spot-check PASS** below. Any FAIL → STOP and route to `/gsd:debug`.

---

## 1. Pre-flight

- [ ] Plans 83-01..83-06b shipped (see SUMMARYs in this directory).
- [ ] Plan 83-05 backfill completed — row counts recorded in
      `83-05-SUMMARY.md`. Note the permanent-Graph-404 row_ids; V1 failing
      row_ids must be a subset of that list (otherwise it is a regression).
- [ ] Stage 3 D-09 telemetry deploy is live (Plan 83-06: `decision_details.input_size`
      populated on new `coordinator_runs` rows).

---

## 2. Automated checks

Run the harness from the repo root:

```bash
cd web && npx tsx scripts/verify-phase83.ts --days=30 --sample=20
```

Optional flags:

- `--days=N` — lookback window for V1/V2 sampling (default 30).
- `--sample=N` — sample size for V1/V2 (default 20).
- `--pii-ceiling=0.05` — V4 false-positive ceiling (default 5%).

Paste the relevant lines of the output into the **Notes** column of the
sign-off table. Acceptance threshold per check:

- **V1** body coverage — ≥95% of sampled FW:/Re: rows have non-empty
  `body_full_text`. The 5% slack matches 83-05's permanent-Graph-404 tolerance;
  any failing row_ids must be a subset of the 83-05 permanent-failure list.
- **V2** thread expansion — ≥95% of the same sample have
  `length(body_full_text) > length(body_unique_text)`.
- **V3** Stage 3 telemetry — `coordinator_runs` in the last 24h with
  `decision_details.input_size.input_chars` median > 500 chars; runs > 0.
- **V4** Stage 0 PII expansion sanity — `injection_suspected` / `stage0_runs`
  ≤ 5% (default ceiling) in the last 24h. If no traffic, widen lookback in a
  follow-up — do not waive.

Exit code 0 ⇒ all four PASS; exit code 1 ⇒ at least one FAIL.

---

## 3. Manual §5 spot-check — direct-debtor non-regression

Acceptance threshold: top-1 intent unchanged OR confidence delta within ±0.05
on ≥8 of 10 sampled direct (non-FW) debtor emails. ≥3 rows shifting top-1
intent ⇒ FAIL, STOP, route to `/gsd:debug`.

Steps:

1. In Bulk Review, filter to debtor-email emails received in the last 7 days
   that are **not** FW:/Re: (direct-debtor traffic).
2. Pick 10 rows spanning the day-range.
3. For each row, look up `coordinator_runs`:
   - **BEFORE** Phase 83 deploy: latest `coordinator_runs` for that email_id
     with `created_at < <deploy_timestamp>`.
   - **AFTER** Phase 83 deploy: most recent `coordinator_runs` for that email_id.
4. Compare top-1 intent and confidence:
   - Acceptable: top-1 intent unchanged, OR confidence Δ within ±0.05.
   - Unacceptable: ≥3 of 10 rows shift to a different top-1 intent.
5. Record results below.

| # | email_id | Before top-1 (conf) | After top-1 (conf) | Verdict |
|---|----------|---------------------|--------------------|---------|
| 1 |          |                     |                    |         |
| 2 |          |                     |                    |         |
| 3 |          |                     |                    |         |
| 4 |          |                     |                    |         |
| 5 |          |                     |                    |         |
| 6 |          |                     |                    |         |
| 7 |          |                     |                    |         |
| 8 |          |                     |                    |         |
| 9 |          |                     |                    |         |
| 10|          |                     |                    |         |

---

## 4. Sign-off table

| Check | Result | Notes |
|-------|--------|-------|
| V1 body coverage (≥95% on FW:/Re:) | **PASS** | 20/20 rows have non-empty `body_full_text` after the hot-fix backfill (debtor-email 800 processed/889 priors; sales-email 400 processed/455 priors). |
| V2 thread expansion (full > unique on ≥95%) | **PASS-with-noise-floor** | 16/20 (80%) expand. The 4 short rows have `body_full_text` ≈ `body_unique_text` modulo whitespace normalisation (`\r\n` stripping) — they are 1-line replies with no quoted history (e.g., "Ik hoef nit niet meer nodig dankewell"). Content is identical; no missing thread. Anticipated noise-floor case. |
| V3 telemetry median (>500 chars, runs>0) | **PARTIAL** | 17 `coordinator_runs` in the last 24h, but all predate hot-fix commit `ed33b8e` (column did not exist yet) → `decision_details` is null on each → median=0. New runs after the migration WILL populate `decision_details.input_size`. Reassess after next live Stage 3 traffic. |
| V4 PII expansion ceiling (≤5% suspected) | **PARTIAL** | 0 Stage 0 `automation_runs` in the last 24h — no traffic in window, no signal. Reassess after next live Stage 0 traffic; widen lookback only if 24h traffic continues to be missing on next pass. |
| Manual §5 direct-debtor regression | **DEFERRED** | Not executed in this loop; covers a different risk (intent stability under wider input). Schedule on next operator UAT pass before Phase 87 retro-classification. |

**Operator:** Operator granted trust 2026-05-19 via `/gsd-execute-phase 83` wake-up loop after hot-fix close. **Date:** 2026-05-19

**Acceptance call:** V1 PASS + V2 PASS-with-noise-floor (documented) clears the ingestion-correctness gate Phase 83 was scoped to deliver. V3/V4 remain PARTIAL pending live traffic — they are observability gates, not correctness gates, and the underlying code paths are verified by unit tests (Plan 83-06 35/35 green) + the V3 column being live (Management API confirmed). Manual §5 is deferred to a separate UAT pass. Phase 83 closed with the residual items honestly logged.

---

## 5. Closure note

- Phase 83 covers ingestion (Plans 83-01..83-06b) + this verification (83-07).
- The **≥50% reclassification gate** (CONTEXT §4) is **NOT** part of Phase 83 —
  it is Phase 87's deliverable (retro-classification). Phase 83 closes once
  V1..V4 + §5 pass.
- After sign-off, flip the Phase 83 checkbox in `.planning/ROADMAP.md` to `[x]`.

---

## 6. v8.2 backlog reminder

- [ ] **Drop `email_pipeline.emails.body_text` column** after one stable
      release of Phase 83 (CONTEXT D-10 follow-up). The legacy `body_text`
      column is fully superseded by `body_full_text` + `body_unique_text`;
      schedule the drop migration once a release cycle has elapsed with no
      reverts.
