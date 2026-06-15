# behavior-sync: bootstrap van grote folders past niet in de Vercel 60s step-limiet

**Ontdekt:** 2026-06-11, bij de 112.5 sales-reactivatie (Sugar cut-over).

**Probleem:** het per-folder step `delta-<swarm>-<folderId>` in `swarm-behavior-sync.ts` draait `deltaPage()` die ALLE pagina's van een folder-delta in één step.run doorloopt. Bij de eerste bootstrap van een grote map overschrijdt dat de Vercel `FUNCTION_INVOCATION_TIMEOUT` (60s) → de cron crash-loopt op dezelfde map en alle mappen ná die map in de loop komen nooit aan de beurt. Gemeten op verkoop@: Sent Items 65.754 items / 13 min, Sugar Archive 23.974 / 4,6 min, 2018-en-2019 4.652 / 50s (borderline).

**Workaround toegepast (2026-06-11):** `web/scripts/bootstrap-behavior-folders.ts` — zelfde logica lokaal (geen cap), tokens geüpserd, steady-state ticks passen daarna ruim.

**Structurele fix nodig** (anders komt dit terug bij élke nieuwe swarm-onboarding, nieuwe jaarmap met history, of een Graph 410-resync):
- Optie A (voorkeur): page-budget per step — `deltaPage` accepteert `maxPages`/deadline, persisteert de `@odata.nextLink` als tussentoken (`bootstrapped=false`), volgende tick hervat. Bootstrap wordt dan incrementeel over ticks gespreid.
- Optie B (quick win): `maxDuration = 300` op de Inngest serve-route (Vercel Pro) — verschuift de grens maar lost 65k-item-mappen niet gegarandeerd op.
- Let op: een timeout midden in de loop verliest ook al-geconsumeerde delta-events van eerdere folders in dezelfde run (token al geadvanceerd binnen het step, derive-and-write aan het eind nooit bereikt). Optie A moet dáárom ook events-per-folder persistent maken of de derive per folder doen.

**Tweede observatie:** een mid-loop timeout kan transities verliezen (zie hierboven) — de eerste live-proef-versleping (2026-06-11 ~09:35) is zo verloren gegaan. De dead-letter-vraag voor behavior-signalen (bestaat er een reconciliatie?) meenemen in dezelfde fix.

**Bevestigd door debug `graph-delta-missing-moves` (2026-06-11):** de derive-loss is geen theorie maar een waargenomen instantie — "Test voor Mailbox volging" (09:31-move, WEL ge-ingest, email_id 76818e3e-…) staat server-side in 2026 maar heeft 0 transities én is niet meer in de inbox-delta-cursor: de @removed is geconsumeerd-en-verloren in de ~09:35 timeout. Dit maakt Optie A (page-budget + events-per-folder persisteren, of derive-per-folder) tot een harde vereiste, niet alleen perf. De debug-fix voegde `skipped_moves[]`-telemetrie toe aan de run-output zodat een legitieme-maar-geskipte move niet meer stil in `skipped_sugar` verdwijnt — maar dat dekt alléén de Sugar-skip-tak (niet-ingeste mail), NIET de derive-loss zelf (events die de run nooit halen). Reconciliatie/dead-letter blijft open.

**Referentie:** Inngest run-failures 09:53/10:04/10:15 UTC (`FUNCTION_INVOCATION_TIMEOUT`), `112.5-*` phase-artefacten, runbook `docs/swarm-behavior-tracking.md`, debug `.planning/debug/graph-delta-missing-moves.md`.
