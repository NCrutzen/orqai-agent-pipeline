---
status: resolved
trigger: "Graph folder-delta mist bevestigde mail-moves (112.5 behavior tracking, verkoop@smeba.nl) — drag Inbox→afgehandeld/2026 op 2026-06-11T11:14Z is server-side bevestigd maar produceert 0 delta-events over 4+ ticks én bij directe cursor-peek"
created: 2026-06-11
updated: 2026-06-11
resolved: 2026-06-11
---

# Debug: Graph folder-delta mist bevestigde mail-moves

## Symptoms

DATA_START
- **Expected:** een mail die van Inbox naar `afgehandeld/2026` wordt gesleept produceert delta-events (een `@removed` in de Inbox-delta en/of een verschijning in de 2026-delta), waaruit `swarm-behavior-sync` een `moved_to_afgehandeld`-transitie + `approve_handled`-signaal destilleert (Phase 112.5 live-proef, runbook docs/swarm-behavior-tracking.md stap 4).
- **Actual:** mail "Sleep test 2" is om 2026-06-11T11:14Z aantoonbaar server-side verplaatst (geverifieerd via directe Graph messages-query op de 2026-map: `lastModifiedDateTime 11:14:17Z`, scripts/probe-2026-folder.ts). Zowel de Inbox- als de 2026-delta-cursor geeft 0 pending events: over 4+ geslaagde behavior-sync ticks (11:16/11:21/11:26/11:30, alle Completed, run-result `transitions_written: 0`) én bij directe peek van de opgeslagen deltaLinks (scripts/probe-inbox-delta.ts, 11:33 + 11:36). Delta-tokens worden elke tick netjes ge-update (updated_at advanceert).
- **Errors:** geen — alles draait foutloos, de events ontbreken simpelweg.
- **Timeline:** eerste waarneming 2026-06-11 direct na de 112.5 sales-reactivatie (Sugar cut-over). Eerdere observaties die OGENSCHIJNLIJK tegenspreken dat moves nooit gerapporteerd worden: (a) 2026-06-11 ~10:04-run zag wél een Inbox `@removed` → `left_to_untracked` (from_bucket=inbox, to_bucket=null) — mogelijk een collega-actie i.p.v. de eerste testmail "Test voor Mailbox volging" (die om 09:31 naar 2026 ging); (b) 2026-06-04 detecteerde dezelfde code 3 Power-Automate sweep-moves (vastgelegd als `skipped_sugar`, zie 112.5-04-SUMMARY.md).
- **Reproduction:** sleep in Outlook een mail van de verkoop@smeba.nl Inbox naar `afgehandeld/2026`; wacht ≥4 sync-ticks (à 5 min); query `swarm_email_transitions` → geen rij; peek de opgeslagen deltaLinks van Inbox + 2026 → 0 events.
DATA_END

## Context / Hypotheses (van orchestrator, 2026-06-11)

- **H1 — trage delta-propagatie:** Graph delta's kunnen bij moves achterlopen. Achtergrond-monitor `bd009girp` peekt de cursors elke 3 min (loopt tot ~12:05 lokale sessie). Bij verschijnen events: H1 bevestigd, geen code-fix nodig (alleen verwachtingsmanagement in runbook).
- **H2 — folder-scoped delta + `IdType="ImmutableId"` rapporteert moves niet (betrouwbaar):** vermoedelijk gedocumenteerde Graph-caveat: met immutable IDs verandert het message-id niet bij een move; folder-delta's missen daardoor mogelijk de verplaatsing. DELTA_PREFER = `IdType="ImmutableId", odata.maxpagesize=100` (web/lib/inngest/functions/swarm-behavior-sync.ts:74). Toets: MS Learn documentatie + experiment met delta ZONDER de ImmutableId-Prefer op een testfolder.
- **H3 — het 06-04/10:04 bewijs betrof andere event-soorten:** de PA-sweep is mogelijk geen native move (bv. copy+hard-delete), en de 10:04 `left_to_untracked` mogelijk een delete/archive-actie van een collega. Toets: immutable_id van de 10:04-transitie herleiden naar de bijbehorende mail (subject) en het soort actie vaststellen.
- **Impact:** fundament van Phase 112.5 (passieve review-signalen) én Phase 117 (Outlook-categorie correction-loop, leest categorie-edits via dezelfde delta). NB: categorie-WIJZIGINGEN (in-place edit, geen move) hebben mogelijk géén last van de move-caveat — expliciet meenemen in de conclusie i.v.m. Phase 117 go/no-go.

