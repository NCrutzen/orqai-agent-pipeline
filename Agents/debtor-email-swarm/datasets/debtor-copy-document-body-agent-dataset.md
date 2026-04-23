---
name: debtor-copy-document-body-agent — clean evaluation dataset
agent_key: debtor-copy-document-body-agent
dataset_type: clean
case_count: 20
version: 2026-04-23.v1
body_version: 2026-04-23.v1
---

# debtor-copy-document-body-agent — Clean Dataset

> **Purpose:** Happy-path evaluation of the `debtor-copy-document-body-agent` HTML cover-letter generator on realistic post-intent, post-fetch inputs. Validates language/entity register selection, greeting-line logic, footer integrity, no-signature rule, de-escalation discipline, and schema-compliance. For adversarial and edge inputs, see `debtor-copy-document-body-agent-edge-dataset.md`.

## Coverage

- **Languages:** 15 NL (10 NL-NL Smeba/Berki, 5 Flemish-BE Sicli-Noord/Smeba-Fire) · 2 EN · 1 DE · 2 FR
- **Entities:** smeba · berki · sicli-noord · sicli-sud · smeba-fire (all 5)
- **sub_type distribution:** 15 invoice · 3 credit_note · 1 werkbon · 1 quote
- **sender_first_name:** ~12 present · ~8 absent
- **Tone:** 17 neutral · 3 de-escalation (emotion_trigger_match=true)

## Metrics this dataset supports

- **Language-correctness** — body language matches `email_language` (target ≥99%)
- **Footer-presence + completeness** — exact `<hr>` + monospace footer with all 5 audit fields (target 100%)
- **No-signature rule** — no "Met vriendelijke groet / Kind regards / Cordialement / Mit freundlichen Grüßen" blocks outside the footer (target 100%)
- **Team-line close present** — correct entity-language team-line (target 100%)
- **Tone-trigger correctness** — `detected_tone` matches orchestrator-provided `emotion_trigger_match`, and when `de-escalation` the prepended sentence is one of the 4 canonical strings (target 100%)
- **Length** — 3-6 sentences of body content + closing service line + team line + footer (advisory)
- **Schema compliance** — 100% of outputs must parse against the `debtor_copy_document_body_result` JSON schema (strict mode)
- **Idempotency** — byte-identical outputs on primary model for same serialized variables (separate idempotency dataset planned)

## Upload instructions (Orq Datasets)

**Option A — Orq Studio UI:**

1. Open Orq Studio → Datasets → New Dataset.
2. Name: `debtor-copy-document-body-agent-clean-2026-04-23`.
3. Schema: upload the `debtor_copy_document_body_result` JSON Schema from the agent spec as the expected-output schema.
4. For each T-## row below, create a datapoint with `inputs = { email_id, inngest_run_id, stage, email_subject, email_body_text, email_sender_email, email_sender_first_name, email_mailbox, email_entity, email_language, intent_result_intent, intent_result_sub_type, intent_result_document_reference, intent_result_confidence, fetched_document_invoice_id, fetched_document_filename, fetched_document_document_type, fetched_document_created_on, body_version, emotion_trigger_match }` and `expected_output = <the expected JSON>`.
5. Tag: `clean`, `phase-1`, `v2026-04-23.v1`.

**Option B — MCP (`mcp__orqai-mcp__create_dataset` + `create_datapoints`):**

```ts
const ds = await createDataset({
  name: "debtor-copy-document-body-agent-clean-2026-04-23",
  description: "Clean evaluation dataset for debtor-copy-document-body-agent phase 1",
});

await createDatapoints({
  dataset_id: ds.id,
  datapoints: cases.map((c) => ({
    inputs: c.inputs,
    expected_output: c.expected_output,
    metadata: { body_version: "2026-04-23.v1", category: "happy-path", language: c.language, entity: c.entity, tone: c.tone },
  })),
});
```

Run experiments against the primary model (`anthropic/claude-sonnet-4-6`) plus the 4 fallbacks (`openai/gpt-4o`, `google-ai/gemini-2.5-pro`, `anthropic/claude-sonnet-4-5`, `mistral/mistral-large-latest`).

---

## Test Inputs

