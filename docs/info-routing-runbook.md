# info-routing swarm — operator runbook

> **Scope:** the `info-routing` swarm processes inbound emails from `info@<brand>` mailboxes through Stage 0 (safety) + Stage 1 (noise filter + Outlook archive) only. No Stage 2/3/4 — those are deferred to a later phase (see `docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md`).
>
> **Last updated:** 2026-05-21 (launch day for info@smeba.nl).

## Architecture in one paragraph

A Zap watches each enabled `info@<brand>` mailbox in Outlook. When a new email arrives, the Zap POSTs `{ auth, messageId, source_mailbox }` to `https://agent-workforce-eosin.vercel.app/api/automations/info-routing/ingest`. The route checks the registry (`public.swarms` + `public.info_routing_mailbox_settings`), fetches the email body from Microsoft Graph, inserts it into `email_pipeline.emails`, and emits a `stage-0/email.received` Inngest event with `swarm_type='info-routing'`. The same swarm-parametric workers that handle debtor-email (`stage-0-safety-worker.ts`, `classifier-screen-worker.ts`) pick it up, run safety + noise classification using the rules from `public.swarm_noise_categories WHERE swarm_type='info-routing'`, and dispatch an `categorize_archive` action when a noise verdict fires. The downstream archive handler moves the email to the appropriate Outlook folder.

## Live state (as of 2026-05-21)

### Registered mailboxes

| Mailbox | Entity | `ingest_enabled` | `dry_run` | Notes |
|---|---|---|---|---|
| `info@smeba.nl` | `smeba` | ✅ true | false | **LIVE 2026-05-21** |
| `info@smeba-fire.be` | `smeba-fire` | ❌ false | true | Pre-staged |
| `info@berki.nl` | `berki` | ❌ false | true | Pre-staged |
| `info@sicli-noord.be` | `sicli-noord` | ❌ false | true | Pre-staged |
| `info@sicli-sud.be` | `sicli-sud` | ❌ false | true | Pre-staged |
| `info@fire-control.nl` | `fire-control` | ❌ false | true | Pre-staged |

**Deliberately NOT registered:** `walker-fire`, `apexfire` — onboard them via INSERT when the corporate decision lands.

### Active noise rules (`public.swarm_noise_categories` where `swarm_type='info-routing'`)

| Category key | Outlook label | Reused from debtor-email? |
|---|---|---|
| `spam` | Spam | ✅ |
| `payment_admittance` | Payment Admittance | ✅ |
| `auto_reply` | Auto-Reply | ✅ |
| `ooo_temporary` | OoO — Temporary | ✅ |
| `ooo_permanent` | OoO — Permanent | ✅ |

All five reuse the debtor-email regex predicates from `web/lib/debtor-email/classify.ts` (`stage1_regex_module` in the swarm row points there). The Stage 1 worker matches on `category_key` for the configured `swarm_type` — no per-swarm code branches.

**Not yet shipped:** `generic_noreply_notification` (a new category key targeting ~4% of info@ traffic). Needs Phase 78 codegen for safe cross-swarm key promotion. See SEED-001 / `docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md` "Decision needed at plan-time".

## Onboarding a new info@ mailbox

**Two steps. No code change. No deploy. No migration.**

### Step 1 — wire the Zap

Clone the working `info@smeba.nl → Agent Workforce ingest` Zap and change two fields:

1. **Trigger** → point at the new mailbox (e.g., `info@berki.nl`)
2. **Action body** → set `source_mailbox` to the new mailbox literal

Body must include exactly these three keys (no others, no headers needed):

```
auth            : <value of ZAPIER_INGEST_SECRET from Vercel env vars>
messageId       : <mapped from Outlook trigger's "Id" field>
source_mailbox  : info@<new-brand>.<tld>
```

Webhook settings:
- Method: `POST`
- URL: `https://agent-workforce-eosin.vercel.app/api/automations/info-routing/ingest`
- Payload Type: `JSON`
- Wrap Request In Array: **No**
- Unflatten: **No**

Test the action step in Zapier before publishing. Success response:

