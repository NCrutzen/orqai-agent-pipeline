---
phase: 87
type: incident-recovery-list
status: open
created: 2026-05-30
source_run: dd88887c-bbe2-4dd0-980d-518237fa1d7f (retro) + read-only V3 re-classification of live loopback archives
---

# Loopback false-archive recovery list

## What happened — and the 2026-05-30 correction

The Phase 84 `own_outbound_invoice_loopback` Stage 1 rule keys on the
**forwarder's** domain, so colleagues forwarding customer dunning/rejection/credit
mail into `debiteuren@` from own-domain mailboxes (`elger@smeba-fire.be`,
`crediteuren@smeba.nl`, `verkoop@…`, `order@smeba.nl`, …) were **classified as
noise (loopback)** and therefore never entered the Stage 3 actionable pipeline.

A read-only V3 re-classification of the **67 loopback classifications** since the
Phase 84 deploy (2026-05-20 → 2026-05-29) found **27 (40%) carried real actions**:
18 `payment_dispute`, 5 `credit_request`, 3 `peppol_request`, 1 `contract_inquiry`.

**CORRECTION (2026-05-30, verified via live Graph dry-run):** the earlier claim
that these were "archived as System Notification" was WRONG. The
`action=categorize_archive` Outlook side-effect only fires behind
`autoActionAllowed = isWhitelistMatch && auto_label_enabled`
(`classifier-screen-worker.ts:600`). The loopback rule is not whitelist-promoted,
so these went to the **bulk-review branch** (`status='predicted'`) with **no
Outlook action**. Live Graph state of all 27:
- **25 still in the Inbox** ("Postvak IN") — never archived, never labeled (0/27 had any category).
- **2 in Deleted Items** (`debiteuren@berki.nl`) — deleted by a *person* (the pipeline took no action), so likely already handled.

**Impact was contained by `triage_shadow_mode`.** The classification bug is real
and the fix (disable + registry-gate) is still important — had the swarm been in
auto-archive mode, these 27 WOULD have been hidden. But no actual mail loss
occurred: the actionable mail is still in the operators' inboxes.

## Recovery candidates (27)

