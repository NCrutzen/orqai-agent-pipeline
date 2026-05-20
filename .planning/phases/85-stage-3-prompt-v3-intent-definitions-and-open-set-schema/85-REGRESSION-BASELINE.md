# Phase 85 — Regression Baseline (Wave 0)

**Pulled:** 2026-05-20
**Source:** Supabase `public.coordinator_runs` ⋈ `email_pipeline.emails` — `ranked_intents->0->>'intent' = 'payment_dispute'`
**Window:** 2026-05-16..05-22 (±3d)
**Row count:** 12 (target: 12)

This is the V2 baseline. Plan 04 re-invokes the same 12 emails through the V3 agent and asserts **≤1 of 12** changes its ranked-top-1 closed-list intent (CONTEXT verification #4, P85-R6).

> **PII redaction:** subjects + body excerpts redacted (see 85-CORPUS.md for the rule set). Each excerpt ≤300 chars.

## Baseline Table

| # | email_id | created_at | subject (redacted) | sender_domain | V2 top-1 | conf | V2 top-1 reasoning (redacted, ≤120 chars) |
|---|---|---|---|---|---|---|---|
| 1 | `71bffe85-8f36-4348-99e3-e7c7859c76ba` | 2026-05-19T10:52:18.112705+00:00 | FW: Openstaande facturen: [INV-NN], [INV-NN], [INV-NN], [INV-NN] en [INV-NN] | sescom.eu | payment_dispute | high | Sender disputes 5 invoices citing non-receipt, unauthorized work, missing reports, and lack of approval. |
| 2 | `8fbd136a-9dd5-4be7-b42e-2064dbc7fed5` | 2026-05-19T11:05:53.649866+00:00 | 3105 - RETOUR Facturen [INV-NN] en [PHONE]) | heijmans.nl | payment_dispute | high | Customer rejects invoices due to incomplete purchase order number, requests correction before payment. |
| 3 | `bd873261-f470-4a9e-80a6-95b6cee22845` | 2026-05-19T11:34:44.872056+00:00 | Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur [INV-NN] | nehemint.nl | payment_dispute | high | Sender disputes invoice amount vs quote, details €26.23 overcharge with line-item breakdown. |
| 4 | `650cb167-4017-4b7f-90e6-fe6c9bef4f8e` | 2026-05-19T11:47:11.987101+00:00 | PO Number [INV-NN] // IBZ - SFG Hainaut Rue Verte 13 7000 MONS | ibz.be | payment_dispute | high | Sender contests invoice EUR 1,376.88 for early maintenance (8 months vs required 11), suspends payment pending justifica
[…truncated…] |
| 5 | `e9661de1-8d56-48ce-afcb-b23629cde7b2` | 2026-05-19T13:08:13.324333+00:00 | Re: Openstaande factuur bij Berki | huismantweewielers.nl | payment_dispute | high | Debtor disputes invoice [INV-NN], claims credit note [INV-NN] should offset it per prior agreement. |
| 6 | `2b9e861d-e225-4faf-b6d7-6adb7f5e479c` | 2026-05-19T13:10:45.480335+00:00 | Factuur gelieve aanpassen  | pmepensioenfonds.nl | payment_dispute | high | Sender disputes invoice quantity (11 fire extinguishers not received), requests correction before payment approval. |
| 7 | `16f7e893-6ac2-427f-92a5-27cc336a0b64` | 2026-05-20T08:06:33.367012+00:00 | 3310 \| Afgekeurde factuur [INV-NN] | p2p.basware.com | payment_dispute | high | BAM rejects invoice [INV-NN] due to missing order number; requests resubmission with correct data. |
| 8 | `7633a41d-9415-4814-9656-57d02bb5358d` | 2026-05-20T08:47:50.817774+00:00 | FW: DISPUUT factuur [INV-NN] ad € 44,3K: 588192 - Excluton Druten BV | smeba.nl | payment_dispute | high | Subject explicitly states 'DISPUUT factuur' with invoice reference and amount. |
| 9 | `58fa20d2-4b84-4ad8-964a-cc235f991070` | 2026-05-20T08:54:51.227624+00:00 | Re: Re: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur [INV-NN] | skynet.be | payment_dispute | high | Sender threatens payment withholding due to lack of response, escalation tone explicit. |
| 10 | `f457afbf-8a86-4a20-95d1-d69e0070463e` | 2026-05-20T09:07:33.800983+00:00 | RE: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur [INV-NN] | dvm-bv.nl | payment_dispute | high | Sender rejects invoice [INV-NN] due to missing ION number, requests corrected invoice. |
| 11 | `067428ad-b3a4-4475-9896-95bac10730bd` | 2026-05-20T10:03:08.074746+00:00 | FW: Invoice [INV-NN] | moyneroberts.com | payment_dispute | high | Sender challenges VAT calculation on invoice [INV-NN]; clear dispute. |
| 12 | `334ca0aa-a19f-4bde-a138-fab2261c3330` | 2026-05-20T11:57:40.007577+00:00 | Re: Openstaande facturen bij Berki - fs | bam.com | payment_dispute | medium | BAM auto-reply rejecting Berki's reminder email; implicitly disputes processing method, not payment itself. |

