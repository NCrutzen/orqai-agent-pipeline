---
phase: quick-260611-jwt
plan: 01
subsystem: infra
tags: [sugarcrm, outlook, microsoft-graph, zapier-sdk, supabase, read-only-report, sales-email]

# Dependency graph
requires:
  - phase: V9.0 sales-email Outlook cut-over
    provides: 34.725 geïngeste source=sugarcrm rows + 87k outlook rows in email_pipeline.emails + outlook_folder_map (verkoop@smeba.nl)
provides:
  - "Read-only npx tsx analyse-script dat open Sugar-items (via live Case-status) matcht naar hun Outlook-locatie + zichtbaarheid"
  - "RAPPORT.md beslis-rapport voor operator Nick: 28 open items, 15 in Sugar Archive (onzichtbaar)"
  - "Bewezen Sugar REST-access via Zapier SDK connectie 58816663 (geen SUGARCRM_* env vars / oauth2-token nodig)"
affects: [sales-email-decommission, sugar-archive-cleanup, outlook-visibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sugar REST via Zapier SDK connectionId (één credential-grens, conform CLAUDE.md NXT-patroon) i.p.v. oauth2/token flow"
    - "Twee-traps Sugar->Outlook match: Trap A exact internet_message_id (DB-only, gratis), Trap B fuzzy Graph $search (bounded cap)"
    - "Open-signaal niet uit email raw_json maar uit gekoppelde Case-status via gechunkte /Cases/filter id $in lookup"

key-files:
  created:
    - web/scripts/sugar-open-items-report.ts
    - .planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/RAPPORT.md
  modified: []

key-decisions:
  - "Task 1 Sugar-credential checkpoint opgelost via bestaande Zapier connectie 58816663 i.p.v. nieuwe SUGARCRM_* secrets / oauth2-token"
  - "Open = gekoppelde Case NIET in {closed,resolved,duplicate,rejected,cancelled,canceled}; live geverifieerde statussen: Closed/New/In Progress/Pending Internal Resolution"
  - "Fuzzy Trap B begrensd op cap (default 300) om Graph-throttling te respecteren; items boven cap -> not_found"

patterns-established:
  - "Read-only productie-inventarisatie: PRODUCTION-banner + GET/filter-reads only, geen mailbox-move/PATCH, enige write is RAPPORT.md"
  - "Distinct-Case batching (13.777 cases / 276 chunks à 50) met voortgangslogging voor lange lokale runs"

requirements-completed: [INVENTARIS-01]

# Metrics
duration: ~18min
completed: 2026-06-11
---

# Quick Task 260611-jwt: Open-SugarCRM-items + Outlook-locatie Inventarisatie Summary

**Read-only analyse-script dat 34.725 geïngeste SugarCRM-mails tegen hun live Case-status filtert tot 28 open items en die naar hun Outlook-map matcht — 15 blijken in "Sugar Archive" te liggen (onzichtbaar voor het team), gerapporteerd in RAPPORT.md.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 3 (Task 1 resolved via checkpoint, Tasks 2+3 executed)
- **Files modified:** 2 (1 script + 1 rapport)

## Accomplishments

- **Sugar-credential checkpoint opgelost** via de bestaande Zapier SDK connectie `58816663` ("Sugar CRM // NCrutzen") — geen nieuwe `SUGARCRM_*` env vars of oauth2/token flow. Live geverifieerd (HTTP 200 op `/Cases` én `POST /Cases/filter`). Volgt het CLAUDE.md-principe "één credential-grens, één auth-pad".
- **Read-only analyse-script** (`web/scripts/sugar-open-items-report.ts`, ~600 regels): pagineert 34.7k sugar-rows, bepaalt open-status via gechunkte live Case-lookup (13.777 distinct Cases over 276 chunks), en matcht open items twee-traps naar Outlook-map + zichtbaarheid + match-confidence. PRODUCTION-banner + strikt read-only.
- **RAPPORT.md gegenereerd** met alle 7 secties: **28 open items van 34.725** (0,1%); **16 onzichtbaar** (15 Sugar Archive + 1 Sent Items), **12 niet teruggevonden**, 0 zichtbaar in Inbox. Ouderdom-verdeling, exact/fuzzy-gesplitste onzichtbare-lijst, niet-gevonden-lijst, expliciete out-of-scope-noot over verplaatsen.

## Task Commits

1. **Task 1: Sugar read-only credentials** — resolved via checkpoint_resolution (Zapier conn 58816663), geen aparte commit
2. **Task 2: Read-only analyse-script** — `106cc199` (feat)
3. **Task 3: Rapport genereren (RAPPORT.md) + --apply** — `008cb16f` (feat)

## Files Created/Modified

- `web/scripts/sugar-open-items-report.ts` — Read-only inventarisatie-script (dry-run default, `--apply` schrijft RAPPORT.md). Flags: `--skip-sugar`, `--fuzzy-cap=<n>`, `--team-filter`.
- `.planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/RAPPORT.md` — Het gegenereerde beslis-rapport voor operator Nick.

## Decisions Made

- **Auth via Zapier connectie i.p.v. directe Sugar oauth2** — de geretireerde fetcher gebruikte `POST /oauth2/token` (grant_type=password), maar de orchestrator-checkpoint wees de bestaande Zapier SDK connectie `58816663` aan als werkend read-only pad. Dit vermijdt nieuwe productie-secrets.
- **Open-definitie** — een mail is open wanneer de gekoppelde Case NIET gesloten is. Live aangetroffen statussen: `Closed` (=dicht), `New`/`In Progress`/`Pending Internal Resolution` (=open). Gesloten-set defensief uitgebreid met resolved/duplicate/rejected/cancelled/canceled.
- **Fuzzy-cap** — Trap B (Graph `$search`) begrensd (default 300) met 120ms throttle; ruim voldoende voor de 28 open items (28/300 gebruikt).

## Deviations from Plan

None - plan executed exactly as written. Task 1's human-action checkpoint was pre-resolved by the orchestrator (Zapier connectie i.p.v. SUGARCRM_* env vars); Tasks 2+3 volgden de actie-specs. De renderer-code voor Task 3 zat al in het Task-2-script (één bestand), dus Task 3's code-deel landde in de Task-2-commit; de Task-3-commit bevat het gegenereerde RAPPORT.md (de daadwerkelijke `--apply` output).

## Issues Encountered

- **`timeout` niet beschikbaar** op deze shell (zsh/macOS) — vroege verify-pogingen leverden lege output. Opgelost door runs naar background + logfile te verleggen en op condities te wachten.
- **Trap A (exact) leverde 0 hits op de 28 open items** terwijl het corpus-breed 2166 exact-matches kent. Oorzaak: de open items zijn vrijwel allemaal threaded replies (`FW:`/`Betreft:`/`RE:`) waarvan Sugar's `message_id` een Sugar-gegenereerd id is (`@walkerfire.sugaropencloud.eu`) dat niet matcht met het originele Outlook internet-message-id. Alle 16 locatie-resolutties kwamen daardoor van Trap B (fuzzy) — eerlijk benoemd in de rapport-betrouwbaarheidssectie. Geen bug; verwacht gedrag van de match-strategie. Aanbeveling staat in het rapport (fuzzy-rijen handmatig verifiëren vóór actie).

## Known Stubs

None — het script wire't echte data (Supabase reads + live Sugar/Graph calls); geen placeholders of hardcoded lege waarden in de output-pad.

## Verification

- **Read-only bevestigd:** `grep -nE "PATCH|messages.*move|.update(|.insert(|.upsert("` levert geen mailbox-/prod-write; enige `POST` is de Sugar `/Cases/filter` read; enige filesystem-write is `writeFileSync(RAPPORT.md)`.
- **PRODUCTION-banner** aanwezig in script-output (regel 1 van stdout).
- **Task 2 verify** (pipeline-structuur via `--skip-sugar` dry-run): laadt 34725 rows, index 86543 ids + 28 folders, matcht — bevestigd.
- **Task 3 verify** (`grep -cE "^## |Outlook-locatie|Ouderdom|Onzichtbare|Sugar Archive|Beperkingen" RAPPORT.md` = 27, >0): passed.

## Next Phase Readiness

- Operator Nick heeft het beslis-rapport: **15 open items in "Sugar Archive" + 1 in Sent + 12 niet-gevonden** — genoeg om te beslissen of/welke mail teruggezet moet worden. Verplaatsen blijft een aparte beslissing na dit rapport (out of scope).
- Het script is herbruikbaar: re-run met hogere `--fuzzy-cap` voor volledige dekking, of `--team-filter` om tot Smeba/Brandbeveiliging te beperken.

## Self-Check: PASSED

- FOUND: web/scripts/sugar-open-items-report.ts
- FOUND: .planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/RAPPORT.md
- FOUND: .planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/260611-jwt-SUMMARY.md
- FOUND commit: 106cc199 (Task 2)
- FOUND commit: 008cb16f (Task 3)

---
*Phase: quick-260611-jwt*
*Completed: 2026-06-11*
