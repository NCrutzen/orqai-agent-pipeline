---
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
reviewed: 2026-06-16T14:35:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - web/lib/info-routing/actionable-tokens.ts
  - web/scripts/eval/info-unknown-pool-noise-baseline.ts
  - supabase/migrations/20260616_phase130_agent_runs_swarm_type_check_info_routing.sql
  - supabase/migrations/20260616b_phase130_info_routing_noise_categories.sql
  - supabase/migrations/20260616c_phase130_info_routing_classifier_rules_seed.sql
  - supabase/migrations/20260616d_phase130_info_unknown_pool_composition_view.sql
  - web/__tests__/stage-1/info-routing-actionable-carveout.test.ts
  - web/__tests__/migrations/agent-runs-info-routing-insert.test.ts
  - web/lib/inngest/functions/__tests__/classifier-screen-worker.info-routing-categories.test.ts
  - web/scripts/eval/__tests__/info-unknown-pool-noise-baseline.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 130: Code Review Report

**Reviewed:** 2026-06-16T14:35:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

I reviewed the Phase 130 info-routing Stage-1 noise-recalibration changeset against the focus areas: ReDoS in the carve-out regex, SQL injection in the baseline script, RLS correctness of the four migrations, the Stage-1/Stage-3 hard-separation invariant, and the Wilson-CI math. The security posture is sound on every axis that was flagged: the carve-out regex is a bounded literal-keyword alternation with **no catastrophic-backtracking risk**; the baseline script uses the Supabase query-builder (parameterised) with **no string interpolation into SQL**; the measurement view is correctly `security_invoker = true`; and the hard-separation invariant holds (no `swarm_intents` row is written by any migration). The Wilson math reuses the verified `wilson.ts` helper correctly. Tests pass (43/43 on the two suites I ran).

The defects I found are not in those headline areas. The most material is a **data-flow bug in the baseline sampler**: it reads `subject`/`from` from `decision_details`, but the Stage-1 writer never stores those keys there, so the human-labelling scaffold emits `null` subject/sender for every row — silently defeating the manual labelling procedure that is NOISE-03's whole point. The remaining findings are a phantom "production backstop" predicate that no production code calls, a statistically wrong choice of Wilson bound for the AFTER measurement, and several quality items. No BLOCKER-class defect; the sampler bug is a WARNING because it degrades the measurement tool rather than corrupting data or security.

## Warnings

### WR-01: Baseline sampler reads subject/sender from `decision_details` keys the writer never sets

**File:** `web/scripts/eval/info-unknown-pool-noise-baseline.ts:335-350`
**Issue:** The sampler maps each pooled row with:
```ts
subject: typeof dd.subject === "string" ? dd.subject : null,
sender:  typeof dd.from === "string"    ? dd.from    : null,
snippet: typeof dd.llm_reasoning === "string" ? dd.llm_reasoning : null,
```
But the Stage-1 writer (`classifier-screen-worker.ts:449-471`, `emitPipelineEvent` `decision_details`) only writes `regex`, `llm_invoked`, `llm_category_key`, `llm_confidence`, `llm_reasoning`, `llm_error`, `final_category_key`, `entity`, `predictor`, `model_key`. There is **no `subject` and no `from`** in `decision_details`. So `subject` and `sender` are `null` for every sampled row. The emitted "label-ready scaffold" (lines 356-365) asks a human to label noise-vs-routable, but gives them only `entity` + the LLM's own `llm_reasoning` as `snippet` — never the actual subject or sender. The human verification NOISE-03 hinges on is crippled: you cannot reliably label an email as noise/routable from the classifier's reasoning alone, and using the LLM's reasoning as the labelling substrate biases the human toward the LLM's verdict (circularity — the exact false-success failure mode Pitfall 5 warns against).
**Fix:** The script `select`s `email_id` already (line 325) but never uses it. Either (a) JOIN/lookup the real subject+sender from `email_pipeline.emails` via `email_id`, or (b) if subject/sender must come from `decision_details`, add them to the writer's `decision_details` payload in `classifier-screen-worker.ts`. Minimum viable fix — fetch the email row:
```ts
// after the pool query, for the sampled ids:
const ids = candidates.map(c => c.id); // or email_ids
const { data: emails } = await admin
  .from("emails").schema("email_pipeline")
  .select("id, subject, from_address").in("id", emailIds);
// then join subject/sender onto each candidate by email_id
```
Do NOT use `llm_reasoning` as the labelling snippet — it biases the human.

