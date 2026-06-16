---
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
verified: 2026-06-16T18:00:00Z
status: human_needed
score: 4/5 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 4/5
  gaps_closed:
    - "WR-01: baseline script now batch-fetches email_pipeline.emails by email_id (CHUNK=200) using sender_email column — null subject/sender defect resolved"
    - "WR-02: wilson.ts now exports wilsonCiUpper (pure, clamps to 1, upper >= lower verified); NoiseFraction.wilson_ci_hi populated via wilsonCiUpper(n, noise) in computeNoiseFractions"
  gaps_remaining:
    - "WR-03: hasActionableToken still has zero production call sites in classifier-screen-worker.ts — open operator decision"
    - "Live end-to-end telemetry not yet observed under real Inngest execution"
    - "BEFORE labelled-sample baseline not yet captured (human labelling required)"
    - "AFTER <20% measurement not yet possible (requires promotion + re-labelling)"
  regressions: []
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
      full worker -> DB write path under real Inngest execution has not been
      observed since the migration.

  - test: "BEFORE per-mailbox labelled-sample baseline"
    expected: >
      Run info-unknown-pool-noise-baseline.ts in `sample` mode over the
      pre-promotion window, human-label the returned rows (noise vs routable),
      then run `compute` to obtain the true-noise fraction + Wilson 95% CI per
      mailbox (smeba, fire-control). WR-01 is now fixed (subject/sender come
      from email_pipeline.emails), so the labelling scaffold is actionable.
      The BEFORE CI lower bound should sit well above ~20% for the NOISE-03
      target to be measurable.
    why_human: >
      The `sample` step emits rows for human labelling — this labelling step
      is explicitly manual (human noise-vs-routable judgement). No automated
      proxy can substitute. The labelled baseline must exist before promotion
      (CLASSIFIER_CRON_MUTATE flip) can be justified.

  - test: "AFTER baseline + <20% upper-bound proof"
    expected: >
      After candidates accumulate N>=30 telemetry rows each and
      CLASSIFIER_CRON_MUTATE is flipped (operator-gated), re-run the baseline
      script in AFTER mode, compute `compare`, and assert wilson_ci_hi < 0.20
      per mailbox (not wilson_ci_lo). WR-02 is now fixed — wilson_ci_hi is
      computed and present in NoiseFraction. This is the statistical proof that
      the noise share is truly below 20% — the stated NOISE-03 success metric.
    why_human: >
      This is a future measurement that requires (a) promoted rules producing
      real archive behavior, (b) human re-labelling of the AFTER sample, and
      (c) operator action at promotion time.

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
Wilson-CI shadow->promote gate. Outcome: the noise share of the "unknown" pool drops
~50%->20%, giving the router (Phase 131) a clean denominator. Registry-data only;
no per-swarm code.

**Verified:** 2026-06-16T18:00:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plan 130-04 (commits 04b1fb39, 0db9f9fd, b70991d2)

---

## Re-verification Summary

Plan 130-04 closed the two code defects flagged as blockers for NOISE-03 measurement tooling.

**WR-01 CLOSED:** `web/scripts/eval/info-unknown-pool-noise-baseline.ts` now batch-fetches `email_pipeline.emails` by `email_id` (CHUNK=200) and reads `sender_email` for the sender field. The always-null `dd.subject`/`dd.from` reads are removed. The fix is present and substantive (lines 358-397).

**WR-02 CLOSED:** `web/lib/classifier/wilson.ts` now exports `wilsonCiUpper` (pure, mirrors `wilsonCiLower` but takes the + radius arm, clamps to 1). `NoiseFraction.wilson_ci_hi` is populated via `wilsonCiUpper(n, noise)` in `computeNoiseFractions`. The baseline test suite asserts `wilson_ci_hi >= wilson_ci_lo` and the wilson test suite asserts `upper >= lower` exhaustively for n in [1,40]. 11 wilson tests + 13 baseline tests = 24 total; all green per executor and code inspection.

**WR-03 REMAINS OPEN:** `classifier-screen-worker.ts` has zero import or call sites for `hasActionableToken`. Grep confirms no match. This is correctly carried as an open operator decision, not a code defect in this re-verification cycle.

