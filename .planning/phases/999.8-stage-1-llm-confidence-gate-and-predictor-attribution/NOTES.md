# Phase 999.8 — NOTES

Pre-discuss-phase notes. Captures the motivating incident, the code/data evidence,
and the reasoning that produced the ROADMAP entry. Discuss-phase will turn the
open questions into a SPEC; nothing here is locked.

---

## Motivating incident (2026-05-08)

A colleague flagged that an email "got archived which shouldn't have." Trace:

- **email_id**: `09823c92-f6c4-4bce-bb9c-e7935e508e40`
- **mailbox**: `debiteuren@smeba-fire.be` (entity `smeba-fire`)
  - Note: Therese addressed `Debiteuren Smeba NL <debiteuren@smeba.nl>` in the To
    header but the ingest picked it up from the smeba-fire.be inbox. Likely an
    Outlook forward/alias rule on the smeba.nl side delivers a copy to the BE
    mailbox. Separate question from this phase — flagged for the inbox owner.
- **subject**: `FW: Invoice 17338747`
- **sender**: `Therese.Hendriks@ago-groep.nl`
- **received_at**: 2026-05-08 13:32:52 UTC

### Pipeline trace (`pipeline_events` joined to `agent_runs`)

| time (UTC)            | stage | decision             | confidence | source     | notes                                                                 |
|-----------------------|-------|----------------------|------------|------------|-----------------------------------------------------------------------|
| 2026-05-08 13:33:26   | 1     | `unknown`            | 0.000      | regex      | `regex.matchedRule = "no_match"` — regex abstained                    |
| 2026-05-08 13:33:31   | 0     | `safe`               | (n/a)      | safety LLM | strip_changed=true, no injection                                      |
| 2026-05-08 13:33:37   | 1     | `payment_admittance` | 0.700      | LLM 2nd    | `llm_confidence="medium"`, `final_category_key="payment_admittance"`  |

Resulting `agent_runs` row: `57097576-bb47-419e-934a-41508e2f304c` —
`status=predicted`, `confidence=medium`, `reasoning="Email requests corrected
invoice and credit note; administrative/accounting correspondence about billing
documentation."`

Resulting Outlook side-effects (per `swarm_noise_categories.payment_admittance.action
= "categorize_archive"`, `outlook_label = "Payment Admittance"`):
1. `categorizeEmail(source_mailbox, message_id, "Payment Admittance")`
2. `archiveEmail(source_mailbox, message_id)`

The email never reached Stage 3 / coordinator / Bulk Review. The only reason an
operator saw it was a manual flag.

---

## The two problems this phase fixes

### Problem 1 — no confidence gate on LLM 2nd-pass

`web/lib/inngest/functions/classifier-screen-worker.ts:287-330`:

```ts
await step.run("emit-verdict", async () =>
  (inngest.send as unknown as SendFn)({
    name: "classifier/verdict.recorded",
    data: {
      automation_run_id,
      swarm_type,
      decision: "approve",                           // <-- unconditional
      predicted_category: finalCategoryKey,
      ...
    },
  }),
);
```

`low`, `medium`, `high` all emit `decision: "approve"`. The downstream
`classifier-verdict-worker.ts` looks up `swarm_noise_categories[finalKey].action`
and runs `categorize_archive` regardless. The only escape valve is the LLM
itself returning `"unknown"` — at which point the seed category has
`action='reject'` (label-only-skip) and Outlook is untouched.

`numericConfidence()` in `web/lib/pipeline-events/types.ts` maps the LLM's
enum to `high→0.9 / medium→0.7 / low→0.4` for `pipeline_events.confidence`,
but no code path reads that numeric value for routing. It's display-only.

The RFC (`docs/agentic-pipeline/stage-1-regex.md:105,115`) says concrete
promotion thresholds for the *regex-rule* hook are Phase 71 work — but it
does **not** specify a confidence gate for the LLM 2nd-pass at all. Gap.

### Problem 2 — verdict feedback math is predictor-blind

`web/lib/inngest/functions/labeling-flip-cron.ts:94-122`:

```ts
const { data: rows } = await admin
  .from("agent_runs")
  .select("human_verdict")
  .eq("swarm_type", "debtor-email-labeling")
  .not("human_verdict", "is", null)
  .filter("context->>icontroller_mailbox_id", "eq", String(mailbox.id))
  ...
const n = list.length;
const agree = list.filter(r => r.human_verdict === "approve").length;
const ci_lo = n > 0 ? wilsonCiLower(n, agree) : 0;
```

