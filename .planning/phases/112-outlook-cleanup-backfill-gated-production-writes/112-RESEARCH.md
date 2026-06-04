# Phase 112: Outlook Cleanup + Backfill (gated production writes) - Research

**Researched:** 2026-06-03
**Domain:** Live-mail-writing pipeline (Outlook archive via Graph), gated go-live flip, idempotent retro backfill (Inngest)
**Confidence:** HIGH (all findings verified against current code + migrations in this workspace; no external libraries introduced)

## Summary

Phase 112 turns sales Stage-1 noise-archiving LIVE and sweeps the already-ingested corpus. The locked decisions (D-01..D-08) are almost entirely about *re-using machinery that already exists and is already correct* — the going-forward live archive needs **only a flag flip** (a one-line `UPDATE swarms` migration applied by a human at a `[BLOCKING]` checkpoint), and the backfill is a near-clone of the proven `stage-0-backfill.ts` Inngest pattern, calling the same `archiveEmail`/`categorizeEmail` Graph helpers the inline path uses.

The single most important architectural fact: **the inline verdict-worker path (`classifier-verdict-worker.ts`) is already fully wired, swarm-agnostic, dry-run-gated (Phase 111 WR-01), and idempotent against the `pipeline_events_one_per_stage_email` unique index.** Flipping `dry_run_config.stage_1_archive` from `true`(blocked)→`false`(live) for `sales-email` activates it with zero code change. Verified: the gate is read at `classifier-verdict-worker.ts:130-132`, the telemetry emit is gated on the same `archiveLive` predicate (WR-01 fix, commit `def93a88`), and the unique index serves as the dedup ledger.

The backfill is the **only new worker**. It re-uses `selectCandidates` (corpus selection + the two-corpus/Outlook-presence seam, D-07), re-evaluates Stage-1 disposition (or reuses a fresh `stage_1_retro_runs` run), splits auto-vs-approval per D-05, and for ambiguous matches routes to Bulk Review by inserting `automation_runs` rows that the existing `approvePrediction`/`recordVerdict` action (which itself fires the inline archive) consumes. Idempotency is double-layered exactly as D-08 specifies: the `pipeline_events` unique index as ledger + treating Graph "already in Archive" as no-op success.

