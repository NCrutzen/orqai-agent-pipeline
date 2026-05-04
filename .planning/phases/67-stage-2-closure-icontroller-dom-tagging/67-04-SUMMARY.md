---
phase: 67
plan: 04
subsystem: inngest / debtor-email
tags: [inngest, events, label-resolver, icontroller, stage-2, side-effect]
requires:
  - web/lib/automations/icontroller/url.ts (Plan 67-02 — buildIcontrollerMessageUrl helper)
  - web/lib/automations/debtor-email/mailboxes.ts (ICONTROLLER_MAILBOXES, isKnownMailbox)
  - web/lib/inngest/functions/classifier-label-resolver.ts (Phase 66 emit-coordinator pattern)
provides:
  - typed event "debtor-email/icontroller-tag.requested"
  - second step.run("emit-icontroller-tag") in label-resolver
  - email_labels.icontroller_tag_status status mapping per D-10
affects:
  - Plan 67-05 (tagger function consumes the new event)
  - Plan 67-03 (label module — independent)
tech-stack:
  added: []
  patterns:
    - inline SendFn cast on inngest.send (CLAUDE.md commit dae6276)
    - step.run wrapping for replay-safety (CLAUDE.md commit dd2583a)
    - .insert(...).select("id").single() to capture FK for sibling event
key-files:
  created: []
  modified:
    - web/lib/inngest/events.ts
    - web/lib/inngest/functions/classifier-label-resolver.ts
    - web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts
decisions:
  - mailbox_list_url derived from mailboxes.ts ICONTROLLER_MAILBOXES const (not labeling_settings column) — RESEARCH § Open Question 4 recommendation; Phase 68 swarms registry will absorb
  - icontroller_message_url is the MAILBOX-LIST URL (Option A from RESEARCH § URL Construction); per-message msg_id resolved inside tagger via search-and-click
  - icontroller_mailbox_id on email_labels INSERT now uses ICONTROLLER_MAILBOXES lookup (was hardcoded 0 from pre-Phase-56.8 stub)
  - icontrollerEnv read from process.env.ICONTROLLER_ENV ("production" if exact match; else "acceptance")
metrics:
  completed: 2026-05-04
  tasks_completed: 3
  files_modified: 3
  duration_minutes: ~10
---

# Phase 67 Plan 04: Stage 2 → iController-tag dispatch Summary

Wave 3 part 1 of 2: extend the Inngest event catalogue with `debtor-email/icontroller-tag.requested`, then make `classifier-label-resolver.ts` emit a SECOND event alongside Phase 66's `emit-coordinator` step. The label-resolver now writes the correct `icontroller_tag_status` per D-10's mapping table (pending | skipped_dry_run | skipped_unconfigured), letting the new tagger function (Plan 67-05) consume the event in the locked happy-path only.

## Tasks Completed

| # | Name                                                   | Commit  |
| - | ------------------------------------------------------ | ------- |
| 1 | Add typed event to events.ts                           | 2ba3b86 |
| 2 | Emit icontroller-tag from label-resolver + status map  | 0cdad86 |
| 3 | Test asserts second emit + skip-status writes          | 87b848f |

## mailbox_list_url Source Decision

Used `ICONTROLLER_MAILBOXES` constant from `web/lib/automations/debtor-email/mailboxes.ts` (the `source_mailbox` → `mailbox_id` mapping). Two reasons:

1. **No `labeling_settings.icontroller_mailbox_id` column today.** The column would need a migration; deferred to Phase 68's `swarms` registry generalisation per RESEARCH § Open Question 4.
2. **The const already covers all five MR mailboxes** (smeba=4, berki=171, sicli-noord=15, sicli-sud=16, smeba-fire=5). One source of truth — code-side, not DB-side — is fine for v1.

Trade-off: a new mailbox requires a code change, not a settings flip. Acceptable; mailbox additions are rare and already require code (Zapier per-mailbox Zaps, classifier overrides etc.).

## Event-Data-Shape Diff (vs CONTEXT D-02)

CONTEXT D-02 base shape:
```ts
{ email_label_id, email_id, customer_account_id, customer_name,
  source_mailbox, icontroller_message_url, icontroller_company, automation_run_id }
```

R-02 extensions (this plan adds):
```ts
{ ...above,
  icontroller_mailbox_id: number,   // NEW — for tagger to land on right mailbox without remapping
  entity: string | null,            // NEW — brand-mismatch check (SELECTORS.md lines 142-184)
  sender_email: string,             // NEW — for findEmailViaSearch in tagger
  subject: string,                  // NEW — for findEmailViaSearch in tagger
  received_at: string }             // NEW — for findEmailViaSearch in tagger
```

The tagger does NOT need a second email lookup. CONTEXT D-02 was written before RESEARCH revealed the msg_id is unknown at dispatch time, forcing the tagger to do search-and-click.

## Status Mapping (per D-10) — Implementation

```
                       INSERT      INSERT                                second
                       status      icontroller_tag_status                  emit?
matched + dry_run      'dry_run'   'skipped_dry_run'                       no
matched + live + cfg   'pending'   'pending'                               YES
matched + live + ¬cfg  'pending'   'skipped_unconfigured'                  no
unresolved             'skipped'   'pending' (irrelevant; default)         no
```

The `icontroller_tag_status='pending'` rows are the queue the tagger drains.

## Verification

- `cd web && npx tsc --noEmit` → exit 0 (clean)
- `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` → 5/5 passed (1 Phase 66 + 4 Phase 67)
- grep checks all green:
  - `debtor-email/icontroller-tag.requested` in events.ts ✓
  - `emit-icontroller-tag` step in label-resolver ✓
  - `icontroller_tag_status: icontrollerTagStatus` in INSERT row ✓
  - `skipped_dry_run`, `skipped_unconfigured` literals ✓
  - `buildIcontrollerMessageUrl` import + call ✓
  - inline `(inngest.send as unknown as SendFn)({...})` (no destructure) ✓

## Deviations from Plan

None — plan executed exactly as written. The `mailbox_list_url` source decision (const vs labeling_settings column) was already pre-decided in RESEARCH § Open Question 4 with a const recommendation; followed it.

Side benefit (Rule 1-adjacent, not a bug-fix): replaced the pre-existing `icontroller_mailbox_id: 0` stub on the email_labels INSERT with the proper mailbox-id lookup. The TODO comment cited Phase 56.8; Phase 67 effectively completes it.

## Self-Check: PASSED

Files exist:
- `/Users/nickcrutzen/Developer/agent-workforce/web/lib/inngest/events.ts` ✓
- `/Users/nickcrutzen/Developer/agent-workforce/web/lib/inngest/functions/classifier-label-resolver.ts` ✓
- `/Users/nickcrutzen/Developer/agent-workforce/web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` ✓

Commits exist (verified via `git log --oneline`): 2ba3b86, 0cdad86, 87b848f
