---
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
verified: 2026-06-16T15:30:00Z
status: human_needed
score: 4/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Live end-to-end telemetry confirmation"
    expected: >
      Trigger one live info-routing unknown email through Stage 1 and confirm an
      agent_runs row with swarm_type='info-routing' + rule_key='llm:{cat}:{conf}'
      lands (no 23514 error). The CHECK + INSERT path is proven via the 130-01
      live roundtrip, but this confirms the worker write under real production
      traffic — not just the DDL roundtrip.
    why_human: >
      Requires real email traffic through the live pipeline. Cannot be verified
      by grep or static analysis. The DDL change is confirmed applied, but the
      full worker → DB write path under real Inngest execution has not been
      observed since the migration.

  - test: "BEFORE per-mailbox labelled-sample noise baseline"
    expected: >
      Run info-unknown-pool-noise-baseline.ts in `sample` mode over the
      pre-promotion window, human-label the returned rows (noise vs routable),
      then run `compute` to obtain the true-noise fraction + Wilson 95% CI per
      mailbox (smeba, fire-control). The BEFORE CI lower bound should sit well
      above ~20% for the NOISE-03 target to be measurable.
    why_human: >
      The `sample` step emits rows for human labelling — this labelling step
      is explicitly manual (human noise-vs-routable judgement). No automated
      proxy can substitute. Additionally, WR-01 (see Gaps Summary) means the
      current sample scaffold emits null subject/sender, requiring the fix
      described below before the labelling is actionable. The labelled baseline
      must exist before promotion (CLASSIFIER_CRON_MUTATE flip) can be
      justified.

  - test: "AFTER baseline + <20% upper-bound proof"
    expected: >
      After candidates accumulate N>=30 telemetry rows each and
      CLASSIFIER_CRON_MUTATE is flipped (operator-gated), re-run the baseline
      script in AFTER mode, compute `compare`, and assert wilson_ci_hi < 0.20
      per mailbox (not wilson_ci_lo). This is the statistical proof that the
      noise share is truly below 20% — the stated NOISE-03 success metric.
    why_human: >
      This is a future measurement that requires (a) promoted rules producing
      real archive behavior, (b) human re-labelling of the AFTER sample, and
      (c) the wilson_ci_hi fix from WR-02 (currently only ci_lo is computed,
      which cannot bound the AFTER share from above). Requires both a code fix
      and operator action at promotion time.

  - test: "hasActionableToken wired into classifier-screen-worker.ts (WR-03)"
    expected: >
      For swarm_type='info-routing', classifier-screen-worker.ts imports and
      calls hasActionableToken before allowing the LLM verdict to be used for
      archiving. The function currently exists as a module but has zero
      production call sites — the programmatic backstop is dead code.
    why_human: >
      This is a code change (wire the predicate into the worker) that requires
      a follow-up plan/task decision. The human must decide: either wire it now
      (making the NOISE-04 carve-out a real programmatic guard) or formally
      accept that the carve-out is prompt-only + Wilson-shadow only and update
      the module docstring accordingly. Either path requires operator decision
      and code execution.
---

# Phase 130: info@ Stage-1 Noise-Recalibration Verification Report

**Phase Goal:** Close the ~50% latent-noise leak in the info-routing "unknown" pool
(info@smeba.nl + info@fire-control.nl) by registering new Stage-1 classifier_rules
candidates — cold-sales/SEO outreach, marketing newsletters, auto-dealer/vehicle spam,
unsolicited job applications, survey/feedback invites — that flow through the existing
Wilson-CI shadow→promote gate. Outcome: the noise share of the "unknown" pool drops
~50%→<20%, giving the router (Phase 131) a clean denominator. Registry-data only;
no per-swarm code.

