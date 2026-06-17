# Resolver Customer-Match Eval — Operator Validation (2026-06-16)

**Source sheet:** [`resolver-eval.xlsx`](./resolver-eval.xlsx) (tabs `Validatie` + `Uitleg`).
**Validator:** debiteurenbeheer collega (manual, one-off interne controle).
**Sample:** 100 debtor inbound emails, each carrying the resolver's proposed customer + method + confidence.
**Question asked:** *"Klopt de klant die de nieuwe resolver aan deze e-mail koppelt?"* (Ja / Nee / Twijfel) + the correct NXT customer number + on which criterion the human recognised the right customer.

> **Ground-truth note (operator, 2026-06-16):** Exact customer numbers == NXT customer numbers (same numbering). The collega cross-checked in Exact (debiteurenkaart / factuurhistorie); those numbers are therefore valid NXT ground-truth. A resolver number that differs from his Exact lookup is simply **wrong** — there is no system-mapping discrepancy to reconcile.

This eval is the **operator-grounded requirements basis and acceptance baseline for milestone V9.5** (Stage-2 Corroboration + Attachment-Borne Identifiers + cross-brand scope). See `.planning/ROADMAP.md` → V9.5.

---

## Headline result

| Verdict | Count |
|---|---|
| ✅ Ja (correct) | 64 |
| ❌ Nee (wrong) | 25 |
| ❓ Twijfel (uncertain / not derivable from the mail) | 11 |
| **Total** | **100** |

**Baseline accuracy = 64% correct.** V9.5 "done" = significantly reduce the 36 Nee+Twijfel against this same 100-row set.

## The 64% average is strongly bimodal — accuracy splits by *method*

| Method the resolver used | Accuracy (Ja%) | n | Verdict |
|---|---|---|---|
| **Factuurnummer** | **97%** | 39 | gold signal — self-authenticating ID |
| **Klantnummer (zelf-opgegeven)** | **92%** | 12 | gold signal — self-authenticating ID |
| Thread-historie | 50% | 10 | mixed |
| **Afzender / e-maildomein** | **21%** | 28 | **dominant error source** |
| (no method / blocked) | 36% | 11 | n/a |

By resolver-declared type: **AUTO (1 candidate) = 86%** vs **SUGGESTIE (N candidates) = 13%**.
By resolver-declared confidence: **hoog = 93% · midden = 50% · laag = 13%** → confidence is well-calibrated; the resolver already *knows* when it is guessing.

**Architectural read:** the self-authenticating ID tier (factuur / klantnummer) is production-grade (~95%). The damage is concentrated in **sender/domain matching**, which must not auto-resolve when the scope holds multiple candidates. This is exactly the D-06 corroboration thesis, now confirmed on debtor with operator ground-truth.

---

## Error taxonomy — the 36 Nee/Twijfel mapped to V9.5 phases

| Bucket | What goes wrong | n | V9.5 home |
|---|---|---|---|
| **A** | The answer (factuur/klantnr) lives **in an attachment** (PDF/Excel), not in the mail body | 7 | **Phase 121** (attachment-borne identifiers) |
| **B** | **Sender/name ambiguous** — many customer accounts under one org/name/postcode; not disambiguable from the mail alone | 12 | **Phase 120** (multi-signal corroboration) |
| **C** | Customer belongs to a **different brand entity** than the mailbox (smeba-fire vs smeba-BB, berki) → single-scope search misses it | 9 | **Phase 122** (cross-brand-scope resolution) |
| **D** | **Factuurnummer present in the subject** but not used (sender/thread chosen instead) | 3 | **rides along in Phase 121** (extraction + precedence) |

