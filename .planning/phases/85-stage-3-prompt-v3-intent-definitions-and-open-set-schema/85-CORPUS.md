# Phase 85 — Few-Shot Corpus (Wave 0)

**Pulled:** 2026-05-20
**Source:** Supabase project `mvqjhlxfvtqqubqgdvhz` — `email_pipeline.emails` ⋈ `public.coordinator_runs` (joined client-side via PostgREST; `mcp__supabase__execute_sql` MCP was not exposed in this executor session — Rule 3 deviation, see SUMMARY).
**Filter floor:** `received_at > '2026-05-01'`, `length(body_full_text) BETWEEN 200 AND 4000`.
**PII redaction:** debtor emails → `[ADDR]`, names → `[NAME]`, invoice/credit-note refs → `[INV-NN]`, IBAN/VAT → `[IBAN]`/`[VAT]`, phone numbers → `[PHONE]`, URLs → `[URL]`, prompt-injection-shaped strings → `[INJ-MARK]`. Excerpts collapsed to ≤600 chars.
**Language mix target (D-03 / RESEARCH Open Q #4):** ≥6 NL / ≥3 EN / ≥1 cross-language quoted prior. Achieved mix recorded in summary table below.

> Each slot block below lists ONE primary candidate (the one to embed in prompt v3's `<examples>` block) plus up to 4 alternates. Plan 03 operator hand-confirms the primary before paste.


### Slot A — target intent: `payment_dispute`

- **Boundary rule (D-02):** payment_dispute vs credit_request (D-02 pair #1) — pure dispute, no credit-note ask
- **Candidate count:** 5
- **Language target:** nl

#### Primary candidate

| Field | Value |
|---|---|
| email_id | `bd873261-f470-4a9e-80a6-95b6cee22845` |
| subject (redacted) | Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur [INV-NN] |
| sender_domain | nehemint.nl |
| mailbox | debiteuren@smeba.nl |
| received_at | 2026-05-19T11:33:04+00:00 |
| language (heuristic) | nl |
| V2 top-1 intent | payment_dispute |
| V2 top-1 confidence | high |
| body length | 1798 chars |

**Redacted body excerpt (≤600 chars):**

```
CAUTION: External Sender Beste heer/ mevrouw, Bedankt voor de documenten. Vooraf aan de factuur hebben we een offerte ontvangen, zie bijlage. De offerte was voor een bedrag van € 331,74 excl. BTW. De Caution: External ([ADDR]) First-Time Sender Details Safe Spam Phish More... FAQ Protection by Q2Q 
CAUTION: External Sender Beste heer/ mevrouw,
Bedankt voor de documenten.
Vooraf aan de factuur hebben we een offerte ontvangen, zie bijlage.De offerte was voor een bedrag van € 331,74 excl. BTW.De factuur heeft een bedrag van € 357,97 excl. BTW.
Haspelkern slang aansluit seal € 5,37 staat niet geno
[…truncated…]
```

#### Alternates (email_id, lang, V2 top-1)

- `b058e46e-17db-47ed-b2e3-016ed62f9202` — lang=nl — V2 top-1=payment_dispute — subject: FW: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur [INV-NN]
- `b058e46e-17db-47ed-b2e3-016ed62f9202` — lang=nl — V2 top-1=payment_dispute — subject: FW: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur [INV-NN]
- `c670e428-89e8-4226-8177-f96f49416001` — lang=nl — V2 top-1=payment_dispute — subject: RE: openstaande posten
- `a231bd15-cf09-442a-9529-25a9bad01b58` — lang=nl — V2 top-1=payment_dispute — subject: Vragen over uitgevoerd onderhoud Vijzelstraat 32

---

### Slot B — target intent: `payment_dispute (with credit-note ask)`

- **Boundary rule (D-02):** payment_dispute vs credit_request (D-02 pair #1) — both signals present, dispute wins ranked-top, credit_request ranked-2
- **Candidate count:** 5
- **Language target:** nl

#### Primary candidate

| Field | Value |
|---|---|
| email_id | `07e3f0c7-9cc3-4465-8d23-71e3e7125800` |
| subject (redacted) | Factuur [INV-NN] afgewezen door beoordelaar |
| sender_domain | jumbo.com |
| mailbox | debiteuren@smeba.nl |
| received_at | 2026-05-20T13:14:47+00:00 |
| language (heuristic) | nl |
| V2 top-1 intent | payment_dispute |
| V2 top-1 confidence | high |
| body length | 1035 chars |

**Redacted body excerpt (≤600 chars):**

```
CAUTION: External Sender Goedemiddag, Factuur [INV-NN] (zie bijgevoegd) is afgewezen door de beoordelaar. De opgegeven reden luidt: “Zonder goedkeuring van de ondernemer aan het werk gegaan; werknemer External ([ADDR]) Graymail Spam Phish More... FAQ Protection by Q2Q 
CAUTION: External Sender Goedemiddag, 

 

Factuur [INV-NN] (zie bijgevoegd) is afgewezen door de beoordelaar. De opgegeven reden luidt: “Zonder goedkeuring van de ondernemer aan het werk gegaan; werknemer is teruggestuurd.”

De beoordelaar kan zich om deze reden niet vinden in de factuur. Het verzoek is om hierover gezamenlijk 
[…truncated…]
```

#### Alternates (email_id, lang, V2 top-1)

- `e6c821ce-3b97-478b-94fb-ffdcef71a24c` — lang=nl — V2 top-1=payment_dispute — subject: Factuur [INV-NN] afgewezen
- `c856536d-e31a-49fa-998c-cad94b3aa526` — lang=nl — V2 top-1=payment_dispute — subject: Retour van factuur [INV-NN]
- `91bba2b1-00dc-4b89-b47e-acfc756dcc3a` — lang=nl — V2 top-1=payment_dispute — subject: Retour van factuur [INV-NN]
- `e9661de1-8d56-48ce-afcb-b23629cde7b2` — lang=nl — V2 top-1=payment_dispute — subject: Re: Openstaande factuur bij Berki

---

### Slot C — target intent: `credit_request`

- **Boundary rule (D-02):** credit_request vs payment_dispute — pure credit ask, no dispute language
- **Candidate count:** 5
- **Language target:** nl

#### Primary candidate

| Field | Value |
|---|---|
| email_id | `cefb80c8-b44a-4bef-8ddc-ba0b39726859` |
| subject (redacted) | Aanvraag credit in verband met afgekeurde factuur Smeba |
| sender_domain | jumbo.com |
| mailbox | debiteuren@smeba-fire.be |
| received_at | 2026-05-20T12:36:21+00:00 |
| language (heuristic) | nl |
| V2 top-1 intent | credit_request |
| V2 top-1 confidence | high |
| body length | 897 chars |

**Redacted body excerpt (≤600 chars):**

```
CAUTION: External Sender Goedemiddag, Zie bijgevoegd factuur [INV-NN]. Factuur [INV-NN] is afgewezen door de beoordelaar. De reden hiervoor: ‘’De kosten van de verbouwing zijn niet goed afgemaakt’’. D Caution: External ([ADDR]) First-Time Sender Details Safe Spam Phish More... FAQ Protection by Q2Q 
CAUTION: External Sender Goedemiddag, 

 

Zie bijgevoegd factuur [INV-NN].

 

Factuur [INV-NN] is afgewezen door de beoordelaar. De reden hiervoor: ‘’De kosten van de verbouwing zijn niet goed afgemaakt’’. De beoordelaar is @Wassink, Marcel. Graag samen hier uitkomen en in geval van onterechte fa
[…truncated…]
```

#### Alternates (email_id, lang, V2 top-1)

- `cfafdb57-9a26-4f42-984a-bf56101714fa` — lang=nl — V2 top-1=credit_request — subject: 538520 - Lange dhr. F.; splitsing factuur per siteadres
- `325db2ea-a74e-46e7-90d9-75a87740e662` — lang=nl — V2 top-1=credit_request — subject: Aanvraag WKA en KvK Fire-control B.V.
- `9e704665-b2aa-4d6a-87d0-a3f71ac4025b` — lang=nl — V2 top-1=credit_request — subject: Uitbetaling credit facturen
- `be712df4-01e7-49a0-990f-370f2951d660` — lang=nl — V2 top-1=credit_request — subject: FW: starttarief aanpassen

---

### Slot D — target intent: `contract_inquiry`

- **Boundary rule (D-02):** contract_inquiry vs general_inquiry (D-02 pair #5) — explicit contract/SLA/raamovereenkomst reference
- **Candidate count:** 1
- **Language target:** nl

#### Primary candidate

| Field | Value |
|---|---|
| email_id | `aea174fa-b456-4b2d-ac98-f1aab9f45195` |
| subject (redacted) | RE: Goedgekeurde pro forma's 7-5-2026 |
| sender_domain | spie.com |
| mailbox | debiteuren@berki.nl |
| received_at | 2026-05-07T13:09:57+00:00 |
| language (heuristic) | nl |
| V2 top-1 intent | contract_inquiry |
| V2 top-1 confidence | medium |
| body length | 2608 chars |

**Redacted body excerpt (≤600 chars):**

```
CAUTION: External Sender Dag Xander,

 

Zoals besproken graag de proforma’s splitsen.

 

Dit betekent dat voor de Pf’s m.b.t. P1, P2 en P4 er inzicht (technisch) dient te komen wat het meerwerk is.

Aldus kan er sowieso al direct gefactureerd worden conform de inkopen 2025. (de preventieve werkzaamheden)

 

Daarnaast ontvangen wij graag per locatie een separate meerwerk proforma met DUIDELIJK uitleg waar dit meerwerk uit bestaat. Dit helpt bij het gesprek met onze gezamenlijke klant.

Deze proforma’s worden na overeenstemming separaat ingekocht.

 

Met vriendelijke groet,

 

[NAME]
Contra
[…truncated…]
```

---

### Slot E — target intent: `peppol_request`

- **Boundary rule (D-02):** peppol_request vs general_inquiry (D-02 pair #6) — any Peppol mention forces peppol_request
- **Candidate count:** 3
- **Language target:** en

#### Primary candidate

| Field | Value |
|---|---|
| email_id | `365cc739-5973-4362-8a47-a7d489a3b0f6` |
| subject (redacted) | IKEA would like to connect with you on SAP Business Network |
| sender_domain | us.bn.cloud.ariba.com |
| mailbox | debiteuren@smeba-fire.be |
| received_at | 2026-05-07T12:34:28+00:00 |
| language (heuristic) | en |
| V2 top-1 intent | peppol_request |
| V2 top-1 confidence | high |
| body length | 1803 chars |

**Redacted body excerpt (≤600 chars):**

```
CAUTION: External Sender Connect with IKEA to collaborate on SAP Business Network!To SMEBA BRANDBEVEILIGING BV, IKEA, would like to invite you to connect with us on SAP Business Network. In reference to IKEA's (Ingka Group's) recent announcement that they are changing their order and invoicing system and partnering up with SAP, please find here a trading relationship request for your company to connect with IKEA (Ingka Group) over the SAP Business Network. Click Get started to connect.Get started Link expires: August 5, 2026, 12:32 PM About this invitationFrom:IKEAIngka Group Procurement , Älm
[…truncated…]
```

#### Alternates (email_id, lang, V2 top-1)

- `365cc739-5973-4362-8a47-a7d489a3b0f6` — lang=en — V2 top-1=peppol_request — subject: IKEA would like to connect with you on SAP Business Network
- `365cc739-5973-4362-8a47-a7d489a3b0f6` — lang=en — V2 top-1=peppol_request — subject: IKEA would like to connect with you on SAP Business Network

---

### Slot F — target intent: `address_change`

- **Boundary rule (D-02):** address_change vs general_inquiry (D-02 pair #4) — address update wrapped in copy-doc context
- **Candidate count:** 1
- **Language target:** nl

#### Primary candidate

| Field | Value |
|---|---|
| email_id | `b0b431c2-089b-4733-b5ad-da5448acc2eb` |
| subject (redacted) | RE: PO Missing-BhU2lIJcT |
| sender_domain | fire-control.nl |
| mailbox | administratie@fire-control.nl |
| received_at | 2026-05-08T10:16:45+00:00 |
| language (heuristic) | nl |
| V2 top-1 intent | copy_document_request |
| V2 top-1 confidence | high |
| body length | 2534 chars |

**Redacted body excerpt (≤600 chars):**

```
Geachte heer Fleur,

 

Onze administratie kreeg onderstaande email naar aanleiding van een aantal ingediende facturen van uitgevoerde werkzaamheden van Fire Control.

 

Kunt u ons voorzien van de juiste inkooporders zodat wij de facturen kunnen indienen voor de werkzaamheden die zijn uitgevoerd in december 2025 en op 6 mei jl?

 

Alvast bedankt voor uw medewerking. 

 

Met vriendelijke groet,

 

[NAME]

 

 

Verkoop Binnendienst

 

 

 

 

 

Tel 070 – 3177822 

 

 

[ADDR]

 

 

Tiber 46, 2491 DJ Den Haag

 

 

www.fire-control.nl

 

 

 

 

 

 

 

Van: Savitha Prabhu <[ADDR]>

[…truncated…]
```

---

### Slot G — target intent: `general_inquiry`

- **Boundary rule (D-02):** general_inquiry vs other (D-02 pair #2) — clarifying question Moyne Roberts can answer
- **Candidate count:** 5
- **Language target:** nl

#### Primary candidate

| Field | Value |
|---|---|
| email_id | `854f5fa8-e993-43d3-87e6-ee6bdf80831d` |
| subject (redacted) | Aanvraag uittreksel KvK Smeba Brandbeveiliging B.V. |
| sender_domain | hanab.nl |
| mailbox | debiteuren@smeba.nl |
| received_at | 2026-05-20T07:14:58+00:00 |
| language (heuristic) | nl |
| V2 top-1 intent | general_inquiry |
| V2 top-1 confidence | high |
| body length | 1135 chars |

**Redacted body excerpt (≤600 chars):**

```
CAUTION: External Sender Goedendag, De factuur/facturen kunnen niet betaald worden of zijn niet betaald met als reden dat wij geen recente KvK hebben ontvangen. Graag ontvangen wij deze, niet ouder da Caution: External ([ADDR]) First-Time Sender Details Safe Spam Phish More... FAQ Protection by Q2Q 
CAUTION: External Sender 
Goedendag,

 

De factuur/facturen kunnen niet betaald worden of zijn niet betaald met als reden dat wij geen recente KvK hebben ontvangen.

Graag ontvangen wij deze, niet ouder dan 1 jaar, op emailadres [ADDR].

 

Zodra wij deze hebben ontvangen zullen wij overgaan tot b
[…truncated…]
```

#### Alternates (email_id, lang, V2 top-1)

- `b5736b1b-9480-48b2-b323-1ad1f1ee177a` — lang=nl — V2 top-1=general_inquiry — subject: Herinnering terugkoppeling op werkorder [PHONE] gepland op 08/05/2026
- `2b996ebc-10fe-43ea-8c9f-753a33f7eaaf` — lang=nl — V2 top-1=general_inquiry — subject: Herinnering terugkoppeling op werkorder [PHONE] gepland op 17/11/2025
- `093dc26e-84f2-45ba-bf67-8d8415c48346` — lang=nl — V2 top-1=general_inquiry — subject: Herinnering terugkoppeling op werkorder [PHONE] gepland op 12/05/2026
- `fd2dd5b8-50d9-499e-955c-7238a47b31aa` — lang=nl — V2 top-1=general_inquiry — subject: Herinnering terugkoppeling op werkorder [PHONE] gepland op 10/02/2026

---

### Slot H — target intent: `other`

- **Boundary rule (D-02):** general_inquiry vs other (D-02 pair #2) — automated/off-topic, cleared Stage 1
- **Candidate count:** 5
- **Language target:** en

#### Primary candidate

| Field | Value |
|---|---|
| email_id | `f4851a06-a66a-4fed-aa47-f53f1e08452a` |
| subject (redacted) | Invoice [INV-NN] |
| sender_domain | fire-control.nl |
| mailbox | administratie@fire-control.nl |
| received_at | 2026-05-20T12:26:09+00:00 |
| language (heuristic) | en |
| V2 top-1 intent | other |
| V2 top-1 confidence | high |
| body length | 228 chars |

**Redacted body excerpt (≤600 chars):**

```
CAUTION: External Sender Our Invoice number [INV-NN] dated 20/05/2026 is attached

We at Fire Control thank you for your business, your custom is very much appreciated. 
Please make all enquiries to the helpdesk of Fire Control.
```

#### Alternates (email_id, lang, V2 top-1)

- `e35ff6e4-0830-41ee-b838-aff8014ab9ea` — lang=nl — V2 top-1=other — subject: FW: Belangrijk: Uw gegevens zijn bijna verlopen - Uittreksel KvK
- `746e0114-d35a-42da-be93-1f3d92eec348` — lang=nl — V2 top-1=other — subject: FW: Belangrijk: Uw WKA gegevens zijn bijna verlopen - Betaalgedrag Belastingen
- `a3ae0671-d868-4bff-98ee-5f0605685f7b` — lang=nl — V2 top-1=other — subject: Factuur [INV-NN]
- `6818c332-116c-4f39-a578-716305699df2` — lang=nl — V2 top-1=other — subject: Herinnering terugkoppeling op werkorder [PHONE] gepland op 06/11/2025

---

### Slot I — target intent: `(open-set) intent_proposal=`wka_data_request` (or similar)`

- **Boundary rule (D-02):** novel intent not in closed list — agent must emit non-null intent_proposal + proposal_reason (R-02 mitigation)
- **Candidate count:** 3
- **Language target:** nl

#### Primary candidate

| Field | Value |
|---|---|
| email_id | `08da369b-cf26-40c4-b681-fc90718b44c0` |
| subject (redacted) | Breman Utiliteit Rotterdam BV - WKA Gegevens Aanvraag 100489 |
| sender_domain | breman.nl |
| mailbox | administratie@fire-control.nl |
| received_at | 2026-05-18T06:44:25+00:00 |
| language (heuristic) | nl |
| V2 top-1 intent | — |
| V2 top-1 confidence | — |
| body length | 407 chars |

**Redacted body excerpt (≤600 chars):**

```
CAUTION: External Sender Geachte relatie,

Hierbij ontvangt u de periodieke aanvraag van WKA gegevens.
In bijgevoegde brief vindt u de details van de gegevens die wij graag van u willen ontvangen.

Met vriendelijke groet,

[NAME]

Breman Utiliteit Rotterdam BV
A Vareseweg 11, 3047 AT Rotterdam
T [PHONE]
E [ADDR] www.breman.nl

Kvk nr. [INV-NN]
```

#### Alternates (email_id, lang, V2 top-1)

- `de4d54aa-bf24-43ba-89ea-c694f335f4ad` — lang=nl — V2 top-1=— — subject: Breman Utiliteit Zwolle BV - WKA Gegevens Aanvraag 101103
- `2add17c4-6595-4b4c-addd-bbf27f315476` — lang=nl — V2 top-1=— — subject: Breman Utiliteit Rotterdam BV - WKA Gegevens Aanvraag 100489

---

## Slot Coverage Summary

| Slot | Target intent | Candidates | Primary email_id | Primary lang |
|---|---|---|---|---|
| A | `payment_dispute` | 5 | `bd873261-f470-4a9e-80a6-95b6cee22845` | nl |
| B | `payment_dispute (with credit-note ask)` | 5 | `07e3f0c7-9cc3-4465-8d23-71e3e7125800` | nl |
| C | `credit_request` | 5 | `cefb80c8-b44a-4bef-8ddc-ba0b39726859` | nl |
| D | `contract_inquiry` | 1 | `aea174fa-b456-4b2d-ac98-f1aab9f45195` | nl |
| E | `peppol_request` | 3 | `365cc739-5973-4362-8a47-a7d489a3b0f6` | en |
| F | `address_change` | 1 | `b0b431c2-089b-4733-b5ad-da5448acc2eb` | nl |
| G | `general_inquiry` | 5 | `854f5fa8-e993-43d3-87e6-ee6bdf80831d` | nl |
| H | `other` | 5 | `f4851a06-a66a-4fed-aa47-f53f1e08452a` | en |
| I | `(open-set) intent_proposal=`wka_data_request` (or similar)` | 3 | `08da369b-cf26-40c4-b681-fc90718b44c0` | nl |

## Slot Gaps

None — every slot A–I has ≥1 real-corpus candidate.

## Language Mix Check (D-03 / RESEARCH Open Q #4)

- NL primaries: **7** (target ≥6)
- EN primaries: **2** (target ≥3)
- Other/unknown primaries: **0**
- Note: language heuristic is keyword-based; Plan 03 operator should hand-confirm each primary and swap to an alternate if the auto-pick is misclassified. Cross-language quoted-prior shot (D-03 `≥1`) is not yet identified — Plan 03 must locate one (e.g. EN inbound replying to an NL prior) when composing prompt v3, or note in agent-ritual log if no candidate surfaces.

## Token Budget Check (RESEARCH §4)

**Volume SQL (executed via PostgREST count=exact, 2026-05-20):**

```sql
-- Equivalent to RESEARCH §4 SQL
SELECT count(*) FROM public.agent_runs
WHERE swarm_type = 'debtor-email'
  AND intent_version IN ('2026-04-23.v1', '2026-05-01.v2')
  AND created_at > now() - interval '30 days';
```

**Result (last 30d, ending 2026-05-20):**

| Metric | Value |
|---|---|
| Stage 3 calls (v1 + v2, debtor-email) | **280** |
| Of which v1 (`2026-04-23.v1`) | 98 |
| Of which v2 (`2026-05-01.v2`) | 182 |
| Coordinator_runs (cross-check) | 189 |
| Volume bucket (RESEARCH §4) | **Low** (<3,000/mo) |
| Estimated +3k input-token delta/call | $0.009 ≈ €0.0083 |
| Estimated monthly cost delta | **≈ €2.32/mo** |

**Verdict:** Low bucket — R-03 cost concern is negligible (well under €10/mo). **No prompt-cache TODO** needed (RESEARCH §4 threshold = >10k calls/mo).