## Relevante bestanden / artefacten

- web/lib/email-behavior/delta-client.ts (deltaPage, bootstrapUrl, Prefer-header)
- web/lib/inngest/functions/swarm-behavior-sync.ts (per-folder step, DELTA_PREFER, derive-and-write)
- web/lib/email-behavior/transition-extract.ts (move-correlatie op immutable id, binnen-tick)
- web/scripts/probe-inbox-delta.ts + web/scripts/probe-2026-folder.ts (read-only probes, commit 46200371)
- web/scripts/bootstrap-behavior-folders.ts (lokale bootstrap n.a.v. 60s-timeout, commit a99135d7)
- .planning/todos/pending/2026-06-11-behavior-sync-bootstrap-exceeds-vercel-timeout.md (gerelateerde maar losse bug)
- docs/swarm-behavior-tracking.md (runbook), .planning/phases/112.5-*/ (phase-artefacten)
- Graph-toegang: via Zapier SDK keychain lokaal (`graphFetch` in web/lib/outlook/client.ts, connection 56014785). Mailbox is LIVE productie — alleen read-only probes zonder operator-akkoord; geen test-moves uitvoeren zonder expliciete toestemming.

## Evidence

- timestamp: 2026-06-11T11:14Z — "Sleep test 2" server-side in 2026 (probe-2026-folder.ts, status 200, lastModified 11:14:17Z)
- timestamp: 2026-06-11T11:16–11:30Z — 4 sync-ticks Completed, transitions_written 0, tokens advanceren
- timestamp: 2026-06-11T11:33Z + 11:36Z — directe peek opgeslagen deltaLinks Inbox + 2026: 0 pending events
- timestamp: 2026-06-11T10:04Z-run (retry, geslaagd ~10:55) — wél een Inbox @removed gezien → left_to_untracked, herkomst-actie onbekend
- timestamp: 2026-06-04 — 3 PA-sweep-transities gedetecteerd (skipped_sugar), zelfde code

### Nieuwe bevindingen (sessie 2026-06-11 ~11:40Z)

- checked: id-semantiek via probe-id-semantics.ts. found: IMMUTABLE id = prefix `AAkAL`, len 68 (mét Prefer); NON-immutable rotating id = prefix `AAMkA`, len 152 (zónder Prefer). De delta-stream geeft `AAkAL…`-ids terug + `Preference-Applied: IdType=ImmutableId`. implication: **H2-premisse (Prefer niet gehonoreerd) is ONJUIST** — immutable ids werken correct. Mijn eerste id-classificatie-heuristiek stond omgekeerd.
- checked: probe-delta-prefer-applied.ts op opgeslagen Inbox-cursor. found: HTTP 200, Preference-Applied: IdType=ImmutableId, 1 pending event = `changed/new` "RE: [External] Herinnering offerte SB015482" (een NIEUWE inbound, immutable id `AAkAL…`). 2026-cursor: 0 pending. implication: de Inbox-delta is LIVE en rapporteert wel degelijk wijzigingen — alleen niet de Sleep-test-2 @removed in het huidige venster.
- checked: MS Learn (message: delta + delta-query-messages). found: folder-scoped delta emit BIJ EEN MOVE-OUT een `@removed {reason:"deleted"}` in de bron-folder (gedocumenteerd, geen onderscheid delete vs move). implication: het move-detectie-ontwerp (Inbox @removed → cross-folder correlatie) is CORRECT per docs; de caveat is "geen doel-info", niet "geen event". De code vangt dat al af met cross-folder correlatie + left_to_untracked vangnet.
- checked: email_pipeline.emails WHERE source=outlook AND mailbox=verkoop@smeba.nl. found: **0 rijen** (newest 8 query leeg). Sleep test 2 immutable id `AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0AxIHgITGV4kqm7UzXICPpuQACoJHlPgAA` → 0 rijen in swarm_email_transitions; subject "sleep test" → 0 rijen in email_pipeline.emails. implication: **Sleep test 2 is een handmatig opgestelde testmail die NOOIT door de ingest-pipeline is verwerkt**. De derive-stap mapt immutable_id → email_id via email_pipeline.emails.source_id; geen match → `emailIdOf()=""` → `skippedSugar++` → transition NIET geschreven (swarm-behavior-sync.ts:520-528). Zélfs als de @removed gedetecteerd wordt, levert dit per ontwerp 0 geschreven transities.
- checked: de 10:04 left_to_untracked transitie (immutable id `AAkAL…`, email_id 1936abef-…). found: die transitie IS geschreven mét geldige email_id → dus de Inbox-@removed-detectie + immutable→email_id mapping WERKT in principe. Het verschil met Sleep test 2: de 10:04-mail was destijds pipeline-ingested; Sleep test 2 niet.
- checked: Sleep test 2 huidige locatie (immutable-id GET). found: parentFolderId = 2026-folder (`AAMkADlk…`), mod 11:14:17Z — move is echt + server-side bevestigd.
- checked: timing. found: move 11:14:17Z; bootstrap-script commit a99135d7 = 10:22Z (vóór de move, dus heeft deze move NIET ingeslikt). Inbox-token bootstrapped=true, updated_at 11:40Z (advanceert elke tick). implication: een steady-state tick ná 11:14 consumeerde de @removed (cursor staat nu vóórbij → 0 pending bij peek), maar schreef geen transitie.

