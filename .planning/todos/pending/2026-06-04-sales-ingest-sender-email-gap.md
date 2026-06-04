---
created: 2026-06-04T14:00:00.000Z
title: 28% van verkoop@ inbound mist sender_email (354/1.273) — blokkeert Stage 2 resolutie-denominator
area: sales-email
priority: phase-114-prereq
files:
  - web/lib (Graph delta-sync / sales ingest pad)
---

## Context

Corpus-analyse 2026-06-04: 354 van 1.273 inbound rows in `email_pipeline.emails` voor `verkoop@smeba.nl` hebben `sender_email=null` (`raw_json` is ook null op de gecheckte rows). Oorzaak onbekend — mogelijk een ingest-variant (delta-sync vs backfill) die afzender-velden niet meeneemt.

## Waarom dit een 114-prereq is

Stage 2 customer-resolution start bij de afzender. Met 28% null is elke resolutie-rate-meting (en de Wilson-CI promotion-gates later) vertekend: je weet niet of een miss "geen NXT-match" of "geen input" was.

## Acceptatie

- Root cause vastgesteld (welk ingest-pad schrijft rows zonder sender_email?).
- Fix vooruit (nieuwe mails altijd mét afzender) + besluit over backfill van de 354.
- Resolutie-denominator in 114-metingen expliciet gecorrigeerd voor dit gat zolang het bestaat.
