# SECURITY.md — Phase 111: Stage-1 Noise Expansion & Calibration

**Audited:** 2026-06-03
**ASVS Level:** 1
**block_on:** high
**Register source:** PLAN.md `<threat_model>` blocks (Plans 01–05), authored at plan time.
**Verdict:** SECURED — 19/19 threats CLOSED (0 BLOCKER, 0 OPEN).

This audit verifies each declared threat mitigation is present in the implemented code.
Implementation files are read-only; no source was modified.

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-111-01 | Tampering / data-loss | mitigate | CLOSED | `classifier-verdict-worker.ts:124-144` — both `categorizeEmail` and `archiveEmail` wrapped in `if (category.outlook_label && !isStageBlocked(swarmRow, "stage_1_archive"))`. Swarm row loaded at `:83-84`. Sales `dry_run_config.stage_1_archive` blocked → no live archive. |
| T-111-02 | Tampering / data-loss | mitigate | CLOSED | `classifier-screen-worker.ts:931-948` — high-confidence non-`unknown` LLM verdict requires `promotionGateClears` (`readWhitelist(admin, swarm_type)` membership of `llm:{cat}:high`, `:937-942`); non-promoted → `emit-requires-review` (`:966`, no subscriber → stays `predicted`). |
| T-111-03 | Tampering (debtor regression) | mitigate | CLOSED | Debtor block gated on registry value `stage1_regex_module === DEBTOR_REGEX_MODULE_KEY` (`:499`); with settings present the block `return`s from the function (`:878`) before Step 5. Only the settings-missing defensive path falls through (`:886-888`). phase89 regression net green (111-01 SUMMARY). |
| T-111-04 | Elevation (auto-archive of `unknown`) | accept / mitigate | CLOSED | `classifier-screen-worker.ts:947` — `finalCategoryKey === "unknown"` short-circuits to `verdict.recorded` and is never gated as a promotable rule (Anti-Pattern A2). Accepted-risk note below documents the intentional non-archiving disposition. |
| T-111-05 | Tampering / data-loss (flip fires live archive pre-112) | mitigate | CLOSED | Flip is disposition-only; live archive gated by T-111-01. `20260603_sales_noise_calibration_flip.sql:36-47` records the inertness guarantee cross-referencing the Plan-01 gate. |
| T-111-06 | Tampering / data-loss (payment_admittance/unknown archived) | mitigate | CLOSED | `20260603_sales_noise_calibration_flip.sql:69-72` — UPDATE scoped to `swarm_type='sales-email'` and `category_key in ('auto_reply','ooo_temporary','ooo_permanent')` only; `payment_admittance`/`unknown` explicitly NOT flipped (`:74-75`). Live verification: 111-05 SUMMARY (3 archive / 2 review). |
| T-111-07 | Info disclosure (migration to wrong project/swarm) | accept | CLOSED | Accepted-risk entry below. Applied via Supabase MCP to verified ref `mvqjhlxfvtqqubqgdvhz` (111-05 SUMMARY, `apply_migration {"success":true}`); UPDATE swarm-scoped. |
| T-111-08 | Tampering (retro writes live-pipeline state) | mitigate | CLOSED | `sales-email-stage-1-retro-classify.ts` — only write target is `stage_1_retro_runs` (`:121`); grep for `automation_runs`/`agent_runs`/`pipeline_events` → only header comment, no write call. Source-grep guard test (111-03 SUMMARY). |
| T-111-09 | Tampering / replay (non-deterministic run_id) | mitigate | CLOSED | `sales-email-stage-1-retro-classify.ts:67-68` — `run_id` minted inside `step.run("resolve-run-id", … crypto.randomUUID())`; idempotent upsert `onConflict: "run_id,email_id", ignoreDuplicates` (`:137`). No `inngest.send` in file. |
| T-111-10 | Integrity (mis-normalized direction drops corpus) | mitigate | CLOSED | `select-candidates.ts:67-73` — `normalizeDirection` collapses both vocabularies (`{inbound,incoming}→inbound`, `{sent,outbound}→outbound`); sugarcrm filtered on `source` alone (`:119`), outlook on source+mailbox (`:106`). |
| T-111-11 | DoS (unbounded corpus read) | mitigate | CLOSED | `select-candidates.ts:26` `STAGE_1_RETRO_HARD_CAP = 40000`; fail-loud throw at `:128-130` when merged length > cap. |
| T-111-12 | Tampering / data-loss (mined cluster false-archives a lead) | mitigate | CLOSED | `scripts/sales-stage-1-cluster-mine.ts` — read-only (no `.insert/.upsert/.update/.delete`; only `.from(...).select`); header `:24` "OPERATOR-GATED — NO auto-INSERT". Approved keys still ride the Wilson gate (T-111-02). |
| T-111-13 | Tampering / data-loss (loopback over-fires on sales inbound) | mitigate | CLOSED | `loopback-validation.ts` — measures false-archive rate over normalized-inbound only; recommendation derived from `LOOPBACK_FALSE_ARCHIVE_MAX` threshold (`:37`), fail-closed to `disable` at n=0 (`:21-22`); outbound excluded from denominator. |
| T-111-14 | DoS (regex backtracking in new regex rule) | mitigate | CLOSED | No live pipeline regex rule added (no `STAGE1_REGEX_MODULES` entry, no `swarms.stage1_regex_module` UPDATE). The only regexes are in the read-only cluster-miner (`sales-stage-1-cluster-mine.ts:144-178`): anchored literal-token alternations with bounded quantifiers, no nested unbounded quantifiers — no catastrophic backtracking. Default disposition (LLM-category) holds. |
| T-111-15 | Tampering (wrong project ref) | mitigate | CLOSED | Explicit ref `mvqjhlxfvtqqubqgdvhz` via MCP OAuth scoped to Agent-Workforce org; `SUPABASE_ACCESS_TOKEN` not used (111-05 SUMMARY). |
| T-111-16 | Elevation / RLS bypass (new retro table without RLS) | mitigate | CLOSED | `20260603_stage_1_retro_runs.sql:60` `ENABLE ROW LEVEL SECURITY`; service-role-only policy `:65-68`; no anon/authenticated policy; `UNIQUE INDEX` `:47`. Live: `rowsecurity=true`, 1 policy, `check:supabase` 0 ERROR (111-05 SUMMARY). |
| T-111-17 | Tampering / silent drift (codegen drift) | mitigate | CLOSED | `npm run codegen && git diff --exit-code` clean — `swarm_noise_categories` is not codegen'd (111-05 SUMMARY, Finding 3 confirmed live). |
| T-111-18 | Tampering / data-loss (flip fires live archive on apply) | mitigate | CLOSED | Same gate as T-111-01/05; inert on apply verified in 111-05 SUMMARY (Plan 01 gate + blocked `stage_1_archive`). |
| T-111-SC | Tampering (npm installs) | accept | CLOSED | Accepted-risk entry below. Verified: zero `web/package.json` changes across the phase-111 commit window. |