### Correctie + DEFINITIEVE root cause (probe-emails-harden + probe-sleep2 + probe-volging)

- checked: COUNT op email_pipeline.emails (mijn eerdere "0 outlook rijen" was een query-artefact: order op created_at gaf lege page). found: **1086 outlook-rijen voor verkoop@smeba.nl**; de 10:04-mail bestaat (source_id `…ntnVUQAA`, subject "FW: [CASE:735033] Safety Plan…"). implication: de immutable→email_id mapping HEEFT echte data; mijn blind spot was terecht. Sugar-skip is NIET de hele verklaring.
- checked: zit Sleep test 2 / de eerste testmail in emails? found: **Sleep test 2 → 0 rijen** (nooit ge-ingest). **"Test voor Mailbox volging" (09:31-move) → WEL aanwezig** (email_id 76818e3e-…, source_id `…ntnlhwAA`).
- checked: de INGESTE testmail "Test voor Mailbox volging" — transities + huidige locatie. found: **0 transities**, tóch server-side verplaatst naar 2026 (parentFolder = afgehandeld-prefix `AAMkADlk…`, mod 09:31:00Z), en NIET meer aanwezig in de huidige inbox-delta-cursor (al geconsumeerd/voorbij). implication: **ook een ge-ingeste mail-move produceerde 0 transities** → de Sugar-skip verklaart Sleep test 2, maar NIET deze. Er is een TWEEDE, echte oorzaak.
- root_cause_mechanisme: de worker advanceert per folder de delta-cursor BINNEN de per-folder `step.run` (deltaLink-upsert op regel 283-297, direct na deltaPage), maar `derive-and-write` draait ÉÉN keer aan het EIND over alle folders samen (regel 361+). Faalt/timeout een run NÁ een cursor-advance maar VÓÓR derive-and-write (de bekende Vercel 60s mid-loop timeout op grote folders, todo 2026-06-11-behavior-sync-bootstrap-exceeds-vercel-timeout), dan zijn de al-geconsumeerde @removed/move-events PERMANENT verloren: de cursor her-emit ze nooit en er wordt geen transitie geschreven. De 09:31-move ging zo verloren bij de ~09:35 timeout (exact de "Tweede observatie" in de todo). De Sleep-test-2-move (11:14) verdween om twee elkaar versterkende redenen: (a) zelfde derive-loss-venster óf reeds-geconsumeerd, én (b) niet-ingest → Sugar-skip had hem alsnog gedropt.

## Eliminated

- hypothesis: H2 — folder-scoped delta met ImmutableId-Prefer rapporteert moves niet betrouwbaar
  evidence: delta-stream geeft correcte immutable ids (`AAkAL…`, len 68) + `Preference-Applied: IdType=ImmutableId`; MS Learn bevestigt dat een move-out wél een `@removed` in de bron-folder produceert; de 10:04 left_to_untracked bewijst dat de move-@removed-detectie werkt. De Prefer wordt gehonoreerd.
  timestamp: 2026-06-11T11:40Z
