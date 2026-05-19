---
captured: 2026-05-19
source: Conversation — operator confused by label-resolver vs tagger naming and stage assignment
status: pending
priority: M
target_milestone: v8.1
tags: [naming, refactor, docs, stage-2, terminology]
---

# Rename label-resolver + icontroller-tagger; lock tagger as Stage 2

## The naming problem

Two Inngest functions in the debtor-email pipeline have overlapping-
sounding names but do different things:

| Today | Responsibility | Side-effects |
|---|---|---|
| `classifier-label-resolver` | NXT lookup → resolve `customer_account_id` | DB-only: INSERT `debtor.email_labels` with status (pending / skipped / dry_run) |
| `debtor-email-icontroller-tagger` | Apply customer label in iController via Browserless | UPDATE same row: `icontroller_tag_status`, screenshots, `labeled_at` |

"label-resolver" and "tagger" sound near-synonymous. Operator
question 2026-05-19: "Why are there a tagger and a labeler — don't
they do the same thing?" Required full architecture walkthrough to
clarify. Naming is leaking the 2-phase split (resolve → apply) when
it should make the split obvious.

## Stage alignment — also confusing

The tagger applies the **customer label** that the resolver decided.
Both are Stage 2 (customer entity resolution) work — the resolver is
the read/decide half, the tagger is the write/apply half. Stage 3 is
the **intent classifier** (`debtor-email-coordinator`), which is
unrelated to the tagger.

Today:

- `classifier-label-resolver` writes `pipeline_events.stage=2` ✓ (correct)
- `debtor-email-coordinator` writes `pipeline_events.stage=3` ✓ (correct)
- `icontroller-tagger` does NOT emit its own `pipeline_events` row — it
  only updates `email_labels`. Implicit Stage 2 affiliation.

The Phase 82.8 screenshot strip is mounted under `effectiveStageAudit[1]`
in the detail-pane (Stage 1 audit expander). For **noise cleanup**
screenshots (cleanup-worker) that's correct — noise is Stage 1. For
**tagger** screenshots (customer-label-apply) it's misaligned — those
belong under Stage 2.

## Proposed for v8.1

### 1. Rename for clarity

| Today | Proposed | Why |
|---|---|---|
| `classifier-label-resolver` | `stage-2-customer-resolver` (or `customer-entity-resolver`) | Names the stage + the decision (resolve customer entity from sender / NXT) |
| `debtor-email-icontroller-tagger` | `stage-2-icontroller-label-applier` (or `customer-label-applier`) | Names the stage + the action (apply the resolved label in iController) |
| `debtor-email-icontroller-cleanup-worker` | `stage-1-icontroller-noise-cleanup` | Same naming scheme — surfaces the Stage 1 origin |

Affected files / Inngest function IDs / event names / docs:
- Inngest function `id` fields (kebab-case) — rename triggers Inngest
  to treat as new functions; coordinate with deploy
- Event names: `debtor-email/label-resolve.requested` →
  `debtor-email/stage-2.customer-resolve.requested`
- Doc references in `docs/agentic-pipeline/*` and
  `docs/debtor-email-pipeline-architecture.md`
- CLAUDE.md "Canonical Architecture Docs" section
- Any swarm registry references (e.g. `swarm_noise_categories.swarm_dispatch`)

### 2. Lock tagger as Stage 2 in artifacts

- Add explicit "Stage: 2" header to `icontroller-tagger.ts` file comment
- Have the tagger emit a `pipeline_events.stage=2` row on completion
  (decision = `customer_labeled` / `customer_label_failed`) so the
  audit timeline shows the apply-phase as a Stage 2 event explicitly
  (not just an `email_labels` mutation). This also lets the detail-pane
  mount the tagger's screenshots under Stage 2 audit instead of Stage 1.
- Update `docs/agentic-pipeline/stage-2-entity.md` to document the
  two-phase Stage 2 split (resolve + apply) and the worker for each.
- Move Phase 82.8 screenshot strip lookup logic: when paths originate
  from the tagger, mount under `effectiveStageAudit[2]` (Stage 2 audit
  expander); when from cleanup-worker, mount under `effectiveStageAudit[1]`
  (Stage 1 audit expander). Distinguish source at loader time.

### 3. Coordinator naming check

`debtor-email-coordinator.ts` is fine — its name already implies
orchestration role. But for symmetry consider `stage-3-intent-coordinator`.

## Why deferred to v8.1

Renames touch:
- ~20 file references
- Inngest function IDs (treat as new functions → deploy carefully)
- Event names (need backwards-compat shim during rollout OR atomic flip)
- Multiple doc files in the locked RFC set

Out of scope for the Phase 82.8 closure. Bundle with the other v8.1
todos (`2026-05-18-stage-1-needs-review-semantics.md`,
`2026-05-18-override-note-flow-unclear.md`,
`2026-05-18-granular-dry-run-gating-per-stage-and-handler.md`) into
one v8.1 phase = "review-surface + naming + dry-run gates cleanup".

## Acceptance criteria for the v8.1 phase

- [ ] Inngest function IDs renamed and re-registered without dropping
      in-flight runs
- [ ] All event names use `swarm/stage-N.<action>.<event>` scheme
- [ ] `docs/agentic-pipeline/stage-2-entity.md` documents the
      resolve-then-apply split with worker names per phase
- [ ] Tagger emits `pipeline_events.stage=2` on completion
- [ ] Stage 2 detail-pane audit expander mounts tagger screenshots
      (Stage 1 strip continues to mount cleanup-worker screenshots only)
- [ ] CLAUDE.md and root README updated
- [ ] Grep audit: no remaining references to old names

## Related items

- `2026-05-18-stage-1-needs-review-semantics.md` (filter chips)
- `2026-05-18-override-note-flow-unclear.md` (review-surface UX)
- `2026-05-18-granular-dry-run-gating-per-stage-and-handler.md` (gating)