---

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth (Requirement) | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | New classifier_rules candidates exist as registry rows (no per-swarm branch), covering five leaking noise classes, with shadow telemetry unblocked (NOISE-01, NOISE-02) | VERIFIED | 4 migrations applied to production remote (mvqjhlxfvtqqubqgdvhz): CHECK widened (20260616), 6 swarm_noise_categories rows (20260616b, display_order 70-75), 6 classifier_rules candidates (20260616c, kind=agent_intent, status=candidate). Live confirmed via orchestrator: 6 rows each, 0 ERROR supabase lint, no codegen drift. |
| 2 | Candidates promote only via Wilson-CI gate (classifier-promotion-cron), not blind auto-archive (NOISE-02) | VERIFIED | All 6 classifier_rules rows seed status='candidate' (on conflict do nothing). classifier-promotion-cron is swarm-agnostic, verified as the correct gate (not labeling-flip-cron which hardcodes debtor-email). CLASSIFIER_CRON_MUTATE not flipped — shadow by default. Worker-category test (3 passed) confirms categories reach LLM closed list. |
| 3 | Before/after shows unknown pool true-noise share dropping ~50%->20% per live mailbox (NOISE-03) | UNCERTAIN / DEFERRED | Measurement tooling is now fully trustworthy (WR-01 + WR-02 fixed). Infrastructure is in place (composition view applied, baseline script reads real subject/sender, wilson_ci_hi computed). The empirical outcome itself is not measurable yet — BEFORE baseline requires human labelling, AFTER requires promotion + re-labelling. |
| 4 | Zero false-archive of actionable mail: carve-out + word-boundary matching in place and verified on a sample (NOISE-04) | UNCERTAIN (WR-03) | hasActionableToken predicate exists (web/lib/info-routing/actionable-tokens.ts), is substantive, and passes 30/30 boundary tests. However, it has ZERO production call sites — classifier-screen-worker.ts does not import it. Carve-out enforced only via LLM prompt + Wilson shadow gate. Human decision required: wire or accept prompt-only. |
| 5 | Rules apply across both live info@ mailboxes; dormant boxes untouched (NOISE-05) | VERIFIED | swarm_noise_categories rows are scoped to swarm_type='info-routing' only. The 4 dormant boxes remain ingest_enabled=false. Hard-separation test passes (no swarm_intents row added). |

