---
name: debtor-intent-agent — clean evaluation dataset
agent_key: debtor-intent-agent
dataset_type: clean
case_count: 30
version: 2026-04-23.v1
intent_version: 2026-04-23.v1
---

# debtor-intent-agent — Clean Dataset

> **Purpose:** Happy-path evaluation of the `debtor-intent-agent` classifier on realistic `unknown`-bucket debtor emails. Validates that the agent classifies correctly under normal conditions and calibrates `confidence` honestly. For adversarial and edge inputs, see `debtor-intent-agent-edge-dataset.md`.

## Coverage

- **Languages:** 23 NL · 2 EN · 1 DE · 1 FR · 3 ambiguous/low-confidence (language still a known enum)
- **Entities:** smeba · berki · sicli-noord · sicli-sud · smeba-fire (all 5 mailboxes covered)
- **Intent distribution:** 10 `copy_document_request` · 5 `payment_dispute` · 3 `address_change` · 2 `peppol_request` · 2 `credit_request` · 2 `contract_inquiry` · 3 `general_inquiry` · 3 `other`
- **Confidence distribution:** approximately 20 `high` · 7 `medium` · 3 `low` (reflects real volume where most cases are clear and the long tail goes to humans)

## Metrics this dataset supports

- **Intent precision/recall** per intent class (primary success metric — target ≥90% per research-brief §"Shadow-mode evaluation plan")
- **`document_reference` extraction precision** (go/no-go safety metric — target ≥98% on `copy_document_request` cases, brief §8)
- **`document_reference` extraction recall** on copy_document_request (target ≥85%)
- **Confidence calibration** — per-bucket agreement (high ≥95%, medium 80-90%, low anything)
- **Multilingual accuracy** — per-language slice (NL/EN/DE/FR broken out separately)
- **Per-entity agreement** — NL entities (smeba, berki) vs BE entities (sicli-noord, sicli-sud, smeba-fire)
- **Schema compliance** — 100% of outputs must parse against the `debtor_intent_result` JSON schema (strict mode)

## Upload instructions (Orq Datasets)

**Option A — Orq Studio UI:**

1. Open Orq Studio → Datasets → New Dataset.
2. Name: `debtor-intent-agent-clean-2026-04-23`.
3. Schema: upload the `debtor_intent_result` JSON Schema from the agent spec as the expected-output schema.
4. For each T-## row below, create a datapoint with `inputs = { email_id, inngest_run_id, stage, subject, body_text, sender_email, sender_domain, mailbox, entity, received_at }` and `expected_output = <the expected JSON>`.
5. Tag: `clean`, `phase-1`, `v2026-04-23.v1`.

**Option B — MCP (`mcp__orqai-mcp__create_dataset` + `create_datapoints`):**

```ts
const ds = await createDataset({
  name: "debtor-intent-agent-clean-2026-04-23",
  description: "Clean evaluation dataset for debtor-intent-agent phase 1",
});

await createDatapoints({
  dataset_id: ds.id,
  datapoints: cases.map((c) => ({
    inputs: c.inputs,
    expected_output: c.expected_output,
    metadata: { intent_version: "2026-04-23.v1", category: "happy-path", language: c.language },
  })),
});
```

Run experiments against the primary model (`anthropic/claude-haiku-4-5-20251001`) plus the 4 fallbacks. Use the Multi-Model Comparison Matrix below as scaffolding.

---

## Test Inputs