The aggregation groups on mailbox only. A wrong LLM-2nd-pass prediction
(which arrives *because* the regex abstained) and a wrong regex prediction
both decrement `agree` in the same Wilson-CI bucket. If LLM mistakes get
labeled `rejected_other` by reviewers, the per-mailbox CI drops, the
demotion gate (`ci_lo < 0.92`) fires, and `labeling_settings.dry_run` flips
back to `true` for the *whole mailbox* — punishing the regex's
auto-promotion math for the LLM's mistakes.

Today the predictor attribution exists but only in `pipeline_events.decision_details`:

```json
{
  "regex": { "invoked": true, "matchedRule": "no_match", "category": "unknown" },
  "llm_invoked": true,
  "llm_category_key": "payment_admittance",
  "final_category_key": "payment_admittance"
}
```

The verdict-side `agent_runs` row written by `recordVerdict`
(`web/app/(dashboard)/automations/[swarm]/review/actions.ts:131-146`) does
**not** copy this attribution forward. The feedback aggregator would have
to join across rows to recover it, and today simply doesn't.

---

## Operator's framing (verbatim, paraphrased from chat)

> "We want to set hard thresholds, but we need to make sure that we know
> that LLM made the prediction, because in a worst-case scenario the
> confidence scores get lower for the regex as well. If I start labeling
> these emails from LLM as incorrectly labeled, I think there needs to be
> a specific discrepancy between those tools."

Interpretation locked at conversation time: every Stage 1 prediction
carries a *predictor* (`regex:rule_X` or `llm_2nd_pass`); human verdicts
attribute back to that predictor; downstream feedback math (Wilson-CI,
promotion/demotion, any future learning loop) groups on predictor at
minimum.

---

## Open questions (decide in /gsd-discuss-phase)

Mirrored in the ROADMAP entry — listed here for reviewer context, not
duplicated answers:

1. UI affordance: predictor chip on Bulk Review rows + verdict subclasses
   (`LLM was wrong` vs `regex rule X was wrong`)?
2. Regex attribution granularity: 2 streams (regex vs LLM) or N streams
   (per-rule + LLM)?
3. Low-confidence routing target: new surface vs reuse Stage 0
   escalate-to-Kanban shape?
4. Backfill: re-derive `predictor` onto historical `agent_runs` rows from
   `pipeline_events`, or forward-only cutover?
5. Threshold scope: `high`-only uniformly, or per-category override (some
   noise keys may be safe at `medium`)?

---

## Files most likely to change (not locked — discuss-phase will confirm)

- `web/lib/inngest/functions/classifier-screen-worker.ts` — add gate
  between `llm-call` step and `emit-verdict`; route `medium`/`low` to the
  low-confidence surface instead of `decision: "approve"`.
- `web/app/(dashboard)/automations/[swarm]/review/actions.ts` —
  `recordVerdict` must persist `predictor` (and optionally `predictor_rule`)
  onto the verdict-side `agent_runs` row.
- `web/lib/inngest/functions/labeling-flip-cron.ts` — group Wilson-CI on
  `(mailbox, predictor)` instead of `mailbox` alone.
- Schema migration — add `predictor text` (+ `predictor_rule text NULL`)
  to `public.agent_runs`, backfill plan TBD per open question 4.
- `web/lib/pipeline-events/emit.ts` / types — ensure `decision_details`
  already carries predictor attribution canonically (it does today; just
  re-confirm the contract before threading it through to verdict rows).
- `docs/agentic-pipeline/stage-1-regex.md` — RFC update to lock the
  confidence-gate principle (numbers stay in code per existing convention).

---

## Cross-references

- ROADMAP entry: `### Phase 999.8` in `.planning/ROADMAP.md`
- RFC (locked): `docs/agentic-pipeline/stage-1-regex.md`
- Hard separation rule: a row exists in EXACTLY ONE of
  `swarm_noise_categories` (Stage 1) or `swarm_intents` (Stage 3). This
  phase only touches the Stage 1 side; Stage 3 confidence gating is
  out of scope.
- Related backlog phases: 999.4 (Stage 0 timeout), 999.6 (Ariba regex
  rule — example of regex-side promotion), 999.7 (Stage 0 budget breach).
- Feedback memory: `feedback_classifier_evidence_scope.md` —
  multi-entity evidence requirement applies to any regex rule we'd
  promote off the back of this work, but does **not** apply to the LLM
  confidence-gate change itself (that's mechanism, not a per-rule
  promotion).