| ID | Entity | Language | sub_type | First name? | Tone | Category |
|----|--------|----------|----------|-------------|------|----------|
| T-01 | smeba | nl | invoice | Jan | neutral | happy-path |
| T-02 | smeba | nl | invoice | Saskia | neutral | happy-path |
| T-03 | berki | nl | credit_note | Dirk | neutral | happy-path |
| T-04 | smeba | nl | invoice | — | neutral | happy-path |
| T-05 | berki | nl | invoice | Ellen | neutral | happy-path |
| T-06 | smeba | nl | quote | Bart | neutral | happy-path |
| T-07 | berki | nl | invoice | — | neutral | happy-path |
| T-08 | smeba | nl | credit_note | Astrid | neutral | happy-path |
| T-09 | smeba | nl | invoice | Jeroen | neutral | happy-path |
| T-10 | berki | nl | invoice | — | de-escalation | variation |
| T-11 | sicli-noord | nl | werkbon | Hilde | neutral | happy-path |
| T-12 | sicli-noord | nl | invoice | Anke | neutral | happy-path |
| T-13 | smeba-fire | nl | credit_note | Marc | neutral | happy-path |
| T-14 | smeba-fire | nl | invoice | — | neutral | happy-path |
| T-15 | sicli-noord | nl | invoice | Patrick | de-escalation | variation |
| T-16 | smeba | en | invoice | Sarah | neutral | happy-path |
| T-17 | smeba | en | invoice | — | neutral | happy-path |
| T-18 | smeba-fire | de | invoice | Klaus | neutral | happy-path |
| T-19 | sicli-sud | fr | invoice | — | neutral | happy-path |
| T-20 | sicli-sud | fr | invoice | Sophie | de-escalation | variation |

---

## Eval Pairs

### T-01 — NL neutral Smeba, invoice, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000001"
  inngest_run_id: "inn_01HYB0001CLEAN01"
  stage: "generate_body"
  email_subject: "Kopie factuur 33052208"
  email_body_text: |
    Beste,

    Zou u mij een kopie kunnen toesturen van factuur 33052208? Wij hebben deze
    niet in ons archief kunnen terugvinden.

    Alvast bedankt.

    Met vriendelijke groet,
    Jan de Vries
  email_sender_email: "jan@bakker-installatie.nl"
  email_sender_first_name: "Jan"
  email_mailbox: "debiteuren@smeba.nl"
  email_entity: "smeba"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33052208"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127c9"
  fetched_document_filename: "20260420084919994294_nl-invoice-33052208.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-20 08:49:20"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Jan,</p><p>Hartelijk dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van factuur 33052208.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Smeba</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33052208 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000001</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Jan,</p>` (NL first-name greeting)
2. [contains] Mentions `factuur 33052208`
3. [contains] Team-line `Team Debiteuren Smeba`
4. [format] Ends with exact footer pattern `ref: 33052208 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000001</div>`
5. [exact-match] `detected_tone == "neutral"`
6. [exact-match] `body_version == "2026-04-23.v1"`
7. [semantic] No signature block (no "Met vriendelijke groet", no person name close)
8. [format] NL-NL register indicator — uses "hierbij", "in de bijlage", or "treft u aan"

---

### T-02 — NL neutral Smeba, invoice, first-name, formal sender

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000002"
  inngest_run_id: "inn_01HYB0002CLEAN02"
  stage: "generate_body"
  email_subject: "Gelieve kopie F33051977 toe te sturen"
  email_body_text: |
    Geachte heer/mevrouw,

    Gelieve ons een kopie te bezorgen van factuur F33051977. Wij hebben deze
    nodig voor onze boekhouding.

    Met vriendelijke groet,
    Saskia Verhoeven
  email_sender_email: "boekhouding@vandenberg-groep.nl"
  email_sender_first_name: "Saskia"
  email_mailbox: "debiteuren@smeba.nl"
  email_entity: "smeba"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "F33051977"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127ca"
  fetched_document_filename: "20260420103233991234_nl-invoice-F33051977.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-20 10:32:33"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Saskia,</p><p>Dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van factuur F33051977.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Smeba</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: F33051977 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000002</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Saskia,</p>`
2. [contains] `factuur F33051977`
3. [contains] `Team Debiteuren Smeba`
4. [format] Footer ends with `email_id: 22222222-0001-4000-8000-000000000002</div>`
5. [exact-match] `detected_tone == "neutral"`
6. [semantic] Stays formal ("uw", not "je") despite sender's formal register
7. [semantic] No signature block

---

