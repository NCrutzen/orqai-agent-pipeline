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

## Smoke harness JSON (Wave 0 hand-off → phase85-smoke-v3.ts --regression)

```json
[
  {
    "email_id": "71bffe85-8f36-4348-99e3-e7c7859c76ba",
    "subject": "FW: Openstaande facturen: 17000057, 17002109, 17003177, 17004662 en 17007400",
    "body_text": "CAUTION: External Sender Goedemiddag Kirsten,\n\n \n\nAllereerst mijn excuses voor het uitblijven van een reactie van mijn kant. Ik heb eindelijk even de tijd gevonden om na te gaan wat er met die onbetaalde facturen is gebeurd. Zie hieronder mijn reactie \n\n \n\n17002109 - Ik heb deze factuur ondanks mijn verzoeken niet van u ontvangen. De e-mail in de bijlage bevat mijn correspondentie met jullie. De werkzaamheden zijn uitgevoerd. Ik verzoek u alleen om een factuur met één btw-tarief van 21% te sturen. Ons systeem accepteert geen dubbele btw.17004662 - Deze werkzaamheden zijn zonder onze toestemming uitgevoerd. Berki is verzocht om een inventarisatie te maken en een offerte voor te leggen. De factuur is nooit aan mij geleverd. Naar welk e-mailadres is deze gestuurd? Zie de bijgevoegde e-mail. De enige e-mail was van 3 september, met daarin de datum van het bezoek van de technicus voor de inventarisatie en controle. 17003177 - Deze werkzaamheden zijn voor ons uitgevoerd. Tot op heden heb ik nog geen rapport van jullie opname, zoals gevraagd. In mijn e-mail heb ik gevraagd om een overzicht en een controle van de hoeveelheden van de materialen. Deze factuur is niet bij mij bezorgd. 17000057 - is niet naar mij of naar mijn collega verzonden. Kunt u aangeven waar deze werkzaamheden zijn goedgekeurd voor uitvoering? De factuur dateert van maart 2025.17007400 - Kunt u aangeven waar deze werkzaamheden zijn goedgekeurd voor uitvoering? Wie heeft deze werkzaamheden opdracht gegeven en heeft u daarvoor een referentienummer? \n\n \n\nIk hoop dat bovenstaande uitleg helpt. Alle facturen die door u zijn verzonden, worden tot het moment van opheldering tijdelijk opgeschort. Ik verzoek u om een terugkoppeling.\n\n \n\n \n\nRadosław Kowalik \n\nMaintenance coordinator\n\n \n\nM +31 630 613 332\nM +48 721 333 243\nE radoslaw.kowalik@sescom.eu\n\nSescom S.A.\nSescom GmbH\nExcellent Business Center\nEuropaplatz 2\nD-10557 Berlin\n \nF +48 58 761 29 61\n\nwww.sescom.eu\n\nIntegrated FM for European Retail\n\nsescom.eu\n\nNIP: 9571006288, REGON: 220679145, KRS: 0000314588 Sąd Rejonowy Gdańsk-Północ w Gdańsku, VII Wydział Gospodarczy Kapitał zakładowy: 2.280.524,00 PLN opłacony w całości\n\n \n\nFrom: Berki Brandbeveiliging <debiteuren@berki.nl> \nSent: Friday, April 17, 2026 2:40 PM\nTo: office_nl@sescom.euen; DL- facturatie_nl@sescom.eu <facturatie_nl@sescom.eu>\nSubject: Openstaande facturen: 17000057, 17002109, 17003177, 17004662 en 17007400\n\n \n\nGeachte heer/mevrouw,\n\nZojuist heb ik geprobeerd u telefonisch te bereiken met betrekking tot uw openstaande facturen bij Berki Brandbeveiliging B.V.\nGraag kom ik met u in contact om de status van deze openstaande posten te bespreken.\n\nMochten deze facturen bij u niet bekend zijn, dan verwijs ik u graag naar de bijlage.\nMomenteel staat er een bedrag van € 2.313,16 open. Wij zien de betaling hiervan graag tegemoet.\n\nIndien de facturen reeds zijn voldaan of indien u nog vragen heeft, vernemen wij dit graag.\nWij helpen u uiteraard graag verder.\n\nMet vriendelijke groet,\nKirsten \nDebiteurenbeheer\nGelieve deze lijn niet te verwijderen: bt-collections-8a2e96dce9589b24b76717b1b699abdb-000016007323",
    "mailbox": "debiteuren@berki.nl",
    "entity": "berki",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "8fbd136a-9dd5-4be7-b42e-2064dbc7fed5",
    "subject": "3105 - RETOUR Facturen 25122672 en 25122695 (307629)",
    "body_text": "CAUTION: External Sender  \n\n \n\n*bij reactie op deze e-mail a.u.b. reageren via beantwoorden*\n\n \n\nt.a.v. debiteuren administratie\n\n \n\nGeachte lezer,\n\n \n\nHierbij retourneren wij bijgevoegde factuur. Wij kunnen deze factuur om de volgende reden(en) niet in behandeling nemen:\n\n \n\n \n\n03           Het  vermelde inkoopopdracht nummer op de facturen is incompleet; Deze hoort uit 10 cijfers te bestaan ipv 9 cijfers.\n\n               Graag het juiste nummer opvragen en vermelden.\n\n \n\nVoor bovenstaande zaken verzoeken wij u de u verstrekte opdracht te raadplegen of contact op te nemen met uw opdrachtgever.\n\n \n\nIndien u een nieuwe factuur stuurt verzoeken wij u de door Heijmans retour gestuurde factuur intern te crediteren.\n\n \n\n \n\nMet vriendelijke groet,\n\n \n\nAnnemieke Ouwens\n\n \n\nHeijmans Nederland B.V.\n\nShared Service Center\n\nCrediteurenadministratie\n\nE retourenssc@heijmans.nl \nW www.heijmans.nl \n\n \n\n \n\nU kunt nu zelf de status van uw openstaande facturen inzien, als u naar deze link gaat: Main (heijmans.com)\n\n \n\n \n\n \n\n \n\n \n\n \n\n---\nDit bericht is uitsluitend bestemd voor de geadresseerde. Het bericht kan vertrouwelijke informatie bevatten. Als u dit bericht per abuis hebt ontvangen, wordt u verzocht het te vernietigen en de afzender te informeren.\n\nThis email is only meant for the intended recipient. This email may contain confidential information. If you have received this email in error please delete it and notify the sender immediately.",
    "mailbox": "administratie@fire-control.nl",
    "entity": "fire-control",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "bd873261-f470-4a9e-80a6-95b6cee22845",
    "subject": "Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17342022",
    "body_text": "CAUTION: External Sender Beste heer/ mevrouw, Bedankt voor de documenten. Vooraf aan de factuur hebben we een offerte ontvangen, zie bijlage. De offerte was voor een bedrag van € 331,74 excl. BTW. De  Caution: External (jam@nehemint.nl) First-Time Sender   Details    Safe  Spam  Phish  More...  FAQ  Protection by Q2Q \nCAUTION: External Sender Beste heer/ mevrouw,\nBedankt voor de documenten.\nVooraf aan de factuur hebben we een offerte ontvangen, zie bijlage.De offerte was voor een bedrag van € 331,74 excl. BTW.De factuur heeft een bedrag van € 357,97 excl. BTW.\nHaspelkern slang aansluit seal € 5,37 staat niet genoteerd in de offerteFlow- en statische drukmeting € 12,91 offerte en in factuur € 23,19Plaatsen/vervangen van blusapparatuur € 12,68 offerte en in factuur 21,13Beproevingsetiket conform norm/wet € 2,13 1x offerte en in 2x factuur \nVolgens de offerte is een bedrag van € 26,23 meer gefactureerd.\nGraag zouden we informatie hierover willen ontvangen.\n\nAlvast bedankt. \nMet vriendelijke groet,Jolanda Amazu\n\n Nehem InternationalZandvoortselaan 742106 CR HeemstedeThe Netherlands Jolanda Amazu E-mail: jam@nehemint.nlTel: +31 23 543 1750\n\nVan: debiteuren@smeba.nl <debiteuren@smeba.nl>\nVerzonden: Dinsdag, 19 Mei, 2026 12:00\nAan: jam@nehemint.nl <jam@nehemint.nl>\nOnderwerp: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17342022 \nGeachte heer/mevrouw,Hierbij ontvangt u alle gerelateerde documenten n.a.v. factuurnummer: 17342022Met vriendelijke groet,Smeba Brandbeveiliging BVdebiteuren@smeba.nlRemote BHV met Thuis Competent BoxOefenmaterialen thuis, online skills-checkBHV opleiding €125,-Kies jouw BHVLosse herhaling vanaf € 69,99Beoordeeld door instructeur  •  persoonlijke feedbacksmeba.nl\nKvK: 10019090Bijsterhuizen 2028\n6604 LJ Wijchen024-3775458\ndebiteuren@smeba.nl",
    "mailbox": "debiteuren@smeba.nl",
    "entity": "smeba",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "650cb167-4017-4b7f-90e6-fe6c9bef4f8e",
    "subject": "PO Number 33050631 // IBZ - SFG Hainaut Rue Verte 13 7000 MONS",
    "body_text": "CAUTION: External Sender Mevrouw, Mijnheer, Recent hebt u aan onze administratie een bedrag van 1.376,88 EUR gefactureerd voor de huur en het onderhoud van onze brandblussers (Rue Verte 13 – 7000 MONS  Caution: External (emmanuel.vancoppenolle@ibz.be) First-Time Sender   Details    Safe  Spam  Phish  More...  FAQ  Protection by Q2Q \nCAUTION: External Sender \nMevrouw, Mijnheer,Recent hebt u aan onze administratie een bedrag van 1.376,88 EUR gefactureerd voor de huur en het onderhoud van onze brandblussers (Rue Verte 13 – 7000 MONS).Uw factuur vindt u in bijlage 1 ter referentie.Het bestek FORCMS S&L/AO/427/2015, dat behoudens vergissing de voorwaarden vastlegt van de overheidsopdracht die aan u werd gegund, bepaalt het volgende:\". Periodieke controle en onderhoud\nAlle toestellen worden minstens eenmaal per jaar onderhouden en gecontroleerd, met inbegrip\nvan de aanduiding op het toestel van de datum in kwestie (zie hiervoor de niet-limitatieve lijsten\nvan punt 4.1 tot 4.3 van deel E. Technische voorschriften hieronder voor de controle per type\nbrandblusser).\nAan het begin van de opdracht zal de opdrachtnemer, voor de brandblussers die reeds toebehoren\naan de FOD Financiën, de bijgewerkte inventaris van de gebouwen in kwestie hebben ontvangen\nen contact moeten opnemen met de leidend ambtenaar of zijn afgevaardigde van elk gebouw om\neen onderhoud te plannen. Dit onderhoud zal vervolgens jaarlijks plaatsvinden.\nDe aanbestedende overheid vestigt de aandacht van de opdrachtnemer op het feit dat, bij een\nverhuis, de brandblussers door de opdrachtnemer gedemonteerd moeten worden en geïnstalleerd\nen gecontroleerd moeten worden in het nieuwe gebouw.\nDe controle vindt minimaal 11 en maximaal 13 maanden na de vorige controle (of de eerste\nplaatsing) plaats. Na iedere controle moet een gedetailleerd overzicht van alle uitgevoerde werken\nen gebruikte materialen worden opgesteld, dat wordt bezorgd aan de vertegenwoordiger van de\nleidend ambtenaar of zijn afgevaardigde.\nHet gaat om een omniumonderhoud, dit wil zeggen dat de opdrachtnemer alle\nonderhoudshandelingen en nieuwe tests uitvoert.\nTijdens het onderhoud moeten de CO2-blussers worden getest zoals voorzien door de wet.\"Dit document vindt u terug in bijlage 2.In 2025 werd het onderhoud van onze brandblussers uitgevoerd op 14 juli.In 2026 hebt u op eigen initiatief een nieuw onderhoud uitgevoerd op 18 maart.Wij bevinden ons dus ruimschoots onder de minimumtermijn van 11 maanden die twee onderhoudsinterventies dient te scheiden.Dit vervroegde onderhoud en de bijhorende facturatie zijn duidelijk nadelig voor onze administratie.Mag ik u dan ook verzoeken uw vroegtijdige interventie te verantwoorden in het licht van de regels opgelegd door het bestek?De betaling van de factuur wordt in afwachting opgeschort.Mevrouw LEYS, van de dienst Coördinatie en Expertise Overheidsopdrachten van de FOD Binnenlandse Zaken, staat in kopie ter informatie.In afwachting van uw antwoord, verblijf ik,\nmet de meeste hoogachting.\n\n---------------------------\nMadame, Monsieur,\n\nVous avez récemment facturé à notre administration un montant de 1.376,88 eur au titre de la location et de l'entretien de nos extincteurs (Rue Verte 13 - 7000 MONS).\nVotre facture est jointe en annexe 1 pour votre facilité.\nLe cahier des charges FORCMS S&L/AO/427/2015 définissant, sauf erreur, les conditions du marché public qui vous a été attribué, prévoit ceci :  \n\n\". Periodieke controle en onderhoudAlle toestellen worden minstens eenmaal per jaar onderhouden en gecontroleerd, met inbegripvan de aanduiding op het toestel van de datum in kwestie (zie hiervoor de niet-limitatieve lijstenvan punt 4.1 tot 4.3 van deel E. Technische voorschriften hieronder voor de controle per typebrandblusser).Aan het begin van de opdracht zal de opdrachtnemer, voor de brandblussers die reeds toebehorenaan de FOD Financiën, de bijgewerkte inventaris van de gebouwen in kwestie hebben ontvangenen contact moeten opnemen met de leidend ambtenaar of zijn afgevaardigde van elk gebouw omeen onderhoud te plannen. Dit onderhoud zal vervolgens jaarlijks plaatsvinden.De aanbestedende overheid vestigt de aandacht van de opdrachtnemer op het feit dat, bij eenverhuis, de brandblussers door de opdrachtnemer gedemonteerd moeten worden en geïnstalleerden gecontroleerd moeten worden in het nieuwe gebouw.De controle vindt minimaal 11 en maximaal 13 maanden na de vorige controle (of de eersteplaatsing) plaats. Na iedere controle moet een gedetailleerd overzicht van alle uitgevoerde werkenen gebruikte materialen worden opgesteld, dat wordt bezorgd aan de vertegenwoordiger van deleidend ambtenaar of zijn afgevaardigde.Het gaat om een omniumonderhoud, dit wil zeggen dat de opdrachtnemer alleonderhoudshandelingen en nieuwe tests uitvoert.Tijdens het onderhoud moeten de CO2-blussers worden getest zoals voorzien door de wet.\"\n\nCe document est joint en annexe 2\nEn 2025, l'entretien de nos extincteurs a été effectué le 14 juillet.\nEn 2026, vous avez d'initiative effectué un nouvel entretien le 18 mars.\nNous sommes donc largement en dessous du délai minimum de 11 mois devant séparer deux interventions de maintenance.\nCette maintenance avancée et sa tarification sont clairement préjudiciables à notre administration.\nPuis-je vous inviter, dès lors, à justifier votre intervention précoce au regard des règles imposées par le cahier des charges ? \nLe paiement de la facture est tenu en suspens dans l'intervalle.\nMadame LEYS, du service de coordination et d'expertise des achats du SPF intérieur, nous lit en copie pour sa parfaite information.\nDans l'attente du plaisir de vous lire en retour, je vous prie d'agréer, Madame, Monsieur, l'assurance de ma considération distinguée.\n\n \nEmmanuel Vancoppenolle\nDirecteur f.f. \n\n 065/396.432 emmanuel.vancoppenolle@ibz.be\nFOD Binnenlandse Zaken | SPF Intérieur \nGouvernement Provincial du Hainaut \nRue Verte 13 \n7000 MONS",
    "mailbox": "debiteuren@smeba-fire.be",
    "entity": "smeba-fire",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "e9661de1-8d56-48ce-afcb-b23629cde7b2",
    "subject": "Re: Openstaande factuur bij Berki",
    "body_text": "CAUTION: External Sender Beste Kisrsten,\n\nJammer dat er na zoveel tijd weer over begonnen wordt.\n\nNa de komst van Uw monteur hebben wij direct de klachten doorgegeven tel. + per mail (31-03-2025  11:21  richard@huismantweewielers.nl)\n\nEr is toen afgesproken dat er een creditnota gemaakt zou worden omdat wij zeer ontevreden waren en klachten niet opgelost waren. Daarmee zou alles vervallen en hoeft er niets meer betaald te worden.\n\nVervolgens wordt er weer een andere factuur gestuurd, die wij mochten negeren (telefonische besproken) en dan wordt vervolgens op 23-5-2025 nog een mail gestuurd voor een offerte voor werkzaamheden die gepland waren in Febr. 2025.\n\nErg vreemd is dit, ik denk dat het verstandig is om even contact op te nemen met uw directe collega's, zoals Guus de Swart en J Smid over dit voorval.\n\nVind het nogal onprofessioneel overkomen dit.\n\nMet vriendelijke groet,\n\nEveline de Grood\n\nBerki Brandbeveiliging schreef op 19-05-2026 14:00:\n\nGoedemiddag Eveline,\n\nDank voor uw bericht en hopelijk maakt u het goed.\nWat u stelt klopt echter dient u de correcte factuur 17000228 nog wel te voldoen.\nHet gedane werk, waarvoor is afgetekend vind u in de bijlage terug.\n\nWij zien dan ook graag de betaling tegemoet.\nMet vriendelijke groet,\nKirsten\nDebiteurenbeheer\nGelieve deze lijn niet te verwijderen: bt-collections-8a2e96dce9589b24b76717b1b699abdb-000016003885 Van: <info@huismantweewielers.nl>Ontvangen op: 2026-05-01 16:29:35Aan: Berki Brandbeveiliging <debiteuren@berki.nl>Onderwerp: Re: Openstaande factuur bij BerkiHallo Kirsten,\n\nIn de bijlage de creditnota 17000227\n\nDe factuur van u en deze creditnota zouden tegen elkaar weg vallen.\n\nMet vriendelijke groet,\n\nEveline\n\nBerki Brandbeveiliging schreef op 01-05-2026 13:50:\n\nGeachte heer/mevrouw,\n\nZojuist heb ik geprobeerd u telefonisch te bereiken met betrekking tot uw openstaande factuur bij Berki Brandbeveiliging BV.\nGraag kom ik met u in contact om de status van deze openstaande post te bespreken.\n\nMocht deze factuur bij u niet bekend zijn, dan verwijs ik u graag naar de bijlage.\nMomenteel staat er een bedrag van € 808,17 open. Wij zien de betaling hiervan graag tegemoet.\n\nIndien de factuur reeds is voldaan of indien u nog vragen heeft, vernemen wij dit graag.\nWij helpen u uiteraard graag verder.\n\nMet vriendelijke groet,\nKirsten\nDebiteurenbeheer \nGelieve deze lijn niet te verwijderen: bt-collections-8a2e96dce9589b24b76717b1b699abdb-000016003885",
    "mailbox": "debiteuren@berki.nl",
    "entity": "berki",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "2b9e861d-e225-4faf-b6d7-6adb7f5e479c",
    "subject": "Factuur gelieve aanpassen ",
    "body_text": "CAUTION: External Sender Geachte heer/mevrouw,\n\n \n\nDe factuur van Fire Control is niet correct. PME heeft geen 11 brandblussers afgenomen of geleverd gekregen.\nIk vermoed dat hier mogelijk verwarring is ontstaan tussen PWC en PME.\n\nGraag dit aantal laten corrigeren voordat de factuur wordt goedgekeurd voor betaling. Tevens verzoek ik u contact met mij op te nemen om dit op te lossen. Pls check offerte en de werkbon en match deze met de factuur.\n\n \n\nMet vriendelijke groet,\n\n \n\nFrank Balstra\n\nfrank.balstra@pmepensioenfonds.nl | +31 6 83 63 14 56 | +31 85 049 97 89 \n\nJ.P. Coenstraat 7-10, 2595 WP Den Haag | www.pmepensioen.nl\n\n \n\n \n\nDe informatie in deze e-mail kan vertrouwelijk zijn en is uitsluitend bestemd voor de geadresseerde. Als u onterecht een bericht ontvangt, vragen wij u om de inhoud niet te gebruiken en de afzender direct te informeren door het bericht te retourneren.\n\n \n\nVan: Office Management <officemanagement@pmepensioenfonds.nl> \nVerzonden: dinsdag 19 mei 2026 14:45\nAan: Frank Balstra <frank.balstra@pmepensioenfonds.nl>\nCC: Office Management <officemanagement@pmepensioenfonds.nl>\nOnderwerp: FW: Factuur check Fire Control\n\n \n\nFrank,\n\n \n\nVorige week heb ik onderstaand bericht gestuurd\n\nKun je mogelijk in de loop van deze week doorgeven of we de factuur betaalbaar kunnen stellen?\n\nDank je wel weer.\n\n \n\nMet vriendelijke groet,\n\n \n\nMirella Lapré\nMedewerker officemanagement\n\nofficemanagement@pmepensioenfonds.nl | +31 611266531 | secretariaat +31 85 049 97 89 | werkdagen ma-di-do\n\nJ.P. Coenstraat 7-10, 2595 WP Den Haag | www.pmepensioen.nl\n\n \n\nVan: Office Management \nVerzonden: woensdag 13 mei 2026 11:36\nAan: Frank Balstra <frank.balstra@pmepensioenfonds.nl>\nCC: Office Management <officemanagement@pmepensioenfonds.nl>\nOnderwerp: Factuur check Fire Control\n\n \n\nBeste Frank,\n\nWil jij ajb kijken naar de factuur van Fire Control en aangeven of  we deze kunnen goedkeuren voor betaling?\n\nDuidelijker kan ik het echter niet weergeven. Als je het onvoldoende kunt lezen, kun je even meekijken als je weer op kantoor bent?!\n\nDank je wel.\n\n \n\n \n\nMet vriendelijke groet,\n\n \n\nMirella Lapré\nMedewerker officemanagement\n\nofficemanagement@pmepensioenfonds.nl | +31 611266531 | secretariaat +31 85 049 97 89 | werkdagen ma-di-do-vr\n\nJ.P. Coenstraat 7-10, 2595 WP Den Haag | www.pmepensioen.nl",
    "mailbox": "administratie@fire-control.nl",
    "entity": "fire-control",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "16f7e893-6ac2-427f-92a5-27cc336a0b64",
    "subject": "3310 | Afgekeurde factuur 17008384",
    "body_text": "CAUTION: External Sender Geachte heer/mevrouw,\n\nBijgaand ontvangt u factuur 17008384 retour (onderin deze mail vindt u een link naar de pdf van de factuur). Helaas kunnen wij deze niet verwerken in onze administratie omdat:\n\n- Het ordernummer ontbreekt op de factuur. Het ordernummer is terug te vinden op de inkoopopdracht.\n\nVoor het opvragen van dit nummer kunt u contact opnemen met uw besteller binnen BAM.\n\nWij verzoeken u de factuur opnieuw in te dienen met de juiste gegevens, digitaal in PDF formaat. \nVoor het juiste emailadres verwijzen wij u naar de website: \nDigifact \nLet u erop dat het PDF bestand maar 1 factuur incl. bijlagen mag bevatten.\nIndien u al XML facturen aanlevert, gaarne deze methode handhaven.\nIndien u over de mogelijkheid beschikt om uw facturen in XML formaat aan te gaan leveren, dan verzoeken wij u contact met ons op te nemen.\n\nMet vriendelijke groet,\n\nBAM Nederland B.V.\nRunnenburg 9, 3981 AZ Bunnik | Postbus 20, 3980 CA Bunnik\nT +31 88 550 07 50 | E bfs.crediteuren@bam.com | W www.bam.com\n\nWij zijn telefonisch bereikbaar op werkdagen van 8.30 uur tot 16.30 uur.\nU kunt de status van uw facturen opvragen via de BAM portal: http://statusinvoices.bam.com\n\nInvoice 17008384.pdf",
    "mailbox": "debiteuren@berki.nl",
    "entity": "berki",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "7633a41d-9415-4814-9656-57d02bb5358d",
    "subject": "FW: DISPUUT factuur 17006537 ad € 44,3K: 588192 - Excluton Druten BV",
    "body_text": "Van: Xander van Driel <xadr@smeba.nl> \nVerzonden: woensdag 20 mei 2026 10:42\nAan: Ad Marijnissen <ad.marijnissen.sb@moyneroberts.com>\nOnderwerp: DISPUUT factuur 17006537 ad € 44,3K: 588192 - Excluton Druten BV\n\n \n\nHoi Ad,\n\n \n\nVia de crediteurenadministratie van Excluton kwam ik bij Theo Janssen uit over bijgaande factuur.\n\nHij zegt hier eerder contact over te hebben gehad met ons, omdat onze kosten veel hoger waren dan gebruikelijk.\n\n \n\nWat hij zich kan herinneren is dat er verkeerde artikelnummers waren gebruikt. Hij wacht op onze correctie.\n\nAls ik kijk naar bijgaande werkbon en factuur, zie ik niet wat er verkeerd is gegaan.\n\n \n\nAnja en Johan hebben eerder aangegeven dat jij hier mogelijk meer van weet. Vandaar dat ik jou nu bericht.\n\nIs dat zo? En zo ja, kan je please helpen met de juiste correctie?\n\n \n\nGr.,\n\nXander\n\n \n\nPS: Theo Janssen is bereikbaar via 06 51463277 en t.janssen@excluton.nl\n\n \n\n \n\nVan: Berki Brandbeveiliging <debiteuren@berki.nl> \nVerzonden: dinsdag 19 mei 2026 4:05\nAan: Xander van Driel <xadr@smeba.nl>\nOnderwerp: Fwd: RE: 588192 - VERZOEK TOT BETALING\n\n \n\n \n\nCAUTION: External Sender \n\nbellen voor reden niet akkoord\n\nGelieve deze lijn niet te verwijderen: bt-collections-8a2e96dce9589b24b76717b1b699abdb-000016447762 \n\nVan: Administratie‎ <administratie@excluton.nl>\n\nOntvangen op: 2026-03-04 07:58:11\n\nAan: Berki Brandbeveiliging BV <debiteuren@berki.nl>\n\nOnderwerp: RE: 588192 - VERZOEK TOT BETALING\n\nBeste team debiteuren,\n\nFactuurnummer 17006537 is niet akkoord.\n\nMet vriendelijke groet,\n\nRoger Peters \n\n \n\nExcluton BV\n\nWaalbandijk 155\n\n6651KD  DRUTEN\n\nBTW nr.: NL861669757B01\n\nKvK nr.: 80428517\n\nT  : +31 (0)487 – 58 03 87\n\nF  : +31 (0)487 – 51 68 26          \n\nMail : r.peters@excluton.nl  \n\nSite  : www.excluton.nl\n\n----------------------------------- DISCLAIMER ------------------------------------\n\nDit e-mail bericht is vertrouwelijk. De informatie verzonden met dit e-mail bericht is uitsluitend bestemd voor de geadresseerde. Openbaarmaking, vermenigvuldiging, verspreiding en/of verstrekking aan derden is niet toegestaan. Gebruik van deze informatie door anderen dan de geadresseerde is verboden. U wordt verzocht bij onjuiste adressering de afzender direct te informeren door het bericht te retourneren zonder de inhoud van de e-mail te kopiëren, door te zenden of op enige andere wijze te openbaren of te gebruiken. Afzender is niet aansprakelijk voor welke schade dan ook als gevolg van communicatie per e-mail en verzending van documenten en gegevens.\n\n \n\nThis e-mail is confidential. The information sent by means of this e-mail message is intended only for the use of the addressee. Publication, duplication, distribution and/or forwarding to third parties of this message, as well as use of the information by other persons than the intended recipient, is strictly prohibited. If you have received this communication in error, please notify the sender immediately by returning it without copying, forwarding, disclosing or using it in any other way. Sender will not be liable for any damage relating to communication by e-mail or the sending of data and documents.\n\n \n\nP   save a tree....don't print this mail unless you really need to\n\nVan: Berki Brandbeveiliging BV <debiteuren@berki.nl>\nVerzonden: di 3 maart 2026 17:13\nAan: Administratie‎ <administratie@excluton.nl>\nOnderwerp: 588192 - VERZOEK TOT BETALING\n\nKlantnummer: 588192\n\nDatum: 03-03-2026\n\nOnderwerp:  588192 - VERZOEK TOT BETALING\n\nGeachte relatie,\n\nBij controle van onze administratie is gebleken dat onderstaande factuur/ facturen nog niet zijn voldaan. \nWij verzoeken u om binnen 2 werkdagen tot betaling van de vervallen factuur/ facturen over te gaan. \n\n \n\nDocument \n\nDebet \n\nCredit \n\nDatum \n\nVervaldag \n\nDV(*) \n\n17006536\n\n215,20 EUR\n\n-\n\n23-01-2026\n\n22-02-2026\n\n9\n\n17006537\n\n44.311,79 EUR\n\n-\n\n23-01-2026\n\n22-02-2026\n\n9\n\nTotaal: 44.526,99 EUR\n\n(*) Dagen Vervallen\n\nAls u klikt op het blauwe document nummer [factuur] dan wordt dit document automatisch geopend waarna deze te downloaden is.\n\nMocht u hierover nog vragen hebben, gelieve contact op te nemen met onze debiteurenadministratie op telefoonnummer 024-6411066.\n\nMet vriendelijke groet,\nBerki Brandbeveiliging BV\n\nTeam Debiteuren\n\nOnderdeel van de Moyne Roberts Group\nSMEBA Brandbeveiliging BV / SMEBA Fire BV / Moyne Roberts Cavan / APEX Fire LTD/ Walker Fire Preston\nOp al onze leveringen en diensten zijn onze algemene voorwaarden van toepassing. Deze voorwaarden zijn vrij verkrijgbaar via https://www.smeba.nl/algemene-voorwaarden/   \n\nGelieve deze lijn niet te verwijderen:: bt-collections-8a2e96dce9589b24b76717b1b699abdb-000016447762",
    "mailbox": "debiteuren@berki.nl",
    "entity": "berki",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "58fa20d2-4b84-4ad8-964a-cc235f991070",
    "subject": "Re: Re: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050611",
    "body_text": "CAUTION: External Sender Beste, Weeral twee weken verder zonder reactie?! Graag dringend antwoord, anders gaat u akkoord dat we (voorlopig) niets betalen. Mvg Roger Van den houdt Verzonden met mijn gs  External (roger.vandenhoudt@skynet.be)    Graymail  Spam  Phish  More...  FAQ  Protection by Q2Q \nCAUTION: External Sender Beste, \n\nWeeral twee weken verder zonder reactie?! \n\nGraag dringend antwoord, anders gaat u akkoord dat we (voorlopig) niets betalen. \n\nMvg\nRoger Van den houdt\nVerzonden met mijn gsm vanuit Proximus Mail\n\nVan: Roger Van den houdt <roger.vandenhoudt@skynet.be> \nVerzonden: 8 mei 2026 22:32:34 CEST \nAan: debiteuren@smeba-fire.be, info@smeba-fire.be \nOnderwerp: Re: Re: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050611 \n\nBeste,\n\n \n\nHet is nu al meer dan een maand dat we vragen hebben gesteld in verband met een factuur, en tot nu hebben we nog altijd geen enkel teken van leven mogen ontvangen!!!???\n\n \n\nZolang we geen antwoord/uitleg mogen ontvangen, is het niet mogelijk de factuur of welk deel dan ook ervan te betalen!\n\n \n\nZodra we een gefundeerd antwoord ontvangen, zullen we dan ook het echt verschuldigde betalen. \n\n \n\nWe kunnen dan ook niet akkoord gaan met een eventuele verhoging wegens niet-tijdige betaling, aangezien we binnen de gestelde termijn hebben gereageerd op de factuur en we nog steeds wachten op een antwoord!!!\n\n \n\nMvg \nRoger Van den houdt voorzitter-penningmeester vzw Familia Tildonk  \n\n------ Original Message ------\nFrom: roger.vandenhoudt@skynet.be\nTo: debiteuren@smeba-fire.be; info@smeba-fire.be\nSent: Wednesday, May 6th 2026, 10:23\nSubject: Re: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050611\n \n\nBeste,\n\n \n\nKunnen we nog steeds geen antwoord krijgen???\n\n \n\nMvg\nRoger Van den houdt\n\n \n\n------ Original Message ------\nFrom: roger.vandenhoudt@skynet.be\nTo: debiteuren@smeba-fire.be; info@smeba-fire.be\nSent: Monday, April 27th 2026, 10:56\nSubject: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050611\n \n\nBeste,\n\n \n\nIs het nog steeds niet mogelijk een antwoord te ontvangen?\n\nOf komen de mails niet door?\n\n \n\nGraag had ik toch een antwoord ontvangen, vooraleer te kunnen overgaan tot betaling.\n\n \n\nMvg \nRoger Van den houdt  \n\n------ Origineel bericht ------\nVan: roger.vandenhoudt@skynet.be\nAan: roger.vandenhoudt@skynet.be; debiteuren@smeba-fire.be; info@smeba-fire.be\nVerzonden: Monday, April 20 2026, 00:34\nOnderwerp: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050611\n \n\nBeste,\n\n \n\nGraag had ik een antwoord ontvangen, vooraleer te kunnen overgaan tot betaling.\n\n \n\nMvg \nRoger Van den houdt  \n\n------ Origineel bericht ------\nVan: roger.vandenhoudt@skynet.be\nAan: roger.vandenhoudt@skynet.be; debiteuren@smeba-fire.be; info@smeba-fire.be\nVerzonden: Sunday, April 12 2026, 00:04\nOnderwerp: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050611\nBeste, \n\nIs het nog niet mogelijk enig antwoord te ontvangen? \n\n \n\nMvg\nRoger Van den houdt\nVerzonden met mijn gsm vanuit Proximus Mail\n\nVan: Roger Van den houdt <roger.vandenhoudt@skynet.be> \nVerzonden: 2 april 2026 10:08:52 CEST \nAan: roger.vandenhoudt@skynet.be, debiteuren@smeba-fire.be, info@smeba-fire.be \nOnderwerp: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050611 \n\nBeste, \n\nIs onderstaande bericht aan uw aandacht ontsnapt of is het niet toegekomen? \n\nGraag een spoedig antwoord. \n\n \n\nMvg\nRoger Van den houdt\nVerzonden met mijn gsm vanuit Proximus Mail\n\nVan: Roger Van den houdt <roger.vandenhoudt@skynet.be> \nVerzonden: 25 maart 2026 18:12:26 CET \nAan: debiteuren@smeba-fire.be, info@smeba-fire.be \nOnderwerp: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050611 \n\n \n\nBeste,\n\n \n\nBij het nazicht van de nu opgestuurde factuur bij de servicewissel van een brandblusser, die de technieker niet bijhad bij de vorige controle op 8 januari 2026 - factuur 33050018, stel ik vast, behoudens missing, dat voor deze brandblusser ook allerlei wisselstukken werden aangerekend bij de vorige controle.\n\nIs het normaal dat dit tweemaal wordt aangerekend?\n\nIk zie immers op gemelde factuur van 8 januari ll alles 5 maal aangerekend, alwaar er in totaal 5 brandblussers zijn, waarvan 1 toen al most gewisseld worden, doch niet gebeurd is omdat de technieker toen geen ander toestel bijhad!\n\n \n\nIs het ook normaal dat de prijs op twee jaar tijd bijna verdubbeld is voor een gelijkaardige brandblusser?\n\n \n\nGraag ontvingen we uitleg hieromtrent en, in voorkomend geval, een creditnota voor het eventueel teveel of tweemaal aangerekende.\n\n \n\nMvg  \nRoger Van den houdt  \n\n------ Origineel bericht ------\nVan: debiteuren@smeba-fire.be\nAan: info@familiatildonk.be\nVerzonden: Monday, March 23 2026, 12:36\nOnderwerp: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050611\nGeachte heer/mevrouw, Hierbij ontvangt u alle gerelateerde documenten n.a.v. factuurnummer: 33050611 Met vriendelijke groet, Smeba Fire BV",
    "mailbox": "debiteuren@smeba-fire.be",
    "entity": "smeba-fire",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "f457afbf-8a86-4a20-95d1-d69e0070463e",
    "subject": "RE: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17340297",
    "body_text": "CAUTION: External Sender Beste leverancier, Bedankt voor factuur 17340297. De desbetreffende factuur is niet voorzien van een ION nummer. Zonder het juiste ION nummer kunnen wij de factuur helaas niet  Caution: External (j.boateng@dvm-bv.nl) First-Time Sender   Details    Safe  Spam  Phish  More...  FAQ  Protection by Q2Q \nCAUTION: External Sender Beste leverancier,\n\n \n\nBedankt voor factuur 17340297.\n\n \n\nDe desbetreffende factuur is niet voorzien van een ION nummer. Zonder het juiste ION nummer kunnen wij de factuur helaas niet in behandeling nemen. De factuur is derhalve nog niet verwerkt.\n\nOm de factuur in behandeling te kunnen nemen ontvangen wij graag een aangepaste factuur inclusief het juiste ION nummer.\n\n \n\nMocht het ION onbekend zijn, dan kan deze worden aangevraagd via uw opdrachtgever binnen DVM. Alle toekomstige facturen mogen, met juist ION nummer, gestuurd worden naar factuur@dvm-bv.nl\n\n \n\nBij voorbaat dank voor de medewerking en begrip.\n\n \n\nMet vriendelijke groet,\n\n \n\nJennifer Boateng\n\n \n\n \n\nDijkhuis Vastgoed Management B.V.\n\nPostbus 94050, 1090 GB Amsterdam\n\nDuivendrechtsekade 87-88, 1096 AJ Amsterdam \n+31 (0)20 692 24 44\n\nwww.dvm-bv.nl\n\nj.boateng@dvm-bv.nl \n\nWerkdagen: Maandag t/m Donderdag\n\n \n\n \n\nFrom: DVM Factuur \nSent: donderdag 16 april 2026 10:20\nTo: debiteuren@smeba.nl\nSubject: RE: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17340297\n\n \n\nBeste leverancier,\n\n \n\nBedankt voor factuur 17340297.\n\n \n\nDe desbetreffende factuur is niet voorzien van een ION nummer. Zonder het juiste ION nummer kunnen wij de factuur helaas niet in behandeling nemen. De factuur is derhalve nog niet verwerkt.\n\nOm de factuur in behandeling te kunnen nemen ontvangen wij graag een aangepaste factuur inclusief het juiste ION nummer.\n\n \n\nMocht het ION onbekend zijn, dan kan deze worden aangevraagd via uw opdrachtgever binnen DVM. Alle toekomstige facturen mogen, met juist ION nummer, gestuurd worden naar factuur@dvm-bv.nl\n\n \n\nBij voorbaat dank voor de medewerking en begrip.\n\n \n\n \n\nMet vriendelijke groet,\n\n \n\nJennifer Boateng\n\n \n\n \n\nDijkhuis Vastgoed Management B.V.\n\nPostbus 94050, 1090 GB Amsterdam\n\nDuivendrechtsekade 87-88, 1096 AJ Amsterdam \n+31 (0)20 692 24 44\n\nwww.dvm-bv.nl\n\nj.boateng@dvm-bv.nl \n\n \n\nFrom: debiteuren@smeba.nl <debiteuren@smeba.nl> \nSent: woensdag 15 april 2026 13:46\nTo: DVM Factuur <Factuur@dvm-bv.nl>\nSubject: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17340297\n\n \n\nGeachte heer/mevrouw,\n\nHierbij ontvangt u alle gerelateerde documenten n.a.v. factuurnummer: 17340297\n\nMet vriendelijke groet,\n\nSmeba Brandbeveiliging BV\n\ndebiteuren@smeba.nl \n\nRemote BHV met Thuis Competent Box\n\nOefenmaterialen thuis, online skills-check\n\nBHV opleiding €125,- \n\nKies jouw BHV \n\nLosse herhaling vanaf € 69,99\n\nBeoordeeld door instructeur  •  persoonlijke feedback \n\nsmeba.nl\nKvK: 10019090 \n\nBijsterhuizen 2028\n6604 LJ Wijchen \n\n024-3775458\ndebiteuren@smeba.nl \n\nDisclaimer\nDit emailbericht inclusief eventuele bijlagen is vertrouwelijk en uitsluitend bestemd voor de geadresseerde(n). Wij verzoeken u derhalve dit emailbericht direct aan de geadresseerde te overhandigen. Indien de email bij vergissing bij u terecht is gekomen, verzoeken wij u het emailbericht te vernietigen, de inhoud ervan niet te gebruiken en niet onder derden te verspreiden. Wij verzoeken u ons tevens per email te berichten over de ontvangst van het emailbericht of telefonisch contact met ons op te nemen via nummer 00 31 – (0)20 69 22 444. Voor misbruik van informatie uit deze email bent u aansprakelijk. Deze disclaimer bevestigt tevens dat dit emailbericht is gescand op de aanwezigheid van computervirussen.\nThis email including any files transmitted is confidential and intended for the addressee. If you have received this email in error, please remove this email from your email box and neither use the contents or disclose them in any manner to third parties. We also request you to inform us by email concerning the receipt of the email message or contact us by telephone via 0031 (0)20 69 22 444. You are liable for abuse of any information of this email. This disclaimer also confirms that this email message has been scanned for the presence of computer viruses.",
    "mailbox": "debiteuren@smeba.nl",
    "entity": "smeba",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "067428ad-b3a4-4475-9896-95bac10730bd",
    "subject": "FW: Invoice 17338747",
    "body_text": "Hallo, op factuur 17338747 lijkt het BTW-bedrag onjuist berekend. Kunnen jullie deze corrigeren?\n\n  \n\nMet vriendelijke groet,\n\nTest (Phase 999.8 UAT)\n\nVerzonden vanaf Outlook voor Mac",
    "mailbox": "administratie@fire-control.nl",
    "entity": "fire-control",
    "baseline_top_intent": "payment_dispute"
  },
  {
    "email_id": "334ca0aa-a19f-4bde-a138-fab2261c3330",
    "subject": "Re: Openstaande facturen bij Berki - fs",
    "body_text": "CAUTION: External Sender L.S.,\n\nDe onderstaande mail hebben wij niet verwerkt, aangezien deze vermoedelijk geen (nieuwe) factuur betreft.\n\nIn het geval dat deze mail wel één of meerdere facturen bevat die nog niet bij BAM bekend zijn, deze graag opnieuw aanbieden met het onderwerp van de mail en de bestandsnamen de factuurnummers. U kunt de status van uw facturen controleren op https://statusinvoices.bam.com/.\n\nIn dien deze mail een herinnering of overzicht betreft, graag deze nu en voortaan naar de desbetreffende afdeling sturen. De contactgegevens per administratie zijn te vinden op https://www.bam.com/nl/digifact.\n\nNaar de pdffactuur????@bam.com mailadressen van BAM kunnen alleen facturen in PDF formaat worden gestuurd (en 1 PDF bestand mag niet groter zijn dan 10 Mb). Dus geen JPG, TIF, ZIP, Word, Excel etc. bestanden en ook geen “Mailtjes in een Mailtje” geplakt. De PDF kan ook niet door middel van een link worden aangeboden; de PDF moet als bijlage worden mee gestuurd met de mail. De PDF-bestanden worden automatisch verwerkt, de tekst in de mail wordt derhalve niet gelezen.\n\nEnglish:\nDe email below has not been processed, because it is reasonably assumed not to be a new invoice.\n\nIn the case this email does contain invoices not previously correctly received by BAM, please use the invoice number(s) as the subject for the email and filename per complete PDF invoice. You can check whether it is (un)known and the current status of your invoices on https://statusinvoices.bam.com/.\n\nIn case that this email concerns a reminder or current overview of outstanding invoices, etc., please send this mail and any in the future to the relevant administration. For this you can view https://www.bam.com/nl/digifact.\n\nOnly invoices in PDF format can be sent to BAM's pdfinvoice????@bam.com mail addresses (and one PDF file cannot exceed 10 Mb). So no JPG, TIF, ZIP, Word, Excel etc. files and also no \"Mails inserted in another mail\". The PDF can also not be offered by a link; the PDF really should be sent along with the email as an attachment. The PDF files are processed automatically, the text in the mail is therefore not read.\n\n----------------------------\nGeachte heer/mevrouw,\n\nHopelijk maakt u het goed.\nGraag komen wij met u in contact over de momenteel nog openstaande facturen.\n\nOp dit moment staan de volgende facturen nog open:\n\n1700030917000310170003111700031217000313Deze facturen zijn tevens in de bijlage terug te vinden.\nGraag vernemen wij wat de huidige status is en wanneer wij de betaling mogen verwachten.\n\nMocht er nog informatie ontbreken, laat u het dan gerust weten. Wij helpen u uiteraard graag verder.\n\nIn de hoop u hiermee voldoende te hebben geïnformeerd, verblijf ik.\n\nMet vriendelijke groet,\nKirsten \nDebiteurenbeheer\nGelieve deze lijn niet te verwijderen: bt-collections-8a2e96dce9589b24b76717b1b699abdb-000016077142",
    "mailbox": "debiteuren@berki.nl",
    "entity": "berki",
    "baseline_top_intent": "payment_dispute"
  }
]
```