| ID | Entity / Mailbox | Language | Intent | Expected `confidence` | Category |
|----|------------------|----------|--------|-----------------------|----------|
| T-01 | smeba / debiteuren@smeba.nl | nl | copy_document_request (invoice) | high | happy-path |
| T-02 | smeba / debiteuren@smeba.nl | nl | copy_document_request (invoice) | high | happy-path |
| T-03 | berki / debiteuren@berki.nl | nl | copy_document_request (credit_note) | high | happy-path |
| T-04 | sicli-noord / debiteuren@sicli-noord.be | nl | copy_document_request (werkbon) | high | happy-path |
| T-05 | smeba-fire / debiteuren@smeba-fire.be | nl | copy_document_request (contract) | high | happy-path |
| T-06 | smeba / debiteuren@smeba.nl | nl | copy_document_request (quote) | high | happy-path |
| T-07 | berki / debiteuren@berki.nl | nl | copy_document_request (invoice) | medium | variation |
| T-08 | smeba / debiteuren@smeba.nl | en | copy_document_request (invoice) | medium | variation |
| T-09 | sicli-sud / facturations@sicli-sud.be | fr | copy_document_request (invoice) | high | happy-path |
| T-10 | smeba-fire / debiteuren@smeba-fire.be | de | copy_document_request (invoice) | high | happy-path |
| T-11 | smeba / debiteuren@smeba.nl | nl | payment_dispute | high | happy-path |
| T-12 | berki / debiteuren@berki.nl | nl | payment_dispute | high | happy-path |
| T-13 | sicli-noord / debiteuren@sicli-noord.be | nl | payment_dispute | high | happy-path |
| T-14 | smeba / debiteuren@smeba.nl | en | payment_dispute | medium | variation |
| T-15 | smeba-fire / debiteuren@smeba-fire.be | nl | payment_dispute | high | happy-path |
| T-16 | smeba / debiteuren@smeba.nl | nl | address_change | high | happy-path |
| T-17 | berki / debiteuren@berki.nl | nl | address_change | high | happy-path |
| T-18 | sicli-noord / debiteuren@sicli-noord.be | nl | address_change | medium | variation |
| T-19 | smeba / debiteuren@smeba.nl | nl | peppol_request | high | happy-path |
| T-20 | sicli-noord / debiteuren@sicli-noord.be | nl | peppol_request | high | happy-path |
| T-21 | smeba / debiteuren@smeba.nl | nl | credit_request | high | happy-path |
| T-22 | berki / debiteuren@berki.nl | nl | credit_request | medium | variation |
| T-23 | smeba / debiteuren@smeba.nl | nl | contract_inquiry | high | happy-path |
| T-24 | smeba-fire / debiteuren@smeba-fire.be | nl | contract_inquiry | medium | variation |
| T-25 | smeba / debiteuren@smeba.nl | nl | general_inquiry | medium | variation |
| T-26 | berki / debiteuren@berki.nl | nl | general_inquiry (rekeningoverzicht) | medium | boundary |
| T-27 | sicli-sud / facturations@sicli-sud.be | fr | general_inquiry | low | boundary |
| T-28 | smeba / debiteuren@smeba.nl | nl | other | low | boundary |
| T-29 | berki / debiteuren@berki.nl | nl | other | low | boundary |
| T-30 | sicli-noord / debiteuren@sicli-noord.be | nl | other | medium | variation |

---

## Eval Pairs

Each case includes the full Orq variable set + the expected JSON output. `received_at` values are spread across the last 2 weeks (2026-04-09 → 2026-04-23).

### T-01 — Clean NL copy invoice (Smeba)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000001"
  inngest_run_id: "inn_01HY00001CLEAN01"
  stage: "classify"
  subject: "Kopie factuur 33052208"
  body_text: |
    Beste,

    Zou u mij een kopie kunnen toesturen van factuur 33052208? Wij hebben deze
    niet in ons archief kunnen terugvinden.

    Alvast bedankt.

    Met vriendelijke groet,
    Jeroen Bakker
    Bakker Installatietechniek BV
  sender_email: "jeroen@bakker-installatie.nl"
  sender_domain: "bakker-installatie.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-22T09:14:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "invoice",
  "document_reference": "33052208",
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Explicit NL request for a copy of invoice 33052208; reference appears verbatim in both subject and body with the word 'factuur'.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [exact-match] `intent == "copy_document_request"`
2. [exact-match] `sub_type == "invoice"`
3. [exact-match] `document_reference == "33052208"`
4. [exact-match] `language == "nl"`, `confidence == "high"`
5. [format] Output is strict JSON, no prose, no fences
6. [exact-match] `intent_version == "2026-04-23.v1"`

---

### T-02 — NL copy invoice with prefix "F"

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000002"
  inngest_run_id: "inn_01HY00002CLEAN02"
  stage: "classify"
  subject: "Gelieve kopie F33051977 toe te sturen"
  body_text: |
    Geachte heer/mevrouw,

    Gelieve ons een kopie te bezorgen van factuur F33051977. Wij hebben deze
    nodig voor onze boekhouding.

    Met vriendelijke groet,
    Saskia Verhoeven
    Inkoop Van den Berg Groep
  sender_email: "boekhouding@vandenberg-groep.nl"
  sender_domain: "vandenberg-groep.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-20T11:02:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "invoice",
  "document_reference": "F33051977",
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Formal NL request for a copy of invoice F33051977; reference with F-prefix appears verbatim tied to 'factuur'.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [contains] reference `F33051977` 2. [exact-match] `sub_type == "invoice"` 3. [exact-match] `confidence == "high"` 4. [format] schema-valid JSON

---

### T-03 — Berki credit note copy

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000003"
  inngest_run_id: "inn_01HY00003CLEAN03"
  stage: "classify"
  subject: "kopie creditnota 33049882 aub"
  body_text: |
    Hoi,

    Kan je me de creditnota 33049882 nog eens doorsturen? Ik heb hem nodig voor
    de aansluiting in de boekhouding.

    Thx alvast,
    Dirk
  sender_email: "dirk.peeters@logistiek-noord.nl"
  sender_domain: "logistiek-noord.nl"
  mailbox: "debiteuren@berki.nl"
  entity: "berki"
  received_at: "2026-04-19T14:40:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "credit_note",
  "document_reference": "33049882",
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Informal NL request for credit note 33049882; reference stated verbatim with 'creditnota'.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `sub_type == "credit_note"` 2. [contains] reference `33049882` 3. [exact-match] `confidence == "high"` 4. [exact-match] `language == "nl"`

