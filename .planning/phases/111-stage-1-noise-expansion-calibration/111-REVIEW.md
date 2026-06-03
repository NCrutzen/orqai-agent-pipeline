---
phase: 111-stage-1-noise-expansion-calibration
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - web/lib/inngest/functions/classifier-screen-worker.ts
  - web/lib/inngest/functions/classifier-verdict-worker.ts
  - web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts
  - web/lib/automations/sales-email/retro/select-candidates.ts
  - web/lib/automations/sales-email/retro/aggregate-baseline.ts
  - web/lib/automations/sales-email/retro/loopback-validation.ts
  - scripts/sales-stage-1-cluster-mine.ts
  - web/lib/inngest/events.ts
  - web/app/api/inngest/route.ts
  - supabase/migrations/20260603_stage_1_retro_runs.sql
  - supabase/migrations/20260603_sales_noise_calibration_flip.sql
findings:
  critical: 0
  warning: 6
  info: 5
  total: 11
status: issues_found
---

# Phase 111: Code Review Report

**Reviewed:** 2026-06-03
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Phase 111 sales-email Stage 1 noise calibration submission across the four key concern areas. The big structural wins hold up:

- **Swarm-agnostic gates are clean.** The verdict-worker dry-run gate (Finding 1) and the screen-worker promotion gate (Finding 2 / Step 5) both route through registry/`swarm_type`-scoped calls with no `swarm_type === 'X'` literal branch. The debtor auto-action path is gated on `stage1_regex_module === '@/lib/debtor-email/classify'` (a registry value, not a swarm literal), and sales (regex module null) correctly falls through to the swarm-agnostic Step 5. No regression to the debtor path was introduced — the inline gate wraps both `categorize` and `archive` and defaults fail-closed.
- **Retro harness replay-safety is correct.** `run_id` is resolved inside `step.run("resolve-run-id")`, the upsert is `onConflict: "run_id,email_id", ignoreDuplicates`, side-channel isolation is honored (writes only `stage_1_retro_runs`), and no `inngest.send` appears.
- **Cluster-mine is genuinely read-only.** No INSERT/upsert/update anywhere; promotion is operator-gated by construction.
- **CLAUDE.md compliance:** `inngest.send` is never destructured (all inline casts), the migration RLS pattern is correct (ENABLE RLS + service-role policy), and the calibration flip correctly excludes `payment_admittance` and `unknown`.

No BLOCKERs found. Six WARNINGs and five INFO items below — the most material are an event-schema contract drift on `classifier/verdict.recorded` (the emitted payloads omit required `rule_key`/`entity` fields), and a Stage-4 telemetry write that violates the documented side-channel/disposition expectations when the inline archive is dry-run-blocked.

## Warnings

### WR-01: verdict-worker emits a Stage-4 "auto_archived_noise" telemetry row even when the inline archive was dry-run-BLOCKED

**File:** `web/lib/inngest/functions/classifier-verdict-worker.ts:115-318`
**Issue:** The Finding-1 dry-run gate correctly wraps the inline `categorize`/`archive` calls (lines 124-144) so that for sales (all stages blocked) no live Outlook side-effect fires. However, control still falls through to the unconditional `emit-stage-4-handled` `step.run` (line 263) which writes a `pipeline_events` row with `decision: "auto_archived_noise"` and `archived_at: new Date().toISOString()`. For a dry-run-blocked sales verdict, **nothing was archived**, yet Stage 4 telemetry asserts it was. This pollutes the handled-overview surface and any downstream metric that trusts Stage-4 `auto_archived_noise` as ground truth that an email left the inbox. The migration's "INERTNESS GUARANTEE" comment (`20260603_sales_noise_calibration_flip.sql:35-47`) claims the flip "fires no live archive" — true for Outlook, but it does fire a false telemetry record.
**Fix:** Gate the Stage-4 emit on the same condition as the inline archive. Capture the gate result once and reuse it:
```ts
const archiveLive = category.outlook_label && !isStageBlocked(swarmRow, "stage_1_archive");
if (archiveLive) {
  await step.run("categorize", ...);
  await step.run("archive", ...);
}
// ... side-effect dispatch ...
if (archiveLive) {
  await step.run("emit-stage-4-handled", async () => { /* ... */ });
}
```
Otherwise, the only signal of "real archive happened" is decoupled from the actual side-effect.

### WR-02: `classifier/verdict.recorded` payloads omit fields the event schema declares as required