### T-03 — NL neutral Berki, credit note, first-name, casual sender but formal reply

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000003"
  inngest_run_id: "inn_01HYB0003CLEAN03"
  stage: "generate_body"
  email_subject: "kopie creditnota 33049882 aub"
  email_body_text: |
    Hoi,

    Kan je me de creditnota 33049882 nog eens doorsturen? Ik heb hem nodig voor
    de aansluiting in de boekhouding.

    Thx alvast,
    Dirk
  email_sender_email: "dirk.peeters@logistiek-noord.nl"
  email_sender_first_name: "Dirk"
  email_mailbox: "debiteuren@berki.nl"
  email_entity: "berki"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "credit_note"
  intent_result_document_reference: "33049882"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127cb"
  fetched_document_filename: "20260419144002881234_nl-creditnote-33049882.pdf"
  fetched_document_document_type: "credit_note"
  fetched_document_created_on: "2026-04-19 14:40:02"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Dirk,</p><p>Dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van creditnota 33049882.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Berki</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33049882 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000003</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Dirk,</p>`
2. [contains] `creditnota 33049882` (NL localization of credit_note, NOT "credit note" or "creditnote")
3. [contains] `Team Debiteuren Berki`
4. [semantic] Formal "uw" (not "je") — never downgrade register for AR first contact
5. [format] Footer correct with `ref: 33049882`
6. [exact-match] `detected_tone == "neutral"`
7. [semantic] No signature block

---

### T-04 — NL neutral Smeba, invoice, NO first name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000004"
  inngest_run_id: "inn_01HYB0004CLEAN04"
  stage: "generate_body"
  email_subject: "Factuur kopie aub"
  email_body_text: |
    Goedemiddag,

    Graag ontvangen wij een kopie van factuur 33052901 voor de dossier-administratie.

    Administratie Prinsen & Zonen
  email_sender_email: "admin@prinsen-zonen.nl"
  email_sender_first_name: null
  email_mailbox: "debiteuren@smeba.nl"
  email_entity: "smeba"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33052901"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127d1"
  fetched_document_filename: "20260421091002335511_nl-invoice-33052901.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-21 09:10:02"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste heer/mevrouw,</p><p>Dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van factuur 33052901.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Smeba</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33052901 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000004</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste heer/mevrouw,</p>` (honorific fallback for NL when no first name)
2. [contains] `factuur 33052901`
3. [contains] `Team Debiteuren Smeba`
4. [format] Footer `ref: 33052901` · `email_id: 22222222-0001-4000-8000-000000000004`
5. [exact-match] `detected_tone == "neutral"`
6. [semantic] No signature block

---

### T-05 — NL neutral Berki, invoice, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000005"
  inngest_run_id: "inn_01HYB0005CLEAN05"
  stage: "generate_body"
  email_subject: "Factuur 33048711 opnieuw"
  email_body_text: |
    Beste,

    Onze boekhouder heeft factuur 33048711 niet ontvangen. Kunnen jullie deze
    opnieuw doorsturen?

    Met vriendelijke groet,
    Ellen de Wit
  email_sender_email: "ellen@dewit-handel.nl"
  email_sender_first_name: "Ellen"
  email_mailbox: "debiteuren@berki.nl"
  email_entity: "berki"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33048711"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127d2"
  fetched_document_filename: "20260416093011221100_nl-invoice-33048711.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-16 09:30:11"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Ellen,</p><p>Dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van factuur 33048711.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Berki</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33048711 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000005</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Ellen,</p>`
2. [contains] `factuur 33048711`
3. [contains] `Team Debiteuren Berki`
4. [format] Footer correct
5. [exact-match] `detected_tone == "neutral"`
6. [semantic] No signature block

---

### T-06 — NL neutral Smeba, quote, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000006"
  inngest_run_id: "inn_01HYB0006CLEAN06"
  stage: "generate_body"
  email_subject: "Offerte 41203 - kopie gewenst"
  email_body_text: |
    Goedemiddag,

    Zouden jullie mij een kopie van offerte 41203 kunnen sturen? Ik moet deze
    nog intern voorleggen voor akkoord.

    Groeten,
    Bart Janssen
  email_sender_email: "bart@janssen-vastgoed.nl"
  email_sender_first_name: "Bart"
  email_mailbox: "debiteuren@smeba.nl"
  email_entity: "smeba"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "quote"
  intent_result_document_reference: "41203"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127d3"
  fetched_document_filename: "20260417133022111000_nl-quote-41203.pdf"
  fetched_document_document_type: "quote"
  fetched_document_created_on: "2026-04-17 13:30:22"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Bart,</p><p>Dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van offerte 41203.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Smeba</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 41203 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000006</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Bart,</p>`