- hypothesis: H1 — trage delta-propagatie als ENIGE oorzaak
  evidence: de Inbox-cursor toont WEL een vers event (nieuwe inbound "RE: Herinnering offerte") → delta loopt niet structureel achter. De afwezigheid van een Sleep-test-2-event komt niet door propagatievertraging maar door de Sugar-skip in derive-and-write (test-mail nooit in email_pipeline.emails).
  timestamp: 2026-06-11T11:40Z
- hypothesis: H3 — het 10:04/06-04 bewijs betrof andere event-soorten (geen native move)
  evidence: de 10:04 left_to_untracked is een echte Inbox-@removed met geldige email_id; bewijst juist dat native-move-detectie werkt. Geen tegenspraak meer.
  timestamp: 2026-06-11T11:40Z

## Current Focus

hypothesis: ROOT CAUSE — de live-proef is met een mail (Sleep test 2) uitgevoerd die nooit door de ingest-pipeline is gegaan, dus geen rij in email_pipeline.emails heeft. De derive-stap (swarm-behavior-sync.ts:418-438 + 515-528) mapt immutable_id → email_id via emails.source_id en skipt elk id zonder match (`skippedSugar`). De move-@removed WORDT gedetecteerd maar de transitie wordt niet geschreven omdat er geen email_id is. Dit is een TESTMETHODE-fout + een observability-gat (geen telemetrie die "move gezien maar geskipt" zichtbaar maakt), GEEN delta/immutable-id-bug.
test: bevestig dat de probe-keten consistent is en stel de fix vast (zie reasoning_checkpoint hieronder)
expecting: een geldige live-proef gebruikt een mail die door ingest is gegaan (staat in email_pipeline.emails); dan moet de move wél een moved_to_afgehandeld-transitie + approve_handled-signaal opleveren
next_action: GEEN — sessie afgerond, operator heeft de fix live bevestigd (zie Resolution.verification)

reasoning_checkpoint:
  hypothesis: "De live-proef faalde omdat 'Sleep test 2' nooit pipeline-ingested is (0 rijen in email_pipeline.emails). De derive-stap skipt immutable_ids zonder email_id-match (skippedSugar), dus de gedetecteerde move-@removed produceert 0 geschreven transities. Geen Graph/immutable-id-bug."
  confirming_evidence:
    - "email_pipeline.emails heeft 0 outlook-rijen voor verkoop@smeba.nl; subject 'sleep test' → 0 rijen; Sleep test 2 immutable id → 0 transitie-rijen"
    - "de 10:04 left_to_untracked (echte Inbox-@removed) WERD geschreven mét geldige email_id → move-detectie + mapping werkt"
    - "delta-stream geeft correcte immutable ids + Preference-Applied: IdType=ImmutableId; Inbox-cursor toont een vers nieuw event → delta is live"
    - "MS Learn: move-out emit een @removed in de bron-folder (ontwerp klopt)"
  falsification_test: "Een move van een ÉCHT pipeline-ingested mail (rij in email_pipeline.emails) produceert OOK geen moved_to_afgehandeld-transitie. Dan is de oorzaak niet de Sugar-skip maar iets in de delta/correlatie."
  fix_rationale: "Root cause is deels testmethode (verkeerde mail) en deels een observability-gat: de worker telt skippedSugar maar logt niet WELKE immutable_ids als move gezien-maar-geskipt zijn, waardoor een legitieme move op een niet-ingested mail onzichtbaar verdwijnt. Fix: (a) runbook corrigeren zodat de live-proef een ingested mail gebruikt; (b) skippedSugar verrijken met de geskipte move-transitie-soorten (debug-telemetrie) zodat 'move gezien maar geen email_id' niet stil is."
  blind_spots: "Niet getest met een echt ingested mail (vereist productie-move = checkpoint). Mogelijk zijn er ZOWEL niet-ingested test-mails ALS een tweede latentie-effect; de falsification_test sluit dat pas definitief uit. Ook: of email_pipeline.emails écht 0 outlook-rijen heeft of dat de query-kolom (mailbox) afwijkt is met één extra check te harden."

## Resolution

