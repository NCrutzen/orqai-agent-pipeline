---
slug: stage1-unknown-no-dispatch
status: resolved
trigger: Stage 1 LLM Pass 2 returns final_category_key='unknown' but rows do not advance to Stage 2
created: 2026-05-07
updated: 2026-05-12
resolved: 2026-05-07T13:26:58Z
resolution_commit: 66d145e
---

# Debug: stage1-unknown-no-dispatch

## Symptoms

- **Expected behavior**: Per `docs/agentic-pipeline/stage-3-coordinator.md:102`, when Stage 1 LLM Pass 2 returns `final_category_key='unknown'`, the verdict-worker should map this to action `swarm_dispatch` and forward to Stage 2 by emitting the Inngest event `debtor-email/label-resolve.requested`. A subsequent stage=2 `pipeline_event` row should appear for that email.
- **Actual behavior**: 5 debtor-email `pipeline_events` rows at `stage=1` with `decision='unknown'` (Phase 74 LLM-Pass-2 shape) on 2026-05-07 with zero stage=2 follow-up.
- **Trace email**: `email_id=fdd6490d-d997-45d1-a6fe-09dfb237ea67`, two automation_runs `a5f4d1c3-…` (smeba) and `509f4ce5-…` (smeba-fire), both at status `failed` with `error_message="email row not found for message_id=AAkALgAA…"`.
- **Blast radius**: 7 `automation_runs` failed today/yesterday with the same `email row not found for message_id=…` error pattern, all carrying Outlook Graph IDs (`AAkALgAA…` prefix).

## Investigation Targets — RESULTS

1. **Verdict-worker dispatch** — ✅ correct. `web/lib/inngest/functions/classifier-verdict-worker.ts:179-207` branches on `category.action === 'swarm_dispatch'` and fires `inngest.send({ name: category.swarm_dispatch, data: { message_id, source_mailbox, ... }})`. Comment at line 96 ("seed category for 'unknown' is action='reject'") is stale-but-harmless — the `reject` case is just a no-op default; the live registry row uses `swarm_dispatch`.
2. **Registry wiring** — ✅ correct. Live row in Supabase `public.swarm_noise_categories` for `(swarm_type='debtor-email', category_key='unknown')`: `action='swarm_dispatch'`, `swarm_dispatch='debtor-email/label-resolve.requested'`, `enabled=true`. (All 4 noise keys plus `unknown` shown — no drift, no terminal action on `unknown`.)
3. **Consumer for `debtor-email/label-resolve.requested`** — ❌ **broken at email lookup**. `web/lib/inngest/functions/classifier-label-resolver.ts:52-65` queries `email_pipeline.emails` with `.eq("internet_message_id", message_id)`. The `message_id` flowing through the event chain is the **Outlook Graph message id** (e.g. `AAkALgAA…`), but `email_pipeline.emails` stores that value in column `source_id` — column `internet_message_id` is `null` for outlook-zapier-ingested rows (per memory `feedback_email_pipeline_lookup_keys.md`). The `maybeSingle()` returns `null` → branch at line 77-90 (`mark-failed-email-missing`) fires → `automation_runs.status='failed'`, no Stage 2 `pipeline_event` ever written, no coordinator event ever emitted.

## Evidence

- timestamp: 2026-05-07T11:36–11:37Z, source: `pipeline_events`. For `email_id=fdd6490d-…`: rows at stage=0 (safe) + stage=1 (unknown, Phase 74 LLM shape, `final_category_key='unknown'`). No stage=2 row.
- timestamp: 2026-05-07T11:36–11:37Z, source: `automation_runs`. Two runs `a5f4d1c3-…` and `509f4ce5-…`, both `status=failed`, `error_message="email row not found for message_id=AAkALgAA…"`, `completed_at` ~10s after stage=1 emit.
- timestamp: 2026-05-07, source: `email_pipeline.emails`. Row `id=fdd6490d-…` has `source_id="AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0AfVu6ColRQ0Cue2Zmzx_SzAACgjd4PgAA"` and `internet_message_id=null`.
- timestamp: 2026-05-07, source: `swarm_noise_categories`. `(debtor-email, unknown)` row → `action=swarm_dispatch`, `swarm_dispatch=debtor-email/label-resolve.requested`, `enabled=true`.
- timestamp: 2026-05-06–05-07, source: `automation_runs`. 7 total failures with `error_message LIKE 'email row not found for message_id=%'` — all carry Outlook Graph IDs (`AAkALgAA…` prefix). Confirms the bug fires for every `unknown` Pass-2 verdict in production right now.
- source: `classifier-label-resolver.ts:59`, line: `.eq("internet_message_id", message_id)` — wrong column.
- source: `classifier-verdict-worker.ts:196-204`, the `data.message_id` forwarded to `debtor-email/label-resolve.requested` comes from `event.data.message_id` of the verdict event, which traces back to `classifier-screen-worker.ts:88` and from there to the Stage-0 emitter, which uses the Outlook Graph id consistently end-to-end.