**Verified:** 2026-06-16T15:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth (Requirement) | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | New classifier_rules candidates exist as registry rows (no per-swarm branch), covering five leaking noise classes, with shadow telemetry unblocked (NOISE-01, NOISE-02) | ✓ VERIFIED | 4 migrations applied to production remote (mvqjhlxfvtqqubqgdvhz): CHECK widened (20260616), 6 swarm_noise_categories rows (20260616b, display_order 70-75), 6 classifier_rules candidates (20260616c, kind=agent_intent, status=candidate). Live confirmed via orchestrator: 6 rows each, 0 ERROR supabase lint, no codegen drift. |
| 2 | Candidates promote only via Wilson-CI gate (classifier-promotion-cron), not blind auto-archive (NOISE-02) | ✓ VERIFIED | All 6 classifier_rules rows seed status='candidate' (on conflict do nothing). classifier-promotion-cron is swarm-agnostic, verified as the correct gate (not labeling-flip-cron which hardcodes debtor-email). CLASSIFIER_CRON_MUTATE not flipped — shadow by default. Worker-category test (3 passed) confirms categories reach LLM closed list. |
| 3 | Before/after shows unknown pool true-noise share dropping ~50%→<20% per live mailbox (NOISE-03) | ? UNCERTAIN / DEFERRED | Infrastructure is in place (composition view applied, baseline script written), but: (a) BEFORE baseline has NOT been captured yet (human labelling required), (b) WR-01 means the scaffold emits null subject/sender making labelling unreliable, (c) WR-02 means only wilson_ci_lo is computed — cannot assert AFTER < 20% upper bound. The outcome itself is not measurable yet; it is a future human-verified result. |
| 4 | Zero false-archive of actionable mail: carve-out + word-boundary matching in place and verified on a sample (NOISE-04) | ? UNCERTAIN (WR-03) | hasActionableToken predicate exists (web/lib/info-routing/actionable-tokens.ts), is substantive, and passes 30/30 boundary tests. However, it has ZERO production call sites — classifier-screen-worker.ts does not import it. The carve-out is currently enforced ONLY via LLM prompt + Wilson shadow gate (no programmatic backstop). The plan explicitly calls this the "cardinal safety constraint" and a "HIGH SEVERITY" threat (T-130-02-01); the implementation falls short of the stated threat mitigation. Classified as UNCERTAIN because a human decision is needed: wire it or accept prompt-only + update the threat model. |
| 5 | Rules apply across both live info@ mailboxes; dormant boxes untouched (NOISE-05) | ✓ VERIFIED | swarm_noise_categories rows are scoped to swarm_type='info-routing' only (verified in migration: no debtor/sales rows). The 4 dormant boxes remain ingest_enabled=false (verified live at plan time). Hard-separation test passes (no swarm_intents row added). |

