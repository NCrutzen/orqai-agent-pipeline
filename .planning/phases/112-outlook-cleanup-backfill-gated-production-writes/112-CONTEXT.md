# Phase 112: Outlook Cleanup + Backfill (gated production writes) - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn sales Stage 1 noise-archiving **live** and retroactively sweep the already-ingested corpus — high-confidence noise auto-archived in `verkoop@smeba.nl`, ambiguous matches routed to Bulk Review for operator approval, idempotent and safe to re-run. This is the **first phase that writes to live customer mail**.

**In scope:**
- Flip sales `dry_run_config.stage_1_archive` blocked → live behind a canary + operator checkpoint (CLEANUP-01).
- A retroactive backfill worker that sweeps the ingested corpus and archives matching noise (CLEANUP-02).
- Idempotent re-run (no duplicate archives / double side-effects) (CLEANUP-02).

**Out of scope (other phases):**
- Stage 3 sales intent agent + `swarm_intents` (Phase 113).
- Stage 2 resolver reuse (Phase 114).
- SugarCRM dead-data/source decommission (Phase 115) — the 34k `source='sugarcrm'` records are NOT live Outlook mail and are not archived here except where a real Outlook message exists (see D-08).
- New noise-rule discovery (was Phase 111).

</domain>

<decisions>
## Implementation Decisions

### Go-live flip & rollout safety (CLEANUP-01)
- **D-01:** Flip is **canary → operator-gated full flip**. Flip live for a small canary (capped first batch / next N high-confidence matches), pause at a blocking human-verify checkpoint to inspect what landed in `verkoop@smeba.nl`, then the operator approves the unrestricted flip.
- **D-02:** The flip is delivered as an **audited migration** (mirroring 111's flip migration) `UPDATE swarms SET dry_run_config ... stage_1_archive=false WHERE swarm_type='sales-email'`, **applied via Supabase MCP at the go-live checkpoint** after canary approval — not auto-applied during plan execution. The migration file is written by the phase; the apply is the human-gated trigger (a `[BLOCKING]` checkpoint task).

### Archive mechanism (CLEANUP-01 reconciliation)
- **D-03:** Going-forward live archive **reuses the existing inline verdict-worker path** — `classifier-verdict-worker.ts` already does Outlook label + archive swarm-agnostically (WR-01-gated on `isStageBlocked(swarm,'stage_1_archive')`), and sales categories already carry `outlook_label`. **Flipping the flag activates it; NO new side-effect descriptor or cleanup worker is needed for the inline archive.**
- **D-04:** **Outlook archive only** — there is no sales equivalent of debtor's iController-delete second system. The `verkoop@smeba.nl` mailbox is the only system touched. (Reconciles CLEANUP-01's "swarms.side_effects entry + cleanup worker" wording: that wording predates the 111 inline-gate work; the ONLY new worker this phase builds is the **backfill sweeper** (D-05). No `side_effects` row is added for the inline Outlook archive.)