## Eliminated

- Verdict-worker not branching on `unknown` → eliminated by code read + registry-driven `action` switch.
- Registry row for `unknown` having wrong action → eliminated by live Supabase query.
- `debtor-email/label-resolve.requested` having no consumer → eliminated; consumer exists at `classifier-label-resolver.ts:36-38` and runs (proof: it wrote the failure error_message).
- Triage shadow_mode silently dropping rows → eliminated; orchestrator note already confirms shadow mode is the gate that ENABLES the LLM funnel for unknowns.

## Root Cause

**`classifier-label-resolver.ts:59` looks up the email by the wrong column.** The lookup uses `.eq("internet_message_id", message_id)`, but the runtime `message_id` is the Outlook Graph message id (the `AAkALgAA…` value), which `email_pipeline.emails` stores in `source_id`, not in `internet_message_id`. For every Outlook-zapier-ingested email — i.e. every debtor-email email in production — `internet_message_id` is `null`, so the lookup misses and the resolver bails out via `mark-failed-email-missing` before any Stage 2 work happens.

This is a column-name regression that matches the canonical learning in user memory `feedback_email_pipeline_lookup_keys.md` ("outlook-zapier writes Outlook id to source_id (NOT internet_message_id)").

The bug is **purely Phase 74 surface**: when Stage 1's LLM 2nd-pass returned a noise key, the verdict-worker took the `categorize_archive` branch (which uses Outlook side effects keyed by the Graph id directly, no email-table lookup needed) and the bug was invisible. The bug only fires when `unknown` reaches `swarm_dispatch`, which is also exactly when Phase 74 wants to forward to Stage 2 — so Phase 74 is what made the bug observable.

## Proposed Fix

Single-line change in `web/lib/inngest/functions/classifier-label-resolver.ts:59`:

```diff
-          .eq("internet_message_id", message_id)
+          .eq("source_id", message_id)
```

Justification:
- The verdict-worker forwards the same `message_id` it received from Stage 0 / screen-worker, which is the Outlook Graph id end-to-end (see `classifier-screen-worker.ts:88`). It is never the RFC-5322 `Message-ID` header.
- `email_pipeline.emails.source_id` carries that Graph id (verified live for trace email `fdd6490d-…`).
- All other workers in the funnel that key off the Graph id (categorize/archive in `outlook` lib, iController cleanup in side-effects) already use it as the Graph id — only this one resolver mis-columns the lookup.

After the fix:
- Replay/retrigger the 7 failed `automation_runs` so they re-enter Stage 2.
- Add a regression test: the existing `classifier-label-resolver.test.ts` should be amended to assert the lookup column is `source_id` (mock fixture should fail if someone flips it back).

## Specialist Hint

`typescript` — single Supabase query column-name fix in a `.ts` file; no runtime/concurrency complexity, no React. typescript-expert review optional but low-value.

## Resolution

- **commit**: `66d145e` (2026-05-07T13:26:58Z) — "fix(stage-1): label-resolver email lookup must match source_id"
- **change**: `classifier-label-resolver.ts:59` lookup switched from `.eq("internet_message_id", message_id)` to `.or("source_id.eq.${message_id},internet_message_id.eq.${message_id}")`, matching the existing pattern in `classifier-invoice-copy-handler.ts:237`. Handles both outlook-zapier and Graph-direct ingestion paths.
- **regression test**: added in the same commit, asserts the `.or()` filter contains both columns.
- **replay**: `web/scripts/replay-stage1-unknown-failures.ts` executed for the 8 failed `automation_runs`.
- **verification (2026-05-12)**: Supabase query `SELECT count(*) FROM automation_runs WHERE error_message LIKE 'email row not found for message_id=%' AND completed_at > '2026-05-07T13:26:58Z'` → **0 rows**. Bug is dead in production.