2. [contains] `offerte 41203` (NL localization of quote)
3. [contains] `Team Debiteuren Smeba`
4. [format] Footer `ref: 41203`
5. [exact-match] `detected_tone == "neutral"`
6. [semantic] Does not say "factuur" or "invoice" — respects sub_type=quote

---

### T-07 — NL neutral Berki, invoice, NO first name, short email

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000007"
  inngest_run_id: "inn_01HYB0007CLEAN07"
  stage: "generate_body"
  email_subject: "Factuur 33050044"
  email_body_text: "Graag kopie van factuur 33050044. Dank."
  email_sender_email: "administratie@transport-koerier.nl"
  email_sender_first_name: null
  email_mailbox: "debiteuren@berki.nl"
  email_entity: "berki"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33050044"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127d4"
  fetched_document_filename: "20260418140033112233_nl-invoice-33050044.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-18 14:00:33"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste heer/mevrouw,</p><p>Dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van factuur 33050044.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Berki</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33050044 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000007</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste heer/mevrouw,</p>`
2. [contains] `factuur 33050044`
3. [contains] `Team Debiteuren Berki`
4. [semantic] Body still 3-6 sentences even though original email is 1 line
5. [exact-match] `detected_tone == "neutral"`

---

### T-08 — NL neutral Smeba, credit_note, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000008"
  inngest_run_id: "inn_01HYB0008CLEAN08"
  stage: "generate_body"
  email_subject: "Creditnota 33051450"
  email_body_text: |
    Beste,

    Kunt u mij een kopie sturen van creditnota 33051450? Ik moet deze nog
    koppelen aan de oorspronkelijke factuur in onze administratie.

    Met vriendelijke groet,
    Astrid Bos
  email_sender_email: "a.bos@installatiebedrijf-bos.nl"
  email_sender_first_name: "Astrid"
  email_mailbox: "debiteuren@smeba.nl"
  email_entity: "smeba"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "credit_note"
  intent_result_document_reference: "33051450"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127d5"
  fetched_document_filename: "20260419110022221133_nl-creditnote-33051450.pdf"
  fetched_document_document_type: "credit_note"
  fetched_document_created_on: "2026-04-19 11:00:22"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Astrid,</p><p>Dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van creditnota 33051450.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Smeba</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33051450 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000008</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Astrid,</p>`
2. [contains] `creditnota 33051450`
3. [contains] `Team Debiteuren Smeba`
4. [exact-match] `detected_tone == "neutral"`
5. [semantic] No signature block

---

### T-09 — NL neutral Smeba, invoice, first-name, continuation reply

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000009"
  inngest_run_id: "inn_01HYB0009CLEAN09"
  stage: "generate_body"
  email_subject: "RE: Factuur 33053102"
  email_body_text: |
    Beste,

    Zoals besproken aan de telefoon: graag nogmaals factuur 33053102 per mail.

    Met vriendelijke groet,
    Jeroen Bakker
  email_sender_email: "jeroen@bakker-installatie.nl"
  email_sender_first_name: "Jeroen"
  email_mailbox: "debiteuren@smeba.nl"
  email_entity: "smeba"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33053102"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127d6"
  fetched_document_filename: "20260422081122331100_nl-invoice-33053102.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-22 08:11:22"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Jeroen,</p><p>Dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van factuur 33053102.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Smeba</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33053102 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000009</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Jeroen,</p>`
2. [contains] `factuur 33053102`
3. [contains] `Team Debiteuren Smeba`
4. [exact-match] `detected_tone == "neutral"`
5. [semantic] No signature block, no reference to phone call detail (avoid quoting sender)

---

### T-10 — NL DE-ESCALATION Berki, invoice, no first name (emotion trigger)

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000010"
  inngest_run_id: "inn_01HYB0010CLEAN10"
  stage: "generate_body"
  email_subject: "Waar blijft factuur 33051199??"
  email_body_text: |
    Waar blijft factuur 33051199?? Ik wacht al weken!! Dit is niet acceptabel.

    Debiteurenadministratie
  email_sender_email: "debiteuren@holding-zn.nl"
  email_sender_first_name: null
  email_mailbox: "debiteuren@berki.nl"
  email_entity: "berki"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33051199"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127d7"
  fetched_document_filename: "20260418101502889911_nl-invoice-33051199.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-18 10:15:02"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: true
```

```json
{
  "body_html": "<p>Beste heer/mevrouw,</p><p>Dank voor uw bericht en excuus voor het ongemak. In de bijlage treft u een kopie aan van factuur 33051199.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Berki</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33051199 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000010</div>",
  "detected_tone": "de-escalation",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste heer/mevrouw,</p>`