**Score:** 3/5 truths fully verified; 2 uncertain (one infrastructure, one safety concern). Human verification gates all 5 being complete.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260616_phase130_agent_runs_swarm_type_check_info_routing.sql` | Widened CHECK constraint | ✓ VERIFIED | Exists on disk; drop+re-add of agent_runs_swarm_type_check; 5-value union including 'info-routing'; applied to production; live INSERT roundtrip proven |
| `web/__tests__/migrations/agent-runs-info-routing-insert.test.ts` | Live INSERT smoke (skipIf no creds) | ✓ VERIFIED | Exists; it.skipIf pattern matches plan spec; mirrors worker Step-3 shape; cleans up row |
| `supabase/migrations/20260616b_phase130_info_routing_noise_categories.sql` | 6 swarm_noise_categories rows | ✓ VERIFIED | Exists; 7 matches for 'info-routing'; categorize_archive; no swarm_intents reference; applied live |
| `supabase/migrations/20260616c_phase130_info_routing_classifier_rules_seed.sql` | 6 paired classifier_rules candidates | ✓ VERIFIED | Exists; 6 rows; kind=agent_intent; status=candidate; on conflict do nothing; applied live |
| `web/lib/info-routing/actionable-tokens.ts` | Production hasActionableToken predicate | ✓ VERIFIED (as module) / ⚠ ORPHANED (as production backstop) | Module exists, exports hasActionableToken with correct bounded regex (two-arm alternation, ReDoS-safe). But no production code imports it — WR-03. |
| `web/__tests__/stage-1/info-routing-actionable-carveout.test.ts` | Carve-out boundary test (30 cases) | ✓ VERIFIED | Exists; imports from production module (not redefining); 30/30 passed per executor |
| `supabase/migrations/20260616d_phase130_info_unknown_pool_composition_view.sql` | security_invoker view over pipeline_events | ✓ VERIFIED | Exists; WITH (security_invoker = true) confirmed; info-routing filter present; no SECURITY DEFINER; applied live returning 10 rows |
| `web/lib/inngest/functions/__tests__/classifier-screen-worker.info-routing-categories.test.ts` | Worker test — 6 keys reach LLM closed list | ✓ VERIFIED | Exists; hermetic mocks; 3 passed per executor; guards NOISE-01 registry→LLM invariant |
| `web/scripts/eval/info-unknown-pool-noise-baseline.ts` | Per-mailbox labelled baseline script | ✓ VERIFIED (as tool) / ⚠ WR-01 degrades labelling | Exists; arg-guarded (exits code 2 on missing args); pure-fn/IO split; reads Task-1 view; uses wilson.ts. However, maps subject/sender from decision_details keys the writer never sets → null subject/sender in every emitted row (WR-01). Also only computes wilson_ci_lo, cannot prove AFTER < 20% upper bound (WR-02). |
| `web/scripts/eval/__tests__/info-unknown-pool-noise-baseline.test.ts` | Pure-fn unit suite (beyond plan) | ✓ VERIFIED | Additive beyond plan; 13 tests; locks pure/IO split |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| classifier-screen-worker Step-3 INSERT | public.agent_runs | swarm_type='info-routing' write | ✓ WIRED | CHECK widened; live roundtrip proven; worker invokes loadSwarmNoiseCategories('info-routing') |
| classifier_rule_telemetry view | classifier-promotion-cron | n/agree aggregation, swarm-agnostic | ✓ VERIFIED | Promotion gate correctly identified; swarm-agnostic (no .eq swarm filter); shadow until CLASSIFIER_CRON_MUTATE=true |
| swarm_noise_categories (info-routing) | classifier_rules (info-routing) | Paired seed per category_key | ✓ WIRED | 6-to-6 pairing confirmed; rule_key = category_key verbatim |
| classifier-screen-worker loadSwarmNoiseCategories | stage-1-category-classifier closed list | enabled categories passed at call-time | ✓ WIRED | Worker-category test verifies this path hermetically |
| hasActionableToken | classifier-screen-worker (NOISE-04 backstop) | import + call before LLM archive | ✗ NOT WIRED | Zero production call sites (WR-03). Predicate exists as dead code relative to the production runtime. |
| baseline script (sample mode) | pipeline_events + info_unknown_pool_composition | createAdminClient + view query | ✓ WIRED (for distribution half) / ⚠ PARTIAL (for subject/sender) | Distribution query is wired. Subject/sender extraction is wired against decision_details keys that the writer never populates → always null (WR-01). |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| info_unknown_pool_composition view | decision, n, pct | pipeline_events (real DB rows, ~1185 existing) | Yes | ✓ FLOWING |
| baseline script — SampleCandidate.subject | dd.subject | decision_details jsonb | No — key never set by writer | ✗ HOLLOW_PROP (WR-01) |
| baseline script — SampleCandidate.sender | dd.from | decision_details jsonb | No — key never set by writer | ✗ HOLLOW_PROP (WR-01) |
| baseline script — NoiseFraction.wilson_ci_lo | wilsonCiLower(n, noise) | correct formula, wrong tail for AFTER assertion | Partial — right formula, wrong direction | ⚠ STATIC for AFTER use case (WR-02) |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| NOISE-01 | 130-02 | Six new noise classes as registry rows, no per-swarm branch | ✓ SATISFIED | 6 swarm_noise_categories + 6 classifier_rules rows applied live |
| NOISE-02 | 130-01, 130-03 | Wilson-CI shadow→promote gate; no blind auto-archive | ✓ SATISFIED | All candidates status=candidate; classifier-promotion-cron verified as correct gate; CLASSIFIER_CRON_MUTATE not flipped |
| NOISE-03 | 130-03 | Before/after measurement, noise drops ~50%→<20% per mailbox | ? NEEDS HUMAN | Infrastructure exists (view, script). BEFORE baseline not captured. WR-01 degrades labelling scaffold. WR-02 prevents AFTER upper-bound proof. Outcome not measurable until both human-verification items and code fixes complete. |
| NOISE-04 | 130-02 | Actionable-token carve-out + word-boundary matching, zero false-archive | ? NEEDS HUMAN | hasActionableToken exists with correct regex; 30/30 boundary tests pass. But predicate is not called by any production code (WR-03). Human must decide: wire or formally accept prompt-only. |
| NOISE-05 | 130-02 | Rules apply to both live mailboxes; dormant boxes untouched | ✓ SATISFIED | swarm_type='info-routing' scope; ingest_enabled=false on 4 dormant boxes confirmed |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/scripts/eval/info-unknown-pool-noise-baseline.ts` | 342-343 | `dd.subject` / `dd.from` always null (writer never sets these keys) | ⚠ Warning | Degrades NOISE-03 labelling scaffold — human labels noise/routable without seeing subject or sender |
| `web/scripts/eval/info-unknown-pool-noise-baseline.ts` | 179 | Only `wilsonCiLower` computed; no `wilson_ci_hi` | ⚠ Warning | Cannot prove AFTER noise < 20% upper bound — the stated success metric |
| `web/lib/info-routing/actionable-tokens.ts` | 10-13 | Documented as "PRODUCTION carve-out backstop the screen-worker calls" but has zero call sites | ⚠ Warning | NOISE-04 safety claim overstated vs actual runtime behavior |