---

### T-04 — Sicli-Noord werkbon copy (Flemish)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000004"
  inngest_run_id: "inn_01HY00004CLEAN04"
  stage: "classify"
  subject: "Werkbon 22104478 - gelieve door te sturen"
  body_text: |
    Beste,

    Wij ontvangen graag een kopie van werkbon 22104478 van de interventie
    vorige week. Het PV is zoek geraakt bij onze technieker.

    Dank bij voorbaat.

    Met vriendelijke groeten,
    Hilde Claes
  sender_email: "h.claes@metaalwerk-geel.be"
  sender_domain: "metaalwerk-geel.be"
  mailbox: "debiteuren@sicli-noord.be"
  entity: "sicli-noord"
  received_at: "2026-04-21T08:25:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "werkbon",
  "document_reference": "22104478",
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Flemish NL request for a copy of werkbon 22104478; reference appears verbatim labeled 'werkbon'.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `sub_type == "werkbon"` 2. [contains] reference `22104478` 3. [exact-match] `language == "nl"` 4. [semantic] reasoning mentions werkbon, not invoice

---

### T-05 — Smeba-Fire contract copy (Flemish)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000005"
  inngest_run_id: "inn_01HY00005CLEAN05"
  stage: "classify"
  subject: "Kopie onderhoudscontract CN-2025-0842"
  body_text: |
    Geachte,

    Gelieve ons een kopie van ons onderhoudscontract CN-2025-0842 te bezorgen.
    Wij hebben dit nodig voor de interne audit.

    Met vriendelijke groeten,
    Marc Vermeiren
    Facility Manager - Residentie Lindenhof
  sender_email: "m.vermeiren@lindenhof-residentie.be"
  sender_domain: "lindenhof-residentie.be"
  mailbox: "debiteuren@smeba-fire.be"
  entity: "smeba-fire"
  received_at: "2026-04-18T10:11:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "contract",
  "document_reference": "CN-2025-0842",
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Flemish NL request for a copy of maintenance contract CN-2025-0842; reference stated verbatim tied to 'onderhoudscontract'.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `sub_type == "contract"` 2. [contains] `CN-2025-0842` 3. [exact-match] `language == "nl"` 4. [exact-match] `confidence == "high"`

---

### T-06 — Smeba quote copy

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000006"
  inngest_run_id: "inn_01HY00006CLEAN06"
  stage: "classify"
  subject: "Offerte 41203 - kopie gewenst"
  body_text: |
    Goedemiddag,

    Zouden jullie mij een kopie van offerte 41203 kunnen sturen? Ik moet deze
    nog intern voorleggen voor akkoord.

    Groeten,
    Bart Janssen
  sender_email: "bart@janssen-vastgoed.nl"
  sender_domain: "janssen-vastgoed.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-17T13:30:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "quote",
  "document_reference": "41203",
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "NL request for a copy of quote 41203; reference stated verbatim tied to 'offerte'.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `sub_type == "quote"` 2. [contains] `41203` 3. [exact-match] `intent == "copy_document_request"` 4. [format] schema-valid JSON

---

### T-07 — Berki NL copy invoice, reference fuzzy (no digits) → medium

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000007"
  inngest_run_id: "inn_01HY00007CLEAN07"
  stage: "classify"
  subject: "Factuur vorige maand"
  body_text: |
    Beste,

    Kunnen jullie mij de factuur van vorige maand nogmaals toesturen? Ik kan
    hem niet meer vinden.

    Dank,
    Ellen de Wit
  sender_email: "ellen@dewit-handel.nl"
  sender_domain: "dewit-handel.nl"
  mailbox: "debiteuren@berki.nl"
  entity: "berki"
  received_at: "2026-04-16T09:00:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "invoice",
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "medium",
  "reasoning": "NL request for an invoice copy but no reference number provided; a human reviewer must resolve which invoice.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "copy_document_request"` 2. [exact-match] `document_reference == null` 3. [exact-match] `confidence == "medium"` 4. [semantic] reasoning mentions missing/no reference

---

### T-08 — EN copy invoice, no reference (Smeba)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000008"
  inngest_run_id: "inn_01HY00008CLEAN08"
  stage: "classify"
  subject: "Invoice copy request"
  body_text: |
    Hi,

    Could you please resend us the last invoice? We cannot find it in our
    accounting system.

    Thanks,
    Peter Harrison
    Harrison & Co
  sender_email: "p.harrison@harrison-co.com"
  sender_domain: "harrison-co.com"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-15T15:20:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "invoice",
  "document_reference": null,
  "urgency": "normal",
  "language": "en",
  "confidence": "medium",
  "reasoning": "English request to resend an invoice; no reference number present, human must resolve.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `language == "en"` 2. [exact-match] `document_reference == null` 3. [exact-match] `confidence == "medium"` 4. [exact-match] `sub_type == "invoice"`

