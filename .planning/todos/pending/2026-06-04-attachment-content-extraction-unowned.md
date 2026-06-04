---
created: 2026-06-04T16:00:00.000Z
title: Bijlage-content-extractie (PDF → tekst → resolver-input) is van geen enkele track — sizing na ronde-1 operator-validatie v8.2
area: agentic-pipeline
priority: cross-track / besluit na data
files:
  - web/lib/outlook/client.ts (haalt nu alleen hasAttachments-vlag op)
  - web/lib/agentic-pipeline/resolve/ (Engine-seam waar het swarm-agnostisch zou landen)
---

## Context

Operator-validatie v8.2 ronde 1 (2026-06-04) legde bloot dat bijlage-inhoud nergens wordt geïngest: een Ultimoo-incasso-PDF bevatte het klantnummer (`Uw referentie`) terwijl de mail-body niets had → resolver terecht "geen voorstel", maar de info bestond wél. Zie `.planning/spikes/010-comprehensive-backtest/OPERATOR-FEEDBACK-2026-06-04.md` op branch `workspace/v8.2-resolution-recall` (gaps G-1/G-2).

## Wie dekt wat (per 2026-06-04)

- **Sales (Phase 114-03)**: alléén de `has_attachments`-vlag (Graph `$select`), fix-forward, geen backfill, geen metadata, geen content. 114-04/05 raken bijlagen niet. Commits stonden bij vastlegging nog lokaal in de sales-agent-swarm worktree.
- **Debtor (v8.2 RESL-01..15)**: bijlagen 0× genoemd in VALIDATION-BRIEF/FINDINGS — blinde vlek.
- **Conclusie**: content-extractie is unowned. Beide tracks zijn hiervan op de hoogte (finding op v8.2-branch, deze todo op main).

## Beslissing (bewust geparkeerd)

Niet bouwen vóór de ronde-1 cijfers. De ingevulde Excel (operator vult bij bijlage-gevallen "juiste klantnr" + toelichting "stond in bijlage" in) kwantificeert hoe vaak het antwoord alléén in een bijlage zit. Daarna kiezen:

- Frequent → nieuwe RESL-lever (v8.2) of 114-vervolg; swarm-agnostisch in de Engine-seam (RESL-01/02/03), NIET debtor-only. Bijlagen via Zapier SDK-pad (NXT-documenten op S3-patroon) of Graph attachment-download.
- Zeldzaam → operator-runbook (Outlook erbij pakken bij `has_attachments=true` + geen voorstel) en sluiten.

## Acceptatie

- [ ] Ronde-1 Excel geanalyseerd: N "antwoord alleen in bijlage" / totaal geen-voorstel-rijen gerapporteerd.
- [ ] Go/no-go besluit vastgelegd (RESL-lever, 114-vervolg, of runbook) met eigenaar.
- [ ] Gerelateerd: `2026-06-04-sales-ingest-attachments-gap.md` (sales-branch) — backfill-vraag daar nog open.