## Ranked Top-2 / Top-3 per row

| # | email_id | top-1 | top-2 | top-3 |
|---|---|---|---|---|
| 1 | `71bffe85-8f36-4348-99e3-e7c7859c76ba` | payment_dispute | copy_document_request | general_inquiry |
| 2 | `8fbd136a-9dd5-4be7-b42e-2064dbc7fed5` | payment_dispute | copy_document_request | — |
| 3 | `bd873261-f470-4a9e-80a6-95b6cee22845` | payment_dispute | — | — |
| 4 | `650cb167-4017-4b7f-90e6-fe6c9bef4f8e` | payment_dispute | contract_inquiry | — |
| 5 | `e9661de1-8d56-48ce-afcb-b23629cde7b2` | payment_dispute | credit_request | — |
| 6 | `2b9e861d-e225-4faf-b6d7-6adb7f5e479c` | payment_dispute | copy_document_request | — |
| 7 | `16f7e893-6ac2-427f-92a5-27cc336a0b64` | payment_dispute | — | — |
| 8 | `7633a41d-9415-4814-9656-57d02bb5358d` | payment_dispute | — | — |
| 9 | `58fa20d2-4b84-4ad8-964a-cc235f991070` | payment_dispute | general_inquiry | — |
| 10 | `f457afbf-8a86-4a20-95d1-d69e0070463e` | payment_dispute | — | — |
| 11 | `067428ad-b3a4-4475-9896-95bac10730bd` | payment_dispute | — | — |
| 12 | `334ca0aa-a19f-4bde-a138-fab2261c3330` | payment_dispute | general_inquiry | — |

## Redacted Body Excerpts (≤300 chars each)

### #1 — `71bffe85-8f36-4348-99e3-e7c7859c76ba`

- subject: FW: Openstaande facturen: [INV-NN], [INV-NN], [INV-NN], [INV-NN] en [INV-NN]
- sender_domain: sescom.eu
- mailbox: debiteuren@berki.nl

```
CAUTION: External Sender Goedemiddag Kirsten,

 

Allereerst mijn excuses voor het uitblijven van een reactie van mijn kant. Ik heb eindelijk even de tijd gevonden om na te gaan wat er met die onbetaalde facturen is gebeurd. Zie hieronder mijn reactie 

 

[INV-NN] - Ik heb deze factuur ondanks mijn
```

### #2 — `8fbd136a-9dd5-4be7-b42e-2064dbc7fed5`

- subject: 3105 - RETOUR Facturen [INV-NN] en [PHONE])
- sender_domain: heijmans.nl
- mailbox: administratie@fire-control.nl

```
CAUTION: External Sender 

 

*bij reactie op deze e-mail a.u.b. reageren via beantwoorden*

 

t.a.v. debiteuren administratie

 

Geachte lezer,

 

Hierbij retourneren wij bijgevoegde factuur. Wij kunnen deze factuur om de volgende reden(en) niet in behandeling nemen:

 

 

03 Het ve
```

### #3 — `bd873261-f470-4a9e-80a6-95b6cee22845`

- subject: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur [INV-NN]
- sender_domain: nehemint.nl
- mailbox: debiteuren@smeba.nl

```
CAUTION: External Sender Beste heer/ mevrouw, Bedankt voor de documenten. Vooraf aan de factuur hebben we een offerte ontvangen, zie bijlage. De offerte was voor een bedrag van € 331,74 excl. BTW. De Caution: External ([ADDR]) First-Time Sender Details Safe Spam Phish More... FAQ
```

### #4 — `650cb167-4017-4b7f-90e6-fe6c9bef4f8e`

- subject: PO Number [INV-NN] // IBZ - SFG Hainaut Rue Verte 13 7000 MONS
- sender_domain: ibz.be
- mailbox: debiteuren@smeba-fire.be

```
CAUTION: External Sender Mevrouw, Mijnheer, Recent hebt u aan onze administratie een bedrag van 1.376,88 EUR gefactureerd voor de huur en het onderhoud van onze brandblussers (Rue Verte 13 – 7000 MONS Caution: External ([ADDR]) First-Time Sender Details Safe Spam Phish
```

### #5 — `e9661de1-8d56-48ce-afcb-b23629cde7b2`

- subject: Re: Openstaande factuur bij Berki
- sender_domain: huismantweewielers.nl
- mailbox: debiteuren@berki.nl

```
CAUTION: External Sender Beste Kisrsten,

Jammer dat er na zoveel tijd weer over begonnen wordt.

Na de komst van Uw monteur hebben wij direct de klachten doorgegeven tel. + per mail ([PHONE]:21 [ADDR])

Er is toen afgesproken dat er een creditnota gemaakt zou worden o
```