2. [contains] Exact canonical NL de-escalation sentence: `Dank voor uw bericht en excuus voor het ongemak.`
3. [contains] `factuur 33051199`
4. [contains] `Team Debiteuren Berki`
5. [exact-match] `detected_tone == "de-escalation"`
6. [semantic] NO specific-fault admission (no "sorry voor de vertraging", no "excuses dat u zo lang heeft moeten wachten")
7. [semantic] Exactly ONE de-escalation sentence — not two, not a paragraph

---

### T-11 — Flemish-BE neutral Sicli-Noord, werkbon, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000011"
  inngest_run_id: "inn_01HYB0011CLEAN11"
  stage: "generate_body"
  email_subject: "Werkbon 22104478 - gelieve door te sturen"
  email_body_text: |
    Beste,

    Wij ontvangen graag een kopie van werkbon 22104478 van de interventie
    vorige week. Het PV is zoek geraakt bij onze technieker.

    Dank bij voorbaat.

    Met vriendelijke groeten,
    Hilde Claes
  email_sender_email: "h.claes@metaalwerk-geel.be"
  email_sender_first_name: "Hilde"
  email_mailbox: "debiteuren@sicli-noord.be"
  email_entity: "sicli-noord"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "werkbon"
  intent_result_document_reference: "22104478"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127d8"
  fetched_document_filename: "20260421082500001122_nl-werkbon-22104478.pdf"
  fetched_document_document_type: "werkbon"
  fetched_document_created_on: "2026-04-21 08:25:00"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Hilde,</p><p>Dank voor uw bericht. Gelieve in bijlage een kopie van werkbon 22104478 te vinden.</p><p>Bij vragen kan u mij altijd contacteren.<br>Team Debiteuren Sicli-Noord</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 22104478 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000011</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Hilde,</p>`
2. [contains] `werkbon 22104478`
3. [contains] `Team Debiteuren Sicli-Noord`
4. [format] Flemish register markers — uses `gelieve` AND/OR `in bijlage` (not NL-NL `hierbij treft u aan`)
5. [format] Flemish close `Bij vragen kan u mij altijd contacteren.` OR `Heeft u vragen? Dan hoor ik het graag.` (both acceptable)
6. [exact-match] `detected_tone == "neutral"`
7. [semantic] No signature block

---

### T-12 — Flemish-BE neutral Sicli-Noord, invoice, first-name, casual sender

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000012"
  inngest_run_id: "inn_01HYB0012CLEAN12"
  stage: "generate_body"
  email_subject: "factuur 33049882"
  email_body_text: |
    Hallo, kan je mij een kopie van factuur 33049882 bezorgen? Bedankt!

    Anke
  email_sender_email: "anke@bouwbedrijf-dewilde.be"
  email_sender_first_name: "Anke"
  email_mailbox: "debiteuren@sicli-noord.be"
  email_entity: "sicli-noord"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33049882"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127d9"
  fetched_document_filename: "20260411083021221133_nl-invoice-33049882.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-11 08:30:21"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Anke,</p><p>Dank voor uw bericht. Gelieve in bijlage een kopie van factuur 33049882 te vinden.</p><p>Bij vragen kan u mij altijd contacteren.<br>Team Debiteuren Sicli-Noord</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33049882 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000012</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Anke,</p>`
2. [contains] `factuur 33049882`
3. [contains] `Team Debiteuren Sicli-Noord`
4. [semantic] Stays formal ("uw", "u") — does NOT mirror sender's casual "je"/"kan je"
5. [format] Flemish register indicator — `gelieve` or `in bijlage`
6. [exact-match] `detected_tone == "neutral"`

---