```json
{
  "action": "stage_0_dispatched",
  "messageId": "...",
  "source_mailbox": "info@berki.nl",
  "automation_run_id": "...",
  "email_id": "..."
}
```

### Step 2 — flip the registry switch

```sql
UPDATE public.info_routing_mailbox_settings
   SET ingest_enabled = true,
       dry_run        = false,
       updated_by     = '<your-name>'
 WHERE source_mailbox = 'info@<new-brand>.<tld>';
```

The route picks up the change on the next request (no restart). Send one real test email to verify the round-trip.

### Adding a brand-new brand (e.g., walker-fire)

If the mailbox isn't in the pre-staged list yet, prepend Step 1 with an INSERT:

```sql
INSERT INTO public.info_routing_mailbox_settings
  (source_mailbox, entity, ingest_enabled, dry_run, updated_by)
VALUES
  ('info@walker-fire.com', 'walker-fire', false, true, '<your-name>');
```

Also widen the swarm row's `entity_brand` array if the new brand isn't already in it:

```sql
UPDATE public.swarms
   SET entity_brand = (entity_brand::jsonb || '["walker-fire"]'::jsonb)
 WHERE swarm_type = 'info-routing'
   AND NOT (entity_brand @> '["walker-fire"]'::jsonb);
```

Then run `npm run codegen` and commit the generated diff (registry → TS regen).

If the new domain isn't already in `swarms.tenant_domains`, add it:

```sql
UPDATE public.swarms
   SET tenant_domains = (tenant_domains::jsonb || '["walker-fire.com"]'::jsonb)
 WHERE swarm_type = 'info-routing'
   AND NOT (tenant_domains @> '["walker-fire.com"]'::jsonb);
```

Then re-run `npm run codegen` to refresh `tenant-domains.generated.ts`. The own-domain noise rule reads this list to suppress internal-CC traffic.

## Disabling a mailbox temporarily

```sql
UPDATE public.info_routing_mailbox_settings
   SET ingest_enabled = false,
       updated_by     = '<your-name>'
 WHERE source_mailbox = 'info@<brand>.<tld>';
```

The route returns `{ action: "skipped_disabled" }` immediately. The Zap can stay running; emails just get acknowledged and dropped. Re-enable by setting `ingest_enabled = true`.

For more aggressive disablement (turn off all of info-routing at once), set `enabled = false` on the `swarms` row:

```sql
UPDATE public.swarms SET enabled = false WHERE swarm_type = 'info-routing';
```

## Monitoring

### Bulk Review surface

Live rows for the swarm:

> **`https://agent-workforce-eosin.vercel.app/automations/info-routing/stage-1`**

The dashboard shell at `/automations/[swarm]/stage-N` is swarm-parametric — info-routing rows surface in the same UI the team uses for debtor-email, no per-swarm rebuild needed.

### Volume check (last 24h)

```sql
SELECT
  count(*) FILTER (WHERE stage = 0)                                          AS stage0_total,
  count(*) FILTER (WHERE stage = 1 AND decision IN ('spam','auto_reply','ooo_temporary','ooo_permanent','payment_admittance')) AS stage1_noise_auto_archived,
  count(*) FILTER (WHERE stage = 1 AND decision = 'unknown')                 AS stage1_passed_through
FROM public.pipeline_events
WHERE swarm_type = 'info-routing'
  AND created_at > now() - interval '24 hours';
```

### Recent verdicts

```sql
SELECT e.subject, e.sender_email, p.decision,
       p.decision_details->>'predictor' as predictor,
       p.created_at
FROM public.pipeline_events p
JOIN email_pipeline.emails e ON e.id = p.email_id
WHERE p.swarm_type = 'info-routing'
  AND p.stage = 1
ORDER BY p.created_at DESC
LIMIT 20;
```

### Ingest-route health

The route logs `[info-routing/ingest]` warnings/errors to Vercel logs. Filter by route path `/api/automations/info-routing/ingest` in the Vercel dashboard.

## Troubleshooting

### Zap action returns `401 unauthorized`

The `auth` body field doesn't match `ZAPIER_INGEST_SECRET` in Vercel env vars.

