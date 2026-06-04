---
created: 2026-06-04T14:00:00.000Z
title: Sales-ingest legt attachment-info niet vast — has_attachments=false op alle 1.273 verkoop@ mails
area: sales-email
priority: phase-114-prereq
resolves_phase: 116
files:
  - web/lib (Graph delta-sync / sales ingest pad)
---

## Context

Corpus-analyse 2026-06-04 (re-sequencing besluit 114↔113): alle 1.273 inbound mails in `email_pipeline.emails` voor `verkoop@smeba.nl` hebben `has_attachments=false` en `raw_json=null`. De operator observeert juist dat deze mailbox relatief véél bijlagen bevat (offertes, tekeningen, PO's) — het signaal wordt dus niet gecaptured door de ingest, niet ontkracht door de data.

## Waarom dit een 114/113-prereq is

- Stage 2 (customer resolver): bijlagen bevatten vaak het hardste resolutie-signaal (PO/offertenummer op briefpapier).
- Stage 3 (intent seeding, STAGE3-02): "stuurt PO mee" vs "vraagt offerte aan" is een intent-onderscheidend kenmerk dat nu onzichtbaar is in de corpus.

## Acceptatie

- Ingest schrijft `has_attachments` (en bij voorkeur attachment-metadata: namen/types) voor nieuwe mails.
- Beslissen of backfill over de bestaande 1.273 nodig is (Graph message-id's zijn aanwezig in `source_id`).

## Status-update 2026-06-04 (na Phase 114)

- `has_attachments`-capture voor nieuwe mail is GEDAAN (Phase 114-03, D-14): `web/lib/outlook/client.ts` vraagt `hasAttachments` op, ingest-route schrijft het weg.
- Rest van de scope (attachment-metadata, content-extractie, backfill-besluit) is gepromoveerd naar **Phase 116: Attachment Ingest — uniform cross-swarm** (`resolves_phase: 116` hierboven). Uniformiteitseis: registry-configured, swarm-agnostisch — geen sales-only pad.
