# Phase 114: Stage 2 Resolver Reuse — cross-swarm generality proof - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 114-stage-2-resolver-reuse-cross-swarm-generality-proof
**Areas discussed:** Seam-landing strategie, Sales resolution-lagen, NXT lookup-transport, Audit-target & surface

---

## Pre-discussion: re-sequencing besluit

Voorafgaand aan deze discuss (zelfde sessie) is V9.0 re-sequenced: 114 vóór 113, op operator-initiatief, onderbouwd met corpus-analyse (1.273 inbound verkoop@: 32% offerte-subjects, ≥44% debiteuren-overlap, 75% business-domeinen). Vastgelegd in ROADMAP.md + STATE.md, commit `42c250eb`.

---

## Seam-landing strategie

| Option | Description | Selected |
|--------|-------------|----------|
| Enabler-PR naar main | Seam-subset (dynamic.ts + engine.ts + config.ts + adapter-refactor) uit v8.2-branch als gedrag-neutrale PR | ✓ |
| Wachten op v8.2-merge | Zero duplicatie, timeline onbekend (gegated op debiteuren-validatie) | |
| Interim zonder seam | Sales-only resolver statisch wiren; throwaway, ondergraaft STAGE2-01 | |

**User's choice:** Enabler-PR naar main
**Notes:** Scouting vond dat de RESL-03 seam al volledig gebouwd is op `origin/workspace/v8.2-resolution-recall` (Phase 90, 5/6, cutover HELD) — 39 ahead / 233 behind main.

| Option | Description | Selected |
|--------|-------------|----------|
| Seam dormant, sales eerste consumer | Debtor-worker behoudt statische import; laagste risico live debtor-pad | |
| Volledige RESL-03 incl. debtor-rewire | Beide swarms door één seam; vereist 90-06 equality dry-run + regressie-gate | |
| Jij beslist | Claude kiest tijdens planning | ✓ |

**User's choice:** Jij beslist (default-aanbeveling: dormant)

| Option | Description | Selected |
|--------|-------------|----------|
| Zelf, met notitie in v8.2 STATE | Operator is auteur van beide tracks; rebase-notitie achterlaten | ✓ |
| Eerst afstemmen met collega | Indien v8.2-workspace door ander actief gebruikt | |

**User's choice:** Zelf, met notitie in v8.2 STATE

---

## Sales resolution-lagen

| Option | Description | Selected |
|--------|-------------|----------|
| Offerte- + ordernummers | Nieuwe NXT-lookups, sluit aan op data (32% offerte-subjects) | ✓ (verbreed) |
| Eerst sender-only | Kleinere fase, lagere recall | |
| Jij beslist | | |

**User's choice:** Optie 1, maar verbreed — "we moeten op meer identifiers gaan zoeken"
**Notes:** Uitgewerkt naar data-gedreven identifier-discovery (corpus-mining, analoog aan intent-vocabulary-principe). CTO-input: postcode en andere identifiers, **multi-matchen om zekerheid te verhogen**; installatie-adressen heten in NXT **Sites**. Startset: offerte, order, factuur (lookup bestaat al), postcode/adres→Sites.

| Option | Description | Selected |
|--------|-------------|----------|
| Quoted-sender extractie als input | Own-tenant afzender → origineel adres uit quoted body → sender_match | ✓ |
| Forwards → unresolved | Extractie later; verliest ~kwart resolutie-kansen | |
| Jij beslist | | |

**User's choice:** Quoted-sender extractie

---

## NXT lookup-transport

| Option | Description | Selected |
|--------|-------------|----------|
| nxtRequest REST-proxy | Geen Zap per lookup-soort; prereq PR #63 merge + prod-deploy | ✓ |
| Zapier SQL (debtor-pad) | Bewezen, maar elke lookup = nieuwe Zap/proc | |
| Hybride | Bestaande Zaps as-is, nieuwe soorten via REST | |

**User's choice:** nxtRequest REST-proxy (bestaande debtor-lookups blijven as-is — D-11)

---

## Audit-target & surface

| Option | Description | Selected |
|--------|-------------|----------|
| Generieke tabel | Swarm-agnostische resolutie-tabel; elke volgende swarm hergebruikt | ✓ |
| Sales-eigen tabel | Spiegel van debtor.email_labels; derde swarm = derde tabel | |
| Jij beslist | | |

**User's choice:** Generieke tabel (migration + RLS + codegen)

---

## Todo-folding

- ✓ Gefold: `2026-06-04-sales-ingest-attachments-gap.md`, `2026-06-04-sales-ingest-sender-email-gap.md` (beide als in-fase prereq)
- ✗ Niet gefold: `2026-04-23-create-draft-idempotency-and-cleanup.md` — debtor-territorium; user merkte op dat het sales-analoog uiteindelijk een Stage 4 Handler wordt die een Outlook-draft maakt → deferred idea V11.0

## Claude's Discretion

- D-03: seam dormant vs volledige debtor-rewire in de enabler-PR
- D-08: thread_inheritance in iteratie 1
- D-13: Bulk Review Stage 2-tab wiring
- D-12 (deels): schema-plaatsing van de generieke resolutie-tabel

## Deferred Ideas

- Sales Stage 4 Handler: concept-draft in Outlook (V11.0), met idempotency-les uit de create-draft todo
