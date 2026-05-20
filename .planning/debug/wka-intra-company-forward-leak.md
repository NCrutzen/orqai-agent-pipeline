---
status: verified
trigger: "Intra-company forwards from Smeba-group senders leak into v7 Human review lane as unknown+needs-review. Concrete case WKA verklaring SC&S (msg AAkALgAA...e29JKQAA, run 52ef81b0-cc2e-4e4d-a2c6-e726517a2b24)."
created: 2026-04-23T00:00:00.000Z
updated: 2026-04-23T11:30:00.000Z
---

## Current Focus

Closed. Framing van de oorspronkelijke debug was fout. Intra-company forwards
*horen* in de review-lane — ze zijn vaak echte werk-items van collega's. Het
echte probleem was dat dezelfde rows NIET opdoken in de bulk-review UI en dus
niet tot regex-training konden leiden.

## Symptoms

expected: Intra-company forwards van Smeba-groep senders verschijnen in (a)
de v7 review-lane zodat de operator ze ziet, EN (b) de bulk-reviewer (`/automations/debtor-email-review`)
zodat reviewer-feedback de regex-classifier kan trainen.
actual: Kaart staat in v7 review-lane met tags `[unknown, needs-review]` ✓.
Maar mail is onzichtbaar in bulk-reviewer omdat de `isHandled`-filter rijen
met `status=feedback` overslaat, en ingest schreef `status: "feedback"` bij
`skipped_not_whitelisted`. ✗
errors: None thrown. Silent training-pipeline gap.
reproduction: Mail van *@smeba.nl/*@sicli-noord.be/*@sicli-sud.be/*@berki.nl/*@smeba-fire.be
→ debiteuren@smeba.nl → Zapier ingest (alleen Outlook-trigger + filter + webhook;
geen sender-whitelist) → `ingest/route.ts` classify → `rule: no_match` →
logged als `status: feedback + action: skipped_not_whitelisted` → v7 toont
het als review-kaart, bulk-reviewer verbergt het als "handled".
started: Sinds ingest-route `status: "feedback"` schrijft voor niet-whitelisted
classifier-uitkomsten. Niet gebisect.

## Eliminated

- "De Zap heeft een sender-whitelist die te strict is" — onjuist. De Zap
  doet alleen Outlook-trigger + categorie-filter + webhook POST. Alle
  classify-logica zit server-side in `web/app/api/automations/debtor-email/ingest/route.ts`.
- "`classify.ts` heeft een domein-whitelist die intra-company afwijst" —
  onjuist. Classifier kijkt alleen naar sender-*shape* (noreply, payment-role,
  human-shape), geen specifieke domeinen.
- "`AUTO_ACTION_RULES` uitbreiden met intra-forward regel" — voorbarig. Die
  set vereist Wilson CI-lo ≥ 95% op productie-telemetry. Eerst samples
  verzamelen via bulk-review; pas daarna evt. regel toevoegen.

## Evidence

- timestamp: 2026-04-23
  checked: `ingest/route.ts:171-200`
  found: Niet-whitelisted classifier-uitkomsten krijgen `status: "feedback"` +
  `result.action: "skipped_not_whitelisted"`.
  implication: De status "feedback" werd hier als pre-review signaal gebruikt
  (classifier heeft geraden, mens moet nog).

- timestamp: 2026-04-23
  checked: `debtor-email-review/actions.ts:103-127`
  found: Reviewer-beslissingen uit de bulk-UI schrijven óók `status: "feedback"`
  — maar nu als post-review signaal (reviewer heeft beslist).
  implication: Eén status-waarde, twee onverenigbare betekenissen. `isHandled`
  in `page.tsx:91` gaat uit van post-review, dus pre-review rows worden
  ten onrechte als afgehandeld verborgen uit de bulk-review inbox.

- timestamp: 2026-04-23
  checked: `page.tsx:86-105`
  found: `isHandled` beschouwt alle rijen met `status in [feedback, completed,
  skipped_idempotent, deferred]` als afgehandeld.
  implication: Splitsen van pre-review en post-review semantiek volstaat om
  ingest-predictions zichtbaar te maken zonder bulk-review handshake te breken.

## Resolution

root_cause: Status-collision. `status: "feedback"` werd op twee plekken
geschreven voor twee onverenigbare betekenissen — pre-review classifier-guess
(ingest) versus post-review menselijke beslissing (actions). De bulk-review
UI's `isHandled`-filter gaat uit van de post-review betekenis en verborg
daardoor de ingest-predictions.

fix:
  - Nieuwe status `"predicted"` toegevoegd aan `AutomationRunStatus`
    (`web/lib/automations/types.ts`) + `stageFromStatus("predicted") → "review"`.
  - `ingest/route.ts:177`: schrijft nu `status: "predicted"` i.p.v. `"feedback"`.
  - `swarm-bridge/sync.ts`: `stageFromStatus` + `deriveEntityStage` + `startEventType`
    ondersteunen `predicted` als review-equivalent. `isSkipFeedback` defense-
    in-depth logic ripped (niet langer nodig). Nieuwe helper `isReviewStatus`
    behandelt `feedback` en `predicted` symmetrisch.
  - `page.tsx:86-105`: `isHandled` sluit nu expliciet uit:
    (a) `predicted` (blijft uit de handled-lijst) — voor nieuwe rows;
    (b) rows met `result.action = "skipped_not_whitelisted"` óók als ze
    status=feedback hebben — voor historische rows, geen backfill-SQL nodig.

verification: Manual test na deploy:
  1. Stuur test-forward van *@smeba.nl naar debiteuren@smeba.nl.
  2. Verifieer v7 review-lane toont de kaart binnen 5 min (na swarm-bridge
     cron).
  3. Verifieer `/automations/debtor-email-review` toont dezelfde mail als
     unhandled in de bulk-review lijst.
  4. Reviewer kiest categorie → `status: "feedback"` + `stage: "review_decision"`
     wordt geschreven → mail verdwijnt uit bulk-UI én v7 review-lane.

files_changed:
  - web/lib/automations/types.ts
  - web/lib/automations/swarm-bridge/sync.ts
  - web/app/api/automations/debtor-email/ingest/route.ts
  - web/app/(dashboard)/automations/debtor-email-review/page.tsx

follow_up:
  - Zodra genoeg hand-gelabelde intra-forward samples binnen zijn via de
    bulk-reviewer, een classify-rule "intra_forward" overwegen met een
    eigen categorie. Pas toevoegen aan `AUTO_ACTION_RULES` zodra Wilson
    CI-lo ≥ 95%.
