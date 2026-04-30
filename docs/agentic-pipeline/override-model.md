# 4-Axis Override Model

> **Status:** RFC (Phase 63). Implements RFC-03. Locked decisions D-10, D-11.
> **Cross-link:** every axis names a graduated-automation hook -- see [`./graduated-automation.md`](./graduated-automation.md).

## Purpose

Operators correct pipeline output at four independent points. Each correction produces a distinct learning signal that feeds a different graduated-automation hook (cross-link to [`./graduated-automation.md`](./graduated-automation.md)). Documenting the four axes separately is what lets the eval and promotion logic in Phase 71 score each stage on its own merits, without one wrong answer poisoning the verdict on the others.

## Four Axes (Overview Table)

| Axis | Stage | Override meaning | Today-state (source-of-truth) | Graduated-automation hook consumed |
|---|---|---|---|---|
| Axis 1 | Stage 1 (regex) | Wrong category | **REAL TODAY:** `agent_runs.corrected_category` (operator's chosen category, verified `supabase/migrations/20260428_public_agent_runs.sql:85`) + `agent_runs.human_verdict` (verified same migration, line 68 enum). | regex-rule promotion (Wilson-CI gate) |
| Axis 2 | Stage 2 (entity) | Wrong customer | **PARTIAL TODAY:** per-mailbox approve/reject in `/automations/debtor-email-labeling` writes `agent_runs.human_verdict` and updates `email_labels.reviewed_by` / `email_labels.reviewed_at`; the consolidated `email_labels.corrected_customer_account_id` capture column exists (verified `20260430c_email_labels_feedback_and_invoice_copy.sql:16`) but full Bulk-Review surface for it is forward-referenced to Phase 71. | sender-mapping promotion |
| Axis 3 | Stage 3 (coordinator) | Wrong intent | **DOES NOT EXIST TODAY** -- Phase 65 introduces the ranked-intent surface; Phase 71 ships override capture. | prompt-tune trigger |
| Axis 4 | Stage 4 (handler) | Wrong handler output | **REAL TODAY:** `email_labels.draft_quality` + `email_labels.feedback_reason` (verified `20260430c_email_labels_feedback_and_invoice_copy.sql:18-19`); `agent_runs.human_verdict` enum includes `'edited_minor'` and the `'rejected_*'` family (verified `20260428_public_agent_runs.sql:68`). | prompt-tune / handler-replacement |

## Axis 1 -- Wrong Category (Stage 1)

### Definition

The Stage 1 regex classifier emitted the wrong `category_key` (or `unknown` when a real category applied). The operator picks the correct category from the swarm's category vocabulary in the Bulk Review UI. This corrects the routing decision: a different `swarm_categories.action` would have fired.

### Where captured today

The Bulk Review UI at `web/app/(dashboard)/automations/debtor-email-review/` lets the operator pick the corrected category on any row. The dropdown writes `agent_runs.corrected_category`; the up/down vote on the matching rule writes `agent_runs.human_verdict`.

### Telemetry row produced

Today, an `agent_runs` row carries the override fields directly. Forward-referenced: a `pipeline_events` row stamped with `stage='1-regex'`, `decision=<original>`, `override=<corrected>`, `eval_type='category-correction'`, `context_version=1`. The `pipeline_events` table itself is shipped in Phase 70.

### Graduated-automation hook

Regex-rule promotion. Axis 1 overrides accumulate into the per-rule binomial sample feeding the Wilson-CI promotion gate. When a candidate rule's lower bound clears the gate (thresholds in code, not in this RFC), the rule is promoted live. See [`./graduated-automation.md`](./graduated-automation.md).

## Axis 2 -- Wrong Customer (Stage 2)

### Definition

The Stage 2 entity-resolver returned the wrong `customer_id` (or null when a real account existed). The operator picks the correct account in the labeling/review UI. Downstream stages may have run their reasoning on the wrong customer's documents -- that does not make their reasoning "wrong"; it makes their inputs wrong (see [Independence of Axes](#independence-of-axes)).

### Where captured today

Partial -- consolidated in Phase 71. The per-mailbox approve/reject flow at `/automations/debtor-email-labeling` writes `agent_runs.human_verdict` plus the `reviewed_by` / `reviewed_at` fields on `email_labels`. The dedicated correction column `email_labels.corrected_customer_account_id` exists in the schema (verified migration `20260430c_email_labels_feedback_and_invoice_copy.sql:16`) but the consolidated 4-axis Bulk Review override control that uses it ships in Phase 71.

### Telemetry row produced

Today: `agent_runs.human_verdict` plus the corrected-account column when the Phase 71 surface lands. Forward-referenced: `pipeline_events` row with `stage='2-entity'`, `decision=<original_customer_id>`, `override=<corrected_customer_id>`, `eval_type='entity-correction'`, `context_version=1`.

### Graduated-automation hook

Sender-mapping promotion. Axis 2 corrections feed the Phase 56 Wilson-CI promotion machinery for `sender -> customer` mappings: an LLM-aided sender lookup that, after enough operator-approved samples, becomes a deterministic sender-to-customer map. See [`./graduated-automation.md`](./graduated-automation.md).

## Axis 3 -- Wrong Intent (Stage 3)

### Definition

The Stage 3 coordinator emitted the wrong intent (or the wrong top-ranked intent on a multi-intent email). The operator picks the correct intent (or reorders the ranked list) in the Bulk Review UI.

### Where captured today

**Today-state: not yet captured.** Phase 65 ships the ranked-intent coordinator (CORD-01..04), and Phase 71 ships the Bulk Review override control that lets operators correct or reorder the intent ranking. Until both land, axis 3 is described, not measured.

### Telemetry row produced

Forward-referenced: `pipeline_events` row with `stage='3-coordinator'`, `decision=<intent_emitted>`, `override=<intent_corrected>`, `eval_type='intent-correction'`, `context_version=1`. Multi-intent emails generate one row per ranked-list correction.

### Graduated-automation hook

Prompt-tune trigger. Axis 3 corrections clustered by pattern (same kind of email, same kind of mistake) queue a prompt revision proposal for human review. The proposal goes through the Learning Inbox surface (Phase 71) before any prompt update is applied. See [`./graduated-automation.md`](./graduated-automation.md).

## Axis 4 -- Wrong Handler Output (Stage 4)

### Definition

The Stage 4 handler produced an output that is wrong on its own merits -- bad draft text, wrong attachment, wrong tone, wrong language, wrong reference number. Stage 1, 2, and 3 may all have been correct; the failure is the handler agent's own.

### Where captured today

The kanban-card review surface (the per-card Approve / Edit / Reject controls in the swarm's Agent OS view -- the surface plumbed via [`../swarm-bridge-contract.md`](../swarm-bridge-contract.md)) writes:
- `email_labels.draft_quality` (`correct` | `needed_edit` | `rejected`) -- the headline verdict on the draft.
- `email_labels.feedback_reason` -- free-text or structured reason for `needed_edit` / `rejected`.
- `agent_runs.human_verdict` -- includes `'edited_minor'`, `'edited_major'`, and the `'rejected_*'` family (verified `supabase/migrations/20260428_public_agent_runs.sql:68`).

### Telemetry row produced

Today: the `email_labels` row carries `draft_quality` + `feedback_reason`; the matching `agent_runs` row carries `human_verdict`. Forward-referenced: `pipeline_events` row with `stage='4-handler'`, `decision=<draft_emitted>`, `override=<edit_or_reject>`, `eval_type='handler-quality'`, `context_version=1`.

### Graduated-automation hook

Prompt-tune / handler-replacement. Axis 4 signals clustered by `feedback_reason` family (e.g. "wrong language" repeating) feed either a prompt revision proposal OR a handler-agent swap proposal (a different agent variant takes over for that intent). Both routes go through the Learning Inbox before applying. See [`./graduated-automation.md`](./graduated-automation.md).

## Independence of Axes

Overriding axis N does NOT invalidate downstream stages' decisions on the same email; those decisions become non-applicable, not wrong. If axis 2 (wrong customer) is overridden, the Stage 3 intent and Stage 4 draft were computed against the wrong customer's context -- they are non-applicable, not wrong, and the eval logic in Phase 71 must not double-count them as Stage 3 / Stage 4 errors. The four axes are independent learning signals; each scores its own stage on the inputs that stage actually saw.

## Forward References

- `pipeline_events` table -- Phase 70 (TELE-01); the single source of truth where every axis's override row lands once the table exists.
- Bulk Review 4-axis UI -- Phase 71 (REVW-01..06); the consolidated surface where axes 2 and 3 (and re-homed axes 1 and 4) get captured uniformly.
- Ranked-intent coordinator -- Phase 65 (CORD-01..04); precondition for axis 3 capture.
- Consolidated axis 2 / axis 3 capture columns and UI controls -- Phase 71.

## See Also

- [`./README.md`](./README.md) -- RFC entry point.
- [`./graduated-automation.md`](./graduated-automation.md) -- the hooks each axis feeds.
- [`./stage-1-regex.md`](./stage-1-regex.md)
- [`./stage-2-entity.md`](./stage-2-entity.md)
- [`./stage-3-coordinator.md`](./stage-3-coordinator.md)
- [`./stage-4-handler.md`](./stage-4-handler.md)
