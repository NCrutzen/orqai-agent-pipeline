---
phase: 55-debtor-email-pipeline-hardening
plan: 02
status: superseded
landed_at: web/lib/automations/debtor-email/mailboxes.ts
---

Superseded. Multi-mailbox resolver landed via `mailboxes.ts` + `icontroller_mailbox_id` usage across `classifier-label-resolver`, `classifier-invoice-copy-handler`, `labeling-flip-cron`, `label-email/route.ts`. Confirmed in production for smeba, smeba-fire, fire-control, sicli-noord/sud, berki. See `55-CLOSURE.md`.