(Buckets overlap on some rows; e.g. #19/#24 are A∩B, #67/#69/#70 are B∩C, #85/#86 are C∩D.)

### ⚠️ The most dangerous class: confident-wrong AUTO

Four rows were `AUTO` + confidence `hoog` and **still wrong** (#2, #85, #95, #97) — a confident false positive is the exact failure D-06 corroboration exists to catch (a second independent signal would have disagreed and demoted). Plus four `AUTO`/`midden` wrong via thread-history (#80, #86, #96, #98). These are the highest-priority cases: the resolver was *sure* and *wrong*.

### Bucket A — answer in attachment (→ Phase 121)
`#16` klantnr in bijlage · `#19` factuur→klantnr across mailed-in PDFs · `#24` Excel with 358 invoice rows, all different customers (edge case: one mail → many customers) · `#28` klantnr in bijlage · `#29` klantnr in bijlage · `#86` klantnr in bijlage + factuur in subject · `#15` nothing in body, no attachment surfaced.

### Bucket B — sender/name ambiguity (→ Phase 120)
`#7` Fedasil 30+ accounts · `#10` "bri groep" 4 · `#31` "'s Heeren Loo" 10 · `#39/#40/#47` postcode 3980 CA → 18 accounts · `#67/#69/#70` CBRE 25 accounts (Smeba BB) · `#80` SPIE Building Solutions 18 accounts (picked wrong via thread) · `#19/#24` multi-customer mails.
**The validator himself could not disambiguate these from the mail** → these are *Twijfel*, not operator error. Resolver must demote sender-match to suggestie/blocked when scope holds >1 candidate, and corroborate with a second signal (postcode→Site).

### Bucket C — wrong brand entity (→ Phase 122)
`#37` "betreft smeba BB, niet smeba fire" · `#85` "moet smeba fire zijn, geen smeba BB" · `#95/#96/#97/#98` "moet in mailbox van berki zitten" · `#67/#69/#70` CBRE under Smeba BB entity.
Mail lands in one brand mailbox but the customer lives under a different brand's `scope_key`; a single-brand-scoped back-search cannot find it. Right customer *is* resolvable (collega found it in Exact via factuur) — the resolver just searched the wrong scope.

### Bucket D — factuur in subject not used (→ extraction/precedence)
`#83` factuur in subject + customer email in thread footer · `#85` factuur in subject (also bucket C) · `#86` factuur in subject + klantnr in bijlage.
Gold signal was present in the subject line but a weaker method (sender/thread) was chosen → invoice extraction must read the subject and outrank sender-match in precedence.

---

## Implications for V9.5 (acceptance baseline)

1. **Phase 120 (corroboration)** is validated on debtor, not just sales spike-011: ~12 ambiguity errors + the confident-wrong AUTO class. Sender/domain-match must not AUTO at >1 candidate; ≥2 agreeing independent signals raise confidence deterministically.
2. **Phase 121 (attachment-borne IDs)** has direct payoff evidence: 7 errors where the only id was in a PDF/Excel attachment. Pairs with the live attachment recall lever (PR #96).
3. **Phase 122 (cross-brand scope)** — NEW, added from this eval: 9 errors where the customer is under a different brand entity than the mailbox. Resolver scope_key handling / multi-scope back-search.
4. **Bucket D rides along in Phase 121:** parse factuurnummer from the subject; factuur > sender in precedence (same extraction-completeness theme as attachment-borne IDs — no separate todo).
5. **Acceptance metric for V9.5:** re-run the resolver over these same 100 emails after 120/121/122 land; target a material reduction of the 36 Nee+Twijfel (especially eliminating the 4 confident-wrong AUTO and the bucket-A/C cases where ground-truth is now known). Sits alongside (does not replace) the no-Engine-diff measurement that finalises V9.0 STAGE2-01.

## Reproducibility

The 100 rows + per-row verdicts/criteria are in `resolver-eval.xlsx` (`Validatie` tab). Columns: proposed customer (H), method (I), evidence (J), type (K), confidence (L), and the operator's verdict (M), correct number (N), criterion (O), free-text (P). Keep this set frozen as the V9.5 regression fixture.