No TBD/FIXME/XXX debt markers found in phase-modified files (not a blocker).

---

### Human Verification Required

#### 1. Live end-to-end telemetry confirmation

**Test:** Send or wait for one live info-routing unknown email through Stage 1 (classifier-screen-worker). Observe the agent_runs table for a row with swarm_type='info-routing' and a rule_key matching 'llm:{category}:{confidence}'.

**Expected:** A row lands with no error (specifically no Postgres 23514 from agent_runs_swarm_type_check). The rule_key matches one of the six new noise category keys or 'llm:unknown:*' if the email doesn't match.

**Why human:** Requires real Inngest worker execution under live traffic. The DDL roundtrip (Plan 01) proved the DB accepts the row; this confirms the full worker→DB path hasn't regressed under normal operation.

---

#### 2. BEFORE per-mailbox labelled-sample baseline

**Test:** Run `npx tsx web/scripts/eval/info-unknown-pool-noise-baseline.ts sample <since> <until>` over the pre-promotion window. Human-label each returned row as noise or routable. Run `compute <labelled.json>`.

**Expected:** Each mailbox (smeba, fire-control) produces a NoiseFraction with noise_fraction near ~0.50 (the stated baseline) and wilson_ci_lo well above 0.20, confirming there is a measurable gap for the <20% target.