| email_id | V3 intent | conf | sender | subject |
|----------|-----------|------|--------|---------|
| 1afe24d9-6700-4ba3-801f-063f4af1271b | payment_dispute | high | order@smeba.nl | FW: nieuwe factuur |
| 677f605e-7b3d-4757-9988-2e696b1d0acf | payment_dispute | high | order@smeba.nl | FW: factuur 17342345 |
| f0d8c1f4-8eda-4cd1-9836-9c868800fa90 | payment_dispute | high | crediteuren@smeba.nl | FW: Uw factuur is afgekeurd, factuurnummer 17342412 |
| cfc8fa29-8f06-45df-b12d-37999d574c93 | peppol_request | high | elger@smeba-fire.be | Fw: 530540 - Aanmaning |
| 2ea03bad-d975-4446-9a6c-0fbb91a6c474 | payment_dispute | high | elger@smeba-fire.be | Fw: SMEBA Rappel de paiement avec frais 530549 - 7 dagen TERMIJN |
| 0027dcfb-0b5e-4abd-b655-aa0f76927d88 | payment_dispute | high | elger@smeba-fire.be | Fw: SMEBA Rappel de paiement avec frais 530549 - 7 dagen TERMIJN |
| 67a5f883-693b-483b-995d-cb46703ebf17 | payment_dispute | high | elger@smeba-fire.be | FW: Contestation Facture n° 33050838 // Fedasil GLONS |
| d2fc1405-fead-4582-b1cd-9b33ed2b9f1e | credit_request | high | elger@smeba-fire.be | FW: riziv galillée facture client :520 007 |
| e0493e98-15c2-4bc4-bb18-40cf5f8c8fb3 | peppol_request | high | elger@smeba-fire.be | FW: Opgelet: nieuwe procedure fakturatie Kansspelcommissie |
| 1d233998-46b1-48b2-9be2-4e3ba833c18b | credit_request | high | elger@smeba-fire.be | FW: 528071 - HERINNERING |
| 760964f3-47da-4ec4-bec6-fc2b640359f9 | payment_dispute | high | elger@smeba-fire.be | FW: Jaarlijks onderhoud blusinstallatie serverlokaal |
| ddee6f6a-9b29-405c-b1b5-89662ff7a9b4 | payment_dispute | high | elger@smeba-fire.be | FW: Fw: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050459 |
| 95c4d3a6-248e-4704-b31a-ddb9fbc116f5 | payment_dispute | high | verkoop@fire-control.nl | FW: Bestelling 310181 / WO 5226.17658.306 |
| f7c8402e-3761-4e5d-8c90-910e835c83b4 | payment_dispute | medium | melissa.vandenbogaart@fire-control.nl | Factuur 25123030 |
| b3a04cb1-5de3-4c38-a351-f7f1c65afdf5 | credit_request | high | verkoop@smeba.nl | FW: Betreft: [CASE:761006] RE: Documenten n.a.v. uitgevoerde werkzaamh |
| 13a0b722-ddf8-4d7f-841a-778e978bc19d | payment_dispute | high | melissa.vandenbogaart@fire-control.nl | FW: Contractoverleg ISS-FireControl t.a.v. evaluatie&toekomst |
| d073e9a4-657f-4074-b72e-d0326df355f2 | peppol_request | high | crediteuren@smeba.nl | FW: Facturen PEPPOL |
| 2a2e7b20-e0d4-4a47-bbb7-ea677edc3889 | payment_dispute | high | verkoop@fire-control.nl | FW: Stationsplein 14-22 |
| 88e99229-7688-42ef-92ef-8831d88b7376 | contract_inquiry | high | elger@smeba-fire.be | Re: SMEBA Rappel de paiement avec frais 530549 - 7 dagen TERMIJN |
| 03e4031d-a021-4482-9efd-f11e594dbecc | payment_dispute | high | mebo@smeba.nl | FW: facturen pending receipt |
| a378d042-b507-4c34-bd1d-1c7810d6aeec | payment_dispute | high | crediteuren@smeba.nl | FW: Dubbele kredietnota voor factuur 32050047 dd.01-01-2025 |
| 8ab1f603-b1fa-4da6-ae23-9d7e7c2aca81 | credit_request | high | verkoop@smeba.nl | FW: [CASE:760863] Opdracht tot uitvoering Referentie J.H.van Kuijk |
| ea9c2dae-1de6-4eab-b857-add1f85c59ed | payment_dispute | high | crediteuren@smeba.nl | FW: 3310 \| Afgekeurde factuur 17008061 |
| ce45a6b0-fc34-4b4f-bbc3-1cd2d3697e79 | payment_dispute | high | elger@smeba-fire.be | Fw: factuur 33050712 |
| 32fb8ec5-aab7-4af3-86b5-63529e65660f | credit_request | high | verkoop@smeba.nl | FW: [CASE:771376] FW: Factuur 17320443 >>> crediteren en opnieuw indienen |
| d50dc9ec-5a5d-409f-9e0c-14ffe7a474fb | payment_dispute | high | xadr@smeba.nl | FW: Fw: [External] 591155 - 7 dagen TERMIJN |
| 65f9957f-1e0a-4fda-a2a8-ef3558f20461 | payment_dispute | high | xadr@smeba.nl | FW: FW: Openstaande facturen: 17000057, 17002109, 17003177, 17004662 |

Full machine output (all 67, incl. non-actionable): was at `/tmp/loopback-measurement.json` (ephemeral).

## Recovery status (2026-05-30)

Given the correction above, there is **no Outlook un-archive to perform** — the
25 actionable emails are already in the operators' inboxes (the 2 berki ones were
human-deleted; restore from Deleted Items only if the team wants them back —
operator's call, not auto-restored since a person deleted them deliberately).

Optional, low-priority: re-dispatch the 25 through the now-fixed pipeline so they
also appear in the Bulk Review **actionable** lane (instead of the noise lane).
Low value while the swarm is in `triage_shadow_mode` (Bulk Review is observe-only).
Defer to when graduated automation lands. No urgent action required.