- Confirm you're putting the secret in **body data** (`auth` field), NOT in a header.
- Confirm Unflatten is **No** — if it's Yes, Zapier flattens `auth` into something nested and the route can't find it.
- Pull the current secret value from Vercel → agent-workforce → Settings → Environment Variables → `ZAPIER_INGEST_SECRET` → reveal.

### Zap action returns `400 unknown_mailbox`

The `source_mailbox` value isn't in `public.info_routing_mailbox_settings`.

```sql
-- Check what's registered:
SELECT source_mailbox, entity, ingest_enabled
FROM public.info_routing_mailbox_settings
ORDER BY source_mailbox;
```

If the mailbox should be there but isn't, INSERT a row per "Adding a brand-new brand" above. If there's a typo in the Zap, fix the Zap.

### Zap action returns `200 skipped_disabled`

Expected when `ingest_enabled = false` on the mailbox row. To enable, run the UPDATE in Step 2 of onboarding.

### Zap action returns `200 skipped_not_found`

Microsoft Graph returned 404 for the message id. Common causes:
- The email was deleted between Zap firing and route processing
- The Zap is pointed at the wrong Outlook account (must be one with cross-tenant access — typically `zapier@moyneroberts.com` connection `56014785`)
- Folder permissions changed

The row is still logged to `automation_runs` with `outcome=not_found` so it's visible in audit.

### Email appears in Bulk Review but no Outlook archive

The verdict fired but the downstream archive handler didn't process it. Check:

```sql
SELECT id, status, automation, result, error_message, completed_at
FROM public.automation_runs
WHERE swarm_type = 'info-routing'
  AND result->>'message_id' = '<the message id>'
ORDER BY created_at DESC;
```

If the latest run has `status='failed'`, the error_message describes what broke. The most common cause is Microsoft Graph rate limiting — retries usually clear it.

### All info-routing traffic stopped

Most likely Vercel deploy regression — check `https://agent-workforce-eosin.vercel.app/api/automations/info-routing/ingest` returns 401 (route exists). If it returns 404, the deploy failed. If the route is up but no Zap fires, check Zapier's history for the Zap.

## Related files

- **Migration (swarm + noise rules):** `supabase/migrations/20260521_info_routing_swarm_smeba_minimum_viable.sql`
- **Migration (per-mailbox registry):** `supabase/migrations/20260521_info_routing_mailbox_settings.sql`
- **Ingest route:** `web/app/api/automations/info-routing/ingest/route.ts`
- **Stage 0 worker (shared):** `web/lib/inngest/functions/stage-0-safety-worker.ts`
- **Stage 1 worker (shared):** `web/lib/inngest/functions/classifier-screen-worker.ts`
- **Stage 1 regex module (shared with debtor-email):** `web/lib/debtor-email/classify.ts`
- **Architecture canon:** `docs/agentic-pipeline/README.md`, `docs/agentic-pipeline/stage-1-regex.md`
- **Original proposal (spike-derived, pre-launch):** `docs/designs/2026-05-19-smeba-info-routing-swarm-proposal.md`
- **Seed entry:** `.planning/seeds/SEED-001-info-smeba-routing-swarm-onboarding.md`

## Known open work

- **Stage 3 router** — info-routing currently has no Stage 3 intent classifier. Non-noise emails sit in Bulk Review for operator triage. Phase 999.9 full launch will add a placeholder router agent (per the proposal).
- **`generic_noreply_notification` noise rule** — captures ~4% of info@ traffic (sender pattern `^(noreply|no-reply|donotreply|notifications?|alerts?|...)`). Deferred until Phase 78 codegen lands for safe cross-swarm key promotion.
- ~~Outlook label/archive end-to-end verification~~ ✅ Verified 2026-05-21: first live email (`nieuwsbrief@alcedo-media.nl` / "[SPAM] De kracht van de dagstart") was categorized "Spam" and archived by the pipeline. Re-verify any future email via `npx tsx web/scripts/probe-info-smeba-archive.ts` (read-only Graph probe).
- **Production ingest route hardening** — current route accepts the seeded brand set. For Stage 3 router phase, revisit whether `info_routing_mailbox_settings` should grow columns (e.g., `forward_default_recipient` for the router's department-routing feature).
