# Phase 84 — CORPUS-SAMPLES.md

**Phase:** 84 — Stage 1 noise rules for AP-automation FYI traffic
**Wave:** 0 (Plan 84-01)
**Compiled:** 2026-05-20 via `web/scripts/phase-84-corpus-probe.ts` against
`email_pipeline.emails` (service-role read).
**Hand-confirmation:** every row below was inspected for sender_email +
subject before listing as a positive. Rows that matched a probe filter but
did NOT fit the D-01 template (e.g. "FW: ... door CBRE" forwards for the
ISS-only Coupa rules) were excluded.

> **Hard-separation reminder:** every category below registers in
> `swarm_noise_categories` ONLY (Stage 1). No swarm_intents rows are written
> in Phase 84. Enforced by `web/__tests__/static-checks/swarm-hard-separation.test.ts`.

## Promotion gate (D-05) status

D-05 = Wilson-CI 7d shadow path **OR** corpus-evidence path (≥10
hand-confirmed positives + zero hand-confirmed FPs + 7-day live shadow shows
no FPs). The table below records today's evidence; the 7-day shadow is
Wave 3 (84-04).

| category | live_positives (debtor-email) | live_positives (sales-email) | hand_FPs | Wilson_path_eligible | corpus_path_eligible | gate_disposition | Day 7 decision (operator fills in) | promotion_date |
|----------|-------------------------------|------------------------------|----------|----------------------|----------------------|------------------|------------------------------------|----------------|
| coupa_invoice_paid_notification     | 3 (90d) | 0 | 0 | unlikely (<30) | NO (<10) | **corpus-short** — extend window or accept shadow-only | _(EXTEND / PROMOTE / HOLD / DROP-sales-email)_ | _(YYYY-MM-DD)_ |
| coupa_invoice_approved_notification | 3 (90d) | 0 | 0 | unlikely (<30) | NO (<10) | **corpus-short** — same | _(EXTEND / PROMOTE / HOLD / DROP-sales-email)_ | _(YYYY-MM-DD)_ |
| iss_ptp_autoreply                   | 3 (90d) | 0 | 0 | unlikely (<30) | NO (<10) | **corpus-short** — same | _(EXTEND / PROMOTE / HOLD / DROP-sales-email)_ | _(YYYY-MM-DD)_ |
| frieslandcampina_portal_reject      | 3 (90d) | 0 | 0 | unlikely (<30) | NO (<10) | **corpus-short** — same; Christiaan.Knipping FP risk noted | _(EXTEND / PROMOTE / HOLD / DROP-sales-email)_ | _(YYYY-MM-DD)_ |
| m365_quarantine                     | 3 (90d) | 0 | 0 | unlikely (<30) | NO (<10) | **corpus-short** — same | _(EXTEND / PROMOTE / HOLD / DROP-sales-email)_ | _(YYYY-MM-DD)_ |
| sender_phishing_notice              | 2 (90d) | 0 | 0 | unlikely (<30) | NO (<10) | **corpus-short** — narrow to one supplier (R-03) | _(EXTEND / PROMOTE / HOLD / DROP-sales-email)_ | _(YYYY-MM-DD)_ |
| supplier_bank_change_notification   | 1 (90d) | 0 | 0 | NO (N=1)        | NO (<10) | **corpus-very-short** — keep shadow-only, do not auto-promote | _(EXTEND / PROMOTE / HOLD / DROP-sales-email)_ | _(YYYY-MM-DD)_ |
| own_outbound_invoice_loopback       | 20+ (90d) | 0 | 0 | likely (N≥30 after 7d) | YES (≥10) | **eligible** — corpus path open | _(EXTEND / PROMOTE / HOLD / DROP-sales-email)_ | _(YYYY-MM-DD)_ |

**Filling rule (per PROMOTION-RUNBOOK.md section 3):**
- `PROMOTE` = status flipped to `promoted` for at least one swarm; fill `promotion_date`.
- `EXTEND` = shadow continues past Day 7; revisit weekly.
- `HOLD` = `status='candidate'` indefinitely (re-evaluate in V8.2).
- `DROP-sales-email` = `swarm_noise_categories.enabled=false` for the sales-email row only (R-04); debtor-email row may still PROMOTE.

**Operator action required (R-04 / Pitfall 7):** for the 7 categories where
the corpus-evidence path is short, decide whether to extend the corpus
window (>90d) or accept the Wilson-CI 7-day shadow as the sole gate.
Phase 84-04 (shadow) will re-evaluate.

## Per-swarm coverage gap rollup (D-08 / R-04)

