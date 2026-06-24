---
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
verified: 2026-06-16T20:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/5
  gaps_closed:
    - "WR-01: baseline script batch-fetches email_pipeline.emails by email_id (CHUNK=200), reads sender_email — null subject/sender defect resolved"
    - "WR-02: wilsonCiUpper exported from wilson.ts; NoiseFraction.wilson_ci_hi populated via wilsonCiUpper(n, noise)"
    - "WR-03: hasActionableToken is now WIRED into classifier-screen-worker.ts (line 351-361), registry-gated on swarmRow.stage1_shared_block_rules, upstream of debtor block (line 514) and Step 5 — NOISE-04 is a real programmatic guard, not dead code"
    - "NOISE-03 re-scoped: human-labelling step removed; metric is now automated per-mailbox unknown-share from info_unknown_pool_composition view (zero manual labels)"
    - "Predicate relocated to web/lib/stage-1/actionable-tokens.ts (swarm-agnostic); old web/lib/info-routing/actionable-tokens.ts deleted; zero dangling imports confirmed"
    - "stage1_shared_block_rules text[] column added to public.swarms (migration 20260616e, APPLIED); info-routing enrolled as first adopter {actionable_token}; all other swarms default {}"
    - "stage-1-regex.md updated: three-layer enumeration (not two), shared-pool framing, forward-note on cross-swarm noise registry"
    - "Worker tests: 5/5 green (adopted+actionable→forced unknown; adopted+body→forced unknown; not-adopted+actionable→no veto; undefined adoption→no veto; adopted+non-actionable→no veto)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Live end-to-end telemetry confirmation"
    expected: >
      Under real Inngest worker execution, an info-routing unknown email through Stage 1
      produces an agent_runs row with swarm_type='info-routing' and rule_key='llm:{cat}:{conf}'
      — no Postgres 23514 error. Confirms the full worker->DB write path under live traffic.
    why_human: >
      Requires real email traffic through the live Inngest pipeline. Cannot be verified
      by grep or static analysis. The DDL roundtrip (Plan 01) proved the DB accepts the row;
      this confirms the end-to-end path under normal operation.
  - test: "AFTER empirical outcome: unknown-share drops to <20% per mailbox"
    expected: >
      After the six info-routing noise candidates accumulate N>=30 telemetry rows each and
      CLASSIFIER_CRON_MUTATE is flipped (operator-gated), run:
        npx tsx web/scripts/eval/info-unknown-pool-noise-baseline.ts report
      and observe unknown_pct < 0.20 per mailbox (smeba, fire-control). This is the
      NOISE-03 empirical success measurement.
    why_human: >
      Future measurement requiring (a) promoted rules producing real archive behavior under
      live traffic, and (b) operator action to flip CLASSIFIER_CRON_MUTATE. The tooling is
      complete and automated (zero human labelling now required); the empirical outcome
      accrues over time under real traffic.
---

# Phase 130: info@ Stage-1 Noise-Recalibration Verification Report

**Phase Goal:** Close the ~50% latent-noise leak in the info-routing "unknown" pool
(info@smeba.nl + info@fire-control.nl) by registering new Stage-1 classifier_rules
candidates — cold-sales/SEO outreach, marketing newsletters, auto-dealer/vehicle spam,
unsolicited job applications, survey/feedback invites — that flow through the existing
Wilson-CI shadow->promote gate. Outcome: the noise share of the "unknown" pool drops
~50%->20%, giving the router (Phase 131) a clean denominator. Registry-data only;
no per-swarm code.

**Verified:** 2026-06-16T20:00:00Z
**Status:** human_needed
**Re-verification:** Yes (2nd — after 130-05)

---

## Re-verification Summary (130-05)

Plan 130-05 (commits d5b2ccc0, 4cab3182, 2a52a6b3, c81c866a) resolved all open operator decisions from the prior verification plus the REQ-6 swarm-agnostic architectural directive.

**WR-03 CLOSED (option A + swarm-agnostic):** `hasActionableToken` is now imported and called in `classifier-screen-worker.ts` at line 351-361, on the LLM success path after `const finalKey = parsed.category_key;` and upstream of the debtor live-archive block (Step 4.5, line 514) and Step 5. The veto is registry-gated on `swarmRow.stage1_shared_block_rules?.includes('actionable_token')` — a swarm-agnostic membership check with no `swarm_type ===` literal (REQ-6 confirmed: grep finds zero new literals). The predicate was relocated to `web/lib/stage-1/actionable-tokens.ts`; the old `web/lib/info-routing/actionable-tokens.ts` is deleted; zero dangling imports remain. Migration `20260616e` added `stage1_shared_block_rules text[] NOT NULL DEFAULT '{}'` to `public.swarms` and enrolled info-routing as `{actionable_token}`; all other swarms default `{}` (behaviour-neutral).