### WR-02: AFTER measurement uses the Wilson *lower* bound, which cannot bound the post-fix noise share from above

**File:** `web/scripts/eval/info-unknown-pool-noise-baseline.ts:179` (`wilson_ci_lo: wilsonCiLower(n, noise)`), used for BOTH before and after runs
**Issue:** The NOISE-03 success claim is "true-noise share drops ~50% → **<20%**". To *prove an upper bound* on the AFTER noise fraction (i.e. "noise is now below 20%"), you need the Wilson **upper** bound. The script only ever computes `wilsonCiLower`. With the lower bound you can show BEFORE noise was *at least* X, but you cannot show AFTER noise is *at most* 20% — the lower bound is the wrong tail for the AFTER assertion. The header comment (lines 41-44) even reasons about "the BEFORE CI lower bound sits well above the AFTER CI upper bound" — but no upper bound is ever computed, so that comparison can't actually be made with the script's output. As written, the tool cannot substantiate the `<20%` half of its own success criterion.
**Fix:** Add a `wilson_ci_hi` (Wilson upper bound) to `NoiseFraction` and report it. `wilson.ts` only exports the lower bound; add a sibling `wilsonCiUpper(n, k, z)` (same formula with `+ z*sqrt(...)`), or compute it inline:
```ts
const center = phat + z2 / (2 * n);
const radius = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
const hi = Math.min(1, (center + radius) / denom);
```
Report both bounds; assert AFTER `wilson_ci_hi < 0.20` for the success gate.

### WR-03: `hasActionableToken` is documented as the "production carve-out backstop the screen-worker uses" but has zero production call sites

**File:** `web/lib/info-routing/actionable-tokens.ts:10-13, 50-53`
**Issue:** The module header states this is "the PRODUCTION carve-out backstop: a pure predicate the screen-worker calls when the LLM-prompt carve-out needs a programmatic check." A repo-wide search for `hasActionableToken` / `ACTIONABLE_TOKEN_REGEX` / `actionable-tokens` outside the module and its test returns **nothing** — `classifier-screen-worker.ts` does not import or call it. So the NOISE-04 carve-out is, in production, enforced *only* by the LLM prompt and the Wilson shadow gate; the "programmatic backstop" is dead code that exists solely to be unit-tested. This is a real safety gap relative to the plan's threat model (T-130-02-01 "HIGH SEVERITY: false-archive of actionable/routable mail"): the boundary test gives false confidence that a programmatic guard runs at classification time, when in fact no code path consults it. The carve-out can only ever fail-open until the worker actually calls it.
**Fix:** Either (a) wire `hasActionableToken` into `classifier-screen-worker.ts` so that, for `swarm_type='info-routing'`, a positive match forces `unknown`/not-noise *before* the LLM verdict is allowed to archive (the actual "backstop" the docstring promises), or (b) if the carve-out is genuinely prompt-only by design for this phase, correct the module/test/RFC wording to stop claiming a programmatic backstop the worker does not use, and file a follow-up to wire it. Given the plan calls this "the cardinal safety constraint," option (a) is strongly preferred.

## Info

### IN-01: `email_id` is selected but never used in the sampler mapping

**File:** `web/scripts/eval/info-unknown-pool-noise-baseline.ts:325` and `:335-350`
**Issue:** `.select("id, decision_details, email_id")` fetches `email_id`, but the mapping callback's destructured type omits it and nothing references it. Dead column in the projection. (It becomes load-bearing if WR-01 is fixed via an `email_pipeline.emails` lookup.)
**Fix:** Use it (per WR-01) or drop it from the `select`.

### IN-02: View `pct` partitions NULL-entity rows into a single anonymous bucket without comment

