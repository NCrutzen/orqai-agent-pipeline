# Browserless multi-tab op Prototyping ($25) — onderzoeksrapport

Context: refactor (commit 28cd7d3, gerevert) opende N tabs via
`context.newPage()` binnen één Browserless-sessie voor parallelle iController
cleanup. Cron werd muisstil op Vercel: 4 missed ticks, geen errors, geen
pending rows.

## Wat de docs zeggen

Browserless v2 telt concurrency **per sessie**, niet per tab.

- Terminology page: *"A session represents an active, connected Chrome
  instance."* en *"Concurrency is the maximum number of browser sessions
  that can run simultaneously on a Browserless instance."*
  (docs.browserless.io/docs/terminology.html)
- Prototyping tier: 10 concurrent browsers, 20k units/mo, 15 min max
  session time, `$0.002` per unit overage.
- Unit-definitie (pricing/search): *"One unit equals a block of browser
  time up to 30 seconds; typically a unit is used per page, though longer
  running automations may use more than one."* → meerdere tabs die samen
  lang actief zijn, **vermenigvuldigen wel het unit-verbruik**, maar niet
  het concurrent-browsers-getal.
- Geen enkele docs-pagina noemt een harde "pages per session" limit op de
  Prototyping tier.

Conclusie docs: 1 `connectOverCDP` = 1 concurrent browser, ongeacht hoeveel
`newPage()` erin. Eén draaiende cron gebruikt dus 1 van de 10 slots.

## Live probe

Script: `web/lib/automations/debtor-email-cleanup/probe-multitab.ts`
(`npx tsx` vanuit `web/`, 1 connect → 1 context → N parallelle `newPage` +
`goto https://example.com`).

```
[connect] ok in 1502ms
[tabs=3] wall=210ms  — alle 3 PASS (167–210ms per tab)
[tabs=5] wall=186ms  — alle 5 PASS (167–185ms per tab)
browser.isConnected() = true na beide rondes
```

Geen disconnect, geen protocol errors, wall-time ~gelijk aan één nav →
echte parallelle uitvoering. Tier ondersteunt 5 tabs in 1 context probleem-
loos.

## Conclusie

Multi-tab binnen één `BrowserContext` **is ondersteund** op Prototyping.
Het telt voor 1 concurrent browser. De revert-oorzaak zit dus *niet* in
tier-limiet of fundamentele Browserless-ongeschiktheid.

Waarschijnlijke echte oorzaken van de stille crash (buiten dit rapport,
wel belangrijk om te volgen):

1. `connectWithSession` / `saveSession` race — parallelle tabs schrijven
   terug naar dezelfde `sessionKey` in Supabase → last-writer-wins corrupt
   cookies → login loop op volgende tick zonder error-log.
2. Gedeelde `page` state (search-filter, sidebar) tussen tabs die in
   `deleteEmailOnPage` naar `/messages` navigeren — niet crash, maar
   vastlopende `waitForResponse` die langer duurt dan Vercel's 60s cron
   timeout → proces hard killed vóór de error bubbled naar Supabase.
3. Vercel cron Hobby/Pro timeout (60s) overschreden door N parallelle
   navigaties die iController's backend serialiseert.

## Aanbeveling

Herintroduceer parallelisme als volgt:

- **Houd 1 connectOverCDP**, maar geef elke tab een eigen
  `browser.newContext()` (niet hergebruiken) zodat cookies/storage
  geïsoleerd zijn — voorkomt session-corruptie tussen tabs.
- **Splits `saveSession` uit de parallelle loop**: 1 context wordt de
  "canonical" cookie-owner, anderen zijn ephemeral. Of: serialiseer de
  `saveSession`-call na `Promise.all`.
- **Concurrency cap = 3** (niet 5+): iController zelf is vermoedelijk de
  bottleneck, niet Browserless.
- **Verplaats naar Inngest** als >60s totaal waarschijnlijk is. Vercel
  cron is te krap voor N×iController-flows.
- **Voeg expliciete try/catch + Supabase error-log toe per tab**: de
  huidige "stille crash" komt door niet-gevangen rejections in een
  Promise.all, die Vercel als succes rapporteert.

Veilig pad: eerst Inngest + 1-tab sequentiëel stabiliseren, dan tabs naar
2 → 3 opschalen met per-tab error logging.
