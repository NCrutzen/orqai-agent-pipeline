---
slug: fire-control-graph-405
status: resolved
trigger: Graph 405 OData on categorize+archive — narrowed to administratie@fire-control.nl ONLY (smeba-fire.be now resolved); recurring since Phase 74 rollout 2026-05-06
created: 2026-05-11T13:12:29Z
updated: 2026-05-11T14:35:00Z
---

# Debug: fire-control-graph-405 (round 3 — RESOLVED)

## Symptoms

DATA_START
- **Original session (Friday 2026-05-08)**: 18 categorize 405 failures across administratie@fire-control.nl (16) + debiteuren@smeba-fire.be (2). Root cause hypothesis: Mail.ReadWrite.Shared / FullAccess delegation gap on Zapier connection 56014785 (`zapier@moyneroberts.com`).
- **Today (2026-05-11)**: smeba-fire.be appears resolved (no longer in failure stream). administratie@fire-control.nl is STILL failing with the same 405. Failure scope has narrowed from 2 mailboxes to 1.
- **Operator hint (round 3)**: suspected Zap or backend treats fire-control as non-shared mailbox.
DATA_END

## Current Focus

- **hypothesis (CONFIRMED)**: smeba-fire.be was never a separate physical mailbox — its messages live inside the smeba.nl mailbox (alias / secondary SMTP / shared receive). The connection user already had access there, so it "started working" on its own. fire-control.nl IS a separate physical mailbox and requires a per-mailbox FullAccess grant on `zapier@moyneroberts.com`.
- **root_cause**: M365 mailbox delegation gap on `administratie@fire-control.nl` specifically. The Friday grant either was scoped to smeba.nl-shaped mailboxes only or relied on tenant-level role assignment that doesn't transitively cover this mailbox.
- **next_action**: Operator action — apply FullAccess delegation to administratie@fire-control.nl explicitly. No code change.

## Evidence

- timestamp: 2026-05-11T13:42Z
  source: DNS MX + login.microsoftonline.com/.well-known/openid-configuration
  finding: All four domains (fire-control.nl, smeba-fire.be, moyneroberts.com, smeba.nl) resolve to the **same M365 tenant** `771b9422-2016-420b-8ad2-4a6424a231b2`. Cross-tenant delegation hypothesis FALSIFIED.
- timestamp: 2026-05-11T13:42Z
  source: DNS MX
  finding: fire-control.nl MX = `firecontrol-nl01b.mail.protection.outlook.com` (M365-direct hosting). smeba-fire.be + smeba.nl MX = `mailanyone.net` (3rd-party relay). fire-control hosted as a distinct mailbox in this tenant — `Add-MailboxPermission` style grants are applicable.
- timestamp: 2026-05-11T13:42Z
  source: Supabase email_pipeline.emails since 2026-05-08
  finding: Both mailboxes still ingest emails: fire-control.nl 36 rows, smeba-fire.be 34 rows. Ingest layer is healthy on both. Failure is downstream at Stage 0 categorize+archive.
- timestamp: 2026-05-11T14:20Z
  source: web/app/api/automations/debtor-email/ingest/route.ts:151-156, 477-507
  finding: `sourceMailbox = body.source_mailbox?.trim() ?? LEGACY_DEFAULT_MAILBOX` is passed verbatim into `categorizeEmail(sourceMailbox, ...)` and `archiveEmail(sourceMailbox, ...)`. No remapping, no UPN substitution. Operator's hypothesis "code addresses non-shared mailbox" is FALSIFIED.
- timestamp: 2026-05-11T14:20Z
  source: web/lib/outlook/client.ts:237-293
  finding: Both functions hit `/users/${enc(mailbox)}/messages/{id}` and `/users/${enc(mailbox)}/messages/{id}/move`. The `mailbox` parameter is the shared mailbox UPN itself — this is the canonical Graph delegated-shared-mailbox addressing pattern. No bug here.
- timestamp: 2026-05-11T14:25Z
  source: Supabase email_pipeline.emails — source_id (Outlook EntryId) comparison
  finding: |
    EntryId mailbox segments (the suffix that encodes per-mailbox identity):
    - debiteuren@smeba.nl       → `fVu6ColRQ0Cue2Zmzx_SzAAC...`
    - debiteuren@smeba-fire.be  → `fVu6ColRQ0Cue2Zmzx_SzAAC...`  ← IDENTICAL to smeba.nl
    - administratie@fire-control.nl → `KOHINYZLcUeBaDTqXgXywAAA...` ← distinct
    Smeba-fire.be is physically the same mailbox as smeba.nl (likely secondary SMTP / mail-enabled alias). Graph resolves both UPNs to the same mailbox object, where the connection user has FullAccess. fire-control.nl is a distinct mailbox object with its own EntryId namespace and its own ACL.