**NOISE-03 RE-SCOPED (automated):** The human-labelling step (sample → label → compute → Wilson CI) is removed from `info-unknown-pool-noise-baseline.ts`. The metric is now a zero-human-cost `report` mode that reads `info_unknown_pool_composition` and computes `computeUnknownShare` per mailbox. Justified because the now-wired carve-out structurally prevents routable mis-archive (Pitfall 5), making the distribution metric sufficient. Wilson imports removed from the script (wilson.ts itself untouched).

**5/5 worker tests green:** adopted+subject token → forced unknown; adopted+body token → forced unknown; not-adopted (empty array) + actionable → no veto; undefined adoption (pre-migration) → no veto; adopted + non-actionable → no veto.

**All five NOISE must-haves are now VERIFIED** at the code/infrastructure level. The sole remaining item is the inherently future empirical outcome (live traffic must accrue under the wired carve-out and promoted rules; CLASSIFIER_CRON_MUTATE is operator-gated).

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth (Requirement) | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | New classifier_rules candidates exist as registry rows (no per-swarm branch), covering five leaking noise classes, with shadow telemetry unblocked (NOISE-01, NOISE-02) | VERIFIED | 6 swarm_noise_categories rows (20260616b) + 6 classifier_rules candidates (20260616c, status=candidate) applied to production. Live confirmed. classifier-promotion-cron is the correct swarm-agnostic gate. CLASSIFIER_CRON_MUTATE not flipped — shadow by default. |
| 2 | Candidates promote only via Wilson-CI gate (classifier-promotion-cron), not blind auto-archive (NOISE-02) | VERIFIED | All 6 rows seed status='candidate' (on conflict do nothing). Gate verified swarm-agnostic. Worker-category test (3/3) confirms categories reach LLM closed list. |
| 3 | Before/after shows unknown pool true-noise share dropping ~50%->20% per live mailbox (NOISE-03) | VERIFIED (infrastructure) / PENDING (empirical outcome) | Measurement tooling is complete and automated: info_unknown_pool_composition view applied; baseline script report mode is pure-function-driven, zero human labels; test green. The empirical ~50%→<20% outcome requires live traffic accrual + promotion (inherently future). |
| 4 | Zero false-archive of actionable mail: carve-out + word-boundary matching in place and verified (NOISE-04) | VERIFIED | hasActionableToken imported and called in classifier-screen-worker.ts (line 51 import, lines 351-361 veto). Registry-gated on swarmRow.stage1_shared_block_rules — no swarm_type literal (REQ-6). Upstream of debtor block (line 514) and Step 5 — fail-safe against both live-archive paths. 5/5 worker tests green. 30/30 boundary tests green. |
| 5 | Rules apply across both live info@ mailboxes; dormant boxes untouched (NOISE-05) | VERIFIED | swarm_noise_categories rows scoped to swarm_type='info-routing' only. 4 dormant boxes remain ingest_enabled=false. Hard-separation test passes. |

**Score:** 5/5 truths verified at code/infrastructure level.

