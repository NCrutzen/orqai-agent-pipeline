# Debtor Email Cleanup

**Status:** live (as iController tool — full vertical slice in progress, see roadmap)
**Type:** hybrid
**Eigenaar:** Nick Crutzen
**Systemen:** iController, Outlook (Microsoft 365 shared mailbox), Zapier, Browserless.io

## Wat doet het

Verwijdert een specifieke email uit de iController Messages-inbox van een klant-subsidiary (bv. `smebabrandbeveiliging`). Onderdeel van de Debtor Email Swarm: na classificatie en archivering in Outlook ruimt deze automation de email op in iController zodat de debiteurenmailbox schoon blijft.

## Waarom

iController's Messages-inbox raakt vol met auto-replies en payment notices die de debiteurenbeheerders afleiden van inhoudelijk werk. Deze automation verwijdert ze automatisch zodra Outlook-archivering is gelukt.

## Trigger

`POST /api/automations/debtor-email-cleanup` van Zapier (of in Phase A4 van de orchestrator-endpoint). Header `x-automation-secret: $AUTOMATION_WEBHOOK_SECRET`.

**Request body:**

```json
{
  "mode": "preview" | "delete",
  "env":  "acceptance" | "production",
  "email": {
    "company":    "smebabrandbeveiliging",
    "from":       "Detuinen Accounts",
    "subject":    "Automatic reply: Documenten n.a.v. uitgevoerde werkzaamheden",
    "receivedAt": "2026-04-20T13:18:56"
  }
}
```

`mode=preview` is het dry-run pad — login + find + marked before-screenshot + **stop**. Gebruik dit altijd eerst tegen production om de juiste rij visueel te verifiëren.

## Aanpak

**Hybrid.** Zapier triggert + verwerkt de Outlook-kant; deze Vercel API route voert de iController browser-actie uit via Browserless.io + Playwright. iController heeft geen API — browser automation is de enige weg.

**Find-strategy** (`findEmail` in `browser.ts`):
- Pagineert door `#messages-list` (max 10 pagina's, DataTables `.paginate_button.next`).
- Match primair op **timestamp**: `HH:MM` + datum-onderdelen uit `receivedAt` in meerdere formaten (`YYYY-MM-DD`, `DD-MM-YYYY`, `DD/MM/YYYY`, `DD.MM.YYYY`).
- Fallback: `from` + eerste 30 chars van `subject` (case-insensitive substring).
- **De in-app Search box wordt NIET gebruikt** — onbetrouwbaar op live, zie learnings.

**Delete-strategy** (`selectAndDelete`):
- `row.locator('input[type="checkbox"]').first()` — kolom-agnostisch.
- `isChecked()` verifiëren; fallback naar first-cell click (DataTables row-toggle); throw als nog steeds niet gecheckt.
- Bulk-delete button `.delete-bulk.bulk-action`.
- Confirm dialog: `button:has-text("OK" | "Yes" | "Confirm" | "Delete")` of `.modal .call-to-action`.

## Aannames

- De email bestaat op het moment van de call (niet al door een mens verwijderd).
- `company` komt exact (case-insensitive) overeen met het `» ...` sidebar-label in iController; partial-match als fallback.
- `receivedAt` is binnen ~1 minuut van wat iController toont. Beide zijn lokale tijd (Europe/Brussels), geen TZ-conversie.
- Audit-screenshots hoeven niet PII-gesanitized — Supabase Storage bucket is interne audit-trail.

## Credentials

Uit de Supabase `credentials` tabel (decrypted via `@/lib/credentials/proxy`):

| Environment | Credential name | ID |
|---|---|---|
| `production` | iController Production Login | `dfae6b50-59dd-44e6-81ac-79d4f3511c3f` |
| `acceptance` | iController Test Login | `e9a9570e-5f0d-4d50-8b41-212fc6bdb78a` |

Environment-switch gebeurt via `env` veld in de webhook body (default: `acceptance` — production vereist expliciete opt-in).

## Zapier configuratie

**Status:** not yet configured (Phase A5 — zie roadmap).

Verwachte flow:
1. Trigger: nieuwe email in gedeelde debtor inbox (Outlook / Microsoft 365).
2. POST naar `/api/debtor-email/classify` (Phase A1) → krijgt `{category}`.
3. If `category IN (auto_reply, payment_admittance)`:
   - POST naar `/api/tools/outlook/categorize` (Phase A2).
   - POST naar `/api/tools/outlook/archive` (Phase A3).
   - POST naar deze endpoint met `mode="delete"`, `env="production"`.
4. Else: laat rusten (Phase C neemt over).

## Audit trail

Elke run logt naar `automation_runs` met:

- `automation`: `"debtor-email-cleanup"`
- `status`: `completed` | `failed`
- `result.screenshots.before` / `.after`: paths in `automation-screenshots/debtor-email-cleanup/` bucket (Supabase Storage). Signed URLs zijn 1h geldig.
- `triggered_by`: `"zapier-webhook:{category}"` voor prod runs, `"preview:manual"` voor dry-runs.

Screenshots bevatten **altijd** een red-outline highlight op de target rij (`scrollIntoView` + `outline: 3px solid #ff0033` + `background: #ffe5ec`) zodat de audit in één oogopslag verifieerbaar is. Dit is een team-standaard voor alle browser automations — zie `feedback_automation_screenshots_highlight_target` memory.

## Gerelateerde bestanden

- `browser.ts` — Playwright/Browserless logica (findEmail, selectAndDelete, highlightRow).
- `route.ts` (in `web/app/api/automations/debtor-email-cleanup/`) — HTTP handler + audit logging.
- `run-live-test.ts` — local CLI runner (blocked by Browserless IP-restrict; gebruik Vercel preview deployments voor live tests).
- Roadmap: [`docs/debtor-email-swarm-roadmap.md`](../../../../docs/debtor-email-swarm-roadmap.md).