- timestamp: 2026-05-11T14:30Z
  source: debtor.labeling_settings
  finding: fire-control row has `auto_label_enabled=false`. The 405 must therefore originate from the classifier-verdict-worker (Inngest) path, not the synchronous ingest auto-action path. Worker calls `categorizeEmail(source_mailbox, ...)` with the same source_mailbox — same Graph URL shape, same access requirement.

## Eliminated

- **Cross-tenant M365 delegation**: All four domains share tenant `771b9422-2016-420b-8ad2-4a6424a231b2`.
- **Code-side mailbox addressing bug**: ingest route + outlook client both pass the shared-mailbox UPN faithfully through to Graph; no UPN substitution or fallback to connection user.
- **Zap config "non-shared mailbox" trigger variant**: ingest payload's `source_mailbox` is correctly `administratie@fire-control.nl`, and the messageId returned by the Zap is a fire-control-mailbox-bound EntryId (distinct segment from smeba.nl). The Zap is using the right shared-mailbox trigger.
- **"Friday FullAccess grant fixed smeba-fire.be"**: smeba-fire.be was never a separate physical mailbox. It "fixed itself" because its messages live inside smeba.nl (which the connection user already had access to all along). The Friday grant did NOT actually change anything for smeba-fire.be — and by extension, may not have been applied to any specific mailbox at all. fire-control.nl needs an explicit per-mailbox grant.

## Resolution

- **root_cause**: `zapier@moyneroberts.com` (Zapier Outlook connection 56014785) lacks FullAccess delegation on the `administratie@fire-control.nl` mailbox specifically. fire-control.nl is a distinct physical mailbox in tenant `771b9422-2016-420b-8ad2-4a6424a231b2`, separate from the smeba.nl mailbox (which transitively covers smeba-fire.be via secondary SMTP / alias). The Friday remediation was scoped to a different mailbox than fire-control.
- **fix**: Operator action (no code change). In M365 admin / Exchange Admin Center:
  1. Grant `zapier@moyneroberts.com` **FullAccess** on the `administratie@fire-control.nl` mailbox (PowerShell: `Add-MailboxPermission -Identity administratie@fire-control.nl -User zapier@moyneroberts.com -AccessRights FullAccess -InheritanceType All -AutoMapping $false`).
  2. Wait 60 minutes for Exchange ACL cache refresh, OR force a Zapier connection reauth from `https://zapier.com/app/connections` to refresh the OAuth scope.
  3. Replay one fire-control failed run from the Inngest dashboard (or wait for the next inbound) to verify the 405 is gone.
- **verification**: After the grant, the next categorize+archive call against an `administratie@fire-control.nl` message should return 200/204 instead of 405. Watch the Inngest `classifier-verdict-worker` step output for the next fire-control event, or query `automation_runs` for `entity='fire-control' AND status='completed' AND result->>'stage'='categorize+archive'`.
- **specialist_hint**: general (this is M365 ops / Exchange Online ACL — not language-specific; no specialist skill applies)

## Verification (2026-05-11 14:15-14:36 UTC)

- **Direct Graph probe** (`web/scripts/probe-fire-control-graph.ts`): 10 probes through Zapier connection 56014785 against the latest fire-control message. PATCH `/users/{fc}/messages/{id}` (probe 7) and PATCH `/users/{fc}/mailFolders/inbox/messages/{id}` (probe 9) both returned **200 OK** — write permission is in place.
- **Canary replay 1** (`replay-fire-control-405-canary.ts`): run `4b7ed93e` (auto_reply) → `failed` → `pending` → `completed` in ~12s. Live PATCH "Auto-Reply" + move to Archive succeeded.
- **Canary replay 2** (RUN_ID=17ab7f5f): payment_admittance row → `completed` in ~70s (longer due to iController cleanup side-effect).
- **Bulk replay** (`replay-fire-control-405-bulk.ts`): remaining 14 failed-405 fire-control runs → all `completed` between 14:26:43 and 14:36:27 UTC. Final tally: 16/16 rows resolved, zero failures.

Whether the M365 grant was applied during the session or had already been applied earlier in the day, the Graph write path is now functional end-to-end on `administratie@fire-control.nl`.