---

### T-09 — Sicli-Sud FR copy invoice (francophone)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000009"
  inngest_run_id: "inn_01HY00009CLEAN09"
  stage: "classify"
  subject: "Copie facture 33048221"
  body_text: |
    Bonjour,

    Pourriez-vous m'envoyer une copie de la facture 33048221 s'il vous plaît?
    Nous ne la retrouvons pas dans nos archives.

    Cordialement,
    Sophie Delvaux
    Services Généraux - Immobilière du Sud
  sender_email: "s.delvaux@immo-sud.be"
  sender_domain: "immo-sud.be"
  mailbox: "facturations@sicli-sud.be"
  entity: "sicli-sud"
  received_at: "2026-04-14T11:45:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "invoice",
  "document_reference": "33048221",
  "urgency": "normal",
  "language": "fr",
  "confidence": "high",
  "reasoning": "Formal FR request for a copy of facture 33048221; reference stated verbatim tied to 'facture'.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `language == "fr"` 2. [contains] `33048221` 3. [exact-match] `sub_type == "invoice"` 4. [exact-match] `confidence == "high"`

---

### T-10 — Smeba-Fire DE copy invoice

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000010"
  inngest_run_id: "inn_01HY00010CLEAN10"
  stage: "classify"
  subject: "Rechnung 33050998 - Kopie bitte"
  body_text: |
    Sehr geehrte Damen und Herren,

    bitte senden Sie uns eine Kopie der Rechnung 33050998. Wir benoetigen
    diese fuer unsere Buchhaltung.

    Mit freundlichen Gruessen,
    Klaus Hoffmann
    Einkauf - Hoffmann Industriebau GmbH
  sender_email: "k.hoffmann@hoffmann-industrie.de"
  sender_domain: "hoffmann-industrie.de"
  mailbox: "debiteuren@smeba-fire.be"
  entity: "smeba-fire"
  received_at: "2026-04-13T09:12:00Z"
