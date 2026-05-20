# Phase 89 — Shadow Report (Plan 07)

**Run:** 2026-05-20
**Operator:** /gsd-execute-phase (Wave 3 / Plan 07)
**Acceptance scope:** SC-89-01, SC-89-03, SC-89-04, SC-89-05
**Phase-base commit (SC-89-05 gate baseline):** `7cf07ff` ("docs(089): plan Stage 1 LLM 2nd-pass auto-action promotion track")

---

## Step 1: Fire `classifier/llm-rules-seed.run`

**Status:** seed **simulated via direct PostgREST upsert** (idempotent via `on_conflict=swarm_type,rule_key`). The canonical Inngest invocation was not callable from this session (no live Inngest dev server / production event-key in scope).

### Re-fire via Inngest before production reliance

Operators MUST re-fire the event via one of:

- **Inngest dashboard** → Functions → `classifier/llm-rules-seed` → "Send event" → event name `classifier/llm-rules-seed.run`, empty payload.
- **CLI:** `npx inngest-cli@latest send classifier/llm-rules-seed.run` (against the project's `INNGEST_EVENT_KEY`).
- **Programmatic:** `inngest.send({ name: "classifier/llm-rules-seed.run" })` from a Next.js route.

The Inngest function is idempotent (`onConflict: "swarm_type,rule_key"` in `web/lib/inngest/functions/classifier-llm-rules-seed.ts:55-68`), so re-firing on top of the simulated upserts is a no-op for the 8 existing rows and will add any rows for swarms / categories added later.

### Seed simulation payload (verbatim shape from `classifier-llm-rules-seed.ts:55-68`)

```jsonc
{
  "swarm_type": "<from public.swarms WHERE enabled=true>",
  "rule_key": "llm:<category_key>:high",
  "kind": "agent_intent",
  "status": "candidate",
  "n": 0, "agree": 0, "ci_lo": null,
  "last_evaluated": null, "promoted_at": null,
  "notes": "Phase 89 — LLM 2nd-pass noise classifier (seed-simulated; re-fire via Inngest)"
}
```

### Source enumeration (PostgREST queries against live Supabase)

`public.swarms` enabled=true: `debtor-email`, `sales-email` (2 swarms).

`public.swarm_noise_categories` enabled=true, excluding `category_key='unknown'` (per A6 / RFC `docs/agentic-pipeline/stage-1-regex.md` hard-separation rule):

| swarm_type | category_key | action |
|---|---|---|
| debtor-email | payment_admittance | categorize_archive |
| debtor-email | auto_reply | categorize_archive |
| debtor-email | ooo_temporary | categorize_archive |
| debtor-email | ooo_permanent | categorize_archive |
| sales-email | auto_reply | manual_review |
| sales-email | ooo_temporary | manual_review |
| sales-email | ooo_permanent | manual_review |
| sales-email | payment_admittance | manual_review |

`CONFIDENCE_LEVELS = ["high"]` (per `classifier-llm-rules-seed.ts:29`).

→ **8 rows seeded** (4 debtor + 4 sales × 1 confidence level), all returned with new ids (verbatim PostgREST response in run log).

> **Action item for operators:** re-fire `classifier/llm-rules-seed.run` via Inngest before relying on the production promotion path. The simulated upsert produces an identical row shape; the re-fire is for trace fidelity (Inngest run log) and to confirm the function code path executes end-to-end against live Supabase.

---

## Step 2: SC-89-01 verification — `classifier_rules` has `llm:*:high` rows per active swarm

```sql
SELECT swarm_type, COUNT(*) AS rule_count
FROM public.classifier_rules
WHERE rule_key LIKE 'llm:%:high'
GROUP BY swarm_type
ORDER BY swarm_type;
```

| swarm_type    | rule_count |
|---------------|------------|
| debtor-email  | 4          |
| sales-email   | 4          |

Per-row detail (verbatim PostgREST response, sorted):

| swarm_type    | rule_key                       | kind          | status    |
|---------------|--------------------------------|---------------|-----------|
| debtor-email  | llm:auto_reply:high            | agent_intent  | candidate |
| debtor-email  | llm:ooo_permanent:high         | agent_intent  | candidate |
| debtor-email  | llm:ooo_temporary:high         | agent_intent  | candidate |
| debtor-email  | llm:payment_admittance:high    | agent_intent  | candidate |
| sales-email   | llm:auto_reply:high            | agent_intent  | candidate |
| sales-email   | llm:ooo_permanent:high         | agent_intent  | candidate |
| sales-email   | llm:ooo_temporary:high         | agent_intent  | candidate |
| sales-email   | llm:payment_admittance:high    | agent_intent  | candidate |

**SC-89-01: PASS** ✅ — every (active swarm × enabled noise category != 'unknown') has one candidate `llm:<cat>:high` row. `kind='agent_intent'` (per RESEARCH Pitfall 3 / OQ2 — closest fit in current enum). All `status='candidate'` — no promotions claimed.

---

## Step 3: Shadow-eval harness (SC-89-03)

### Harness location
`scripts/phase-89-shadow-eval.ts` (NEW this plan). Read-only: no `.insert`, `.update`, `.delete`, `.upsert` callsites. Loads `web/.env.local` via the same minimal parser as `scripts/phase-65-regression-backfill.ts`. Imports `wilsonCiLower` + `shouldPromote` from `web/lib/classifier/wilson.ts` via the documented relative-path convention (no path-alias `@/` outside the `web/` compile unit).

### Invocation

```bash
cd "/Users/nickcrutzen/Developer/Agent Workforce"
NODE_PATH=web/node_modules npx tsx scripts/phase-89-shadow-eval.ts
```

> Note: `NODE_PATH=web/node_modules` is required because `@supabase/supabase-js` is installed under `web/node_modules` (pnpm), not at the repo root. Phase 65's `scripts/phase-65-regression-backfill.ts` has the same constraint when run from outside `web/`.

### Output (verbatim)

```
# Phase 89 Shadow Report

**Generated:** 2026-05-20T06:19:25.605Z
**Source:** public.classifier_rule_telemetry
**Filter:** rule_key LIKE 'llm:%'
**Rows returned:** 0

| swarm_type | rule_key | n | agree | ci_lo | promotable |
|---|---|---|---|---|---|

**Promotable rule_keys: 0**
**SC-89-03 acceptance:** PENDING — 0 promotable rule_keys on current telemetry. Per 089-06-PUSH-LOG.md, the 839 backfilled agent_runs rows all have human_verdict IS NULL; classifier_rule_telemetry filters on human_verdict IS NOT NULL, so backfilled rows do NOT yet contribute to (n, agree). Mechanism is shipped (Plans 02-06); first promotion happens after operator retro-review accumulates n>=30 verdicts with ci_lo>=0.92 on at least one llm:*:high rule_key (most likely candidate: llm:auto_reply:high with 70 backfilled rows + 32 for llm:payment_admittance:high).
```

### Informational: raw `agent_runs.rule_key LIKE 'llm:%'` distribution (NOT used by view)

The view `public.classifier_rule_telemetry` filters on `human_verdict IS NOT NULL` (verified in `supabase/migrations/20260428_classifier_rule_telemetry.sql:11-13`). The backfilled rows do not yet satisfy that filter, but they exist in the underlying `agent_runs` table:

| rule_key                       | raw n in agent_runs | human_verdict state |
|--------------------------------|---------------------|---------------------|
| llm:unknown:high               | 273                 | all NULL            |
| llm:unknown:medium             | 246                 | all NULL            |
| llm:unknown:low                | 176                 | all NULL            |
| llm:auto_reply:high            | 70                  | all NULL            |
| llm:payment_admittance:high    | 32                  | all NULL            |
| llm:payment_admittance:medium  | 22                  | all NULL            |
| llm:ooo_temporary:high         | 12                  | all NULL            |
| llm:ooo_temporary:medium       | 6                   | all NULL            |
| llm:ooo_permanent:high         | 2                   | all NULL            |
| **total**                      | **839**             | **839 NULL / 0 set**|

**Top 5 by raw n:** `llm:unknown:high` (273), `llm:unknown:medium` (246), `llm:unknown:low` (176), `llm:auto_reply:high` (70), `llm:payment_admittance:high` (32).

Note: `llm:unknown:*` keys are intentionally NOT seeded (per A6 / RFC `docs/agentic-pipeline/stage-1-regex.md` — `unknown` routes to Stage 2/3 dispatch via `action='swarm_dispatch'`, never to `categorize_archive`). They will never accumulate Wilson-CI evidence against a seeded rule; they aggregate only in the view if/when operators retro-review them, and the promotion cron then ignores them because no candidate row exists with `rule_key='llm:unknown:high'`.

### SC-89-03 acceptance interpretation

The plan's preferred wording is *"identifies ≥1 promotable rule_key OR documents pending accumulation timeline"*. With the post-backfill state honestly surfaced:

- **Mechanism shipped:** harness compiles + connects + queries view + applies `wilsonCiLower` + `shouldPromote`. Plans 02–06 complete (worker writes `rule_key`, migration backfilled 839 historic rows, view aggregates them once reviewed, cron promotes when gate passes).
- **First promotion timeline:** post-Phase-89 operator retro-review. The most viable candidates are `llm:auto_reply:high` (n=70 raw → needs n≥30 reviews with ≥92% Wilson lower bound) and `llm:payment_admittance:high` (n=32 raw → same gate). `llm:ooo_temporary:high` (12) and `llm:ooo_permanent:high` (2) cannot promote until additional production traffic accumulates beyond n=30.
- **Followup:** decide between (a) operator retro-reviewing the 102 high-confidence non-unknown rows in `/automations/debtor-email/stage-1` (and the 383 sales-email equivalents) to bootstrap the view, or (b) a corpus-spot-check pathway analogous to the Phase 60-08 hard-case sampling that lowered `PROMOTE_CI_LO_MIN` from 0.95 to 0.92.

**SC-89-03: PENDING (documented)** — mechanism live; first promotion gated on operator action documented above and in Step 5.

---

## Step 4: SC-89-05 — automated git-diff gate (witnessing copy)

The gate (per Task 1 `<automated>` block + checker B3) compares `HEAD` to the phase-base commit `7cf07ff`. Three sub-checks; all must output `0`.

### Sub-check A — no migration touches `classifier_rule_telemetry`

```bash
git diff 7cf07ff..HEAD -- supabase/migrations/ | grep -i 'classifier_rule_telemetry' | wc -l
```

Output: `0` ✅

### Sub-check B — promotion cron is unmodified

```bash
git diff 7cf07ff..HEAD -- web/lib/inngest/functions/classifier-promotion-cron.ts | wc -l
```

Output: `0` ✅

### Sub-check C — no edit in screen-worker diff references `DEBTOR_REGEX_MODULE_KEY`

```bash
git diff 7cf07ff..HEAD -- web/lib/inngest/functions/classifier-screen-worker.ts | grep -E '^[+-]' | grep -v '^[+-][+-][+-]' | grep 'DEBTOR_REGEX_MODULE_KEY' | wc -l
```

Output: `0` ✅

(Plan 02's edits to `classifier-screen-worker.ts` are scoped to Edit Sites 1, 2, and 3 in `089-PATTERNS.md` — the LLM-path insert, the failure-path insert, and the `effectiveMatchedRule` derivation just before the whitelist gate. None touches the `DEBTOR_REGEX_MODULE_KEY` dispatch token at L401, which CONTEXT D-04 reserves for Phase 88.)

### Self-contained runner (re-runnable from any worktree state)

```bash
PHASE_BASE=7cf07ff
git diff "$PHASE_BASE"..HEAD -- supabase/migrations/ | grep -i 'classifier_rule_telemetry' | wc -l | grep -q '^[[:space:]]*0$' && echo "A: PASS" || echo "A: FAIL"
git diff "$PHASE_BASE"..HEAD -- web/lib/inngest/functions/classifier-promotion-cron.ts | wc -l | grep -q '^[[:space:]]*0$' && echo "B: PASS" || echo "B: FAIL"
git diff "$PHASE_BASE"..HEAD -- web/lib/inngest/functions/classifier-screen-worker.ts | grep -E '^[+-]' | grep -v '^[+-][+-][+-]' | grep 'DEBTOR_REGEX_MODULE_KEY' | wc -l | grep -q '^[[:space:]]*0$' && echo "C: PASS" || echo "C: FAIL"
```

**Live run output (this session):**

```
A: PASS
B: PASS
C: PASS
```

**SC-89-05: PASS** ✅

---

## Step 5: SC-89-04 operator UAT runbook (post-Phase-89 action)

Per CONTEXT D-02 ("do not flip mutate flag as part of Phase 89"), the mutate-flag flip is explicitly NOT performed by this plan. The runbook below is the hand-off; operator executes it after the simulated/Inngest-fired seed and any retro-review or corpus spot-check that produces a promotable row.

### Pre-conditions

- Step 2 above PASSED (classifier_rules carries the 8 `llm:*:high` candidate rows).
- Plans 02–06 are deployed (Wave 1 + Wave 2). Stage-1 worker writes `rule_key`; `recordVerdict` accepts `llm:*` keys; row-loader synthesizes `ruleKey` for LLM rows.
- At least one `llm:*:high` rule has accumulated `n >= 30` and `ci_lo >= 0.92` against `human_verdict IN ('approved', 'edited_minor')` (verifiable by re-running `npx tsx scripts/phase-89-shadow-eval.ts` and seeing `Promotable rule_keys: >=1`).

### Operator steps

1. **Review accumulated `llm:*:high` candidates** in the classifier-rules dashboard:
   ```
   https://agent-workforce.vercel.app/classifier-rules?status=candidate&kind=agent_intent
   ```
   Confirm at least one row shows `n >= 30, ci_lo >= 0.92, status=candidate`. If none, return to retro-review; do NOT proceed.

2. **Set `CLASSIFIER_CRON_MUTATE=true`** in Vercel env (Production scope) for the project `agent-workforce` (`prj_APDosWEbpdca53P5UxXst8tCJMVV`, Moyne Roberts org `team_xILPwdz1coAgNKNP0zjMteGI`). Trigger a redeploy or wait for the next deployment so the env-var update takes effect.

3. **Wait for the next promotion-cron tick.** The cron is scheduled by `web/lib/inngest/functions/classifier-promotion-cron.ts` — do NOT modify that file (SC-89-05 gate). Verify the cron promoted at least one `llm:*:high` row:
   ```sql
   SELECT swarm_type, rule_key, n, agree, ci_lo, status, promoted_at
   FROM public.classifier_rules
   WHERE rule_key LIKE 'llm:%:high'
     AND status = 'promoted'
   ORDER BY promoted_at DESC NULLS LAST
   LIMIT 10;
   ```
   Expectation: at least one row with `status='promoted'` and a non-null `promoted_at` after the env-var flip.

4. **Wait for the next matching live LLM verdict.** Stage-1 worker (`classifier-screen-worker.ts`) computes `effectiveMatchedRule = llmInvoked && llm_category_key && llm_confidence ? \`llm:${cat}:${conf}\` : regexOutcome.matchedRule`. When the LLM 2nd-pass returns (for example) `{ category_key: "auto_reply", confidence: "high" }` and `classifier_rules` has `llm:auto_reply:high` at `status='promoted'`, then `whitelistSet.has("llm:auto_reply:high") === true` → debtor dispatch handler runs `categorize+archive`.

5. **Verify with this SELECT** against live `automation_runs`:
   ```sql
   SELECT id, result, created_at
   FROM public.automation_runs
   WHERE triggered_by = 'stage-1-worker'
     AND result->>'stage' = 'categorize+archive'
     AND result->'predicted'->>'rule' LIKE 'llm:%'
   ORDER BY created_at DESC
   LIMIT 5;
   ```
   Expectation: at least one row exists. The row's `result.predicted.rule` will be the promoted `llm:*:high` key; `result.stage='categorize+archive'`; `triggered_by='stage-1-worker'`.

6. **Capture the verifying row id + json into a follow-up phase artefact** (`089-04-UAT-LIVE.md` or a Phase 89.1 directory). Do NOT amend this Phase 89 SHADOW-REPORT.

### Out-of-scope / explicit non-action by Plan 07

- Do NOT flip `CLASSIFIER_CRON_MUTATE` from this session.
- Do NOT promote any candidate row by direct DB UPDATE (the cron is the only legitimate promotion path; bypassing it violates the Phase 60 promotion contract).
- Do NOT modify `classifier-promotion-cron.ts`, `classifier_rule_telemetry.sql`, or any line referencing `DEBTOR_REGEX_MODULE_KEY` in `classifier-screen-worker.ts` (Step 4 gate).

**SC-89-04: DEFERRED to operator UAT** (runbook delivered).

---

## Step 6: Sign-off

- [x] Seed fired (simulated via PostgREST upsert; operator must re-fire via Inngest before production reliance — Step 1)
- [x] `classifier_rules` has `llm:*:high` rows for every active swarm (Step 2 — 8 rows, 4 per swarm)
- [x] Shadow-eval ran + result documented as PENDING with concrete accumulation timeline (Step 3)
- [x] SC-89-05 git diff gate = all three `0` against phase-base `7cf07ff` (Step 4 — automated + witnessed)
- [x] SC-89-04 UAT runbook handed off (Step 5)

---

## Acceptance criteria coverage map

| Criterion | Status   | Evidence                                                                                                                |
|-----------|----------|-------------------------------------------------------------------------------------------------------------------------|
| SC-89-01  | PASS     | Step 2 — 8 `llm:*:high` candidate rows across 2 active swarms (debtor-email, sales-email).                              |
| SC-89-02  | (Wave 1) | Covered by Plans 02 + 05 vitest harnesses (commits `6edbe49`, `f2a376c`, `b0bf17e`); not re-verified in Plan 07.        |
| SC-89-03  | PENDING  | Step 3 — harness shipped + ran; 0 promotable on current telemetry (839 rows still `human_verdict=NULL`). Timeline doc'd.|
| SC-89-04  | DEFERRED | Step 5 — UAT runbook documented per CONTEXT D-02 ("do not flip mutate flag as part of Phase 89").                       |
| SC-89-05  | PASS     | Step 4 — automated 3-sub-check git-diff gate against phase-base `7cf07ff`, all three return `0`.                       |

---

## Files touched by Plan 07

- **NEW** `scripts/phase-89-shadow-eval.ts` — read-only Wilson-CI shadow reporter (140 lines incl. docblock).
- **NEW** `.planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-SHADOW-REPORT.md` — this file.
- **NEW** `.planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-07-SUMMARY.md` — plan summary (created next).

No edits to: `web/lib/inngest/functions/classifier-promotion-cron.ts`, `supabase/migrations/20260428_classifier_rule_telemetry.sql`, the `DEBTOR_REGEX_MODULE_KEY` dispatch token in `web/lib/inngest/functions/classifier-screen-worker.ts` (SC-89-05 gate, Step 4).