### Backfill auto-vs-approval split (CLEANUP-02)
- **D-05:** A new **backfill worker** sweeps the ingested corpus, re-evaluates each email's Stage 1 disposition, and archives matches. Auto-archive set = **the 7 non-loopback inherited AP keys + the 3 flipped safe keys** (`auto_reply`, `ooo_temporary`, `ooo_permanent`) — i.e. everything currently at `categorize_archive` in `swarm_noise_categories` for sales, minus loopback. Everything else (`payment_admittance`, `unknown`, low/medium-confidence, un-promoted) routes to **Bulk Review** for operator approval.
- **D-06:** **`own_outbound_invoice_loopback` is skipped entirely** by the backfill — not auto-archived AND not surfaced for approval (per the debtor ~40% mis-archive incident + 111's test-first posture). Operator handles any loopback noise outside this sweep.

### Backfill scope, idempotency (CLEANUP-02)
- **D-07:** Backfill scope = **live `verkoop@smeba.nl` Outlook mail + any historic row that maps to a real Outlook message still in the mailbox** (join on `internet_message_id`). Only archive a message that actually exists in the inbox; rows with no live Outlook message (pure SugarCRM imports) are no-ops.
- **D-08:** Idempotency = **`pipeline_events_one_per_stage_email` unique index as the dedup ledger** (a Stage-1 archive row = already archived → skip) **AND** treat Graph "message already in Archive" as a **no-op success**. Double protection; reuses the proven Phase-82.2 machinery. A mid-batch crash + re-run produces zero duplicate archives.

### Claude's Discretion (research/planner to determine)
- **Canary size N** and the exact canary cut (next-N-matches vs first-capped-batch).
- **Batch size, Graph API throttling/rate-limit handling, and resumability** (Inngest per-function concurrency, backoff on 429s, checkpointed cursor).
- The Bulk Review approval action shape for ambiguous backfill matches (reuse the existing Stage-1 review surface).
- Whether a backfill **dry-run report mode** (list what WOULD archive) precedes the live canary — recommended but planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline architecture (locked)
- `docs/agentic-pipeline/README.md` — 5-stage funnel; side-effect model.
- `docs/agentic-pipeline/stage-1-regex.md` — `categorize_archive` = Outlook label + archive (+ queue cleanup automation for debtor); the `swarm_noise_categories.action` dispatch.
- `docs/debtor-email-pipeline-architecture.md` — debtor cleanup/side-effect implementation map (the analog for the side-effect pattern, even though sales uses inline archive not iController).

### Implementation (read before touching)
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — the inline `categorize_archive` path (D-03); `archiveLive` gate (Phase 111 WR-01). The flag-flip activates this for sales.
- `web/lib/pipeline-gating/dry-run-gate/` — `isStageBlocked` (the gate the flip toggles).
- `web/lib/outlook/client.ts:357,392` — `categorizeEmail` / `archiveEmail` (Graph). The archive mechanism.
- `web/lib/swarms/registry.ts` — `loadSwarm` / `swarm_noise_categories` reads (the auto-set source of truth for D-05).
- Phase 82.2 `pipeline_events_one_per_stage_email` unique index — the idempotency ledger (D-08); find its migration.
- `web/lib/automations/sales-email/retro/` (Phase 111) — the corpus-selection + `stage_1_retro_runs` harness; the backfill re-uses the disposition logic (D-05) and the two-corpus/Outlook-presence selection (D-07).
- `.planning/phases/111-stage-1-noise-expansion-calibration/111-REVIEW.md` — WR-01 (telemetry gating now matters with live archive) + WR-03 (reproducible `would_archive`) carry-forwards.

### Project decisions / data
- `.planning/STATE.md` — sales `dry_run_config.stage_1_archive=true` (blocked) today; 110-04 per-stage gate.
- `.planning/todos/pending/2026-04-23-create-draft-idempotency-and-cleanup.md` — side-effect idempotency lessons (Inngest retries/60s-timeout → duplicate side-effects); the reason D-08 needs a ledger, not just step-cache.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Inline verdict-worker archive** (D-03): no new worker for going-forward live mail — flag-flip only.
- **dry-run-gate `isStageBlocked`**: the single toggle; the migration flips its backing flag.
- **Phase 111 retro harness** (`retro/select-candidates.ts`, `aggregate-baseline.ts`): corpus selection + Outlook-presence + disposition logic the backfill reuses (D-05/D-07).
- **`pipeline_events_one_per_stage_email`**: ready-made idempotency ledger (D-08).
- **`archiveEmail`/`categorizeEmail`** Graph helpers.

### Established Patterns
- Inngest replay-safety: side effects in `step.run`; non-deterministic ids inside the step (Phase 65). Step-cache does NOT protect against thrown-error retries → the ledger (D-08) is the real dedup (create-draft-idempotency lesson).
- Registry-as-source-of-truth: the auto-set (D-05) reads live `swarm_noise_categories.action`, not a hardcoded list.
- Migration-decision vs production-write separation: the flip migration (D-02) is the human-gated trigger; code ships inert.

### Integration Points
- `verkoop@smeba.nl` Outlook mailbox via Graph (the only live system touched).
- `swarm_noise_categories` (sales) — current `categorize_archive` set defines the backfill auto-set.
- Bulk Review Stage-1 surface — the approval lane for ambiguous matches.

</code_context>

<specifics>
## Specific Ideas

- This is the first live-mail-writing phase; the canary + operator checkpoint (D-01) is the safety spine. Treat the go-live flip migration as a trigger pulled by a human, never auto-applied mid-execution.
- WR-01 (Phase 111) matters more now: with archive live, the Stage-4 `auto_archived_noise` telemetry must fire iff a real archive happened — already fixed, but verify it holds for sales live.

</specifics>

<deferred>
## Deferred Ideas

- Rollback/undo of a bad backfill batch (un-archive) — not built; rely on the canary + idempotency + Bulk-Review-for-ambiguous to prevent bad batches. Revisit only if a live incident warrants an undo tool.
- Archiving pure SugarCRM-imported records that have no live Outlook message — out of scope (Phase 115 owns Sugar disposition).

### Reviewed Todos (not folded)
- `2026-04-23-create-draft-idempotency-and-cleanup.md` — its idempotency *lessons* inform D-08, but its specific scope (iController create-draft drafter dedup) is debtor-side and not part of this phase.
- Bulk Review UI todos (override-note flow, Stage-1 chip semantics) — frontend surface, not this phase.

</deferred>

---

*Phase: 112-outlook-cleanup-backfill-gated-production-writes*
*Context gathered: 2026-06-03*