```

```json
{
  "intent": "copy_document_request",
  "sub_type": "invoice",
  "document_reference": "33050998",
  "urgency": "normal",
  "language": "de",
  "confidence": "high",
  "reasoning": "Formal DE request for a copy of Rechnung 33050998; reference stated verbatim.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `language == "de"` 2. [contains] `33050998` 3. [exact-match] `sub_type == "invoice"` 4. [exact-match] `confidence == "high"`

---

### T-11 — Smeba NL payment dispute

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000011"
  inngest_run_id: "inn_01HY00011CLEAN11"
  stage: "classify"
  subject: "Betwisting factuur 33050119"
  body_text: |
    Geachte heer/mevrouw,

    Wij betwisten factuur 33050119. De geleverde werkzaamheden komen niet
    overeen met de opdracht zoals besproken. Gelieve deze factuur te
    crediteren.

    Met vriendelijke groet,
    Administratie Van der Meer BV
  sender_email: "admin@vandermeer-bv.nl"
  sender_domain: "vandermeer-bv.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-12T10:00:00Z"
```

```json
{
  "intent": "payment_dispute",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Sender explicitly disputes an invoice and requests credit; this is a dispute, not a copy request.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "payment_dispute"` 2. [exact-match] `sub_type == null` 3. [exact-match] `document_reference == null` 4. [semantic] reasoning distinguishes dispute from copy request

---

### T-12 — Berki NL dispute

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000012"
  inngest_run_id: "inn_01HY00012CLEAN12"
  stage: "classify"
  subject: "Bezwaar factuur 33047771"
  body_text: |
    Beste,

    Wij maken bezwaar tegen factuur 33047771. Het aantal gefactureerde uren
    (16) stemt niet overeen met de werkelijk geleverde uren (8). Graag
    aangepaste factuur.

    Groet,
    Financiele administratie
  sender_email: "facturen@groenbouw.nl"
  sender_domain: "groenbouw.nl"
  mailbox: "debiteuren@berki.nl"
  entity: "berki"
  received_at: "2026-04-11T14:30:00Z"
```

```json
{
  "intent": "payment_dispute",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "NL objection to invoice content based on hour discrepancy; sender is disputing, not requesting a copy.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "payment_dispute"` 2. [exact-match] `sub_type == null` 3. [exact-match] `confidence == "high"` 4. [semantic] reasoning mentions dispute/objection

---

### T-13 — Sicli-Noord dispute with urgency (Flemish)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000013"
  inngest_run_id: "inn_01HY00013CLEAN13"
  stage: "classify"
  subject: "URGENT - klacht factuur 33046612"
  body_text: |
    Beste,

    Wij hebben ernstige bezwaren tegen factuur 33046612. Deze interventie is
    reeds eerder gefactureerd op 33045001. Dit is dubbelfacturatie. Gelieve
    ZSM een creditnota te sturen anders stoppen wij de betalingen.

    Met vriendelijke groeten,
    Patrick Joris
  sender_email: "p.joris@joris-constructies.be"
  sender_domain: "joris-constructies.be"
  mailbox: "debiteuren@sicli-noord.be"
  entity: "sicli-noord"
  received_at: "2026-04-10T08:05:00Z"
```

```json
{
  "intent": "payment_dispute",
  "sub_type": null,
  "document_reference": null,
  "urgency": "high",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Flemish NL dispute alleging double invoicing; sender threatens to halt payments and demands credit note urgently.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "payment_dispute"` 2. [exact-match] `urgency == "high"` 3. [exact-match] `sub_type == null` 4. [semantic] reasoning captures urgency signal

---

### T-14 — Smeba EN dispute

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000014"
  inngest_run_id: "inn_01HY00014CLEAN14"
  stage: "classify"
  subject: "Disputing invoice - wrong service delivered"
  body_text: |
    Hello,

    We would like to dispute the last invoice we received. The service
    described does not match what was actually delivered on site. Please
    contact our office to resolve this.

    Regards,
    Michael Thompson
  sender_email: "mike@thompson-logistics.com"
  sender_domain: "thompson-logistics.com"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-09T16:22:00Z"
```

```json
{
  "intent": "payment_dispute",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "en",
  "confidence": "medium",
  "reasoning": "EN dispute about service mismatch; no invoice reference provided so confidence is medium pending human lookup.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "payment_dispute"` 2. [exact-match] `language == "en"` 3. [exact-match] `document_reference == null` 4. [exact-match] `confidence == "medium"`

---

### T-15 — Smeba-Fire NL dispute

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000015"
  inngest_run_id: "inn_01HY00015CLEAN15"
  stage: "classify"
  subject: "Betwisting factuur 33045989"
  body_text: |
    Geachte,

    Wij betwisten factuur 33045989 aangezien de installatie nog niet opgeleverd
    is. Gelieve deze factuur op te schorten tot na oplevering.

    Met vriendelijke groeten,
    Technische dienst - AZ Sint-Lucas
  sender_email: "techdienst@az-sintlucas.be"
  sender_domain: "az-sintlucas.be"
  mailbox: "debiteuren@smeba-fire.be"
  entity: "smeba-fire"
  received_at: "2026-04-22T11:50:00Z"
```

```json
{
  "intent": "payment_dispute",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Flemish NL dispute — sender withholds payment pending project delivery; not a copy request.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "payment_dispute"` 2. [exact-match] `sub_type == null` 3. [exact-match] `confidence == "high"` 4. [semantic] reasoning mentions delivery/oplevering

---

### T-16 — Smeba NL address change

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000016"
  inngest_run_id: "inn_01HY00016CLEAN16"
  stage: "classify"
  subject: "Wijziging factuuradres"
  body_text: |
    Beste,

    Wij zijn per 1 mei verhuisd. Gelieve onze factuurgegevens te wijzigen naar:

    Bakkerij De Korenhof BV
    Kerkstraat 12
    3811 CV Amersfoort

    Met vriendelijke groet,
    Sandra Koster
  sender_email: "sandra@de-korenhof.nl"
  sender_domain: "de-korenhof.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-21T09:30:00Z"
```

```json
{
  "intent": "address_change",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Clear NL address change request; sender provides full new billing address.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "address_change"` 2. [exact-match] `sub_type == null` 3. [exact-match] `confidence == "high"` 4. [exact-match] `language == "nl"`

---

### T-17 — Berki NL address change (name + address)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000017"
  inngest_run_id: "inn_01HY00017CLEAN17"
  stage: "classify"
  subject: "Nieuwe bedrijfsnaam en -adres"
  body_text: |
    Hallo,

    Per 1 april zijn wij gefuseerd. Gelieve onze gegevens aan te passen:

    Oud: Van Veen Techniek BV
    Nieuw: VV-Groep BV, Industrieweg 4, 7325 AR Apeldoorn
    KvK: 12345678
    BTW: NL123456789B01

    Graag aangepast in uw systeem.

    Mvg,
    Henk van Veen
  sender_email: "h.vanveen@vv-groep.nl"
  sender_domain: "vv-groep.nl"
  mailbox: "debiteuren@berki.nl"
  entity: "berki"
  received_at: "2026-04-20T13:14:00Z"
```

```json
{
  "intent": "address_change",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "NL request to update company name, address and VAT after merger; complete data provided.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "address_change"` 2. [exact-match] `confidence == "high"` 3. [exact-match] `sub_type == null` 4. [exact-match] `document_reference == null`

---

### T-18 — Sicli-Noord address change hinting e-invoice

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000018"
  inngest_run_id: "inn_01HY00018CLEAN18"
  stage: "classify"
  subject: "Adreswijziging en factuurmailadres"
  body_text: |
    Beste,

    Gelieve onze facturen voortaan te sturen naar facturen@nieuwadres.be.
    Het postadres blijft ongewijzigd.

    Dank,
    Linda Vermeulen
  sender_email: "l.vermeulen@bouwbedrijf-vermeulen.be"
  sender_domain: "bouwbedrijf-vermeulen.be"
  mailbox: "debiteuren@sicli-noord.be"
  entity: "sicli-noord"
  received_at: "2026-04-19T10:40:00Z"
```

```json
{
  "intent": "address_change",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "medium",
  "reasoning": "Flemish NL request to change invoice delivery email; interpretable as address_change but could be read as general admin tweak — medium confidence.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "address_change"` 2. [exact-match] `sub_type == null` 3. [exact-match] `confidence == "medium"` 4. [semantic] reasoning acknowledges borderline signal

---

### T-19 — Smeba NL Peppol onboarding

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000019"
  inngest_run_id: "inn_01HY00019CLEAN19"
  stage: "classify"
  subject: "Peppol-facturatie"
  body_text: |
    Beste,

    Wij ontvangen onze facturen voortaan graag via het Peppol-netwerk. Ons
    Peppol-ID is 0106:12345678. Kunt u onze facturatie hierop aansluiten?

    Met vriendelijke groet,
    Erwin de Boer
    Finance - Stichting Thuiszorg Oost
  sender_email: "e.deboer@thuiszorg-oost.nl"
  sender_domain: "thuiszorg-oost.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-18T08:55:00Z"
```

```json
{
  "intent": "peppol_request",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Explicit NL request to be onboarded for Peppol invoicing, Peppol-ID provided.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "peppol_request"` 2. [exact-match] `sub_type == null` 3. [exact-match] `confidence == "high"` 4. [contains] reasoning references Peppol

---

### T-20 — Sicli-Noord Peppol

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000020"
  inngest_run_id: "inn_01HY00020CLEAN20"
  stage: "classify"
  subject: "Aansluiting Peppol"
  body_text: |
    Beste,

    Kunnen wij vanaf volgende maand via Peppol gefactureerd worden? Peppol-ID
    0208:0123456789. Dit is voor ons een wettelijke verplichting vanaf 2026.

    Met vriendelijke groeten,
    Kris Deprez
  sender_email: "k.deprez@gemeente-aalst.be"
  sender_domain: "gemeente-aalst.be"
  mailbox: "debiteuren@sicli-noord.be"
  entity: "sicli-noord"
  received_at: "2026-04-17T14:00:00Z"
```

```json
{
  "intent": "peppol_request",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "Flemish NL Peppol onboarding request; legal mandate cited, ID provided.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "peppol_request"` 2. [exact-match] `confidence == "high"` 3. [exact-match] `sub_type == null` 4. [contains] reasoning references Peppol

---

### T-21 — Smeba credit request

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000021"
  inngest_run_id: "inn_01HY00021CLEAN21"
  stage: "classify"
  subject: "Aanvraag creditnota - factuur 33044105"
  body_text: |
    Geachte heer/mevrouw,

    Op factuur 33044105 is een onderdeel gefactureerd dat uiteindelijk niet
    geleverd is (regel 3: verdeelstuk DN50). Gelieve hiervoor een creditnota
    op te maken van EUR 184,50 excl. BTW.

    Met vriendelijke groet,
    Astrid Bos
  sender_email: "a.bos@installatiebedrijf-bos.nl"
  sender_domain: "installatiebedrijf-bos.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-16T11:20:00Z"
```

```json
{
  "intent": "credit_request",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "NL explicit request to issue a credit note for an invoice line not delivered; actionable credit request, not a copy request.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "credit_request"` 2. [exact-match] `sub_type == null` 3. [exact-match] `document_reference == null` 4. [semantic] reasoning distinguishes credit_request from payment_dispute

---

### T-22 — Berki credit request, soft phrasing

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000022"
  inngest_run_id: "inn_01HY00022CLEAN22"
  stage: "classify"
  subject: "Kan hier een creditnota voor?"
  body_text: |
    Hoi,

    Zoals besproken op locatie heeft de monteur maar 2 uur gewerkt ipv de
    gefactureerde 4. Kan hier een creditnota voor komen?

    Groet,
    Tim
  sender_email: "tim@bouwservice-utrecht.nl"
  sender_domain: "bouwservice-utrecht.nl"
  mailbox: "debiteuren@berki.nl"
  entity: "berki"
  received_at: "2026-04-15T09:45:00Z"
```

```json
{
  "intent": "credit_request",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "medium",
  "reasoning": "NL informal credit request for hours discrepancy; borderline with payment_dispute but the action asked for is a credit note.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "credit_request"` 2. [exact-match] `confidence == "medium"` 3. [exact-match] `sub_type == null` 4. [semantic] reasoning acknowledges dispute overlap

---

### T-23 — Smeba contract inquiry

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000023"
  inngest_run_id: "inn_01HY00023CLEAN23"
  stage: "classify"
  subject: "Vraag over onderhoudscontract"
  body_text: |
    Beste,

    Wij willen graag weten wat er precies onder ons onderhoudscontract valt.
    Kan iemand mij terugbellen om dit door te nemen? Tel: 06-12345678.

    Met vriendelijke groet,
    Frank Nijhuis
  sender_email: "f.nijhuis@nijhuis-horeca.nl"
  sender_domain: "nijhuis-horeca.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-14T15:10:00Z"
```

```json
{
  "intent": "contract_inquiry",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "high",
  "reasoning": "NL request for clarification about maintenance contract scope; informational, not a copy request.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "contract_inquiry"` 2. [exact-match] `sub_type == null` 3. [exact-match] `document_reference == null` 4. [exact-match] `confidence == "high"`

---

### T-24 — Smeba-Fire contract cancellation question (medium)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000024"
  inngest_run_id: "inn_01HY00024CLEAN24"
  stage: "classify"
  subject: "Opzegtermijn contract"
  body_text: |
    Beste,

    Wat is de opzegtermijn van ons lopende servicecontract? Wij overwegen
    over te stappen.

    Mvg,
    Greet Peeters
  sender_email: "g.peeters@klooster-sint-anna.be"
  sender_domain: "klooster-sint-anna.be"
  mailbox: "debiteuren@smeba-fire.be"
  entity: "smeba-fire"
  received_at: "2026-04-13T10:25:00Z"
```

```json
{
  "intent": "contract_inquiry",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "medium",
  "reasoning": "Flemish NL inquiry about contract notice period; borderline with cancellation intent but currently only informational.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "contract_inquiry"` 2. [exact-match] `confidence == "medium"` 3. [exact-match] `sub_type == null` 4. [semantic] reasoning acknowledges borderline nature

---

### T-25 — Smeba general inquiry

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000025"
  inngest_run_id: "inn_01HY00025CLEAN25"
  stage: "classify"
  subject: "Vraag"
  body_text: |
    Hallo,

    Kunt u mij vertellen wie onze vaste contactpersoon is bij Smeba? Ik ben
    nieuw in de functie en wil even voorstellen.

    Groet,
    Marloes Stevens
  sender_email: "m.stevens@stevens-vastgoed.nl"
  sender_domain: "stevens-vastgoed.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-12T13:50:00Z"
```

```json
{
  "intent": "general_inquiry",
  "sub_type": null,
  "document_reference": null,
  "urgency": "low",
  "language": "nl",
  "confidence": "medium",
  "reasoning": "NL generic introductory question about contact persons; not tied to invoice, contract or address actions.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "general_inquiry"` 2. [exact-match] `sub_type == null` 3. [exact-match] `document_reference == null` 4. [exact-match] `confidence == "medium"`

---

### T-26 — Berki "rekeningoverzicht" request (boundary — must NOT become copy_document_request)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000026"
  inngest_run_id: "inn_01HY00026CLEAN26"
  stage: "classify"
  subject: "Rekeningoverzicht openstaande posten"
  body_text: |
    Beste,

    Kunt u mij een rekeningoverzicht sturen van onze openstaande posten? Wij
    willen graag een totaalbeeld hebben om alles in een keer af te wikkelen.

    Mvg,
    Crediteurenadministratie
  sender_email: "crediteuren@hoogendijk-groep.nl"
  sender_domain: "hoogendijk-groep.nl"
  mailbox: "debiteuren@berki.nl"
  entity: "berki"
  received_at: "2026-04-11T09:00:00Z"
```

```json
{
  "intent": "general_inquiry",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "medium",
  "reasoning": "NL request for a rekeningoverzicht (statement of open items); per spec collapsed into general_inquiry because fetchDocument has no statement type.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "general_inquiry"` 2. [exact-match] `sub_type == null` 3. [exact-match] `document_reference == null` 4. [semantic] reasoning explicitly explains why this is not `copy_document_request`

---

### T-27 — Sicli-Sud FR vague reply (low confidence)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000027"
  inngest_run_id: "inn_01HY00027CLEAN27"
  stage: "classify"
  subject: "Re: votre courrier"
  body_text: |
    Bonjour,

    Je ne comprends pas votre dernier message. Pouvez-vous m'expliquer de quoi
    il s'agit?

    Merci,
    Nathalie
  sender_email: "n.martin@atelier-martin.be"
  sender_domain: "atelier-martin.be"
  mailbox: "facturations@sicli-sud.be"
  entity: "sicli-sud"
  received_at: "2026-04-10T11:15:00Z"
```

```json
{
  "intent": "general_inquiry",
  "sub_type": null,
  "document_reference": null,
  "urgency": "low",
  "language": "fr",
  "confidence": "low",
  "reasoning": "Short vague FR reply asking for clarification; no actionable intent identifiable.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `language == "fr"` 2. [exact-match] `confidence == "low"` 3. [exact-match] `sub_type == null` 4. [exact-match] `document_reference == null`

---

### T-28 — Smeba OOO-style footer wrapped in other intent (low confidence)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000028"
  inngest_run_id: "inn_01HY00028CLEAN28"
  stage: "classify"
  subject: "Bedankt"
  body_text: |
    Dankjewel voor de snelle reactie!

    Groet,
    Tom
  sender_email: "tom@bedrijfje.nl"
  sender_domain: "bedrijfje.nl"
  mailbox: "debiteuren@smeba.nl"
  entity: "smeba"
  received_at: "2026-04-22T15:35:00Z"
```

```json
{
  "intent": "other",
  "sub_type": null,
  "document_reference": null,
  "urgency": "low",
  "language": "nl",
  "confidence": "low",
  "reasoning": "Thank-you message with no action requested; does not map to any actionable intent.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "other"` 2. [exact-match] `confidence == "low"` 3. [exact-match] `sub_type == null` 4. [exact-match] `document_reference == null`

---

### T-29 — Berki "other" (spam-like but not quite spam)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000029"
  inngest_run_id: "inn_01HY00029CLEAN29"
  stage: "classify"
  subject: "Uitnodiging netwerkevent"
  body_text: |
    Beste relatie,

    Wij nodigen u uit voor ons jaarlijkse netwerkevent op 5 juni. Aanmelden
    via bijgevoegde link.

    Hartelijke groet,
    Marketing Team
  sender_email: "events@branchevereniging.nl"
  sender_domain: "branchevereniging.nl"
  mailbox: "debiteuren@berki.nl"
  entity: "berki"
  received_at: "2026-04-21T12:00:00Z"
```

```json
{
  "intent": "other",
  "sub_type": null,
  "document_reference": null,
  "urgency": "low",
  "language": "nl",
  "confidence": "low",
  "reasoning": "Marketing invitation unrelated to debtor AR workflows; no actionable AR intent.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "other"` 2. [exact-match] `confidence == "low"` 3. [exact-match] `sub_type == null` 4. [exact-match] `urgency == "low"`

---

### T-30 — Sicli-Noord NL forwarding a supplier question (variation — medium/other)

```yaml
inputs:
  email_id: "11111111-0001-4000-8000-000000000030"
  inngest_run_id: "inn_01HY00030CLEAN30"
  stage: "classify"
  subject: "FWD: vraag van onze boekhouder"
  body_text: |
    Beste,

    Onze boekhouder heeft nog een paar vragen over het BTW-regime dat op onze
    facturen staat. Kunt u hem rechtstreeks contacteren? bb@accountant.be

    Mvg,
    Ann
  sender_email: "a.devos@vos-logistics.be"
  sender_domain: "vos-logistics.be"
  mailbox: "debiteuren@sicli-noord.be"
  entity: "sicli-noord"
  received_at: "2026-04-20T14:22:00Z"
```

```json
{
  "intent": "general_inquiry",
  "sub_type": null,
  "document_reference": null,
  "urgency": "normal",
  "language": "nl",
  "confidence": "medium",
  "reasoning": "Flemish NL forward referring accountant for VAT question; generic inquiry with no specific document or action.",
  "intent_version": "2026-04-23.v1"
}
```

**Pass criteria:** 1. [exact-match] `intent == "general_inquiry"` 2. [exact-match] `sub_type == null` 3. [exact-match] `confidence == "medium"` 4. [exact-match] `language == "nl"`

---

## Multi-Model Comparison Matrix

Compare the clean dataset against the agent's primary + 4 fallback models (per research-brief §"Fallback chain") plus one extra provider for 6-model coverage. Run 5 representative cases first.

| Test ID | Input summary | `anthropic/claude-haiku-4-5-20251001` (primary) | `openai/gpt-4o-mini` (fb1) | `google-ai/gemini-2.5-flash` (fb2) | `mistral/mistral-large-latest` (fb3) | `anthropic/claude-3-5-haiku-20241022` (fb4) | `google-ai/gemini-2.5-pro` (extra) |
|---------|---------------|--------------------------------------------------|---------------------------|-------------------------------------|---------------------------------------|----------------------------------------------|--------------------------------------|
| T-01 | NL invoice copy, clean ref | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-09 | FR invoice copy | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-10 | DE invoice copy | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-11 | NL payment dispute w/ invoice# | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-26 | NL rekeningoverzicht boundary | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-27 | FR low-confidence vague | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |

Key checks per cell:
- intent matches expected
- `document_reference` matches expected (incl. `null` where expected)
- `confidence` within ±1 bucket of expected
- schema-valid JSON

---

## Notes

- Model IDs above match the agent spec and research-brief. Validate against Orq MCP `list_models` before running experiments — if `mistral/mistral-large-latest` is pinned (e.g. `mistral-large-2411`), substitute.
- The clean dataset is the first half of a two-file set. Edge dataset: `debtor-intent-agent-edge-dataset.md` (15 cases, 33% adversarial ratio).
- Dataset version pinned to `2026-04-23.v1`. Any change to the agent's prompt/schema requires regenerating both files and bumping the version.