**File:** `web/lib/inngest/events.ts:203-216`, emitted at `web/lib/inngest/functions/classifier-screen-worker.ts:628-639, 951-963`
**Issue:** The `classifier/verdict.recorded` event type declares `rule_key: string` and `entity: string` as **required** (non-optional) fields. Every emit site in `classifier-screen-worker.ts` sends a payload that contains neither `rule_key` nor `entity` (only `automation_run_id, swarm_type, decision, message_id, source_mailbox, predicted_category, override_category`). This is invisible to `tsc` solely because the emit goes through the `(inngest.send as unknown as SendFn)` cast (and `SendFn` types `data` as `Record<string, unknown>`), which is exactly what the cast was meant to widen past — but here it is silently hiding a real contract mismatch. The consuming `classifier-verdict-worker.ts:32-40` never reads `rule_key`/`entity`, so there is no runtime crash today, but the schema is now lying about the contract and any future subscriber that trusts `event.data.rule_key`/`entity` will get `undefined`.
**Fix:** Make `rule_key` and `entity` optional in the event schema to match the actual emitted shape, or thread the real values into the emit payloads:
```ts
"classifier/verdict.recorded": {
  data: {
    automation_run_id: string;
    swarm_type: string;
    rule_key?: string;          // emitters do not send this
    decision: "approve" | "reject";
    message_id: string;
    source_mailbox: string;
    entity?: string | null;     // emitters do not send this
    predicted_category: string;
    override_category?: string | null;
  };
};
```

### WR-03: retro `would_archive` is computed from the PRE-flip action map, so the false-archive signal can silently invert depending on apply order

**File:** `web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts:74-111`
**Issue:** `would_archive` is derived from `actionByKey.get(predicted_category_key) === "categorize_archive"`, read live from `swarm_noise_categories` at run time. The whole point of the retro harness (per the file header and `20260603_sales_noise_calibration_flip.sql`) is to produce **calibration evidence that INFORMS the flip decision** (D-07 seeding, D-09 loopback). But the calibration flip migration changes `auto_reply`/`ooo_temporary`/`ooo_permanent` to `categorize_archive`. If the retro runs *after* the flip is applied, `would_archive` (and therefore `false_archive_suspect` and the entire `aggregate-baseline` / `loopback-validation` output) reflects the post-flip world; if it runs *before*, it reflects the pre-flip world. The harness gives no signal of which action-map snapshot it used, so the D-09 loopback enable/disable recommendation is non-reproducible across apply order. Given Plan 05 applies the migration in the same phase, this ordering ambiguity is live.
**Fix:** Persist the action snapshot used (e.g. store `action_at_classify_time` per row, or stamp the run with a registry-version hash) so the baseline is interpretable. At minimum, document in the run output which action values were in effect, and pin the retro to run before the flip.

### WR-04: per-email `classify-${c.email_id}` step IDs can collide / exceed Inngest step-name constraints, and one bad email aborts the whole run

**File:** `web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts:97-143`
**Issue:** Two coupled robustness problems on the per-email loop over up to `STAGE_1_RETRO_HARD_CAP = 40000` candidates:
1. Step name is `classify-${c.email_id}`. `email_id` is a uuid (safe), but if `selectCandidates` ever returns duplicate ids across the two corpora merge (no dedup on `id` is performed — see WR-05), two steps share an ID, and Inngest memoizes the second to the first's result, silently skipping a classification.
2. The loop has no per-email error isolation: `Stage1OutputSchema.parse` throws on any malformed LLM output, and with `retries: 3` the *entire* 40k-email run restarts from the failing step on each retry, then hard-fails — losing the partial work and burning Orq tokens. A single unparseable verdict aborts the batch.
**Fix:** Wrap the `invokeOrqAgent` + parse in a try/catch inside the step that records a `predicted_category_key: 'unknown'` / error sentinel row instead of throwing (mirrors the live screen-worker D-11 coercion at `classifier-screen-worker.ts:382-426`), so one bad email doesn't abort 40k. Dedup candidates by `email_id` before the loop (see WR-05).

### WR-05: `selectCandidates` cap is enforced on a non-deduplicated merge and can over- or under-count

**File:** `web/lib/automations/sales-email/retro/select-candidates.ts:96-134`
**Issue:** Each corpus is read with `.limit(readCap)` (`cap + 1`) and the two arrays are concatenated, then `merged.length > cap` throws. Two issues: (a) the cap guard fires on the *sum* but each query independently capped at `cap+1`, so a window with `cap` outlook rows AND `cap` sugarcrm rows yields `2*(cap+1)` and throws even though the operator only asked for `cap` — the error message is correct but the "+1 sentinel" comment (line 97-98) describes a per-query sentinel that doesn't actually detect single-corpus truncation (if exactly `readCap` rows come back from one corpus, you cannot tell whether it truncated). (b) There is no dedup; if the same email exists in both corpora (e.g. a sugarcrm-imported copy of an Outlook mail) it is classified twice and double-counts in the baseline. The comment claims fail-loud truncation detection but a single corpus returning exactly `cap+1` while the other returns 0 silently passes the `> cap` check at `cap+1`... which actually throws — acceptable — but the asymmetric per-corpus truncation case (corpus A has cap+5 rows but only cap+1 are read) is undetectable.
**Fix:** Read each corpus capped at `cap+1`, detect truncation per-corpus (`length === readCap` → throw with which corpus truncated), then `cap`-check the merged total, then dedup by `email_id` before returning.