**Reasoning on classification:** The phase deliverable is the registry infrastructure + programmatic enforcement (wiring, tests, migrations, docs). All five NOISE must-haves are now met in code. The sole remaining item is the live empirical outcome (~50%→<20%) which is inherently a future measurement — it accrues under real traffic after promotion and cannot be produced by any code change. Since human verification items exist (live telemetry observation + empirical outcome confirmation), status is `human_needed`. There are no code defects, no open decisions, and no blockers.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260616_phase130_agent_runs_swarm_type_check_info_routing.sql` | Widened CHECK constraint | VERIFIED | Exists; applied to production; live INSERT roundtrip proven |
| `web/__tests__/migrations/agent-runs-info-routing-insert.test.ts` | Live INSERT smoke | VERIFIED | Exists; it.skipIf pattern; mirrors worker Step-3 shape |
| `supabase/migrations/20260616b_phase130_info_routing_noise_categories.sql` | 6 swarm_noise_categories rows | VERIFIED | Exists; applied live |
| `supabase/migrations/20260616c_phase130_info_routing_classifier_rules_seed.sql` | 6 paired classifier_rules candidates | VERIFIED | Exists; status=candidate; applied live |
| `supabase/migrations/20260616e_phase130_swarms_shared_block_rules.sql` | stage1_shared_block_rules text[] + info-routing enrollment | VERIFIED | Exists; ADD COLUMN IF NOT EXISTS text[] NOT NULL DEFAULT '{}'; UPDATE sets ARRAY['actionable_token'] WHERE swarm_type='info-routing'; applied to production (per SUMMARY) |
| `web/lib/stage-1/actionable-tokens.ts` | Shared swarm-agnostic hasActionableToken predicate (relocated) | VERIFIED | Exists at new path; docstring confirms WIRED into worker; old web/lib/info-routing/actionable-tokens.ts DELETED; zero dangling imports confirmed |
| `web/lib/swarms/types.ts` | SwarmRow.stage1_shared_block_rules?: string[] | VERIFIED | Field present at line 111; commented with shared-pool framing |
| `web/lib/inngest/functions/classifier-screen-worker.ts` | Registry-gated hasActionableToken veto on LLM success path | VERIFIED | Import line 51; veto at lines 351-361; upstream of debtor block (line 514); no swarm_type literal in gate |
| `web/lib/inngest/functions/__tests__/classifier-screen-worker.actionable-carveout.test.ts` | Worker veto tests (5 cases) | VERIFIED | Exists; 5 tests covering adopted+subject, adopted+body, not-adopted (empty), not-adopted (undefined), adopted+non-actionable |
| `web/__tests__/stage-1/info-routing-actionable-carveout.test.ts` | Carve-out boundary test (30 cases) — updated import | VERIFIED | Imports from @/lib/stage-1/actionable-tokens (not old info-routing path); 30/30 passed |
| `supabase/migrations/20260616d_phase130_info_unknown_pool_composition_view.sql` | security_invoker view | VERIFIED | Exists; WITH (security_invoker=true); applied live |
| `web/lib/inngest/functions/__tests__/classifier-screen-worker.info-routing-categories.test.ts` | Worker test — 6 keys reach LLM closed list | VERIFIED | Exists; 3/3 passed; guards NOISE-01 registry->LLM invariant |
| `web/scripts/eval/info-unknown-pool-noise-baseline.ts` | Automated view-distribution NOISE-03 reporter (no human labels) | VERIFIED | Re-scoped: samplePerMailbox/computeNoiseFractions/parseLabelledRows/Wilson imports all removed; report mode reads info_unknown_pool_composition via computeUnknownShare pure function; script docstring justifies removal |
| `web/scripts/eval/__tests__/info-unknown-pool-noise-baseline.test.ts` | Pure-fn unit suite for computeUnknownShare | VERIFIED | Sampling/labelling/CI tests removed; new computeUnknownShare tests present |
| `web/lib/classifier/wilson.ts` | wilsonCiUpper export (from 130-04) | VERIFIED | Untouched by 130-05; still exports wilsonCiUpper (other callers unaffected) |
| `docs/agentic-pipeline/stage-1-regex.md` | Three-layer enumeration; shared-pool framing; forward-note | VERIFIED | Three layers (a)(b)(c) explicitly enumerated at line 122-126; layer (b) marked WIRED with correct file path and worker location; NOISE-03 updated to automated view metric; forward-note on shared-pool noise registry present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| classifier-screen-worker.ts (line 51) | web/lib/stage-1/actionable-tokens.ts | import { hasActionableToken } | WIRED | Import present; called at lines 358-360 |
| classifier-screen-worker.ts carve-out gate (line 352-353) | public.swarms.stage1_shared_block_rules | swarmRow.stage1_shared_block_rules?.includes('actionable_token') | WIRED | No swarm_type literal; membership check only (REQ-6) |
| carve-out veto (line 361) | debtor block Step 4.5 (line 514) | Veto at line 361 is upstream | WIRED (upstream) | finalKey set at line 361; debtor block starts at line 514 — 153 lines later |
| carve-out fires → agent_runs INSERT (line 363+) | tool_outputs.gated_to / .shared_block_rule | carveoutFires ternary (lines 386-388) | WIRED | gated_to=finalKey (forced 'unknown'); shared_block_rule='actionable_token' present only when carveout fires |
| baseline script report mode | public.info_unknown_pool_composition | computeUnknownShare(rows) pure function; main() reads view via service-role | WIRED | No sampling, no human labels, no Wilson CI in script |
| classifier_rule_telemetry view | classifier-promotion-cron | n/agree aggregation, swarm-agnostic | WIRED | Shadow until CLASSIFIER_CRON_MUTATE=true |
| swarm_noise_categories (info-routing) | classifier_rules (info-routing) | Paired seed per category_key | WIRED | 6-to-6 pairing confirmed |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| classifier-screen-worker.ts carve-out | swarmRow.stage1_shared_block_rules | public.swarms via loadSwarm select("*") — new column flows automatically | Yes — migration 20260616e applied; info-routing = {actionable_token} | FLOWING |
| info_unknown_pool_composition view | decision, n, pct | pipeline_events (real DB rows) | Yes | FLOWING |
| baseline script computeUnknownShare | rows: CompositionRow[] | info_unknown_pool_composition view via Supabase service-role | Yes | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for live pipeline components — behavioral verification requires real Inngest execution and live email traffic (routed to human verification). Static code checks above confirm the wiring is correct.

---

### Probe Execution

Step 7c: No probe scripts declared for Phase 130. N/A.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| NOISE-01 | 130-02 | Six new noise classes as registry rows, no per-swarm branch | SATISFIED | 6 swarm_noise_categories + 6 classifier_rules rows applied live; no per-swarm code path |
| NOISE-02 | 130-01, 130-03 | Wilson-CI shadow->promote gate; no blind auto-archive | SATISFIED | All candidates status=candidate; classifier-promotion-cron verified swarm-agnostic; CLASSIFIER_CRON_MUTATE not flipped |
| NOISE-03 | 130-03, 130-05 | Before/after measurement, noise drops ~50%->20% per mailbox | SATISFIED (infrastructure) / PENDING (empirical) | Tooling complete, automated, zero human labels. Empirical outcome pending live traffic + promotion. |
| NOISE-04 | 130-02, 130-05 | Actionable-token carve-out + word-boundary matching, zero false-archive | SATISFIED | hasActionableToken wired into worker; registry-gated; no swarm_type literal; 5 worker tests + 30 boundary tests green |
| NOISE-05 | 130-02 | Rules apply to both live mailboxes; dormant boxes untouched | SATISFIED | swarm_type='info-routing' scope; 4 dormant boxes ingest_enabled=false |
| REQ-6 (operator) | 130-05 | Stage 1 must be swarm-agnostic; no swarm_type literal in carve-out gate | SATISFIED | Gate is membership check on text[] adoption array; grep confirms zero new swarm_type === literals added by Plan 05 |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

No TBD/FIXME/XXX debt markers found in phase-modified files. Prior WR-03 anti-pattern (dead-code predicate with misleading docstring) is resolved — the docstring now accurately describes the wired enforcement.

---

### Human Verification Required

#### 1. Live end-to-end telemetry confirmation

**Test:** Send or wait for one live info-routing unknown email through Stage 1 (classifier-screen-worker under Inngest). Observe the agent_runs table for a row with swarm_type='info-routing' and a rule_key matching 'llm:{category}:{confidence}'.

**Expected:** A row lands with no error (no Postgres 23514 from agent_runs_swarm_type_check). The rule_key matches one of the six new noise category keys or 'llm:unknown:*'. If the email carries an actionable token (factuur/offerte/order/…) and was predicted as a noise key, tool_outputs.shared_block_rule='actionable_token' and tool_outputs.gated_to='unknown' should be present.

**Why human:** Requires real Inngest worker execution under live traffic. Cannot be verified by grep or static analysis. The DDL roundtrip (Plan 01) and worker tests prove correctness; this confirms no regression under normal Inngest execution.

---

#### 2. AFTER empirical outcome: unknown-share drops to <20% per mailbox

**Test:** After candidates accumulate N>=30 telemetry rows each and CLASSIFIER_CRON_MUTATE is flipped (operator-gated), run:

```
npx tsx web/scripts/eval/info-unknown-pool-noise-baseline.ts report
```

**Expected:** `unknown_pct < 0.20` for each live mailbox (smeba, fire-control). This is the NOISE-03 empirical success measurement. No human labelling is required — the script reads the view directly and prints per-mailbox JSON.

**Why human:** Future measurement requiring (a) promoted rules producing real archive behavior under live traffic, and (b) operator action to flip CLASSIFIER_CRON_MUTATE. The tooling is complete and automated; the empirical outcome accrues over time.

---

### Gaps Summary

No code gaps. All five NOISE must-haves and REQ-6 are satisfied in the codebase. The two remaining human verification items are inherently forward-looking:

1. **Live telemetry observation** — a one-time sanity check that the worker write path is healthy under real Inngest execution (no code defect suspected; pure operational confirmation).
2. **Empirical AFTER measurement** — the ~50%→<20% outcome accrues after promotion and live traffic, not before. The tooling to make this measurement is complete, automated, and tested.

Neither item indicates a code defect or blocked decision. The phase infrastructure is complete.

---

_Verified: 2026-06-16T20:00:00Z_
_Re-verified after gap-closure plan 130-05 (commits d5b2ccc0, 4cab3182, 2a52a6b3, c81c866a)_
_Verifier: Claude (gsd-verifier)_
