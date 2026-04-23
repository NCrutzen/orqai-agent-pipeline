---
created: 2026-04-23T00:00:00.000Z
title: iController Auto-Labeling van Accounts aan Emails
area: automation
project: Debiteuren Email (60c730a3-f20d-4559-88a3-0cc4c58cdef7)
files:
  - supabase/migrations/20260423_debtor_email_labeling.sql
  - web/lib/automations/debtor-email/mailboxes.ts
  - web/lib/automations/debtor-email/extract-invoices.ts
  - web/app/api/automations/debtor/label-email/route.ts
---

## Status

**MVP skelet gecommit op 2026-04-23.** Niet live. Migratie nog niet uitgevoerd. Zapier Zaps nog niet aangemaakt.

## Doel

Inbound emails in iController (na declutter/delete van de cleanup-stap) automatisch labelen aan het juiste debiteur-account. Per mailbox aan/uit te zetten via Zapier. Onbekende mails blijven onaangeroerd.

## Architectuur (afgestemd)

```
Zapier (per Outlook mailbox, aan/uit in Zapier zelf)
  ↓ POST met graph_message_id, conversation_id, subject, body_text, from_email,
     source_mailbox, icontroller_mailbox_id
Vercel /api/automations/debtor/label-email
  1. Dry-run check per mailbox (debtor.labeling_settings)
  2. Thread-inheritance: zelfde conversation_id al gelabeld? → erven
  3. Invoice regex /\b(17|25|30|32|33)\d{6}\b/g op subject + body
  4. NXT SQL via Zapier: valideer invoice_numbers → debtor_id (TODO)
  5. Sender fallback: from_email → debtor lookup via Zapier (TODO)
  6. LLM tiebreaker (Orq.ai) alleen op ambigue (TODO)
  7. Audit row in debtor.email_labels (altijd, ook bij unresolved)
  8. Als niet dry-run én resolved → Browserless label-actie in iController (TODO)
```

**iController URL-patroon:** `https://walkerfire.icontroller.eu/messages/index/mailbox/{id}`
Mailbox-IDs (productie): smeba=4, berki=171, sicli-noord=15, sicli-sud=16, smeba-fire=5.

## Wat is af

- [x] Supabase migratie (`debtor.email_labels` met conversation_id + index, `debtor.labeling_settings` seed met dry_run=true)
- [x] Mailbox constants file
- [x] Invoice regex extractor (geen extra heuristics — NXT SQL filtert false positives)
- [x] API route skelet: Zod validatie, Bearer auth, dry-run gate, thread-inheritance, invoice-extract, insert in email_labels
- [x] Project description in Supabase bijgewerkt

## TODO — volgorde van afhandeling

1. **Migratie uitvoeren** op Supabase productie (`supabase db push` of via dashboard).
2. **NXT invoice → debtor lookup via Zapier** wiring:
   - Nieuwe Zap of hergebruik bestaande NXT-SQL-Zap
   - Endpoint/secret in env: `DEBTOR_INVOICE_LOOKUP_WEBHOOK_URL` + `DEBTOR_INVOICE_LOOKUP_WEBHOOK_SECRET`
   - SQL: `SELECT debtor_id, debtor_name FROM invoices WHERE invoice_number IN (...)`
   - Unieke debtor in alle hits → `high` confidence; meerdere → `ambiguous_candidates` voor laag 4
3. **Sender → debtor lookup** (laag 3 fallback, alleen als geen invoice hit):
   - SQL: `SELECT debtor_id, debtor_name FROM debtors WHERE email = ?`
   - Shared mailboxes (crediteuren@, accounting@) → verwacht meerdere hits → `ambiguous_candidates`
4. **LLM tiebreaker** (laag 4, alleen ambigue):
   - Orq.ai agent met tools `lookup_debtor_by_email`, `lookup_invoice`
   - Alleen als laag 2/3 meerdere kandidaten gaf; niet voor "geen hit"
5. **iController label-DOM mappen** — probe-script nodig:
   - Nieuw bestand: `web/lib/automations/debtor-email/probe-label-ui.ts`
   - Login, navigate `/messages/index/mailbox/4`, open random mail, vind label/assign-UI, dump DOM
   - Vergelijkbaar met `debtor-email-cleanup/probe-email-popup.ts`
6. **Browserless label-module** `web/lib/automations/debtor-email/label-email-in-icontroller.ts`:
   - Gebruikt `openIControllerSession` uit `web/lib/automations/icontroller/session.ts`
   - Navigate naar mailbox, zoek op `graph_message_id` of subject+from, klik label-UI, kies debtor
   - Screenshots before/after → Supabase storage, paden in email_labels
7. **Zapier Zaps aanmaken** (5 stuks, één per mailbox):
   - Trigger: nieuwe inbound mail in die mailbox
   - Action: POST naar `/api/automations/debtor/label-email` met payload inclusief hardcoded `icontroller_mailbox_id`
   - Auth header: `Authorization: Bearer {AUTOMATION_WEBHOOK_SECRET}`
   - Eerst Smeba (id=4) aanzetten, rest uit tot dry-run resultaten reviewed zijn
8. **Dry-run review UI of SQL view** — tel per mailbox per method/confidence hoeveel gelabeld zouden zijn. Pas daarna `dry_run=false`.

## Aannames / risico's

- `email_pipeline.emails` wordt voor elke inbound mail gevuld voordat Zapier ons belt. Als Zapier sneller is dan de email-ingest → 404 op `email_not_ingested`. Observatie nodig.
- Invoice format 17/25/30/32/33XXXXXX dekt de huidige sample (screenshot 2026-04-23). Nieuwe reeksen → regex uitbreiden.
- Eén iController-login = alle mailboxen zichtbaar in één tenant (bevestigd in session.ts). Geen per-brand credential nodig.
- Live on/off staat in Zapier; Vercel heeft alleen dry-run kill-switch per mailbox.

## Verwijzingen

- Regex patroon check: `web/debtor-email-analyzer/src/categorize.ts:42`
- Noise/no-reply filter hergebruik: `web/debtor-email-analyzer/src/classify-copy-requests.ts:36`
- Thread-ID bron: Microsoft Graph `conversationId` in `web/debtor-email-analyzer/src/fetch-emails.ts:149`
- iController session patroon: `web/lib/automations/icontroller/session.ts`
- Cleanup probe als voorbeeld: `web/lib/automations/debtor-email-cleanup/probe-email-popup.ts`