root_cause: |
  TWEE elkaar versterkende oorzaken — GEEN Graph/immutable-id/delta-bug (H1, H2, H3 alle weerlegd):

  1. TESTMETHODE (Sleep test 2, 11:14): de proefmail was handmatig opgesteld en
     nooit door de ingest-pipeline gegaan → 0 rijen in email_pipeline.emails.
     De derive-stap mapt immutable_id → email_id via emails.source_id en skipt
     elk id zonder match (skippedSugar; swarm-behavior-sync.ts). De move-@removed
     wordt correct gedetecteerd maar de transitie wordt niet geschreven.

  2. OBSERVABILITY-GAT + STRUCTUREEL DERIVE-LOSS-VENSTER ("Test voor Mailbox
     volging", 09:31 — WEL ge-ingest, tóch 0 transities): de worker advanceert
     elke folder-cursor BINNEN de per-folder step.run (deltaLink-upsert direct na
     deltaPage), maar derive-and-write draait ÉÉN keer aan het eind over alle
     folders. Faalt een run ná een cursor-advance maar vóór derive-and-write (de
     bekende Vercel-step-timeout op grote folders, ~09:35), dan zijn al-
     geconsumeerde move-events permanent weg — de cursor her-emit ze nooit. Dit
     was tot nu STIL: skippedSugar telt wel, maar zonder detail welke immutable_ids
     als move gezien-maar-geskipt zijn → een legitieme move verdween spoorloos,
     wat de live-proef ondebugbaar maakte.

  Bevestigingen: delta geeft correcte immutable ids (prefix AAkAL, len 68) +
  Preference-Applied: IdType=ImmutableId; Inbox-cursor toont een vers inbound
  event (delta is live); MS Learn bevestigt dat een move-out een @removed in de
  bron-folder emit; de 10:04 left_to_untracked (echte @removed, geldige email_id)
  bewijst dat detectie + mapping werken. email_pipeline.emails heeft 1086 outlook-
  rijen voor verkoop@ (mijn eerste "0 rijen" was een order-by-created_at artefact).

fix: |
  Minimale, niet-gedrags-wijzigende fix (alleen telemetrie + docs):
  1. swarm-behavior-sync.ts: PerSwarmCounts krijgt `skipped_moves[]` — elke
     geskipte MOVE-soort transitie (moved_to_afgehandeld / self_archived /
     restored_from_archive / left_to_untracked) wordt vastgelegd met immutable_id
     + kind + from/to_bucket, i.p.v. anoniem in skipped_sugar te verdwijnen. Maakt
     "move gezien maar geen email_id" expliciet zichtbaar in de run-output.
  2. docs/swarm-behavior-tracking.md: stap 4 waarschuwt nu nadrukkelijk om een
     GE-INGESTE mail te kiezen (met vooraf-check-query), plus een nieuwe stap 4b
     die skipped_moves[] als diagnose-pad beschrijft (entry = kies ingeste mail;
     lege array + 0 transities = derive-loss / mid-loop timeout).
  NIET in deze fix (bewust): de structurele derive-loss (cursor-advance-vóór-
  derive) vereist de page-budget-per-step redesign — al gedekt door de pending
  todo 2026-06-11-behavior-sync-bootstrap-exceeds-vercel-timeout. maxDuration=300
  staat al op de serve-route (Optie B reeds toegepast).

verification: |
  Zelf-geverifieerd: `npx tsc --noEmit` schoon na de wijziging; skipped_moves
  wordt op alle drie return-paden + de results.push meegegeven; MOVE_KINDS sluit
  read_aged/category_edited noise uit.

  OPERATOR-BEVESTIGD (2026-06-11, Nick — checkpoint verdict: CONFIRMED FIXED):
  live-proef met een GE-INGESTE mail "RE: Profell Pelt." (email_id
  81e8bec1-9d9c-4472-ae98-ed5c704bfcfd), gesleept van Inbox naar
  afgehandeld/2026:
  - swarm_email_transitions rij geschreven: kind=moved_to_afgehandeld,
    from_bucket=inbox, to_bucket=afgehandeld
  - swarm_review_signals rij geschreven: verdict=approve_handled
  - Detectie binnen één sync-tick (<5 min)
  Daarmee is de volledige Phase 112.5-loop end-to-end live bewezen.

files_changed:
  - web/lib/inngest/functions/swarm-behavior-sync.ts
  - docs/swarm-behavior-tracking.md
  - .planning/todos/pending/2026-06-11-behavior-sync-bootstrap-exceeds-vercel-timeout.md