**Score:** 3/5 truths fully verified; 2 uncertain (both require human action). All code-level verifiable items are now confirmed.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260616_phase130_agent_runs_swarm_type_check_info_routing.sql` | Widened CHECK constraint | VERIFIED | Exists on disk; drop+re-add of agent_runs_swarm_type_check; 5-value union including 'info-routing'; applied to production; live INSERT roundtrip proven |
| `web/__tests__/migrations/agent-runs-info-routing-insert.test.ts` | Live INSERT smoke (skipIf no creds) | VERIFIED | Exists; it.skipIf pattern matches plan spec; mirrors worker Step-3 shape; cleans up row |
| `supabase/migrations/20260616b_phase130_info_routing_noise_categories.sql` | 6 swarm_noise_categories rows | VERIFIED | Exists; 7 matches for 'info-routing'; categorize_archive; no swarm_intents reference; applied live |
| `supabase/migrations/20260616c_phase130_info_routing_classifier_rules_seed.sql` | 6 paired classifier_rules candidates | VERIFIED | Exists; 6 rows; kind=agent_intent; status=candidate; on conflict do nothing; applied live |
| `web/lib/info-routing/actionable-tokens.ts` | Production hasActionableToken predicate | VERIFIED (as module) / ORPHANED (as production backstop) | Module exists, exports hasActionableToken with correct bounded regex. But no production code imports it — WR-03 open. |
| `web/__tests__/stage-1/info-routing-actionable-carveout.test.ts` | Carve-out boundary test (30 cases) | VERIFIED | Exists; imports from production module; 30/30 passed per executor |
| `supabase/migrations/20260616d_phase130_info_unknown_pool_composition_view.sql` | security_invoker view over pipeline_events | VERIFIED | Exists; WITH (security_invoker = true) confirmed; info-routing filter present; no SECURITY DEFINER; applied live |
| `web/lib/inngest/functions/__tests__/classifier-screen-worker.info-routing-categories.test.ts` | Worker test — 6 keys reach LLM closed list | VERIFIED | Exists; hermetic mocks; 3 passed per executor; guards NOISE-01 registry->LLM invariant |
| `web/scripts/eval/info-unknown-pool-noise-baseline.ts` | Per-mailbox labelled baseline script | VERIFIED | WR-01 FIXED: batch-fetches email_pipeline.emails by email_id (CHUNK=200), reads sender_email. WR-02 FIXED: imports and calls wilsonCiUpper; wilson_ci_hi present in NoiseFraction and computeNoiseFractions output. |
| `web/scripts/eval/__tests__/info-unknown-pool-noise-baseline.test.ts` | Pure-fn unit suite (beyond plan) | VERIFIED | 13 tests including wilson_ci_hi >= wilson_ci_lo assertion; locks pure/IO split |
| `web/lib/classifier/wilson.ts` | wilsonCiUpper export (WR-02 fix) | VERIFIED | Exported pure function, mirrors wilsonCiLower + radius arm, clamps to 1, n=0 returns 0. 5 dedicated tests in wilson.test.ts (including exhaustive upper >= lower for n in [1,40]). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| classifier-screen-worker Step-3 INSERT | public.agent_runs | swarm_type='info-routing' write | WIRED | CHECK widened; live roundtrip proven; worker invokes loadSwarmNoiseCategories('info-routing') |
| classifier_rule_telemetry view | classifier-promotion-cron | n/agree aggregation, swarm-agnostic | VERIFIED | Promotion gate correctly identified; swarm-agnostic; shadow until CLASSIFIER_CRON_MUTATE=true |
| swarm_noise_categories (info-routing) | classifier_rules (info-routing) | Paired seed per category_key | WIRED | 6-to-6 pairing confirmed; rule_key = category_key verbatim |
| classifier-screen-worker loadSwarmNoiseCategories | stage-1-category-classifier closed list | enabled categories passed at call-time | WIRED | Worker-category test verifies this path hermetically |
| hasActionableToken | classifier-screen-worker (NOISE-04 backstop) | import + call before LLM archive | NOT WIRED | Zero production call sites (WR-03 — open operator decision). |
| baseline script (sample mode) | email_pipeline.emails | admin.schema("email_pipeline").from("emails").select("id, subject, sender_email").in("id", chunk) | WIRED | WR-01 FIXED. Batch fetch by email_id CHUNK=200; sender_email column used; result stored in emailMeta Map. |
| NoiseFraction.wilson_ci_hi | wilsonCiUpper | wilsonCiUpper(n, noise) in computeNoiseFractions | WIRED | WR-02 FIXED. Import confirmed at line 64 of baseline script; call confirmed at line 192. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| info_unknown_pool_composition view | decision, n, pct | pipeline_events (real DB rows) | Yes | FLOWING |
| baseline script — SampleCandidate.subject | emailMeta.get(email_id).subject | email_pipeline.emails.subject (real column) | Yes — WR-01 fixed | FLOWING |
| baseline script — SampleCandidate.sender | emailMeta.get(email_id).sender | email_pipeline.emails.sender_email (real column) | Yes — WR-01 fixed | FLOWING |
| baseline script — NoiseFraction.wilson_ci_hi | wilsonCiUpper(n, noise) | correct formula, upper arm, clamps to 1 | Yes — WR-02 fixed | FLOWING |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| NOISE-01 | 130-02 | Six new noise classes as registry rows, no per-swarm branch | SATISFIED | 6 swarm_noise_categories + 6 classifier_rules rows applied live |
| NOISE-02 | 130-01, 130-03 | Wilson-CI shadow->promote gate; no blind auto-archive | SATISFIED | All candidates status=candidate; classifier-promotion-cron verified as correct gate; CLASSIFIER_CRON_MUTATE not flipped |
| NOISE-03 | 130-03 | Before/after measurement, noise drops ~50%->20% per mailbox | NEEDS HUMAN | Tooling now trustworthy (WR-01+WR-02 fixed). BEFORE baseline not captured. Outcome not measurable until human-verification items complete. |
| NOISE-04 | 130-02 | Actionable-token carve-out + word-boundary matching, zero false-archive | NEEDS HUMAN | hasActionableToken exists with correct regex; 30/30 boundary tests pass. Predicate not called by any production code (WR-03). Human must decide: wire or formally accept prompt-only. |
| NOISE-05 | 130-02 | Rules apply to both live mailboxes; dormant boxes untouched | SATISFIED | swarm_type='info-routing' scope; ingest_enabled=false on 4 dormant boxes confirmed |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/lib/info-routing/actionable-tokens.ts` | 10-13 | Documented as "PRODUCTION carve-out backstop the screen-worker calls" but has zero call sites | Warning | NOISE-04 safety claim overstated vs actual runtime behavior — WR-03 open |

No TBD/FIXME/XXX debt markers found in phase-modified files (not a blocker).
WR-01 and WR-02 anti-patterns from prior verification are resolved.

---

### Human Verification Required

#### 1. Live end-to-end telemetry confirmation