---

## Accepted Risks Log

The following dispositions are **accept** (or the accept-portion of accept/mitigate).
Each is recorded here as the audit's accepted-risk evidence per the disposition table.

### AR-T-111-04 — `unknown` is intentionally never auto-archived
Stage-1 `unknown` is the Stage 2/3 fall-through bucket. The Step 5 gate short-circuits
`unknown` to `verdict.recorded` without minting a promotable rule and the seed
category's `action` (`manual_review`/`reject`) is a label-only-skip. Accepted: `unknown`
is surfaced for human review, never auto-archived. No residual data-loss exposure.

### AR-T-111-07 — Migration applied to the correct project/swarm
Risk: a migration applied to the wrong Supabase project or swarm could disclose/alter
foreign-tenant registry data. Accepted because the UPDATE is `swarm_type='sales-email'`
scoped and was applied via Supabase MCP OAuth (org `oavpdqisdpzxqttgdgpt`) to the
explicit verified ref `mvqjhlxfvtqqubqgdvhz`, with success confirmed by live query
(111-05 SUMMARY). Residual risk: operator selecting a wrong MCP-linked project — out of
band of this phase's code.

### AR-T-111-SC — No new npm packages this phase
Risk: supply-chain compromise via newly added dependencies. Accepted as N/A:
`web/package.json` has zero additions across the phase-111 commit window (verified by
`git diff`). RESEARCH Package Legitimacy Audit: N/A.

---

## Unregistered Flags

None. No `## Threat Flags` section appears in any phase-111 SUMMARY, and no new attack
surface was introduced outside the declared register (the only new write target is the
RLS-protected `stage_1_retro_runs`; the cluster-miner and loopback-validation modules are
pure/read-only).

---

## Observations (non-blocking, not data-loss)

### OBS-WR-01 — Phantom Stage-4 telemetry row when the inline archive is dry-run-BLOCKED
Per code review WR-01 (`classifier-verdict-worker.ts:115-318`): when `stage_1_archive` is
blocked, the inline Outlook `categorize`/`archive` correctly do NOT fire (T-111-01 holds —
**no real mail is archived**), but control still reaches the unconditional
`emit-stage-4-handled` step which writes a `pipeline_events` row with
`decision:"auto_archived_noise"` / `archived_at`. This is a **metrics-accuracy / telemetry
drift** issue, NOT data loss: no email leaves the inbox, the trust boundary "Stage-1 verdict
→ Outlook mailbox" is not crossed. T-111-01/05/18 remain CLOSED on the data-loss axis.
Recommendation (for Phase 112 go-live, where the gate flips to live): gate the Stage-4 emit
on the same `archiveLive` condition so the handled-overview surface and any
`auto_archived_noise` metric stay consistent with the real side-effect. Tracked as an
observation, not a blocker.

Other code-review findings (WR-02 event-schema drift, WR-03 retro action-map snapshot,
WR-04/05 per-email step robustness/dedup, WR-06 sugarcrm tenant scoping, IN-01..05) are
correctness/robustness items outside the declared threat register; they do not reopen any
declared threat. WR-06 (sugarcrm tenant scoping) is the closest to a security concern but
bears on calibration-evidence bias in a read-only/operator-gated discovery path, not on a
live auto-archive decision — noted for the executor, not a Phase-111 threat-register gap.
