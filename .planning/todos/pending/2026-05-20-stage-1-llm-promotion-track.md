---
type: phase-context
date: 2026-05-20
phase: 89
status: pending
source: .planning/debug/stage-2-customer-mapping-stuck.md (item C)
---

# Phase 89 — Stage 1 LLM 2nd-pass auto-action promotion track

## Problem (observed 2026-05-19)

`classifier-screen-worker.ts` auto-action gate:
```ts
const matchedRule = regexOutcome.matchedRule ?? "";
const isWhitelistMatch = whitelistSet.has(matchedRule);
const autoActionAllowed = isWhitelistMatch && settings.auto_label_enabled;
```

For Stage 1 LLM 2nd-pass verdicts (Phase 74 `stage-1-category-classifier`), the
LLM bypasses the regex path entirely. `regexOutcome.matchedRule === "no_match"`,
so `isWhitelistMatch === false` for **every** LLM verdict regardless of
`category_key` or `confidence`. Result: LLM-classified noise emails always land
in bulk-review, never auto-archive.

### Production data (2026-05-19, single day)

| Stage 1 outcome | Source | Disposition |
|---|---|---|
| 1× `subject_autoreply` (promoted regex rule) | Regex | ✅ Auto-archived |
| 3× `payment_subject` (demoted 2026-05-11, now fixed) | Regex | ❌ Bulk-review (would be fixed once N refills) |
| 1× `subject_autoreply+body_mailbox_retired` (candidate) | Regex | ❌ Bulk-review (needs promotion) |
| 3× LLM-classified | LLM 2nd-pass | ❌ Bulk-review (**this phase fixes**) |
| 1× LLM-classified | LLM 2nd-pass | ❌ Bulk-review (**this phase fixes**) |

Net: 1 of 9 noise emails actually auto-archived. After Phase 89 + organic
promotion drift, target is 6-8 of 9.

## Proposed design (option 1 in the debug discussion)

**Extend the existing Wilson-CI promotion model to LLM verdicts.** Same gates,
same `candidate → promoted → demoted` lifecycle, same per-rule telemetry. The
only mechanical change is the `rule_key` format.

### Mechanical changes

1. **rule_key namespace.** LLM verdicts mint synthetic keys of the form
   `llm:{category_key}:{confidence}`. Examples:
   - `llm:auto_reply:high`
   - `llm:payment_admittance:high`
   - `llm:ooo_temporary:high`

2. **Stage 1 worker.** Set `matchedRule = "llm:" + categoryKey + ":" + confidence`
   on LLM-derived verdicts so the existing whitelist check works untouched
   downstream. The verdict-emit payload's `predicted.rule` field carries this
   value too.

3. **Initial seed.** INSERT `candidate` rows for every
   `(noise_category × {high})` combination from `swarm_noise_categories`.
   `low` and `medium` confidence stay in bulk-review by design — gate-narrow
   first, then expand only after the high-confidence track proves out.

4. **Telemetry view.** Widen `classifier_rule_telemetry` (or its source
   materialized view) to aggregate `email_feedback.verdict` per LLM rule_key.
   The existing approve/reject signal from operator overrides at Stage 1 is
   the same input — Wilson-CI doesn't care whether the rule_key matched via
   regex or via LLM.

5. **Promotion gate.** Unchanged: `n≥30 AND ci_lo≥0.92` (PROMOTE_N_MIN +
   PROMOTE_CI_LO_MIN per `lib/classifier/wilson.ts`).

6. **Demotion gate.** Unchanged: `n≥30 AND ci_lo<0.88` (DEMOTE_N_MIN +
   DEMOTE_CI_LO_MAX — note the new N floor shipped 2026-05-20 in commit
   `d0ff6ab` applies to LLM rules too).

### Why option 1 over alternatives

- **Option 2 ("trust LLM `high` confidence blindly")**: no promotion gate,
  no operator telemetry feedback loop. Same reliability profile as the
  pre-Phase 60 hardcoded whitelist. Rejected.
- **Option 3 ("status quo, all LLM → bulk-review")**: doesn't scale as
  LLM 2nd-pass volume grows. Rejected.
- **Option 1 picks up the existing infrastructure (Wilson-CI promotion cron,
  `classifier_rules` table, demotion hysteresis with the N floor) and adds
  a single new namespace.** Cross-swarm reusable; no debtor-specific
  branches; no new gate logic to test.

### Cross-swarm pluggability

The `rule_key` is naturally scoped via `classifier_rules.swarm_type` (composite
PK is `(swarm_type, rule_key)`). Sales-email gets its own `llm:*:high` rows
seeded from sales-email's `swarm_noise_categories` — no extra plumbing.

## Hard prereqs / dependencies

- **None blocking.** Phase 89 is independent of Phases 83-88.
- **Benefits from Phase 84 (Stage 1 noise rules for AP-automation FYI traffic)**
  landing first — more diverse regex-rule baseline data improves the
  comparison between LLM and regex promotion rates. Does not block.

## Acceptance criteria

(a) `classifier_rules` carries one `llm:{category}:high` row per noise category
in `swarm_noise_categories`, swarm-scoped.

(b) Stage 1 worker's `matchedRule` for LLM verdicts uses the new
`llm:{category}:{confidence}` format (regex verdicts unchanged).

(c) `email_feedback` writes are aggregated per LLM `rule_key` in
`classifier_rule_telemetry` (or equivalent).

(d) Wilson-CI shadow-mode run on 30 days of corpus data identifies at least
1 promotable LLM `rule_key` (`shadow_would_promote`).

(e) Post-promotion (CLASSIFIER_CRON_MUTATE=true), an LLM verdict whose
`category_key` + `confidence` match a promoted `llm:*:high` rule produces an
auto-archive cleanup row — verified via `automation_runs` row with
`triggered_by='stage-1-worker', result.stage='categorize+archive'`.

(f) Demotion of a previously-promoted LLM rule_key respects DEMOTE_N_MIN=30
(no asymmetric-hysteresis bug analog).

## Open questions for /gsd-discuss-phase 89

1. **Confidence buckets.** Start with `high` only, or also seed
   `medium` candidates (more telemetry but more risk during shadow phase)?
2. **Telemetry source granularity.** Aggregate at `(rule_key, swarm_type)`
   only, or also include `(rule_key, swarm_type, source_mailbox)` for
   per-mailbox tracking? The regex track is currently swarm-level only.
3. **Initial promotion bypass.** Should any `llm:*:high` rows be seeded as
   already-promoted (skipping the candidate phase) based on the Phase 87
   retro-classification baseline? Or always require organic accumulation?
4. **Surface in the dashboard.** Does the existing classifier-rule-evaluations
   view need a UI tweak to distinguish `llm:*` rows from regex rules, or is
   the rule_key prefix self-documenting?