### #6 — `2b9e861d-e225-4faf-b6d7-6adb7f5e479c`

- subject: Factuur gelieve aanpassen 
- sender_domain: pmepensioenfonds.nl
- mailbox: administratie@fire-control.nl

```
CAUTION: External Sender Geachte heer/mevrouw,

 

De factuur van Fire Control is niet correct. PME heeft geen 11 brandblussers afgenomen of geleverd gekregen.
Ik vermoed dat hier mogelijk verwarring is ontstaan tussen PWC en PME.

Graag dit aantal laten corrigeren voordat de factuur wordt goedgekeu
```

### #7 — `16f7e893-6ac2-427f-92a5-27cc336a0b64`

- subject: 3310 | Afgekeurde factuur [INV-NN]
- sender_domain: p2p.basware.com
- mailbox: debiteuren@berki.nl

```
CAUTION: External Sender Geachte heer/mevrouw,

Bijgaand ontvangt u factuur [INV-NN] retour (onderin deze mail vindt u een link naar de pdf van de factuur). Helaas kunnen wij deze niet verwerken in onze administratie omdat:

- Het ordernummer ontbreekt op de factuur. Het ordernummer is terug te vind
```

### #8 — `7633a41d-9415-4814-9656-57d02bb5358d`

- subject: FW: DISPUUT factuur [INV-NN] ad € 44,3K: 588192 - Excluton Druten BV
- sender_domain: smeba.nl
- mailbox: debiteuren@berki.nl

```
Van: Xander van Driel <[ADDR]> 
Verzonden: woensdag 20 mei 2026 10:42
Aan: Ad Marijnissen <[ADDR]>
Onderwerp: DISPUUT factuur [INV-NN] ad € 44,3K: 588192 - Excluton Druten BV

 

Hoi Ad,

 

Via de crediteurenadministratie van Excluton kwam ik bij Theo Janssen uit
```

### #9 — `58fa20d2-4b84-4ad8-964a-cc235f991070`

- subject: Re: Re: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur [INV-NN]
- sender_domain: skynet.be
- mailbox: debiteuren@smeba-fire.be

```
CAUTION: External Sender Beste, Weeral twee weken verder zonder reactie?! Graag dringend antwoord, anders gaat u akkoord dat we (voorlopig) niets betalen. Mvg Roger Van den houdt Verzonden met mijn gs External ([ADDR]) Graymail Spam Phish More... FAQ Protection by Q2Q
```

### #10 — `f457afbf-8a86-4a20-95d1-d69e0070463e`

- subject: RE: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur [INV-NN]
- sender_domain: dvm-bv.nl
- mailbox: debiteuren@smeba.nl

```
CAUTION: External Sender Beste leverancier, Bedankt voor factuur [INV-NN]. De desbetreffende factuur is niet voorzien van een ION nummer. Zonder het juiste ION nummer kunnen wij de factuur helaas niet Caution: External ([ADDR]) First-Time Sender Details Safe Spam Phish More...
```

### #11 — `067428ad-b3a4-4475-9896-95bac10730bd`

- subject: FW: Invoice [INV-NN]
- sender_domain: moyneroberts.com
- mailbox: administratie@fire-control.nl

```
Hallo, op factuur [INV-NN] lijkt het BTW-bedrag onjuist berekend. Kunnen jullie deze corrigeren?

 

Met vriendelijke groet,

[NAME]

Verzonden vanaf Outlook voor Mac
```

### #12 — `334ca0aa-a19f-4bde-a138-fab2261c3330`

- subject: Re: Openstaande facturen bij Berki - fs
- sender_domain: bam.com
- mailbox: debiteuren@berki.nl

```
CAUTION: External Sender L.S.,

De onderstaande mail hebben wij niet verwerkt, aangezien deze vermoedelijk geen (nieuwe) factuur betreft.

In het geval dat deze mail wel één of meerdere facturen bevat die nog niet bij BAM bekend zijn, deze graag opnieuw aanbieden met het onderwerp van de mail en de
```


## EMAIL_IDS — CSV block (paste into Plan 03/04 smoke script env)

```
71bffe85-8f36-4348-99e3-e7c7859c76ba,8fbd136a-9dd5-4be7-b42e-2064dbc7fed5,bd873261-f470-4a9e-80a6-95b6cee22845,650cb167-4017-4b7f-90e6-fe6c9bef4f8e,e9661de1-8d56-48ce-afcb-b23629cde7b2,2b9e861d-e225-4faf-b6d7-6adb7f5e479c,16f7e893-6ac2-427f-92a5-27cc336a0b64,7633a41d-9415-4814-9656-57d02bb5358d,58fa20d2-4b84-4ad8-964a-cc235f991070,f457afbf-8a86-4a20-95d1-d69e0070463e,067428ad-b3a4-4475-9896-95bac10730bd,334ca0aa-a19f-4bde-a138-fab2261c3330
```
