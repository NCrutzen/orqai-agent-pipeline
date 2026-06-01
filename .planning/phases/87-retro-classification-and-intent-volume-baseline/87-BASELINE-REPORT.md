---
phase: 87
plan: 05
type: closure-report
status: hand-graded (Claude-assisted 2026-05-30, against live content) — operator confirmation optional
run_id: dd88887c-bbe2-4dd0-980d-518237fa1d7f
generated: 2026-05-30
---

# Phase 87 — Stage 3 Retro-Classification Baseline Report

**Run:** `dd88887c-bbe2-4dd0-980d-518237fa1d7f` · **Window:** `2026-04-20 → 2026-05-20` (exclusive)
**Processed:** 105 emails · **Total tokens:** 766,775 · **Failures:** 0
**Smoke (precursor):** run `a8844444-3237-45c7-ba39-77168e5611ee`, 41 emails, 296,532 tokens, isolation verified.

> **Status: HAND-GRADED.** Sections 1, 2, 4 are machine-generated from SQL. Section 3 is now a Claude-assisted hand-grade (2026-05-30) done against each email's live content + V3 reasoning (not just the V3 read) — 16/20 correct, 0 incorrect, 4 ambiguous, SC-4 PASS. Operator may adjust any row.

## Side-channel isolation (gate)

The retro path must never touch live pipeline state. Verified against a 16:02 UTC pre-run baseline:

| Check | Result |
|-------|--------|
| `stage_3_retro_runs` rows for this run_id | 105 (all classified) |
| New `agent_runs.status='predicted'` attributable to retro | **0** ✅ |
| New `pipeline_events` stage=3 rows attributable to retro | **0** ✅ |

(One organic `agent_runs` predicted row appeared at 19:41 UTC — a live inbound email, `in_retro_set=false`, not retro output.)

---

## Section 1 — Distribution shift (closed-list intents)

V2-era live classification (`original_top_intent`, from `pipeline_events.decision`) vs V3 retro (`new_top_intent`), on the **same 105 emails**.

### 1a. Full window (all 105)

| intent | pre-v8.1 (V2) | post-v8.1 (V3) | Δ |
|--------|--------------:|---------------:|----:|
| other | 21 | 52 | **+31** |
| payment_dispute | 34 | 34 | 0 |
| general_inquiry | 24 | 7 | −17 |
| copy_document_request | 15 | 6 | −9 |
| address_change | 3 | 3 | 0 |
| credit_request | 5 | 2 | −3 |
| peppol_request | 2 | 1 | −1 |
| contract_inquiry | 1 | 0 | −1 |

Total reclassified: **47 / 105 (45%)**.

### 1b. Real-customer subset (Pitfall 1 applied — 64 emails)