**File:** `supabase/migrations/20260616d_phase130_info_unknown_pool_composition_view.sql:42-53`
**Issue:** `PARTITION BY decision_details->>'entity'` groups all rows where `entity` is absent/null into one `NULL` partition, and `mailbox_entity` surfaces as SQL `NULL` (not the `(null)` sentinel the TS sampler uses on line 105/163). Per-mailbox pct for the NULL bucket mixes smeba-with-missing-entity and fire-control-with-missing-entity together, which could quietly distort the "per-mailbox" reading if any Stage-1 events lack `entity`. Not a correctness bug given current data (entity is denormalised by the writer), but the asymmetry between the view's `NULL` and the script's `(null)` is a latent inconsistency.
**Fix:** Add a header note that rows with a missing `entity` collapse into a single NULL partition, and consider `coalesce(decision_details->>'entity', '(unknown)')` to make the bucket explicit and align with the script's sentinel convention.

### IN-03: `parseLabelledRows` does not validate `mailbox_entity` and silently nulls non-string values

**File:** `web/scripts/eval/info-unknown-pool-noise-baseline.ts:242-247`
**Issue:** A row whose `mailbox_entity` is a number, object, or omitted is silently coerced to `null` rather than rejected, so a malformed labelled file collapses several mailboxes' labels into the `(null)` bucket of `computeNoiseFractions` (line 163) without any error. For a measurement tool whose output gates a data-loss decision (promotion to auto-archive), a typo in the labelled file degrades silently instead of failing loud.
**Fix:** Reject non-string `mailbox_entity` (or at least warn), mirroring the strict `label`/`id` checks already present on lines 234-241.

### IN-04: `--n` flag accepts non-integers (e.g. `--n=3.7`) without normalisation

**File:** `web/scripts/eval/info-unknown-pool-noise-baseline.ts:301-303`
**Issue:** `const n = Number(parseFlag(...) ?? DEFAULT_N)` then guards `Number.isFinite(n) && n > 0`, but `3.7` passes the guard and flows into `Math.min(n, sorted.length)` / `slice(0, ...)`, which truncates non-deterministically relative to operator intent. Minor, but `--n` is documented as `<int>`.
**Fix:** `const n = Math.floor(Number(...))` after the finite/positive guard, or reject non-integers explicitly.

---

## Cleared focus areas (verified, no defect)

- **ReDoS (carve-out regex):** `ACTIONABLE_TOKEN_REGEX` is a single bounded alternation of literal keywords anchored on `\b`, with no nested quantifiers and no `.*`/`.+`. No catastrophic-backtracking path exists. The two-arm structure (`storing` start-boundary-only vs the full-`\b` arm) is correct and matches the pinned test semantics (`restoring` correctly does NOT match; `storingsdienst` does). **No finding.**
- **SQL injection (baseline script):** all DB access goes through the Supabase PostgREST query-builder (`.eq`/`.gte`/`.lt`/`.select`) with `since`/`until`/`SWARM` passed as bound values, never interpolated into SQL text. The view name is a string literal. **No finding.**
- **RLS / `security_invoker`:** the measurement view is `WITH (security_invoker = true)`; no `SECURITY DEFINER`; no new base table (no missing RLS policy); seeds touch existing RLS-covered tables; CHECK-widen is pure DDL. Compliant with CLAUDE.md. **No finding.**
- **Hard-separation invariant:** none of the four migrations references `swarm_intents`; the two registry seeds write only `swarm_noise_categories` and `classifier_rules`. Invariant holds. **No finding.**
- **Wilson-CI math:** `computeNoiseFractions` reuses the verified `wilsonCiLower` correctly (n=0 → 0 guard, `under_min_n` flag at `PROMOTE_N_MIN`). The math is right; the *choice of bound* for the AFTER case is the issue (WR-02), not the formula.
- **Migration ordering:** `20260616` < `20260616b` < `20260616c` < `20260616d` sorts correctly; Plan-01 CHECK-widen applies before the seeds that depend on it.

---

_Reviewed: 2026-06-16T14:35:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
