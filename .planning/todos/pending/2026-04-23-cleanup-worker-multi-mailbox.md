# Cleanup-worker + catchup + review-actions: multi-mailbox support

**Status:** pending
**Priority:** medium (phase 1b, blocker voor productie-livegang van BE-mailboxen)
**Owner:** Nick
**Source:** 2026-04-23 ingest-route refactor voor multi-mailbox

## Probleem

De ingest-route is nu multi-mailbox (leest `source_mailbox` + `entity` + `icontroller_company` uit `debtor.labeling_settings`). Maar 3 downstream consumers gebruiken nog `ICONTROLLER_COMPANY = "smebabrandbeveiliging"` hardcoded:

1. `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts:22`
   — regel 101 passes `company: ICONTROLLER_COMPANY` naar `deleteEmailOnPage`. Zou moeten lezen van `row.result.company` (nu al geschreven door de refactored ingest-route).
2. `web/lib/debtor-email/icontroller-catchup.ts:22` — idem, 3 callsites.
3. `web/app/(dashboard)/automations/debtor-email-review/actions.ts:15` — idem.

Gevolg: als BE mailboxen auto-label enablen, gaan de Outlook-categorize + archive stappen goed voor alle 5 mailboxen, maar de iController-delete cleanup-cron faalt omdat 'ie altijd in Smeba's iController-company zoekt.

## Fix

Alle 3 bestanden: vervang `ICONTROLLER_COMPANY` constant door `row.result.company` lezen met fallback naar `"smebabrandbeveiliging"` voor backwards-compat met historische rijen zonder `company` veld.

## Acceptance

- [ ] `cleanup-worker.ts`: `company` leest per-row, fallback "smebabrandbeveiliging"
- [ ] `icontroller-catchup.ts`: idem voor alle 3 callsites
- [ ] `debtor-email-review/actions.ts`: idem
- [ ] tsc clean
- [ ] Test: queue een pending row met `company: "berki"` → cleanup-worker probeert in Berki's iController (faalt tot echte Berki-iController-company bekend is, maar niet met Smeba-context)
- [ ] Vul `debtor.labeling_settings.icontroller_company` voor alle 4 BE/NL-niet-Smeba mailboxen zodra de iController company-slugs bekend zijn

## Niet in scope

- De Browserless session (sessieKey `icontroller_session_cleanup`) werkt over alle companies heen via login; geen wijziging nodig aan session-layer.
- iController-credentials zelf (staan in Supabase `credentials` tabel) — 1 credential-set werkt cross-company, geen wijziging.

## Referenties

- Refactor ingest-route: `web/app/api/automations/debtor-email/ingest/route.ts` (2026-04-23)
- Settings migratie: `supabase/migrations/20260423_mailbox_settings_expansion.sql`