### T-13 — Flemish-BE neutral Smeba-Fire, credit_note, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000013"
  inngest_run_id: "inn_01HYB0013CLEAN13"
  stage: "generate_body"
  email_subject: "Kopie creditnota CN-33048220"
  email_body_text: |
    Geachte,

    Gelieve ons een kopie van creditnota CN-33048220 te bezorgen. Wij hebben
    deze nodig voor onze interne boekhouding.

    Met vriendelijke groeten,
    Marc Vermeiren
  email_sender_email: "m.vermeiren@lindenhof-residentie.be"
  email_sender_first_name: "Marc"
  email_mailbox: "debiteuren@smeba-fire.be"
  email_entity: "smeba-fire"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "credit_note"
  intent_result_document_reference: "CN-33048220"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127da"
  fetched_document_filename: "20260415110044991122_nl-creditnote-CN-33048220.pdf"
  fetched_document_document_type: "credit_note"
  fetched_document_created_on: "2026-04-15 11:00:44"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste Marc,</p><p>Dank voor uw bericht. Gelieve in bijlage een kopie van creditnota CN-33048220 te vinden.</p><p>Bij vragen kan u mij altijd contacteren.<br>Team Debiteuren Smeba-Fire</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: CN-33048220 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000013</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Marc,</p>`
2. [contains] `creditnota CN-33048220`
3. [contains] `Team Debiteuren Smeba-Fire`
4. [format] Flemish register — `gelieve` or `in bijlage`
5. [exact-match] `detected_tone == "neutral"`

---

### T-14 — Flemish-BE neutral Smeba-Fire, invoice, no first name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000014"
  inngest_run_id: "inn_01HYB0014CLEAN14"
  stage: "generate_body"
  email_subject: "kopie factuur 33052045"
  email_body_text: |
    Beste,

    Kunnen wij een kopie bekomen van factuur 33052045?

    Vriendelijke groeten,
    Administratie
  email_sender_email: "administratie@sintlucaswegenbouw.be"
  email_sender_first_name: null
  email_mailbox: "debiteuren@smeba-fire.be"
  email_entity: "smeba-fire"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33052045"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127db"
  fetched_document_filename: "20260420144011441100_nl-invoice-33052045.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-20 14:40:11"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Beste heer/mevrouw,</p><p>Dank voor uw bericht. Gelieve in bijlage een kopie van factuur 33052045 te vinden.</p><p>Bij vragen kan u mij altijd contacteren.<br>Team Debiteuren Smeba-Fire</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33052045 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000014</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste heer/mevrouw,</p>`
2. [contains] `factuur 33052045`
3. [contains] `Team Debiteuren Smeba-Fire`
4. [format] Flemish register
5. [exact-match] `detected_tone == "neutral"`

---

### T-15 — Flemish-BE DE-ESCALATION Sicli-Noord, invoice, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000015"
  inngest_run_id: "inn_01HYB0015CLEAN15"
  stage: "generate_body"
  email_subject: "Al weken wachten op factuur 33050112"
  email_body_text: |
    Beste,

    Ik wacht al weken op een kopie van factuur 33050112. Dit begint ongehoord
    te worden. Gelieve deze zo spoedig mogelijk te bezorgen!!

    Patrick Joris
  email_sender_email: "p.joris@joris-constructies.be"
  email_sender_first_name: "Patrick"
  email_mailbox: "debiteuren@sicli-noord.be"
  email_entity: "sicli-noord"
  email_language: "nl"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33050112"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127dc"
  fetched_document_filename: "20260410080522991100_nl-invoice-33050112.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-10 08:05:22"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: true