**Test:** Send or wait for one live info-routing unknown email through Stage 1 (classifier-screen-worker). Observe the agent_runs table for a row with swarm_type='info-routing' and a rule_key matching 'llm:{category}:{confidence}'.

**Expected:** A row lands with no error (specifically no Postgres 23514 from agent_runs_swarm_type_check). The rule_key matches one of the six new noise category keys or 'llm:unknown:*' if the email doesn't match.

**Why human:** Requires real Inngest worker execution under live traffic. The DDL roundtrip (Plan 01) proved the DB accepts the row; this confirms the full worker->DB path hasn't regressed under normal operation.

---

#### 2. BEFORE per-mailbox labelled-sample baseline

**Test:** Run `npx tsx web/scripts/eval/info-unknown-pool-noise-baseline.ts sample <since> <until>` over the pre-promotion window. Human-label each returned row as noise or routable. Run `compute <labelled.json>`.

**Expected:** Each mailbox (smeba, fire-control) produces a NoiseFraction with noise_fraction near ~0.50 (the stated baseline) and wilson_ci_lo well above 0.20, confirming there is a measurable gap for the <20% target. The emitted scaffold now shows real email subjects and senders (WR-01 fixed), enabling reliable human labelling.

**Why human:** The labelling step is explicitly manual (noise-vs-routable requires human judgement about each email's routing intent). The subject/sender fix (WR-01) is confirmed in code — run this step now.

---

#### 3. AFTER baseline + <20% upper-bound proof

**Test:** After candidates accumulate N>=30 telemetry rows each and CLASSIFIER_CRON_MUTATE is flipped (operator-gated), re-run the baseline script in AFTER mode, compute `compare`, and assert wilson_ci_hi < 0.20 per mailbox.

**Expected:** The `compare` output shows `after.wilson_ci_hi < 0.20` for each live mailbox, providing statistical proof (not just a point estimate) that noise is below 20%. wilson_ci_hi is now present in all NoiseFraction outputs (WR-02 fixed).

**Why human:** Future measurement requiring (a) promoted rules, (b) human re-labelling of the AFTER sample, (c) operator action at promotion time.

---

#### 4. Wire hasActionableToken into classifier-screen-worker.ts or formally accept prompt-only (WR-03)

**Test:** Either (a) import hasActionableToken in classifier-screen-worker.ts and, for swarm_type='info-routing', return 'unknown' (not noise) if hasActionableToken returns true before the LLM verdict is allowed to archive — OR — (b) explicitly retract the "PRODUCTION carve-out backstop the screen-worker calls" docstring, update stage-1-regex.md to say the carve-out is prompt-only + Wilson-shadow only, and open a follow-up task for the programmatic wire.

**Expected:** Either a wired predicate call site exists in classifier-screen-worker.ts, or the threat model (T-130-02-01) and module docstring accurately reflect that the programmatic guard does not exist yet.

**Why human:** Architectural decision about the NOISE-04 safety posture. The plan labels this "HIGH SEVERITY" and "the cardinal safety constraint" — the decision must be explicit rather than implicit (dead code).

---

### Gaps Summary

Phase 130 registry infrastructure is fully verified and applied to production. The NOISE-03 measurement tooling is now fully trustworthy after gap-closure plan 130-04:

- **WR-01 RESOLVED:** Subject and sender in the labelling scaffold now come from `email_pipeline.emails` (batch-fetched by `email_id`, CHUNK=200, `sender_email` column). The always-null `dd.subject`/`dd.from` reads are removed.
- **WR-02 RESOLVED:** `wilsonCiUpper` is exported from `wilson.ts` (pure, clamps to 1, upper >= lower exhaustively tested). `NoiseFraction.wilson_ci_hi` is populated in `computeNoiseFractions`. The AFTER measurement can now assert `wilson_ci_hi < 0.20`.
- **WR-03 REMAINS OPEN:** `hasActionableToken` has zero production call sites in `classifier-screen-worker.ts`. This is correctly carried as an operator decision item, not a code defect.

The only remaining items are inherently human/operator: live telemetry observation, the BEFORE labelled baseline (now actionable with WR-01 fixed), the AFTER measurement (future), and the WR-03 decision.

**Status: `human_needed`** — All code-level verifiable truths are confirmed. The remaining items require human action: live telemetry, the BEFORE labelled baseline, the AFTER <20% measurement, and the WR-03 wiring decision.

---

_Verified: 2026-06-16T18:00:00Z_
_Re-verified after gap-closure plan 130-04_
_Verifier: Claude (gsd-verifier)_
