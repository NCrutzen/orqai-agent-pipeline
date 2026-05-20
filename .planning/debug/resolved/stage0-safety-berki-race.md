---
slug: stage0-safety-berki-race
status: investigating
trigger: |
  Stage 0 safety failures (+2 new since baseline) — both on debiteuren@berki.nl:
    email row not found for message_id=AAkALgAAAAAA…JsÉvyQAA (13:11 UTC)
    email row not found for message_id=AAkALgAAAAAA…JsÉvxQAA (12:59 UTC)
  Hypothesis: Stage 0 worker is racing the email_pipeline.emails upsert for berki —
  the row hasn't landed when safety tries to read it. Pattern looks identical to the
  Phase 71-06 fix that was applied to the Zapier ingest route; the Stage 0 worker
  may be reading via a different path that lacks the stub-insert fallback.
created: 2026-05-07
updated: 2026-05-07
---

# Debug Session: stage0-safety-berki-race

## Symptoms
- expected: pipeline finds email row by message_id and proceeds with classification
- actual: "email row not found for message_id=..." errors on debiteuren@berki.nl
- error_messages: |
    email row not found for message_id=AAkALgAAAAAA…JsÉvyQAA (13:11 UTC)
    email row not found for message_id=AAkALgAAAAAA…JsÉvxQAA (12:59 UTC)
- timeline: +2 new failures since last baseline; specific to berki mailbox
- reproduction: triggered by inbound emails on debiteuren@berki.nl (Outlook → Zapier → email_pipeline.emails ingest, then downstream pipeline)

## Current Focus
- hypothesis: error originates in Stage 2 (`classifier-label-resolver.ts:83`) or Stage 4 (`classifier-invoice-copy-handler.ts:260`), NOT Stage 0. Most likely cause is the PostgREST `.or(source_id.eq.<id>,internet_message_id.eq.<id>)` filter silently matching zero rows when the Outlook message_id contains non-ASCII characters (e.g. `É`) — a value-escaping bug, not a temporal race against the email_pipeline.emails upsert.
- test: (a) query automation_runs for the failing rows and check `triggered_by` / `result.stage` to identify the actual handler; (b) verify email_pipeline.emails row exists for those source_ids
- expecting: (a) handler is `classifier/label-resolver` or `classifier/invoice-copy`; (b) email row DOES exist but `.or()` filter doesn't match it
- next_action: run the two SQL queries in "Recommended next investigative steps" below to disambiguate Scenario A (filter encoding) vs Scenario B (stub-insert skipped)

## Evidence
- timestamp: 2026-05-07 (initial)
  source: grep for "email row not found"
  finding: error string ONLY exists at two sites in /web (excluding .next build output and worktrees):
    - web/lib/inngest/functions/classifier-label-resolver.ts:83  (Stage 2)
    - web/lib/inngest/functions/classifier-invoice-copy-handler.ts:260  (Stage 4)
  note: it does NOT exist in stage-0-safety-worker.ts. The Stage 0 worker does not read email_pipeline.emails by message_id at all — its event payload (`email_id`, `subject`, `body_text`, etc.) comes pre-populated from the ingest route.

- timestamp: 2026-05-07
  source: web/lib/inngest/functions/stage-0-safety-worker.ts (lines 41-68)
  finding: Stage 0 receives `email_id`, `message_id`, `subject`, `body_text`, `swarm_type`, `entity`, `mailbox_id` directly from the event. No DB read for the email body. The "email row not found" error is therefore impossible to originate here.

- timestamp: 2026-05-07
  source: web/app/api/automations/debtor-email/ingest/route.ts (lines 305-345, Phase 71-06 fix `da87e15`)
  finding: ingest route runs SELECT-then-INSERT stub on email_pipeline.emails BEFORE firing `stage-0/email.received`. Has race-recovery refetch on insert error. Gate at line 434 `if (isLlmBound && stage0RunId && resolvedEmailId)` — Stage 0 fire is conditional on resolvedEmailId being non-null. So when Stage 0 fires, the row IS guaranteed to be in email_pipeline.emails.

- timestamp: 2026-05-07
  source: web/lib/inngest/functions/classifier-label-resolver.ts (lines 51-65)
  finding: Stage 2 lookup uses
    `.or(\`source_id.eq.${message_id},internet_message_id.eq.${message_id}\`).maybeSingle()`
  PostgREST `or()` does not support unescaped commas / parens / non-ASCII chars in values. Values must be quoted (`"..."`) or URL-encoded — otherwise the filter silently matches nothing. The reported failing message_ids contain `É` (U+00C9), which falls in this risky range.

- timestamp: 2026-05-07
  source: web/lib/inngest/functions/classifier-invoice-copy-handler.ts (lines 222-262)
  finding: Stage 4 invoice-copy handler uses the SAME `.or(source_id.eq.${message_id},internet_message_id.eq.${message_id})` pattern. Same potential bug surface.

- timestamp: 2026-05-07
  source: berki-specificity reasoning
  finding: berki Outlook tenant evidently produces message ids with non-ASCII suffixes (`É` observed). Smeba ids in the existing corpus apparently did not, which is why this only surfaces now / only on berki — pure data-distribution exposure of a latent encoding bug.

## Eliminated
- "Stage 0 worker races the email_pipeline.emails upsert" — Stage 0 doesn't read email_pipeline.emails at all. The error string isn't even present in stage-0-safety-worker.ts.
- "Stage 0 read path lacks Phase 71-06 stub-insert" — the stub-insert lives in the ingest route and runs BEFORE Stage 0 is fired. Stage 0 doesn't need its own stub-insert.

## Hypotheses (ranked)

