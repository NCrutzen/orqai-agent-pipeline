---
phase: 87
type: operator-runbook
status: draft — awaiting operator approval to run
created: 2026-05-30
depends_on: 87-LOOPBACK-RECOVERY.md (the 27-email list) · #59 (loopback rule disabled)
writes_live_state: YES — operator-approved run only, NOT a side-channel
---

# Runbook — recover the 27 loopback false-archived emails

## Purpose
The Phase 84 `own_outbound_invoice_loopback` rule archived 27 forwarded customer emails (carrying real `payment_dispute` / `credit_request` / `peppol_request` / `contract_inquiry` actions) as "System Notification" before they reached Stage 3. The rule is now disabled (#59). This runbook re-dispatches those 27 through the (now-fixed) funnel so they land in the actionable Kanban, and un-archives them in Outlook.

Source list: `87-LOOPBACK-RECOVERY.md` (27 `email_id`s). This **writes live pipeline state** — run only with explicit operator approval, dry-run first.

## Mechanism
The funnel entry event is **`stage-0/email.received`** (emitted by the debtor-email ingest route). Re-emitting it for an `email_id` re-runs Stage 0 → 1 → 2 → 3. With the loopback rule disabled, these rows now fall through Stage 1 as `unknown` → Stage 2 resolve → Stage 3 intent → actionable Kanban (or human lane), instead of being archived.

> The read-only retro path (`debtor-email/retro-classify.requested`) is NOT used here — it never writes live state. Recovery needs the live funnel.

## Pre-flight (verify BEFORE any run — these gate the dry-run)
1. **Loopback rule is disabled in prod:** confirm `swarm_noise_categories` / `classifier_rules` row `own_outbound_invoice_loopback` is `enabled=false` (migration `20260530_disable_own_outbound_loopback.sql` applied to prod, not just committed).
2. **Idempotency (CHECKED 2026-05-30 — findings below):**
   - `debtor.email_labels` has **no unique key on `email_id`** (only PK on surrogate `id`); 38 emails already carry duplicate label rows (max 6). So re-dispatch is **non-idempotent in general** — `stage-2-customer-resolver` `.insert()`s a new row each pass.
   - **BUT the 27 recovery emails currently have ZERO `email_labels` rows** — they were archived at **Stage 1** (`categorize_archive`), which runs *before* Stage 2, so they never got a label. Re-dispatch therefore creates their **first** label row — no `email_labels` duplicate for these 27. ✅
   - The real append is on **`pipeline_events`** (append-only telemetry): re-dispatch adds a fresh Stage-0/1/2/3 decision set on top of the original Stage-1 archive event. **The one thing to confirm in the dry-run:** Bulk Review / the actionable surface shows the **latest** (non-noise) decision, not the stale archive one (i.e. it dedups pipeline_events by most-recent per email+stage). If it shows both, add a supersede flag or dedup-on-read.
   - Net: no pre-clear needed for the 27; the dry-run's job is to confirm the latest-decision-wins display.
3. **Budget:** 27 emails × Stage 0+1+2+3 ≈ well under daily cost ceiling; no concern.
4. **Snapshot:** record current `debtor.email_labels` + `pipeline_events` rows for the 27 `email_id`s (for verification + rollback).

## Run (staged)
1. **DRY-RUN — 1 email:** re-emit `stage-0/email.received` for a single low-risk id from the list (e.g. a `high`-confidence `payment_dispute` like `2ea03bad-…`). Watch: does it reach Stage 3 and land in Kanban? Any duplicate row? Confirm the Outlook archive state.
2. **DRY-RUN — 5 emails:** repeat for 5 across intents (payment_dispute, credit_request, peppol_request). Verify each lands with a sane Stage 1 (non-noise) + Stage 3 intent.
3. **FULL — 27 emails:** re-emit for all 27 `email_id`s. Batch with a short delay between sends to avoid Stage-0 budget bursts.

## Outlook un-archive / re-label (separate from the pipeline)
Re-dispatch fixes the pipeline/Kanban state but does NOT move the message out of the "System Notification" Outlook label (the archive already happened). For each recovered email, remove the "System Notification" label and restore to the actionable folder — via the existing Outlook label tooling (the same path Stage 1 used to apply the label), or operator-manual if the count is small (27). Confirm whether a programmatic un-label exists before deciding manual vs automated.

## Verification (after the full run)
- All 27 `email_id`s have a fresh `debtor.email_labels` row with a **non-noise** Stage 1 category and a Stage 3 intent (not "System Notification").
- Each appears in the actionable Bulk Review / Kanban surface.
- No duplicate rows introduced (compare against the pre-flight snapshot).
- Spot-check 3–5 in Outlook: un-archived + re-labelled.

## Rollback
- If duplicates or mis-routing appear: delete the recovery-run `email_labels` / `pipeline_events` rows (identified by the snapshot diff + run timestamp) and re-evaluate. The originals are untouched (the 27 were archived, not deleted).

## Notes / open items
- **`moyneroberts.com` gap:** several originals came from `*@moyneroberts.com` (e.g. `nick.crutzen.cb@…`) which is NOT in `tenant_domains`, so it escaped the loopback filter differently — add it to `tenant_domains` / the own-entity blocklist (feeds v8.2 RESL-04) so future internal forwards are handled consistently.
- **v8.2 link:** this incident is the canonical internal-forward case. The recovered 27 are a ready test set for v8.2 P1 (self-auth-ID auto-resolve — many carry a customer number in the subject: 530540, 530549, 528071, 588318, …). RESL-15 (noise reclassification) must NOT re-introduce a blanket own-org-sender archive.