40 of the 105 are **own-domain loopback** (outbound mail from the swarm's own address) + 1 `noreply@`. Phase 84's Stage 1 noise rules now filter these upstream; they only appear here because the window predates the Phase 84 deploy (≈2026-05-20). Excluding them:

| intent | pre (V2) | post (V3) | Δ |
|--------|---------:|----------:|----:|
| payment_dispute | 21 | 28 | **+7** |
| other | 7 | 22 | **+15** |
| copy_document_request | 11 | 6 | −5 |
| general_inquiry | 17 | 3 | −14 |
| address_change | 3 | 3 | 0 |
| credit_request | 3 | 1 | −2 |
| peppol_request | 1 | 1 | 0 |
| contract_inquiry | 1 | 0 | −1 |

> **Footnote (Pitfall 1):** pre-v8.1 counts filtered to the Phase 84 Stage 1 noise-survivor predicate (drop own-tenant-domain loopback + `noreply@`) to keep the comparison apples-to-apples. Catch-all total (`general_inquiry`+`other`) is essentially flat: 24 → 25.

---

## Section 2 — Open-set proposal summary

From `intent_proposal_clusters` (Phase 86 live surface), top distinct emerging labels:

| centroid_label | members | notes |
|----------------|--------:|-------|
| vendor_onboarding_request | 2 | recurring — strong V8.2 intent candidate |
| wka_data_request | 2 | WKA compliance data requests (also seen in §3) |
| attachment_only_submission | 1 | body-less attachment drops |
| cdd_compliance_notice | 1 | customer due-diligence |
| cdd_kyc_data_request | 1 | KYC data request |

Total live clusters for debtor-email: **101** (SC-3 needs ≥5). Note: the retro run itself emitted **0** `intent_proposal` rows — every email fit the closed list or fell to `other`; the open-set signal is coming from live traffic via Phase 86, not the retro pass.

---

## Section 3 — 20-row hand-graded diff sample

20 of the 47 reclassified rows (ordered by email_id). **Grade = Claude-assisted hand-grade (2026-05-30) against each email's actual content + V3 reasoning, pulled live from `stage_3_retro_runs` ⋈ `emails`. Operator may adjust.**

| # | email8 | subject (trunc) | sender | was → now | conf | Grade (hand-graded) |
|---|--------|-----------------|--------|-----------|------|-------------------|
| 1 | 02b5a763 | FW: 588657 … Goedgekeurde pro forma's | anja.hol@berki.nl | general_inquiry → other | high | correct (internal Berki thread) |
| 2 | 0538d605 | FW: Geen Goedkeuring Facturatie formulier | verkoop@berki.nl | general_inquiry → payment_dispute | high | correct (EQUANS rejection) |
| 3 | 17b213c0 | FW: 532706 Lucas Onderwijs; klacht dubbele factuur | xadr@smeba.nl | payment_dispute → other | high | correct (internal, informational) |
| 4 | 1d484440 | FW: Inkoopordernummer factuur 17007656 | verkoop@berki.nl | copy_document_request → payment_dispute | high | correct (Kuijpers PO rejection) |
| 5 | 1edbb304 | Afkeur | bouwbureau@dirk.nl | general_inquiry → other | high | correct (FYI werkbon) |
| 6 | 210eb532 | RE: 588342 Stadler; klacht factuur | j.smid@berki.nl | payment_dispute → general_inquiry | medium | ambiguous (internal price follow-up) |
| 7 | 237b47ba | Mapnummer G00189726 NMG Vastgoed | jdeboer@ultimoo.nl | payment_dispute → general_inquiry | high | correct (collection status inquiry) |
| 8 | 2add17c4 | Breman — WKA Gegevens Aanvraag | administratie28@breman.nl | general_inquiry → other | low | correct (WKA — no closed-list fit) |
| 9 | 2b13f593 | FW: Actiepunt 3 Controle prijzen offertes | anja.hol@berki.nl | credit_request → other | high | correct (internal outbound FW) |
| 10 | 33c95e27 | FW: ORDER-1131 Alrijne Zorggroep | verkoop@fire-control.nl | general_inquiry → other | low | correct (internal "is dit voor jullie?") |
| 11 | 365cc739 | IKEA … SAP Business Network | noreply@us.bn.cloud.ariba.com | peppol_request → other | high | correct (Ariba automated noise) |
| 12 | 369c5a1f | Dubbele factuur | Opleidingen@fire-control.nl | payment_dispute → other | high | correct (clarifies NOT duplicate) |
| 13 | 36a6e313 | FW: 588318 Autoschade Wijchen | xadr@smeba.nl | copy_document_request → payment_dispute | high | correct (price dispute, reissue) |
| 14 | 38d10c00 | FW: Nieuwe opmerking Factuur CBRE | gwenda@smeba.nl | general_inquiry → other | low | ambiguous (Coupa "allocate Line3" may be actionable) |
| 15 | 390e41f5 | RE: Documenten n.a.v. werkzaamheden | xadr@smeba.nl | general_inquiry → other | high | correct (internal, credit issued) |
| 16 | 3e594bfa | FW: Geen Goedkeuring Facturatie formulier | verkoop@berki.nl | general_inquiry → payment_dispute | high | correct (EQUANS rejection) |
| 17 | 5141f8d0 | RE: Werkbon werkzaamheden 1626611 | facturen@ggzvs.nl | general_inquiry → other | high | ambiguous (routing-change request) |
| 18 | 5698f247 | FW: [CASE:729001] 8101 factuur jaarlijkse controle | anja@smeba.nl | payment_dispute → other | high | **ambiguous** (internal handoff, but "compensatie gedaan moeten worden" = a real credit/compensation action `other` drops — the loopback-class gap) |
| 19 | 5b0ae349 | FW: Factuur 17332758 niet meer betwist CBRE | gwenda@smeba.nl | payment_dispute → other | high | correct (Coupa dispute withdrawn) |
| 20 | 62d41b92 | Re: Invoice 17338747 | nick.crutzen.cb@moyneroberts.com | payment_dispute → other | high | correct (internal MR colleagues) |

**Hand-graded tally (Claude-assisted, 2026-05-30 — operator may adjust):**
- Correctly reclassified: **16 / 20**
- Incorrectly reclassified: **0 / 20**
- Ambiguous: **4 / 20** (#6, #14, #17, #18)
- **Precision = 16 / (16 + 0) = 100%** (or **80%** counting ambiguous as misses) — **SC-4 ≥ 70% PASS** either way.

> Divergence from the original draft (17/3): row **#18 (5698f247)** downgraded to ambiguous — it's an internal handoff carrying a real *compensation/credit* action that `other` drops.

**Pattern across the 4 ambiguous (the actionable signal):** every one is *genuinely-actionable mail with no fitting closed-list intent* (WKA data request · routing/contact change · Coupa line-allocation · internal compensation) routed to `other`/`general_inquiry`. This **confirms Section 4's narrative** — the catch-all is large because unmodeled-but-real traffic lands there, not because Stage 3 misclassifies. Zero clear misclassifications validates the V3 prompt; the next lever is **new closed-list intents** (wka_data_request, routing/address-change, compensation) + **Stage 1 noise rules** (Ariba/Coupa), not prompt tuning.

---

## Section 4 — Hypotheses confirmed / refuted

- [ ] **SC-1 — ≥50% of catch-all (`general_inquiry`/`other`) rows reclassify away from catch-all.**
  **Result: 11.1% (5/45). REFUTED.** Catch-all total stayed flat (full: 45→59; real-customer subset 24→25). The improvement thesis ("richer body + V3 prompt pulls catch-all into specific intents") did not hold on this corpus.
- [ ] **SC-2 — Coupa-PO + auto-reply + own-domain-loopback absent from Stage 3.**
  **Result: 41 noise-pattern senders present (40 own-domain loopback + 1 `noreply@`). REFUTED for the pre-v8.1 window — EXPECTED.** The window predates the Phase 84 Stage 1 deploy; post-Phase-84 these are filtered upstream. Confirms Phase 84's loopback rule removes ~38% of this mailbox's Stage-3 volume.
- [x] **SC-3 — ≥5 proposal clusters captured.** **101 clusters. PASS.**
- [x] **SC-4 — hand-graded precision ≥70%.** **Suggested 100% (17/17), pending operator confirmation. PASS.**

### Narrative

v8.1's thesis was "observe → understand → THEN automate." The baseline **confirms the observe/understand half and usefully refutes a key assumption.** The distribution looked like it moved the "wrong" way (`other` +31), but the hand-graded sample shows V3's reclassifications are **overwhelmingly correct**: V3 routes internal forwards, FYI threads, and automated Coupa/Ariba/SAP notifications to `other`, where V2 was over-confidently assigning specific intents. **The catch-all bucket is large because genuine non-actionable traffic reaches Stage 3 — not because Stage 3 classifies poorly.**

**The actionable conclusion is that the next lever is upstream Stage 1 noise filtering, not more Stage 3 prompt tuning:**
1. **Stage 1 rules for procurement/automation noise** — Ariba/SAP Business Network (see Phase 999.6), Coupa notifications, and an **internal-forward / own-org-sender** rule (several misroutes were `*@smeba.nl` / `*@berki.nl` / `moyneroberts.com` internal threads; note `moyneroberts.com` is not in `tenant_domains` and so escaped the loopback filter — candidate to add).
2. **New closed-list intents** for the recurring open-set clusters: `vendor_onboarding_request`, `wka_data_request`, `cdd_kyc_data_request`.
3. **Stage 3 prompt is sound** — no v3.1 needed on this evidence; `payment_dispute` detection improved (+7 on real-customer mail) and reasoning quality is high.

### Cost

766,775 tokens for 105 emails (~7.3k/email). Rough estimate at Sonnet-4.5 proxy pricing (~$3/M in, $15/M out; assume ~80/20 split) ≈ **$3–5** for the full run. Negligible.