**ZERO sales-email corpus positives** were found for any of the 8 categories
in the available `email_pipeline.emails` corpus today. The sales-email
mailbox surveyed was `verkoop@smeba.nl` (per `project_phase74_target_mailboxes`).
Per D-08 default = cross-swarm; per R-04 mitigation = drop a single swarm's
row if its sales-email corpus surfaces an FP.

Recommendations per category:

| category | sales-email recommendation |
|----------|----------------------------|
| coupa_invoice_paid_notification     | **keep cross-swarm** — sender `do_not_reply@issworld.coupahost.com` is generic; sales-email mailboxes can hit it incidentally; no observed FP |
| coupa_invoice_approved_notification | **keep cross-swarm** — same |
| iss_ptp_autoreply                   | **keep cross-swarm** — narrow to `Invoice-PtP@nl.issworld.com` sender |
| frieslandcampina_portal_reject      | **CAUTION** — `Christiaan.Knipping@frieslandcampina.com` "Offerte aanvraag Smeba 2026" hit verkoop@smeba.nl (legitimate sales lead). Rule is sender-pinned to `Robbie.Robot@frieslandcampina.com` so the FP is avoided structurally, but flag for shadow-review |
| m365_quarantine                     | **keep cross-swarm** — system mail, hits any tenant mailbox |
| sender_phishing_notice              | **keep cross-swarm** — currently one-supplier narrow (R-03) |
| supplier_bank_change_notification   | **keep cross-swarm** — sender-pinned to `info@farmplus.nl` |
| own_outbound_invoice_loopback       | **keep cross-swarm** — D-03 tenant-domain mechanism is inherently per-swarm via swarms.tenant_domains |

---

## coupa_invoice_paid_notification