**Primary recommendation:** Build the backfill as a one-shot Inngest function modeled byte-for-byte on `stage-0-backfill.ts` (batched, `runId` inside `step.run`, pre-batch dedup SELECT against `pipeline_events`). For the auto-archive path, call `categorizeEmail`+`archiveEmail` directly inside `step.run` (do NOT re-emit `classifier/verdict.recorded` for the auto set — that would create automation_runs churn; reserve the verdict path for the ambiguous→Bulk-Review lane). Gate the live flip behind a written-but-unapplied migration + a `[BLOCKING]` checkpoint, and precede the canary with a dry-run report mode.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Flip is **canary → operator-gated full flip**. Flip live for a small canary (capped first batch / next N high-confidence matches), pause at a blocking human-verify checkpoint to inspect what landed in `verkoop@smeba.nl`, then the operator approves the unrestricted flip.
- **D-02:** The flip is delivered as an **audited migration** (mirroring 111's flip migration) `UPDATE swarms SET dry_run_config ... stage_1_archive=false WHERE swarm_type='sales-email'`, **applied via Supabase MCP at the go-live checkpoint** after canary approval — not auto-applied during plan execution. The migration file is written by the phase; the apply is the human-gated trigger (a `[BLOCKING]` checkpoint task).
- **D-03:** Going-forward live archive **reuses the existing inline verdict-worker path** — `classifier-verdict-worker.ts` already does Outlook label + archive swarm-agnostically (WR-01-gated on `isStageBlocked(swarm,'stage_1_archive')`), and sales categories already carry `outlook_label`. **Flipping the flag activates it; NO new side-effect descriptor or cleanup worker is needed for the inline archive.**
- **D-04:** **Outlook archive only** — there is no sales equivalent of debtor's iController-delete second system. `verkoop@smeba.nl` is the only system touched. No `side_effects` row is added for the inline Outlook archive. The ONLY new worker is the backfill sweeper (D-05).
- **D-05:** A new **backfill worker** sweeps the ingested corpus, re-evaluates each email's Stage-1 disposition, and archives matches. Auto-archive set = **the 7 non-loopback inherited AP keys + the 3 flipped safe keys** (`auto_reply`, `ooo_temporary`, `ooo_permanent`) — i.e. everything currently at `categorize_archive` in `swarm_noise_categories` for sales, minus loopback. Everything else (`payment_admittance`, `unknown`, low/medium-confidence, un-promoted) routes to **Bulk Review** for operator approval.
- **D-06:** **`own_outbound_invoice_loopback` is skipped entirely** by the backfill — not auto-archived AND not surfaced for approval.
- **D-07:** Backfill scope = **live `verkoop@smeba.nl` Outlook mail + any historic row that maps to a real Outlook message still in the mailbox** (join on `internet_message_id`). Only archive a message that actually exists in the inbox; rows with no live Outlook message (pure SugarCRM imports) are no-ops.
- **D-08:** Idempotency = **`pipeline_events_one_per_stage_email` unique index as the dedup ledger** (a Stage-1 archive row = already archived → skip) **AND** treat Graph "message already in Archive" as a **no-op success**. Double protection; reuses the proven Phase-82.2 machinery.

### Claude's Discretion

- **Canary size N** and the exact canary cut (next-N-matches vs first-capped-batch).
- **Batch size, Graph API throttling/rate-limit handling, and resumability** (Inngest per-function concurrency, backoff on 429s, checkpointed cursor).
- The Bulk Review approval action shape for ambiguous backfill matches (reuse the existing Stage-1 review surface).
- Whether a backfill **dry-run report mode** (list what WOULD archive) precedes the live canary — recommended but planner's call.

### Deferred Ideas (OUT OF SCOPE)

- Rollback/undo of a bad backfill batch (un-archive) — not built; rely on the canary + idempotency + Bulk-Review-for-ambiguous.
- Archiving pure SugarCRM-imported records with no live Outlook message — Phase 115 owns Sugar disposition.
- Stage 3 sales intent agent + `swarm_intents` (Phase 113); Stage 2 resolver reuse (Phase 114); SugarCRM dead-code decommission (Phase 115); new noise-rule discovery (was Phase 111).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEANUP-01 | Stage-1 Outlook-archive side-effect wired for sales `categorize_archive` (go-live, gated) | **Reconciled by D-03/D-04:** the inline `classifier-verdict-worker.ts` path already archives Outlook mail swarm-agnostically; the requirement's literal "`swarms.side_effects` entry + cleanup worker" wording predates the 111 inline-gate work. Deliverable = the audited flip migration (D-02) + canary checkpoint. NO new `side_effects` descriptor (Finding 3). |
| CLEANUP-02 | Backfill the noise rules over the ingested corpus; auto-archive high-confidence/AP-noise, ambiguous → Bulk Review; idempotent; loopback excluded | New backfill Inngest worker modeled on `stage-0-backfill.ts` (Finding 6). Auto-set = live `swarm_noise_categories.action='categorize_archive'` minus loopback (Finding 4, D-05). Idempotency = `pipeline_events` unique index ledger + Graph already-archived-as-success (Finding 1/2, D-08). Ambiguous → `approvePrediction`/`recordVerdict` Bulk Review seam (Finding 7). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Go-live flip (governance) | Database (swarms.dry_run_config) | Human checkpoint (MCP apply) | The flag is registry data; the apply is a human-gated migration (D-02). No code owns the decision. |
| Going-forward live archive | Inngest worker (`classifier-verdict-worker.ts`) | Graph (`archiveEmail`) | Already-built inline path; flag activates it (D-03). |
| Retro corpus sweep | Inngest worker (NEW backfill sweeper) | Supabase (corpus read) + Graph (archive) | Long-running batch over ~850+ rows; durable functions + retries (D-05). |
| Live-presence check | Graph (get-by-internetMessageId) | Supabase (email_pipeline.emails join) | Only Graph can confirm a message still exists in the mailbox before archiving (D-07). |
| Ambiguous-match approval | UI (Bulk Review Stage-1) → server action | Inngest (`classifier-verdict-worker`) | Reuse `approvePrediction` → `recordVerdict` → `classifier/verdict.recorded` → inline archive (Finding 7). |
| Idempotency / dedup | Database (`pipeline_events` unique index) | Graph (already-archived no-op) | Double-layer per D-08. |

## Standard Stack

**No new libraries.** This phase is entirely intra-repo reuse. The relevant existing modules:

### Core (existing — reuse, do not rebuild)
| Module | Purpose | Why Reuse |
|--------|---------|-----------|
| `web/lib/outlook/client.ts` — `archiveEmail`, `categorizeEmail` | Graph move-to-Archive + category label | The exact mechanism the inline path uses; already has transient-retry on the Graph fetch (lines 41-63). |
| `web/lib/inngest/functions/classifier-verdict-worker.ts` | Inline `categorize_archive` path (D-03) | Already swarm-agnostic + dry-run-gated + telemetry-gated (WR-01). Flag flip activates it. |
| `web/lib/pipeline-gating/dry-run-gate/index.ts` — `isStageBlocked` | The per-stage gate the flip toggles | Single source of truth; fail-closed on missing config. |
| `web/lib/automations/sales-email/retro/select-candidates.ts` — `selectCandidates` | Two-corpus selection + cap + dedup (D-07) | Already handles the Outlook+SugarCRM corpora, normalization, truncation guard, dedup-by-email_id (post-111 WR-05/06 fixes). |
| `web/lib/inngest/functions/stage-0-backfill.ts` | **The pattern to mirror** for the new backfill sweeper | Proven batched/replay-safe/idempotent one-shot backfill (Finding 6). |
| `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts` — `recordVerdict`, `approvePrediction` | Bulk Review approve → fires inline archive | The exact ambiguous-match approval seam (Finding 7). |
| `web/lib/swarms/registry.ts` — `loadSwarmNoiseCategories` | Auto-set source of truth (D-05) | Registry-as-source-of-truth; reads live `action` per category. |
| `web/lib/pipeline-events/emit.ts` — `emitPipelineEvent` | Writes the Stage-4 dedup-ledger row | The unique-violation catch pattern is already in the verdict worker (lines 311-328). |

### Supporting
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `web/lib/automations/sales-email/retro/aggregate-baseline.ts` | Per-category hit-rate aggregation | If a dry-run report mode is built — reuse to produce the "what would archive" summary. |
| `web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts` | Re-classifies the corpus into `stage_1_retro_runs` | If the backfill re-evaluates disposition fresh, mirror its per-email loop. Note: it writes a SIDE-CHANNEL table only — do NOT have it fire side-effects. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Re-emitting `classifier/verdict.recorded` for the auto set | Direct `archiveEmail` call inside backfill `step.run` | Re-emitting creates `automation_runs` churn + double-handling; the verdict path is built for *operator-reviewed* rows. **Recommend direct Graph call for auto-set, verdict path only for ambiguous→Bulk-Review.** |
| New `backfill_ledger` table | Existing `pipeline_events_one_per_stage_email` index | D-08 explicitly reuses the existing ledger — **no new table needed** (Finding 8). |
| Re-running the Stage-1 classifier in the backfill | Reusing the latest `stage_1_retro_runs` disposition | Re-classifying costs LLM tokens for ~850 (and historic) rows again; if a recent retro run exists, reuse its `predicted_category_key`/`confidence`. Planner's call — see Open Questions. |

**Installation:** None. No `npm install`.

## Package Legitimacy Audit

**N/A — this phase installs no external packages.** All work is intra-repo reuse of existing modules + the already-installed `@zapier/zapier-sdk` (Graph relay) and `inngest`. No `npm install` step in any plan. If the planner discovers a genuinely new dependency is required, run the Package Legitimacy Gate before adding it.

## Architecture Patterns

### System Architecture Diagram

```
GO-LIVE FLIP (D-01/D-02/D-03)
─────────────────────────────
 [phase writes migration file]  20260603x_sales_stage1_archive_golive.sql
            │  (NOT auto-applied)
            ▼
 [BLOCKING checkpoint: operator inspects canary] ──approve──► MCP apply_migration
            │                                                       │
            │ UPDATE swarms SET dry_run_config.stage_1_archive=false│
            ▼                                                       ▼
 sales email arrives ─► Stage 0/1 ─► classifier-verdict-worker.ts
                                          │ action='categorize_archive'
                                          │ archiveLive = outlook_label && !isStageBlocked(swarm,'stage_1_archive')
                                          │   (now FALSE→ LIVE)
                                          ├─► categorizeEmail(verkoop@smeba.nl, msgId, label)   [Graph PATCH]
                                          ├─► archiveEmail(verkoop@smeba.nl, msgId)             [Graph move]
                                          └─► emitPipelineEvent(stage=4, auto_archived_noise)   [DEDUP LEDGER row]

BACKFILL SWEEP (D-05/D-07/D-08)  — NEW one-shot Inngest function
────────────────────────────────
 inngest.send("sales-email/stage-1.backfill", {mode:'report'|'canary'|'full', limit?})
            │
            ▼
 step.run("resolve-run-id")  ← crypto.randomUUID() INSIDE step (replay-safe)
            │
            ▼
 step.run("select-candidates") ── selectCandidates(outlook + sugarcrm corpora)
            │                       (D-07: only rows joinable to a live Outlook message)
            ▼
   per BATCH (size ~100-200):
     step.run("backfill-batch-N"):
        ├─ dedup SELECT pipeline_events (email_id, swarm_type, stage=4)  ──skip already-archived
        ├─ for each candidate:
        │     disposition = re-classify OR reuse stage_1_retro_runs verdict
        │     ├─ loopback key?               → SKIP entirely (D-06)
        │     ├─ in AUTO set (action=categorize_archive minus loopback, high-conf)?
        │     │     ├─ confirm live presence (Graph get-by-internetMessageId)  (D-07)
        │     │     ├─ archiveEmail(...)   ── treat "already in Archive" as success (D-08)
        │     │     └─ emitPipelineEvent(stage=4)  ── unique-violation = no-op (D-08 ledger)
        │     └─ else (payment_admittance / unknown / low-med conf)
        │           → INSERT automation_runs status='predicted' (Bulk Review lane)
        └─ return {archived, skipped, queued}

 OPERATOR (Bulk Review Stage-1) ─► approvePrediction(row_id) ─► recordVerdict
            └─► inngest "classifier/verdict.recorded" ─► classifier-verdict-worker (inline archive, same as live path)
```

### Recommended Project Structure
```
web/lib/inngest/functions/
└── sales-email-stage-1-backfill.ts        # NEW one-shot backfill sweeper (mirror stage-0-backfill.ts)

web/lib/automations/sales-email/backfill/  # NEW (or extend retro/) — pure helpers
├── select-backfill-candidates.ts          # wraps/extends selectCandidates + live-presence join (D-07)
├── disposition.ts                         # auto-vs-approval split (D-05), loopback skip (D-06)
└── __tests__/

supabase/migrations/
└── 20260603x_sales_stage1_archive_golive.sql   # NEW — the D-02 flip (written, NOT applied by plan)
```

### Pattern 1: Replay-safe one-shot backfill (mirror `stage-0-backfill.ts`)
**What:** A one-shot Inngest function triggered by a manual `inngest.send`, batched, with `runId` minted inside `step.run` and a pre-batch dedup SELECT.
**When to use:** The backfill sweeper (CLEANUP-02).
**Example:**
```ts
// Source: web/lib/inngest/functions/stage-0-backfill.ts:71-165 (verified pattern)
export const salesEmailStage1Backfill = inngest.createFunction(
  { id: "sales-email/stage-1.backfill", retries: 1, concurrency: { limit: 1 } },
  { event: "sales-email/stage-1.backfill" },
  async ({ event, step }) => {
    // Phase 65 replay-id rule: mint inside step.run.
    const runId = await step.run("resolve-run-id", async () => crypto.randomUUID());
    const candidates = await step.run("select-candidates", async () => /* selectCandidates(...) */);
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      await step.run(`backfill-batch-${i / BATCH_SIZE}`, async () => {
        // 1. dedup SELECT against pipeline_events (skip already-archived)
        // 2. per candidate: disposition → archive (auto) or queue (ambiguous)
      });
    }
  },
);
```

### Pattern 2: Graph archive with idempotent "already archived" handling (D-08)
**What:** `archiveEmail` moves the message to the Archive folder. A re-run on an already-archived message: the message id is no longer in Inbox; `/messages/{id}/move` on a message already in Archive returns 200 (move is idempotent to the same folder) OR the id resolves in Archive. Treat any "already there / not in inbox" outcome as success.
**Example:**
```ts
// Source: web/lib/outlook/client.ts:392-413 (archiveEmail) — wrap the call:
const r = await archiveEmail(source_mailbox, message_id);
if (!r.success) {
  // D-08: distinguish "already archived" (no-op success) from a real failure.
  // archiveEmail returns {success:false,error} on non-2xx. A 404 (message no
  // longer in the resolved location) on a re-run means it already moved → treat
  // as success. Match on error substring; do NOT retry-loop a genuine failure.
  if (/404|ErrorItemNotFound|already/i.test(r.error ?? "")) { /* no-op success */ }
  else throw new Error(`archive failed: ${r.error}`);
}
```
**[ASSUMED]** the exact 200-vs-404 behavior of Graph `/move` on an already-moved message — verify with a live canary probe before trusting the substring match (see Open Questions OQ-3).

### Pattern 3: Ambiguous → Bulk Review reuses the existing approve seam (Finding 7)
**What:** For ambiguous matches, INSERT an `automation_runs` row with `status='predicted'` carrying `result.{message_id, source_mailbox, predicted_category}` + `email_id`. The existing Bulk Review Stage-1 surface renders predicted rows; the operator clicking Approve calls `approvePrediction(row_id)` → `recordVerdict` → fires `classifier/verdict.recorded` → `classifier-verdict-worker` does the inline archive (gated on `stage_1_archive` being LIVE).
**Why this is the clean seam:** `approvePrediction` (actions.ts:798-878) already hydrates `VerdictInput` from `automation_runs` + `email_pipeline.emails` and delegates to `recordVerdict`. The approve action *is* an archive trigger once the flag is live.

### Anti-Patterns to Avoid
- **Re-emitting `classifier/verdict.recorded` for the AUTO set.** That path is for operator-reviewed rows and creates `automation_runs` + `agent_runs` churn. Auto-set rows should archive directly via `archiveEmail` inside the backfill `step.run`.
- **Adding a `swarms.side_effects` row for the Outlook archive.** D-03/D-04: the inline path archives Outlook directly; `side_effects` is for the debtor iController dispatch pattern. Sales has none.
- **Adding a new ledger table.** D-08 reuses `pipeline_events_one_per_stage_email`. No migration for a ledger.
- **Minting `runId`/timestamps outside `step.run`.** Phase 65 replay-safety; the backfill MUST follow `stage-0-backfill.ts`.
- **Hardcoding the auto-set category list.** Read it from `loadSwarmNoiseCategories` filtered to `action==='categorize_archive'` minus loopback (registry-as-source-of-truth, SWARM-02).
- **Applying the flip migration during plan execution.** D-02: written-but-unapplied; apply is a `[BLOCKING]` human checkpoint via MCP.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Move-to-Archive via Graph | Custom Graph fetch | `archiveEmail` (client.ts:392) | Already resolves the Archive folder (well-known + fallback) and has transient retry. |
| Corpus selection across two sources | New query | `selectCandidates` (select-candidates.ts) | Handles cap, truncation guard, dedup, direction normalization — all hardened in 111. |
| Batched replay-safe backfill scaffold | New Inngest fn from scratch | Clone `stage-0-backfill.ts` | Proven runId-in-step + pre-batch dedup SELECT + idempotent insert. |
| Dedup ledger | New table | `pipeline_events_one_per_stage_email` unique index | D-08; the verdict worker already catches its unique violation (lines 311-328). |
| Ambiguous-match approval UI | New surface | Bulk Review Stage-1 + `approvePrediction` | The approve action already fires the inline archive. |
| Auto-vs-approval disposition | New rules engine | `loadSwarmNoiseCategories` + `action` filter | Registry is source of truth (D-05). |

**Key insight:** This phase is ~90% wiring and ~10% new code. The risk is not "how do I build X" — it's "do I correctly reuse the already-correct machinery and not duplicate side-effect paths." The biggest trap is the auto-set accidentally going through the verdict-worker (double-handling) or someone adding a `side_effects` row that the inline path doesn't need.

## Runtime State Inventory

> Rename/refactor categories — but this is a *go-live + backfill* phase, so the relevant "runtime state" is what's cached/registered that affects the flip and the sweep.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `swarms.dry_run_config.stage_1_archive=true` (blocked) for `sales-email` (verified STATE.md + 110-04). The 3 safe keys + 7 AP keys are at `action='categorize_archive'` in `swarm_noise_categories` (flip migration `20260603_sales_noise_calibration_flip.sql` applied live, inert behind gate). | The D-02 flip migration sets `stage_1_archive=false`. No data migration of existing rows needed for the flip. |
| Live service config | The **registry cache** (`registry.ts` SWARM_CACHE, 60s TTL) holds the pre-flip `dry_run_config`. After the MCP apply, the running Vercel instances will serve the blocked value for up to 60s. | Acceptable lag; note in the checkpoint that live archive begins within ~60s of apply. Not a blocker. |
| OS-registered state | None — no cron/task registers the sales archive. The backfill is manually `inngest.send`-triggered. | None — verified (no sales archive cron exists). |
| Secrets/env vars | `BROWSERLESS_API_TOKEN` not used here; Graph goes via `@zapier/zapier-sdk` (`ZAPIER_CREDENTIALS_*`, `OUTLOOK_CONNECTION_ID=56014785` hardcoded in client.ts). No new secret. | None — existing Zapier-relay credentials already power debtor live archive. |
| Build artifacts | `npm run codegen` covers `swarm_intents` only, NOT `swarm_noise_categories` or `dry_run_config` (confirmed in flip migration comment lines 60-61). | No codegen step for this phase's migrations. |

**The canonical question** (after every file is updated, what runtime systems still have stale state?): the **registry 60s cache** is the only one — and it self-heals within a minute of the flip apply. No durable stale state.

## Common Pitfalls

### Pitfall 1: Auto-set double-handled through the verdict worker
**What goes wrong:** Implementing the backfill auto-archive by re-emitting `classifier/verdict.recorded` per email. This creates `automation_runs`/`agent_runs` rows for every auto-archived email and runs them through the operator-review machinery.
**Why it happens:** The verdict worker *is* the inline archive path, so it looks like the natural reuse point.
**How to avoid:** Auto-set archives via a **direct** `categorizeEmail`+`archiveEmail` call inside the backfill `step.run` + a direct `emitPipelineEvent(stage=4)` (with the same unique-violation no-op). Reserve `classifier/verdict.recorded` for the ambiguous→Bulk-Review lane (where an operator actually approves).
**Warning signs:** Hundreds of new `automation_runs` rows after a backfill run; Bulk Review flooded with auto-resolved rows.

### Pitfall 2: Inngest 60s gateway / retry → duplicate archives
**What goes wrong:** The create-draft-idempotency lesson (`2026-04-23-...md`): a long step can hit a gateway timeout; the thrown error is NOT step-cached, so the retry re-runs the side effect → duplicate. For archive, a duplicate move is mostly harmless (idempotent move), but a duplicate `emitPipelineEvent` would unique-violation (caught) and a duplicate Bulk-Review insert would create a second predicted row.
**Why it happens:** Inngest step-cache only stores *successful* outputs; thrown errors re-execute the full step.
**How to avoid:** (a) Keep batches small enough that a batch step completes well under 60s (BATCH_SIZE ~100-200, not 500). (b) Pre-batch dedup SELECT against `pipeline_events` (already in the `stage-0-backfill.ts` pattern). (c) Bulk-Review insert guarded by an existence check on `(automation, result->>message_id)` — mirror the verdict worker's dedup at lines 211-219.
**Warning signs:** Two predicted rows for the same `message_id`; repeated Stage-4 unique-violation logs.

### Pitfall 3: `aggregate-baseline` 1000-row PostgREST cap (carry-forward IN-03)
**What goes wrong:** If the backfill reuses `aggregateBaseline` (or any unpaginated `.select()`) over a >1000-row run for the dry-run report, PostgREST silently caps at 1000 → under-count.
**Why it happens:** Default PostgREST row limit; the 111 review flagged this (IN-03, left unfixed).
**How to avoid:** Paginate any read over the backfill corpus (range loop, as `scripts/sales-stage-1-cluster-mine.ts` does), or count server-side.
**Warning signs:** Report totals that plateau at exactly 1000.

### Pitfall 4: Live-presence check assumes `internet_message_id` is the Graph id
**What goes wrong:** `archiveEmail`/`categorizeEmail` take the **Graph message id** (`source_id` in `email_pipeline.emails`), NOT the RFC 5322 `internet_message_id`. The verdict worker matches emails on `source_id.eq.${message_id} OR internet_message_id.eq.${message_id}` (client.ts callers; verified verdict-worker:178-181, 284-285). D-07 says "join on `internet_message_id`" for *historic-row → live-mail* mapping, but the **archive call needs the Graph id**.
**Why it happens:** Two different identifiers; `fetchReviewEmailBody` (actions.ts:738) explicitly notes Graph doesn't accept the RFC id and historic corpus rows "probably no longer in any mailbox."
**How to avoid:** For each candidate, resolve the **Graph id**: if the `emails` row has a usable `source_id` (Outlook ingest path), use it directly; for historic rows, look the message up by `internetMessageId` via Graph (`$filter=internetMessageId eq '...'`) to (a) confirm live presence per D-07 AND (b) obtain the Graph id to pass to `archiveEmail`. A row with no Graph hit = no-op (D-07).
**Warning signs:** `archive failed: 404` for historic rows; archives that silently target nothing.

### Pitfall 5: Registry cache masks the flip for 60s
**What goes wrong:** Right after the MCP apply, a canary email may still see `stage_1_archive=blocked` from the 60s `SWARM_CACHE` and skip the live archive.
**How to avoid:** Document in the checkpoint that live archive begins within ~60s; if the canary is "next N matches," wait >60s after apply before judging. Do not add cache-busting code (out of scope).

## Code Examples

### Reading the auto-set from the registry (D-05)
```ts
// Source: web/lib/swarms/registry.ts:54-76 + D-05 disposition
const cats = await loadSwarmNoiseCategories(admin, "sales-email"); // enabled only
const AUTO_KEYS = new Set(
  cats
    .filter((c) => c.action === "categorize_archive")
    .map((c) => c.category_key)
    .filter((k) => k !== "own_outbound_invoice_loopback"), // D-06 skip
);
// disposition: AUTO_KEYS.has(predicted) && confidence==='high' → auto-archive
//              predicted==='own_outbound_invoice_loopback'     → SKIP entirely (D-06)
//              else                                            → Bulk Review queue
```

### The dedup ledger no-op (D-08) — already proven in the verdict worker
```ts
// Source: web/lib/inngest/functions/classifier-verdict-worker.ts:297-328 (verified)
try {
  await emitPipelineEvent(admin, { swarm_type, stage: 4, email_id, decision: "auto_archived_noise", ... });
} catch (err) {
  const code = (err as { code?: string })?.code;
  const msg = (err as Error)?.message ?? "";
  if (code === "23505" || msg.includes("duplicate key value") ||
      msg.includes("pipeline_events_one_per_stage_email")) {
    return; // already archived → idempotent no-op
  }
  throw err;
}
```

### The flip migration shape (D-02) — mirror the 111 flip
```sql
-- 20260603x_sales_stage1_archive_golive.sql  (WRITTEN by plan, APPLIED at [BLOCKING] checkpoint)
-- swarms is an existing RLS-enabled table; UPDATE only — no new policy, no codegen.
BEGIN;
UPDATE public.swarms
   SET dry_run_config = jsonb_set(dry_run_config, '{stage_1_archive}', 'false'::jsonb),
       updated_at = now()
 WHERE swarm_type = 'sales-email';
COMMIT;
```
**[ASSUMED]** the exact `jsonb_set` path vs full-object replacement — verify the current `dry_run_config` shape live before writing (it has `stage_1_archive`, `stage_1_cleanup`, `stage_3_labeling`, `stage_4_handlers` per the gate interface). Use `jsonb_set` to avoid clobbering sibling flags.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CLEANUP-01 "swarms.side_effects entry + cleanup worker" (requirements wording) | Inline verdict-worker archive + flag flip; NO side_effects row | Phase 111 (inline dry-run gate retrofit) | The requirement's literal wording is satisfied differently; D-03/D-04 reconcile it. |
| Hardcoded per-swarm category enums | `swarm_noise_categories` registry read | Phase 56.7 / 68 | Auto-set is registry-derived (D-05). |
| Single unique index `(email_id, swarm_type, stage)` | `... WHERE email_id IS NOT NULL AND override IS NULL` | Migration `20260528a` | **The dedup ledger only covers NON-override emits.** Backfill auto-archive rows are non-override → correctly deduped. (Important nuance for D-08.) |

**Deprecated/outdated:**
- The "swarms.side_effects + cleanup worker" mental model for sales — superseded by the inline path. Don't build it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Graph `/messages/{id}/move` on an already-archived message returns a stable, detectable outcome (200 to same folder, or 404 ErrorItemNotFound) that can be treated as no-op success | Pattern 2 / Pitfall 4 | Backfill re-run could throw on already-archived rows → false failures. **Mitigate: probe during canary.** |
| A2 | `dry_run_config` is a jsonb object with sibling flags; `jsonb_set` is the safe flip mechanism | Code Examples (flip migration) | Full-object replacement could clobber `stage_3_labeling`/`stage_4_handlers`. **Mitigate: read live shape first.** |
| A3 | Historic SugarCRM-imported rows that DO have a live Outlook message are rare/edge (live path cut over 2026-05-06; only 2 sugar stragglers since per REQUIREMENTS.md) — the backfill's live-presence join mostly matters for the ~853 Outlook rows | D-07 / Finding 5 | If many historic rows map to live mail, the Graph get-by-internetMessageId cost (1 call/row) grows. **Mitigate: dry-run report mode counts the join first.** |
| A4 | A recent `stage_1_retro_runs` disposition exists and is reusable, OR re-classification cost (~850+ rows) is acceptable | Alternatives / Open Questions | Re-classifying the full historic corpus (34k sugar) would be expensive — but D-07 scopes the backfill to live-Outlook-present rows only, bounding it. |
| A5 | The Bulk Review Stage-1 surface renders `automation_runs status='predicted'` rows inserted by a non-ingest producer (the backfill) | Pattern 3 / Finding 7 | If the surface filters by `triggered_by` or producer, backfill-queued rows won't appear. **Mitigate: match the producer fields the live ingest uses; verify in plan Wave 0.** |

## Open Questions (RESOLVED — all are D-01 Claude's-Discretion items settled by the plans: report-mode built in 112-01, canary size 10–25 in 112-03, Graph already-archived probed live at the 112-03 idempotency re-run)

1. **Canary size N + cut (Claude's discretion, D-01).**
   - What we know: the live going-forward stream is ~33 emails/day; high-confidence noise is a fraction.
   - What's unclear: "next N matches" vs "first capped batch" of the backfill.
   - Recommendation: Use the **backfill in `report` mode first** (count what would archive), then a **canary = first ~10-25 auto-archives** in `canary` mode, pause at the `[BLOCKING]` checkpoint, operator inspects `verkoop@smeba.nl` Archive folder, then `full`. Keep canary small enough to eyeball every archived message.

2. **Reuse `stage_1_retro_runs` disposition vs re-classify in the backfill (A4).**
   - What we know: a 111 retro harness already classifies the corpus into `stage_1_retro_runs`; reusing avoids LLM cost.
   - What's unclear: whether a fresh run is needed for currency, and whether the `would_archive` snapshot semantics (WR-03) align with post-flip reality.
   - Recommendation: Reuse the latest `stage_1_retro_runs` verdicts if present and recent; pass `archive_reference_keys` = the post-flip auto-set so `would_archive` is deterministic. Re-classify only the live-present rows lacking a verdict.

3. **Graph already-archived behavior (A1).**
   - Recommendation: During the canary, deliberately re-run the backfill on the canary set and confirm the second pass is a clean no-op (zero new archives, zero errors). This validates D-08 end-to-end before `full`.

4. **Dry-run report mode (Claude's discretion).**
   - Recommendation: **Build it.** A `mode='report'` that runs selection + disposition + live-presence join and returns counts (auto / ambiguous / skipped-loopback / no-live-message) without any Graph write. Cheap, reuses `aggregateBaseline` (paginated), and de-risks the first live canary.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Microsoft Graph via `@zapier/zapier-sdk` relay (`OUTLOOK_CONNECTION_ID=56014785`) | archive/categorize/get-by-id | ✓ (powers debtor live archive today) | n/a | — |
| Inngest (durable functions) | backfill sweeper | ✓ | installed | — |
| Supabase MCP `apply_migration` against `mvqjhlxfvtqqubqgdvhz` | D-02 flip apply | ✓ (re-linked 2026-06-03 per STATE.md blocker note) | n/a | Studio SQL editor |
| `pipeline_events_one_per_stage_email` unique index | dedup ledger | ✓ (live, `20260528a`) | n/a | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** MCP apply → Studio SQL editor (the historic Management-API-token-expired risk; STATE.md says MCP OAuth was re-linked 2026-06-03, so MCP is the primary path).

## Validation Architecture

> nyquist_validation assumed enabled (no explicit `false` found).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing — `__tests__/*.test.ts` throughout `web/lib`) |
| Config file | existing repo vitest config (tests run green: 111 left 2049 passing) |
| Quick run command | `cd web && npx vitest run lib/inngest/functions/__tests__/sales-email-stage-1-backfill.test.ts` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEANUP-02 | auto-set excludes loopback; ambiguous → queue | unit | `npx vitest run .../backfill/__tests__/disposition.test.ts` | ❌ Wave 0 |
| CLEANUP-02 | re-run is idempotent (dedup SELECT skips archived; Graph already-archived = success) | unit | `npx vitest run .../sales-email-stage-1-backfill.test.ts` | ❌ Wave 0 |
| CLEANUP-02 | live-presence: historic row with no Graph hit = no-op | unit | same file | ❌ Wave 0 |
| CLEANUP-02 | runId minted inside step.run (replay-safe) | unit | same file (mirror stage-0-backfill test) | ❌ Wave 0 |
| CLEANUP-01 | flip migration sets exactly `stage_1_archive=false` for sales-email, no sibling clobber | migration-assertion | parse-the-SQL test (mirror `sales-noise-calibration.test.ts`) | ❌ Wave 0 |
| CLEANUP-01 | inline path archives live ONLY when `stage_1_archive=false` (gate) | unit (exists, extend) | `npx vitest run lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` | ✅ extend |

### Sampling Rate
- **Per task commit:** `npx vitest run` on the touched `lib/` subtree.
- **Per wave merge:** full `npx vitest run` (catch cross-tree regressions — 111 review found one the `lib/`-scoped gate missed).
- **Phase gate:** full suite green + `npm run check:supabase` 0 ERROR + `npm run codegen && git diff --exit-code` (no-drift) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `web/lib/inngest/functions/__tests__/sales-email-stage-1-backfill.test.ts` — covers CLEANUP-02
- [ ] `web/lib/automations/sales-email/backfill/__tests__/disposition.test.ts` — auto-vs-approval + loopback skip
- [ ] migration-assertion test for the flip (mirror `web/lib/swarms/__tests__/sales-noise-calibration.test.ts`)
- [ ] extend `classifier-verdict-worker.test.ts` for sales-live (flag=false) archive (the test must mock `loadSwarm` + `isStageBlocked` — 111 regression lesson)

## Security Domain

> security_enforcement assumed enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Graph auth via Zapier relay connection (existing); no new auth surface |
| V3 Session Management | no | — |
| V4 Access Control | yes | The flip is human-gated (D-02 `[BLOCKING]` checkpoint); backfill is manual `inngest.send` (not publicly triggerable). Bulk Review approve goes through authenticated server actions (`createClient().auth.getUser()` in actions.ts). |
| V5 Input Validation | yes | `recordVerdict`/`approvePrediction` validate via zod + post-validate `override_category` against the live registry (actions.ts:40-74). Backfill candidates come from trusted internal corpus. |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Mass mis-archive of real customer mail (the debtor ~40% loopback incident) | Tampering / DoS-of-business | Canary + `[BLOCKING]` inspection (D-01); loopback excluded entirely (D-06); ambiguous → operator (D-05) |
| Duplicate side-effects on Inngest retry/timeout | Tampering | Dedup ledger + Graph idempotent move (D-08); small batches (Pitfall 2) |
| Premature/accidental live flip during plan execution | Tampering | Migration written-but-unapplied; apply is human MCP action (D-02) |
| Cross-tenant mail swept into sales backfill | Information disclosure | `selectCandidates` single-tenant Smeba guard (111 WR-06) — fail-loud on foreign source |
| RLS regression on any new table | Elevation | **No new table this phase** — reuses existing RLS-enabled `pipeline_events`/`swarms` (D-08/D-02) |

## Sources

### Primary (HIGH confidence — verified in this workspace)
- `web/lib/outlook/client.ts` — `archiveEmail` (392-413), `categorizeEmail` (357-386), Graph transient-retry (41-63), `getMessageMeta` (161-185)
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — inline archive path, `archiveLive` gate (130-150), Stage-4 emit + unique-violation no-op (274-330)
- `web/lib/pipeline-gating/dry-run-gate/index.ts` — `isStageBlocked` (fail-closed)
- `web/lib/inngest/functions/stage-0-backfill.ts` — the backfill pattern to mirror (runId-in-step, batched, pre-dedup SELECT)
- `web/lib/automations/sales-email/retro/{select-candidates,aggregate-baseline,loopback-validation}.ts`
- `web/lib/inngest/functions/sales-email-stage-1-retro-classify.ts` — per-email loop + side-channel isolation
- `web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts` — `recordVerdict` (60-219), `approvePrediction` (798-878)
- `web/lib/swarms/registry.ts` — `loadSwarmNoiseCategories`
- `supabase/migrations/20260513a_*.sql` + `20260528a_*.sql` — the dedup unique index (now `email_id IS NOT NULL AND override IS NULL`)
- `supabase/migrations/20260603_sales_noise_calibration_flip.sql` — the D-02 flip template + inertness guarantee
- `supabase/migrations/20260513b_pipeline_health.sql:166` — confirms `ar.result->>'message_id' = e.source_id` (Graph id mapping)
- `web/lib/inngest/events.ts:203-219` — `classifier/verdict.recorded` schema (post-WR-02)
- `.planning/phases/111-.../111-REVIEW.md` — WR-01/WR-03 carry-forwards, IN-03 pagination caveat
- `.planning/STATE.md` — flip-blocked state, MCP re-link (2026-06-03)
- `.planning/todos/pending/2026-04-23-create-draft-idempotency-and-cleanup.md` — the 60s-timeout duplicate-side-effect lesson

### Secondary (MEDIUM)
- CLAUDE.md — Inngest replay-safety, Supabase RLS/migration rules, registry-as-source-of-truth

### Tertiary (LOW / to verify)
- Graph `/move` idempotency on already-archived messages (A1) — verify by canary probe

## Metadata

**Confidence breakdown:**
- Standard stack (reuse map): HIGH — every module read and verified in-repo.
- Architecture (flip + backfill): HIGH — flip is a one-line UPDATE; backfill mirrors a proven function.
- Idempotency (D-08): HIGH — the exact unique-violation no-op already runs in the verdict worker.
- Graph already-archived behavior (A1): LOW — needs live canary verification.
- Live-presence Graph-id mapping (Pitfall 4): MEDIUM — the two-id distinction is verified; the historic-row Graph lookup path is inferred.

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (stable internal codebase; re-verify if `classifier-verdict-worker.ts`, the dry-run gate, or the `pipeline_events` index change)

## RESEARCH COMPLETE