### WR-06: SugarCRM corpus is read with no mailbox/tenant scoping — cross-tenant leakage risk into the sales baseline

**File:** `web/lib/automations/sales-email/retro/select-candidates.ts:114-124`
**Issue:** Corpus B selects `source = 'sugarcrm'` with no `mailbox` or entity filter (deliberate, per the Pitfall-5 comment, because `mailbox` holds bean labels not addresses). But `email_pipeline.emails` is a shared multi-swarm table. If any non-Smeba `source='sugarcrm'` rows ever land there (another brand's CRM import, or a future swarm), they are silently swept into the **sales** baseline and the cluster-miner's discovery surface, biasing the D-07 noise-key recommendations with foreign-tenant mail. The code assumes `sugarcrm` ⊆ Smeba; nothing enforces it.
**Fix:** Add an explicit tenant guard if any column supports it (entity/brand), or assert at minimum that all returned `sugarcrm` rows belong to the expected Smeba set and fail loud otherwise. If `sugarcrm` is provably single-tenant today, encode that invariant as a comment + a guard rather than an undocumented assumption.

## Info

### IN-01: redundant optional chaining on always-defined `result.usage` / `result.agent`

**File:** `web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts:118,134`
**Issue:** `InvokeResult.usage` and `.agent` are non-optional (`web/lib/automations/orq-agents/client.ts:98-108`), so `result.usage?.total_tokens ?? 0` and `result.agent?.agent_key ?? null` chain on values that cannot be undefined. Harmless but misleading about the contract.
**Fix:** Drop the `?.` or, if defending against a future shape change, leave a comment saying so.

### IN-02: `void STAGE_1_RETRO_HARD_CAP;` import-keep is a code smell

**File:** `web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts:43`
**Issue:** The constant is imported and immediately `void`-ed solely to keep the import. It is never used in this file (the cap is applied inside `selectCandidates`). This is dead reference noise.
**Fix:** Remove both the import of `STAGE_1_RETRO_HARD_CAP` and the `void` line; `selectCandidates` already owns the cap.

### IN-03: `aggregate-baseline` uses an unpaginated `.select()` over up to 40k rows

**File:** `web/lib/automations/sales-email/retro/aggregate-baseline.ts:54-62`
**Issue:** The aggregation reads `stage_1_retro_runs WHERE run_id = $1` with no `.range()`/pagination. PostgREST defaults to a 1000-row cap unless overridden, so for a run with >1000 emails the baseline silently aggregates only the first 1000 rows — under-counting every category. (Out-of-scope for v1 as a perf concern, but flagged because it is a correctness risk for the calibration evidence.)
**Fix:** Paginate the read (range loop, as the cluster-miner already does at `scripts/sales-stage-1-cluster-mine.ts:222-244`) or use a count/RPC aggregate.

### IN-04: cluster-mine `localPart` only fed to delivery-failure subject regex; magic page sizes

**File:** `scripts/sales-stage-1-cluster-mine.ts:144-146, 223, 250`
**Issue:** Minor quality: `PAGE = 1000` and `CHUNK = 500` are inline magic numbers; the `cand_delivery_failure` rule concatenates `subject + " " + localPart(sender_email)` which can produce false matches when a local-part substring (e.g. `postmaster`) appears in a legitimate sender's address. Discovery-only, operator-reviewed, so impact is low.
**Fix:** Hoist the page sizes to named constants; consider anchoring the delivery-failure local-part check separately from the subject check.

### IN-05: migration filenames are not lexically ordered relative to the gate dependency

**File:** `supabase/migrations/20260603_sales_noise_calibration_flip.sql`, `supabase/migrations/20260603_stage_1_retro_runs.sql`
**Issue:** Both Phase 111 migrations share the `20260603` date prefix and the dry-run-gate retrofit lives in a `20260603b_*` file (referenced in the gate module comment). The calibration-flip migration's inertness guarantee *depends on* the gate migration having already run. Filename lexical order (`20260603_sales_noise_calibration_flip` < `20260603_stage_1_retro_runs` < `20260603b_swarms_dry_run_config`) places the flip BEFORE the gate config seed. If migrations apply in filename order, the flip is briefly live-eligible before `dry_run_config` is seeded — though `isStageBlocked` fail-closes on missing config, so the window is safe. Flagged for ordering hygiene.
**Fix:** Confirm apply order is gate-config-first, or rename so the flip sorts after the dry-run-config seed.

---

_Reviewed: 2026-06-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