**Template:** `Factuur ######## gemarkeerd als Betaald door ISS`
**Sender:** `do_not_reply@issworld.coupahost.com`
**Anchor decision (D-06 / RESEARCH Open Q #2):** `door ISS` only — CBRE
variants stay in Stage 3.

| email_id | mailbox | swarm | from_address | subject | direction | operator_verdict |
|----------|---------|-------|--------------|---------|-----------|------------------|
| 39f17226-f082-40fa-bf34-72d11e988adc | debiteuren@smeba-fire.be | debtor-email | do_not_reply@issworld.coupahost.com | Factuur 17332578 gemarkeerd als Betaald door ISS | incoming | positive |
| f33c0c32-15aa-4cbb-80cd-92ff84ac64d9 | debiteuren@smeba-fire.be | debtor-email | do_not_reply@issworld.coupahost.com | Factuur 17332579 gemarkeerd als Betaald door ISS | incoming | positive |
| 0feee171-4da6-4eaa-abb7-c474436a93e7 | debiteuren@smeba-fire.be | debtor-email | do_not_reply@issworld.coupahost.com | Factuur 17332576 gemarkeerd als Betaald door ISS | incoming | positive |

**Coverage gap:** 3/10. Hand-search of the 90-day corpus surfaced **only 3**
real positives with `door ISS` anchor; the broader probe (43 matches)
includes forwarded `door CBRE` rows from gwenda@smeba.nl which MUST stay
in Stage 3 (CONTEXT `<domain>` "Dropped from scope"). No FPs.

**False positives reviewed:** 0 (confirmed by inspection of subjects only).

**Sales-email coverage:** 0 positives. **keep cross-swarm** — sender-pinned, low FP risk.

---

## coupa_invoice_approved_notification

**Template:** `Factuur ######## is goedgekeurd voor betaling door ISS`
**Sender:** `do_not_reply@issworld.coupahost.com`
**Anchor decision (D-06):** `door ISS` only.

| email_id | mailbox | swarm | from_address | subject | direction | operator_verdict |
|----------|---------|-------|--------------|---------|-----------|------------------|
| c415624d-e108-4f05-9af2-b0fdac975e01 | debiteuren@smeba-fire.be | debtor-email | do_not_reply@issworld.coupahost.com | Factuur 17332578 is goedgekeurd voor betaling door ISS | incoming | positive |
| 7ff782a0-bc11-4abe-bbfc-5dbf0098e5b4 | debiteuren@smeba.nl | debtor-email | do_not_reply@issworld.coupahost.com | Factuur 17332579 is goedgekeurd voor betaling door ISS | incoming | positive |
| ce8d6f7c-f38a-40ec-868f-10b4b3e591b9 | debiteuren@smeba.nl | debtor-email | do_not_reply@issworld.coupahost.com | Factuur 17332576 is goedgekeurd voor betaling door ISS | incoming | positive |

**Coverage gap:** 3/10. Same as Coupa-Betaald — only 3 real `door ISS`
positives. Flag for Phase 84-04 corpus-window-extension decision.

**False positives reviewed:** 0.

**Sales-email coverage:** 0 positives. **keep cross-swarm** — sender-pinned.

---

## iss_ptp_autoreply

**Template:** `Automatisch antwoord: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: ########`
**Sender:** `Invoice-PtP@nl.issworld.com`

| email_id | mailbox | swarm | from_address | subject | direction | operator_verdict |
|----------|---------|-------|--------------|---------|-----------|------------------|
| 74008945-ad00-440f-bb65-f8931b0c2607 | administratie@fire-control.nl | debtor-email | Invoice-PtP@nl.issworld.com | Automatisch antwoord: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 25122603 | inbound | positive |
| 204952d2-4d1a-4cf2-b043-e937bebfd9e6 | debiteuren@smeba.nl | debtor-email | Invoice-PtP@nl.issworld.com | Automatisch antwoord: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17341747 | inbound | positive |
| e80e084f-2525-4b9c-84a4-27b68d2a2879 | debiteuren@smeba-fire.be | debtor-email | Invoice-PtP@nl.issworld.com | Automatisch antwoord: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17341439 | inbound | positive |

**Coverage gap:** 3/10. Volume is naturally low (per CONTEXT.md: ~3 emails
in the surveyed window). Body literally says "Verdere e-mails worden hier
niet gelezen" — true pure auto-reply. Sender + subject template are both
highly specific; FP risk negligible. Recommend accepting D-05's 7-day
shadow-only path here.

**False positives reviewed:** 0.

**Sales-email coverage:** 0 positives. **keep cross-swarm**.

---

## frieslandcampina_portal_reject

**Template:** `FINAL_REMINDER_Invoice received for Candex related purchase(s)_…`
**Sender:** `Robbie.Robot@frieslandcampina.com`

| email_id | mailbox | swarm | from_address | subject | direction | operator_verdict |
|----------|---------|-------|--------------|---------|-----------|------------------|
| 8c3eb31a-2d74-48bb-b18d-350e027867fb | debiteuren@smeba-fire.be | debtor-email | Robbie.Robot@frieslandcampina.com | FINAL_REMINDER_Invoice received for Candex related purchase(s)_7000_174479_17340234_17340235_17340234 | inbound | positive |
| 87473c8a-8669-4a2b-9787-b66c771b0ce6 | info@smeba.nl | info-routing (not D-08 scope) | Robbie.Robot@frieslandcampina.com | FINAL_REMINDER_Invoice received for Candex related purchase(s)_7000_174479_17334232 | incoming | positive (rule-shape) |
| c8086d25-d05c-415f-bff1-97b92688e639 | info@smeba.nl | info-routing (not D-08 scope) | Robbie.Robot@frieslandcampina.com | 02_REMINDER_Invoice received for Candex related purchase(s)_7000_174479_17334232 | incoming | positive (rule-shape) |

**Coverage gap:** 3/10 (1 strictly in debtor-email mailboxes; 2 more in
`info@smeba.nl` which is info-routing, not Phase 84's debtor-email or
sales-email scope). The Robbie.Robot+Candex template is structurally
unambiguous; the rule is sender-pinned which structurally rules out
cross-FP from the `Christiaan.Knipping@frieslandcampina.com` sales-email
contact (see Sales-email coverage below).

**Notes on related senders surfaced by the probe (NOT positives for this rule):**
- `ap.rejection@frieslandcampina.com` — different sender, same `Invoice
  received for Candex` subject. Operator may want a second category
  (`frieslandcampina_ap_rejection`) in a follow-up phase. Not in Phase 84 D-01.
- `fssc.ap.corporate@frieslandcampina.com` — "Your e-mail to the FC C.V."
  receipt template. Different category candidate; not in Phase 84 D-01.

**False positives reviewed:** 0 (`Christiaan.Knipping` is sales conversation,
NOT same sender → structurally excluded).

**Sales-email coverage:** 0 Robbie.Robot positives in verkoop@smeba.nl;
1 unrelated `Christiaan.Knipping@frieslandcampina.com` "Offerte aanvraag"
hit (legitimate sales lead) — does NOT trigger the Phase 84 rule because
the rule is sender-pinned to `Robbie.Robot@frieslandcampina.com`.
**keep cross-swarm** — structurally safe.

---

## m365_quarantine

**Template:** `Microsoft 365 security: You have messages in quarantine`
**Sender:** `q2q@apexfire.ie` (or any `q2q@...` apexfire tenant)

| email_id | mailbox | swarm | from_address | subject | direction | operator_verdict |
|----------|---------|-------|--------------|---------|-----------|------------------|
| 676adada-7c8f-4e75-bb4e-9ffb1d246af7 | administratie@fire-control.nl | debtor-email | q2q@apexfire.ie | Microsoft 365 security: You have messages in quarantine | inbound | positive |
| e3d6add8-ce20-44d0-94c7-7694872d6afc | debiteuren@sicli-noord.be | debtor-email | q2q@apexfire.ie | Microsoft 365 security: You have messages in quarantine | incoming | positive |
| efabc17a-2c86-4841-9d4b-4b4f775af03c | debiteuren@sicli-noord.be | debtor-email | q2q@apexfire.ie | Microsoft 365 security: You have messages in quarantine | incoming | positive |

**Coverage gap:** 3/10. The 4th probe match (`e2ed8d69-…` from
`Dmayer36@Prairieinet.Net` "[SPAM] You have messages in quarantine") is
NOT a positive — that's spam-prefixed unsolicited mail and the existing
`subject_spam_prefix` rule handles it. The Phase 84 boundary test in
classify.test.ts pins this behaviour.

**False positives reviewed:** 1 (Dmayer36 "[SPAM]" — correctly excluded;
existing spam rule wins per first-match-wins ordering).

**Sales-email coverage:** 0 positives. **keep cross-swarm** — system mail.

---

## sender_phishing_notice

**Template:** "Uitleg pishing mail" / "Voorgaande mail niet openen"
**Sender:** `melanie@rskinstallatie.nl` (R-03 narrow — one supplier)

| email_id | mailbox | swarm | from_address | subject | direction | operator_verdict |
|----------|---------|-------|--------------|---------|-----------|------------------|
| 6ca61888-96b3-4a3a-a3d9-d82c8d773719 | administratie@fire-control.nl | debtor-email | melanie@rskinstallatie.nl | Uitleg pishing mail | inbound | positive |
| e4afd80b-12a8-4c83-9bd9-0ef0f21cb6a7 | administratie@fire-control.nl | debtor-email | melanie@rskinstallatie.nl | Voorgaande mail niet openen | inbound | positive |

**Coverage gap:** 2/10. Per R-03 the pattern is intentionally one-supplier
narrow today. The 3rd Melanie row (`99c3ac8d-…` "RSK-FACT-DOC-26198") is a
normal business document subject — NOT a phishing-notice positive (it's the
NORMAL traffic from this sender; the test fixture for "negative" pins this
case).

**False positives reviewed:** 1 (`99c3ac8d` RSK-FACT-DOC normal business
subject — correctly excluded by the rule's subject-anchor on "pishing" /
"niet openen").

**Sales-email coverage:** 0 positives. **keep cross-swarm** — narrow rule.

---

## supplier_bank_change_notification

**Template:** subject mentioning `Wijziging huisbankier en betaalgegevens`,
body mentioning new IBAN.
**Sender:** `info@farmplus.nl`

| email_id | mailbox | swarm | from_address | subject | direction | operator_verdict |
|----------|---------|-------|--------------|---------|-----------|------------------|
| 1b668e99-dc96-4d8c-be63-ae3061bd1e58 | administratie@fire-control.nl | debtor-email | info@farmplus.nl | FarmPlus Wijziging huisbankier en betaalgegevens FarmPlus | inbound | positive |

**Coverage gap:** 1/10. Single positive in the surveyed window. This is the
weakest category by corpus evidence — D-05 corpus-path is NOT eligible.
Recommend Wave 3 (84-04) keeps `supplier_bank_change_notification` in
manual-review (`requires_orchestration=true`) until corpus extends. If
shadow surfaces no additional positives in 7 days, leave the rule as
`candidate` and revisit in V8.2 (per CONTEXT D-07 / deferred AP master-data
handler).

**False positives reviewed:** 0 (no other farmplus.nl rows surfaced).

**Sales-email coverage:** 0 positives. **keep cross-swarm** but expect zero
volume there.

---

## own_outbound_invoice_loopback

**Template:** D-03 dynamic — `direction='inbound' AND
lower(split_part(from_address, '@', 2)) = ANY(swarms.tenant_domains)`.
Today's observed shape: subject `Invoice ########` from
`administratie@fire-control.nl` arriving at `administratie@fire-control.nl`.

| email_id | mailbox | swarm | from_address | subject | direction | operator_verdict |
|----------|---------|-------|--------------|---------|-----------|------------------|
| e30ee88b-c324-43c5-838d-79b9a153bb83 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122947 | inbound | positive |
| 494be4e8-2987-41b1-b917-1a7a7a7b55a6 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122942 | inbound | positive |
| daad3d9e-05dd-47b6-8537-876a39ed739a | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122933 | inbound | positive |
| 626988b0-9115-40f3-94ed-7687343bf136 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122912 | inbound | positive |
| a60536fa-9fcb-4519-a8bf-b2a4116318a9 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122901 | inbound | positive |
| 41fc2d58-8395-41c8-8d9d-3e01d3c96fdb | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122882 | inbound | positive |
| 8e55ed52-388e-4cff-a9f6-08cb7cda4acc | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122818 | inbound | positive |
| 4f164a98-c914-41f0-aec1-7b6012145cb6 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122712 | inbound | positive |
| 89742d92-801e-4169-8642-1a9853f45aa5 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122693 | inbound | positive |
| 6727b822-91a8-4586-979e-6336db560109 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122649 | inbound | positive |
| a93a9694-38e6-4f5f-a3db-e6f25e3ddb60 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122648 | inbound | positive |
| d7fc663f-41eb-43b5-8be3-630a444b7948 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122639 | inbound | positive |
| 2d852165-a2bc-4c7f-896c-6dc1d7d0b36d | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122629 | inbound | positive |
| 15fa3cc4-88ed-443e-bead-ebe1904c474d | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122564 | inbound | positive |
| 4e96cf8d-9941-457b-8866-0464ccd22298 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122563 | inbound | positive |
| 774f6910-0b1f-40e5-84dd-e70807db789b | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122560 | inbound | positive |
| 1f7ccb82-3897-4dd1-ba63-9ce5e7cf87c4 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122551 | inbound | positive |
| 82fba60e-3346-4f31-89bb-efd8c73d953c | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122550 | inbound | positive |
| f7928324-c19a-423a-8be3-605d5be0bd38 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122538 | inbound | positive |
| 7f2efd81-4c0b-4bf2-ace2-cf9e553ea4a4 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122523 | inbound | positive |
| 535d9f45-ea74-4e0c-b7fd-ee24533d1497 | administratie@fire-control.nl | debtor-email | administratie@fire-control.nl | Invoice 25122522 | inbound | positive |

**Coverage:** 21/10. **Meets D-05 corpus-path threshold.** All positives are
strict `administratie@fire-control.nl → administratie@fire-control.nl` with
`direction='inbound'` and an `Invoice ########` subject.

**Negative rows surfaced by the probe (NOT positives):**
- `verkoop@fire-control.nl` → `administratie@fire-control.nl` rows (intra-
  company forwards, different local-part) — NOT the loopback case but
  arguably still own-domain inbound; the D-03 rule body
  `from_address.domain ∈ tenant_domains` WILL match these too. Operator
  decision (Wave 3): treat intra-company forwards as loopback noise, or
  carve out via a local-part guard? Currently the corpus shows these are
  also FYI; leaving them in scope of the rule.
- `info@fire-control.nl` → `administratie@fire-control.nl` "FW: Belangrijk:
  Uw KvK gegevens ..." — same intra-company forward concern.
- One pre-2026 `administratie@fire-control.nl` sent OUTBOUND row
  (`4ec94399-…` 2024-10-07, direction=`sent`) — correctly excluded by the
  `direction='inbound'` guard (D-03).

**False positives reviewed:** 0 in the strict `administratie → administratie`
shape. The intra-company-forward edge case noted above is **not a false
positive**, it is a Wave-3 scope question (does "intra-company outbound
landing in own AR mailbox" count as loopback noise? Operator confirms in
shadow).

**Sales-email coverage:** 0 positives (verkoop@smeba.nl is in a different
tenant; the loopback rule self-scopes via swarms.tenant_domains so this is
expected). **keep cross-swarm** — rule is tenant-domain-driven, sales-email
swarm row inherits its own tenant_domains entry.

---

## Methodology

- Corpus probe: `web/scripts/phase-84-corpus-probe.ts` (read-only,
  service-role, schema=email_pipeline).
- Filters: sender + subject patterns derived verbatim from CONTEXT.md
  `<domain>` block lines 20-28.
- Hand-confirmation: each candidate row was inspected against the D-01
  template anchor. `FW:` / `RE:` forwards by a customer (e.g. gwenda@smeba.nl
  forwarding "door CBRE") were excluded for the ISS-only Coupa rules per
  D-06.
- All `email_id` values are stable across the probe run; they remain valid
  references for the Wave 3 shadow-window operator review.