**Why human:** The labelling step is explicitly manual (noise-vs-routable requires human judgement about each email's routing intent). Additionally, WR-01 means subject and sender are currently null in the emitted scaffold — the subject/sender data-source must be fixed (fetch from email_pipeline.emails by email_id) before the labelling is reliable. Fix WR-01 before running this step.

---

#### 3. Fix WR-01 (subject/sender null) before labelling

**Test:** In info-unknown-pool-noise-baseline.ts, after the pool query, JOIN or lookup `email_pipeline.emails` by `email_id` to obtain real `subject` and `from_address` for each sampled row. Confirm the emitted scaffold shows actual subjects/senders, not nulls.

**Expected:** The human labeller sees the real email subject and sender for each row, enabling accurate noise-vs-routable judgement without relying on the LLM's own reasoning (which would be circular, as WR-01 notes).

**Why human:** This is a code change in the baseline script requiring a follow-up task/commit.

---

#### 4. Add wilson_ci_hi + fix AFTER assertion (WR-02)

**Test:** Add `wilsonCiUpper(n, k)` to `wilson.ts` (or compute inline), add `wilson_ci_hi` to `NoiseFraction`, and assert `wilson_ci_hi < 0.20` in the AFTER run to prove the success metric.

**Expected:** The `compare` output shows `after.wilson_ci_hi < 0.20` for each live mailbox, providing statistical proof (not just a point estimate) that noise is below 20%.

**Why human:** Code change + re-run of the AFTER baseline after promotion, requiring operator action and a follow-up task.

---

#### 5. Wire hasActionableToken into classifier-screen-worker.ts or formally accept prompt-only (WR-03)

**Test:** Either (a) import hasActionableToken in classifier-screen-worker.ts and, for swarm_type='info-routing', return 'unknown' (not noise) if hasActionableToken returns true before the LLM verdict is allowed to archive — OR — (b) explicitly retract the "PRODUCTION carve-out backstop the screen-worker calls" docstring, update stage-1-regex.md to say the carve-out is prompt-only + Wilson-shadow only, and open a follow-up task for the programmatic wire.

**Expected:** Either a wired predicate call site exists in classifier-screen-worker.ts, or the threat model (T-130-02-01) and module docstring accurately reflect that the programmatic guard does not exist yet.

**Why human:** This is a code or documentation change requiring an architectural decision (safety posture for NOISE-04). Given the plan labels this "HIGH SEVERITY" and "the cardinal safety constraint," the decision should be explicit rather than implicit (dead code).

---

### Gaps Summary

Phase 130 infrastructure is substantially in place and applied to production. The registry foundation for the noise recalibration is sound: all four migrations applied successfully (confirmed live), 6 noise categories and 6 shadow classifier_rules candidates exist in the correct state, the composition view is live, and the worker-category test proves the LLM closed list receives the new keys. Gates and conventions (RLS, hard-separation, Wilson-CI, no blind auto-archive) are correctly implemented.

The phase goal as stated — "the noise share of the unknown pool drops ~50%→<20%" — is an empirical outcome that has not yet been measured or achieved. It is the target of a future operational cycle (telemetry accumulation → promotion → AFTER measurement). This is expected and by design: Phase 130 builds and applies the instrumentation infrastructure; the outcome lands during the operator-gated Wilson-CI promotion window.

Three tool-level issues from the code review (WR-01, WR-02, WR-03) degrade the measurement and safety layers without blocking the registry itself:

- **WR-01** (null subject/sender in baseline scaffold) means the BEFORE labelling step cannot be reliably executed until fixed. This should be addressed before the first baseline run, not after.
- **WR-02** (only lower Wilson bound computed) means the script cannot produce the `wilson_ci_hi < 0.20` proof that NOISE-03 requires for the AFTER measurement.
- **WR-03** (hasActionableToken has zero production call sites) means the NOISE-04 programmatic carve-out backstop is not active at runtime. The carve-out is currently enforced only through the LLM prompt definition and the Wilson shadow gate's natural rejection behavior for false positives — which the plan acknowledges as "dual enforcement" — but the module claims to be a production backstop that it currently is not.

None of these are outright blockers to the registry infrastructure (which is verified), but all three must be resolved before the phase outcome (the <20% drop) can be measured and declared achieved.

**Status: `human_needed`** — All automated-verifiable truths are confirmed. The remaining items require human action: live telemetry observation, tool fixes (WR-01/02/03), and the BEFORE/AFTER labelled baseline measurement.

---

_Verified: 2026-06-16T15:30:00Z_
_Verifier: Claude (gsd-verifier)_