### A. PostgREST `.or()` filter encoding bug (most likely)
- Outlook message_id contains `É` (or other special chars).
- `.or(source_id.eq.${message_id},...)` produces a filter string that PostgREST mis-parses, returning 0 rows even though the row exists.
- Affects both `classifier-label-resolver.ts:59` and `classifier-invoice-copy-handler.ts:237`.
- Disambiguation: SELECT the failing source_ids directly — if the row exists, this is the cause.
- Fix: replace `.or()` with two sequential `.eq()` lookups (idempotent, immune to value escaping):
    ```ts
    const bySrc = await admin.schema("email_pipeline").from("emails").select("...").eq("source_id", message_id).maybeSingle();
    const data = bySrc.data ?? (await admin.schema("email_pipeline").from("emails").select("...").eq("internet_message_id", message_id).maybeSingle()).data;
    ```

### B. labeling_settings.entity is null for berki → unknown branch never fires Stage 0
- If true, `isLlmBound` is false at ingest, Stage 0 isn't fired, and these errors can't have come from the Stage-0-triggered LLM path.
- Disambiguation: SELECT entity FROM debtor.labeling_settings WHERE source_mailbox = 'debiteuren@berki.nl'.
- Less likely because the trigger asserts Stage 0 IS firing.

### C. Genuine ingest-vs-handler race despite Phase 71-06
- Would require Stage 0 to be fired via a path that bypasses the ingest route's stub-insert (e.g. operator re-emit, Plan 05, or a fetcher-cron-only ingestion).
- Plausible only if these emails arrived NOT via the synchronous Zapier ingest. Worth checking automation_runs.triggered_by.

## Recommended next investigative steps
1. Identify the actual handler:
   ```sql
   SELECT id, automation, status, error_message, result, triggered_by, created_at
   FROM automation_runs
   WHERE error_message LIKE 'email row not found%'
     AND created_at > now() - interval '48 hours'
   ORDER BY created_at DESC;
   ```
   Check `triggered_by` (`classifier/label-resolver` vs `classifier/invoice-copy`) and `result.stage`.

2. Verify whether the email rows exist:
   ```sql
   SELECT id, source_id, internet_message_id, mailbox, source, received_at
   FROM email_pipeline.emails
   WHERE source_id LIKE 'AAkALgAAAAAA%JsÉvyQAA'
      OR source_id LIKE 'AAkALgAAAAAA%JsÉvxQAA'
      OR internet_message_id LIKE 'AAkALgAAAAAA%JsÉvyQAA'
      OR internet_message_id LIKE 'AAkALgAAAAAA%JsÉvxQAA';
   ```
   Result row(s) found → Scenario A (filter encoding bug). 0 rows → Scenario C (true race / missing ingestion).

3. Confirm berki entity wiring:
   ```sql
   SELECT source_mailbox, entity, ingest_enabled, triage_shadow_mode, auto_label_enabled
   FROM debtor.labeling_settings
   WHERE source_mailbox = 'debiteuren@berki.nl';
   ```

## Resolution
**DUPLICATE of `stage1-unknown-no-dispatch` — already fixed in commit `66d145e` (2026-05-07 13:26 UTC).**

### Final root cause
`classifier-label-resolver.ts:59` (Stage 2 lookup) used `.eq("internet_message_id", message_id)` — but outlook-zapier writes the Outlook Graph id to `source_id`, leaving `internet_message_id` NULL (verified: 100% of berki + smeba rows have `internet_message_id IS NULL`). Every Stage 1 LLM-Pass-2 `unknown` verdict therefore short-circuited to `mark-failed-email-missing`. NOT a race, NOT a Stage 0 issue, NOT a PostgREST filter encoding bug.

### Why it presented as berki-specific
False signal. The bug affected every entity hitting the LLM-Pass-2 unknown path. Smeba `completed` runs in the corpus all reflect post-fix replays via `web/scripts/replay-stage1-unknown-failures.ts`. The 2 failures the user surfaced (13:11, 12:58 UTC) predate the 13:26 UTC fix commit by 12–25 minutes — they are exactly the kind of pre-fix orphans that the replay script targets.

### Hypotheses eliminated this session
1. Stage 0 worker race against email_pipeline.emails — Stage 0 doesn't read by message_id; error string isn't even in stage-0-safety-worker.ts (Eliminated, prior session)
2. PostgREST `.or()` filter encoding bug on non-ASCII / hyphen — service-role REST returns the row correctly (verified curl with the failing id)
3. `.maybeSingle()` returning null on duplicate rows — verified single-row match for failing message_ids
4. berki entity not configured — labeling_settings row exists, ingest_enabled + triage_shadow_mode + auto_label_enabled all true, brand_id=BB

### Verification of fix
- commit `66d145e` is on main (`* main` includes it; `branch -a --contains 66d145e` confirms)
- Code at `web/lib/inngest/functions/classifier-label-resolver.ts:59` now reads `.or(\`source_id.eq.${message_id},internet_message_id.eq.${message_id}\`)` (matches `classifier-invoice-copy-handler.ts:237`)
- Regression test added (`__tests__/classifier-label-resolver.test.ts`)
- No new "email row not found" failures since 13:26 UTC (only 10 min observation window — needs follow-up)

### Outstanding action
Run `web/scripts/replay-stage1-unknown-failures.ts` after the Vercel deploy of `66d145e` lands to clear the pre-fix failed automation_runs (per the commit message instruction).

### Files referenced
- web/lib/inngest/functions/classifier-label-resolver.ts (fixed at line 59)
- web/lib/inngest/functions/classifier-invoice-copy-handler.ts:237 (already correct — pattern source)
- web/scripts/replay-stage1-unknown-failures.ts (replay tool)
- .planning/debug/stage1-unknown-no-dispatch.md (the canonical session for this incident)

status: resolved (duplicate)