```

```json
{
  "body_html": "<p>Beste Patrick,</p><p>Dank voor uw bericht en excuus voor het ongemak. Gelieve in bijlage een kopie van factuur 33050112 te vinden.</p><p>Bij vragen kan u mij altijd contacteren.<br>Team Debiteuren Sicli-Noord</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33050112 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000015</div>",
  "detected_tone": "de-escalation",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Beste Patrick,</p>`
2. [contains] Exact canonical NL de-escalation sentence: `Dank voor uw bericht en excuus voor het ongemak.`
3. [contains] `factuur 33050112`
4. [contains] `Team Debiteuren Sicli-Noord`
5. [format] Flemish register preserved in de-escalation mode — `gelieve`/`in bijlage`
6. [exact-match] `detected_tone == "de-escalation"`
7. [semantic] No specific-fault admission (no "excuses voor de vertraging")

---

### T-16 — EN neutral Smeba, invoice, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000016"
  inngest_run_id: "inn_01HYB0016CLEAN16"
  stage: "generate_body"
  email_subject: "Invoice copy request 33050445"
  email_body_text: |
    Hi,

    Could you resend invoice 33050445 please? I cannot find it in my inbox.

    Thanks,
    Sarah Miller
  email_sender_email: "s.miller@miller-logistics.com"
  email_sender_first_name: "Sarah"
  email_mailbox: "debiteuren@smeba.nl"
  email_entity: "smeba"
  email_language: "en"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33050445"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127dd"
  fetched_document_filename: "20260415091233771144_en-invoice-33050445.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-15 09:12:33"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Dear Sarah,</p><p>Thank you for your message. Please find attached a copy of invoice 33050445.</p><p>If you have any questions, please let me know.<br>Accounts Receivable — Smeba</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33050445 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000016</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Dear Sarah,</p>`
2. [contains] `invoice 33050445`
3. [contains] `Accounts Receivable — Smeba`
4. [format] Uses EN close pattern "If you have any questions, please let me know."
5. [exact-match] `detected_tone == "neutral"`
6. [semantic] No signature block (no "Kind regards", no "Sincerely", no person name)

---

### T-17 — EN neutral Smeba, invoice, no first name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000017"
  inngest_run_id: "inn_01HYB0017CLEAN17"
  stage: "generate_body"
  email_subject: "Copy of invoice 33051009"
  email_body_text: |
    Dear Sir or Madam,

    We kindly request a copy of invoice 33051009 for our records.

    Regards,
    Procurement Department
  email_sender_email: "procurement@globaltrade-uk.com"
  email_sender_first_name: null
  email_mailbox: "debiteuren@smeba.nl"
  email_entity: "smeba"
  email_language: "en"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33051009"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127de"
  fetched_document_filename: "20260416140011221133_en-invoice-33051009.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-16 14:00:11"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Dear Sir or Madam,</p><p>Thank you for your message. Please find attached a copy of invoice 33051009.</p><p>If you have any questions, please let me know.<br>Accounts Receivable — Smeba</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33051009 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000017</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Dear Sir or Madam,</p>` (EN honorific fallback)
2. [contains] `invoice 33051009`
3. [contains] `Accounts Receivable — Smeba`
4. [exact-match] `detected_tone == "neutral"`
5. [semantic] No signature block

---

### T-18 — DE neutral Smeba-Fire, invoice, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000018"
  inngest_run_id: "inn_01HYB0018CLEAN18"
  stage: "generate_body"
  email_subject: "Rechnung 33049117 - Kopie bitte"
  email_body_text: |
    Sehr geehrte Damen und Herren,

    koennten Sie mir bitte eine Kopie der Rechnung 33049117 zusenden? Vielen Dank.

    Mit freundlichen Gruessen,
    Klaus Hoffmann
  email_sender_email: "k.hoffmann@hoffmann-industrie.de"
  email_sender_first_name: "Klaus"
  email_mailbox: "debiteuren@smeba-fire.be"
  email_entity: "smeba-fire"
  email_language: "de"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33049117"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127df"
  fetched_document_filename: "20260412114500771133_de-invoice-33049117.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-12 11:45:00"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Guten Tag Klaus,</p><p>Vielen Dank für Ihre Nachricht. Anbei erhalten Sie eine Kopie der Rechnung 33049117.</p><p>Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.<br>Das Debitorenteam Smeba-Fire</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33049117 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000018</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Guten Tag Klaus,</p>`
2. [contains] `Rechnung 33049117` (DE localization of invoice)
3. [contains] `Das Debitorenteam Smeba-Fire`
4. [format] Uses DE close `Bei Rückfragen stehe ich Ihnen gerne zur Verfügung.`
5. [exact-match] `detected_tone == "neutral"`
6. [semantic] No signature block (no "Mit freundlichen Grüßen" outside footer)

---

### T-19 — FR neutral Sicli-Sud, invoice, no first name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000019"
  inngest_run_id: "inn_01HYB0019CLEAN19"
  stage: "generate_body"
  email_subject: "Copie facture 33048721"
  email_body_text: |
    Bonjour,

    Pourriez-vous me renvoyer la facture 33048721 ? Je ne la retrouve pas.
    Merci.

    Service comptabilité
  email_sender_email: "compta@immo-sud.be"
  email_sender_first_name: null
  email_mailbox: "facturations@sicli-sud.be"
  email_entity: "sicli-sud"
  email_language: "fr"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33048721"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127e0"
  fetched_document_filename: "20260410073011775511_fr-invoice-33048721.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-10 07:30:11"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: false
```

```json
{
  "body_html": "<p>Madame, Monsieur,</p><p>Nous vous remercions de votre message. Vous trouverez ci-joint une copie de la facture 33048721.</p><p>Je reste à votre disposition pour toute information complémentaire.<br>Le service débiteurs Sicli-Sud</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33048721 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000019</div>",
  "detected_tone": "neutral",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Madame, Monsieur,</p>` (FR honorific fallback, comma not period)
2. [contains] `facture 33048721`
3. [contains] `Le service débiteurs Sicli-Sud`
4. [format] Uses FR close `Je reste à votre disposition pour toute information complémentaire.`
5. [exact-match] `detected_tone == "neutral"`
6. [semantic] No signature block (no "Cordialement", no "Bien à vous", no person name)
7. [semantic] Uses BE-French formal AR phrasing (e.g. "ci-joint")

---

### T-20 — FR DE-ESCALATION Sicli-Sud, invoice, first-name

```yaml
inputs:
  email_id: "22222222-0001-4000-8000-000000000020"
  inngest_run_id: "inn_01HYB0020CLEAN20"
  stage: "generate_body"
  email_subject: "Facture 33047223 - inacceptable"
  email_body_text: |
    Bonjour,

    J'attends depuis des semaines une copie de la facture 33047223. C'est
    inacceptable !! Merci de l'envoyer sans délai.

    Sophie Delvaux
  email_sender_email: "s.delvaux@atelier-delvaux.be"
  email_sender_first_name: "Sophie"
  email_mailbox: "facturations@sicli-sud.be"
  email_entity: "sicli-sud"
  email_language: "fr"
  intent_result_intent: "copy_document_request"
  intent_result_sub_type: "invoice"
  intent_result_document_reference: "33047223"
  intent_result_confidence: "high"
  fetched_document_invoice_id: "2c9180839d49f41e019d721fcb5127e1"
  fetched_document_filename: "20260408090022881133_fr-invoice-33047223.pdf"
  fetched_document_document_type: "invoice"
  fetched_document_created_on: "2026-04-08 09:00:22"
  body_version: "2026-04-23.v1"
  emotion_trigger_match: true
```

```json
{
  "body_html": "<p>Bonjour Sophie,</p><p>Merci pour votre message et veuillez nous excuser pour le désagrément. Vous trouverez ci-joint une copie de la facture 33047223.</p><p>Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.<br>Le service débiteurs Sicli-Sud</p><hr style=\"border:none;border-top:1px solid #ccc;margin:20px 0 8px\"><div style=\"font-family:monospace;font-size:11px;color:#888\">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33047223 · body_version: 2026-04-23.v1 · email_id: 22222222-0001-4000-8000-000000000020</div>",
  "detected_tone": "de-escalation",
  "body_version": "2026-04-23.v1"
}
```

**Pass criteria:**
1. [format] Opens with `<p>Bonjour Sophie,</p>`
2. [contains] Exact canonical FR de-escalation sentence: `Merci pour votre message et veuillez nous excuser pour le désagrément.`
3. [contains] `facture 33047223`
4. [contains] `Le service débiteurs Sicli-Sud`
5. [format] Uses FR de-escalation close `Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.` (explicitly allowed when detected_tone == de-escalation AND language == fr)
6. [exact-match] `detected_tone == "de-escalation"`
7. [semantic] No admission of specific fault (no "désolé du retard")

---

## Multi-Model Comparison Matrix

Compare against the agent's primary + 4 fallback models (per agent spec). Run 6 representative cases.

| Test ID | Input summary | `anthropic/claude-sonnet-4-6` (primary) | `openai/gpt-4o` (fb1) | `google-ai/gemini-2.5-pro` (fb2) | `anthropic/claude-sonnet-4-5` (fb3) | `mistral/mistral-large-latest` (fb4) | `cohere/command-r-08-2024` (extra) |
|---------|---------------|------------------------------------------|------------------------|------------------------------------|--------------------------------------|---------------------------------------|-------------------------------------|
| T-01 | NL neutral Smeba invoice | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-10 | NL de-escalation Berki invoice | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-12 | Flemish Sicli-Noord invoice casual sender | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-16 | EN neutral Smeba invoice | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-19 | FR neutral Sicli-Sud invoice | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |
| T-20 | FR de-escalation Sicli-Sud invoice | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail | [ ] pass / [ ] fail |

Key checks per cell:
- Correct greeting for language + first-name-presence
- Correct document type localization (factuur/invoice/Rechnung/facture)
- Correct team-line for entity + language
- Footer integrity (all 5 fields, exact pattern)
- No signature block
- `detected_tone` matches `emotion_trigger_match` input
- Schema-valid JSON

---

## Notes

- Model IDs above match the agent spec and research-brief. Validate against Orq MCP `list_models` before running experiments.
- The clean dataset is the first half of a two-file set. Edge dataset: `debtor-copy-document-body-agent-edge-dataset.md` (10 cases, 33% adversarial ratio).
- Dataset version pinned to `2026-04-23.v1`. Any change to the agent's prompt/schema requires regenerating both files and bumping `body_version`.
- Byte-equality is guaranteed on primary model only. Fallbacks may drift ±5% token-level; downstream must not assert byte-equality across model variants.
