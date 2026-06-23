---
spike: 012
name: order-entry-live-corpus-shape
type: standard
validates: "LIVE validation of Koen's Order-Entry voorwerk findings against the live order@smeba.nl mailbox (raw emails in email_pipeline.emails — ~30,469 incoming since 2024-04-15). Koen's claims are the HYPOTHESES; live mailbox content is the EVIDENCE; we classify INDEPENDENTLY (none of his labels/intents/CSVs are inputs). Tested hypotheses: H1 the swarm shape is Router (1-on-1 forward), not noise-filter; H2 the split is ~order-work 72% / ruis 25% / dispatch 3%; H3 the intent set holds (and whether the intent-first reframe is needed); H4 ~53% is attachment-dependent. Read-only; no runtime code or registry rows."
verdict: "DONE 2026-06-23 — PASS 2 ran the FULL corpus (30,469, 100% coverage). Shape = HYBRID: order_work 54.0% / forward 24.8% / archive 21.8%. Act-layer volume: ~2.2k quote_accepted + ~3.9k raise_order_valtimo + ~6.8k external_purchase_order; router tail mostly → planning; 32% attachment-dependent. Output /Volumes/Developer/pass2.jsonl = V10.5 eval dataset. (Bounded n=60 earlier: H1 confirmed (Koen's Router insight = the 25% forward slice; 62% is order-feeding the desk acts on). H2 substantially confirmed (~62/25/13 vs his 72/25/3). H4 refined: 46% carry attachments but only ~15% decision-blocking. Own-domain 43% = wrong-address customers + forwards → Stage-2 quoted-body recovery. Full 30k sweep = handoff (spike-012-pass2 runner). Zero Koen artifacts as input."
related: [004, 013]
idea: order-entry-act-proof
tags: [order-entry, v10.5, live-validation, corpus, router, classification, read-only]
---

# Spike 012: order-entry-live-corpus-shape

## Why this exists

V10.5 **Order Entry** (roadmap #124) is readiness-gated; one gate is the Order Entry spike.
Dim A asks: **what shape is this swarm and what work does it carry?** — Router (forward to a
department), noise-filter (archive), or order-feeding (create work in NXT).

Koen's voorwerk already *claims* answers (Router-not-noise; 72/25/3; an intent set; ~53%
attachment-dependent). **This spike is the LIVE VALIDATION of those findings** (Nick, 2026-06-22):

- Koen's findings are **hypotheses to test**, not inputs to trust.
- The **live mailbox is the evidence** — raw emails, classified by us from scratch.
- We **pull nothing from Koen**: no label CSVs, no `INTENT-VALIDATIE.md`, no intent-first set, no
  classification outputs. Each is excluded as input precisely so the validation is independent.

Legitimate inputs:
- ✅ **Raw live mailbox data** — `email_pipeline.emails` rows for `mailbox='order@smeba.nl'`
  (real subjects / bodies / senders / `raw_json._source_folder` / `has_attachments`), or a fresh
  Microsoft Graph fetch. Ground truth, not interpretation.
- ✅ **CTO-sourced act-layer facts** (spike 013) for what an "order-feeding" outcome means.
- ❌ Any Koen label CSV / intent definition / classification output.

## Live corpus (verified 2026-06-22)

`email_pipeline.emails`, `mailbox='order@smeba.nl'`:
- **30,469 incoming** (2024-04-15 → 2026-06-15) + 2,357 sent.
- The week 2026-06-08..15 = **451 incoming** (Koen's sampled slice — we may reuse the SAME window
  for a like-for-like check, but we classify it ourselves).

## Hypotheses → live test

| H | Koen's claim | How we validate independently (live, read-only) |
|---|---|---|
| **H1** | Shape = **Router** (1-on-1 forward), not noise-filter | Classify a deterministic raw-email sample into {forward-to-dept, archive-noise, order-work}; if forward dominates and true-archive is small → Router CONFIRMED |
| **H2** | Split ≈ **order-work 72% / ruis 25% / dispatch 3%** | Our own first-match regex rule set over the corpus (+ optional Orq LLM on residue); report the realized split and compare to 72/25/3 |
| **H3** | The **intent set** holds (intent-first reframe pending) | Cluster destinations/intents ourselves; check coverage + whether sender-specific intents over-fit one week (test on the full ~30k, not just the 451) |
| **H4** | **~53% attachment-dependent** | `has_attachments` rate overall + per cluster; report the realized rate vs 53% |
| **+D** | (baseline) | Volume by month + `_source_folder` across the full ~30k; daily inbound rate, for capacity sizing |

## Method

- **Read-only, live.** Query `email_pipeline.emails` directly (raw fields). No `swarm_*` /
  `routing_destinations` / `swarm_intents` INSERTs, no Outlook automation, no runtime code paths.
- **Classify from scratch.** Explicit `RULES` array, first-match-wins, ordered by specificity;
  iterate the array, not the script. Optional Orq LLM on the unmatched residue (`response_format`
  json_schema per repo Orq rules). Describe clusters in plain English here — no registry rows.
- **Deterministic samples** (seeded LCG, seed=42) for human-inspected slices.
- **Paginate explicitly** (>1000 rows → `.range()` sentinel loop).
- Reuse `web/debtor-email-analyzer/` deps. Scripts: `web/debtor-email-analyzer/src/spike-012-*.ts`.
  Dump stdout to `012-output.txt`.
- **Validate on the full corpus, not just Koen's week** — a key independence check is whether his
  one-week split survives across the ~30k (guards against the over-fit Koen himself flagged).

## Results — PASS 1 (live SQL, 2026-06-22)

Source: `email_pipeline.emails`, `mailbox='order@smeba.nl'`, `direction='incoming'` (30,469 rows).
Raw numbers in `012-output.txt`. PASS 1 = SQL over subject/folder/sender/attachments. A deep
body/LLM classification (PASS 2) is the remaining step — flagged below where it's load-bearing.

- **H1 — Router vs noise-filter vs order-feeding → PARTIAL, leans ORDER-FEEDING, not pure Router.**
  97.6% of archived mail sits in **"Orders verwerkt"** folders (filed as *processed into an order*),
  with only a tiny forward/handoff tail (`ligt bij Jeroen-Ad` 10, customer-named folders ≤16). The
  archive says "process into orders," not "1-on-1 forward." ⚠️ **Survivorship caveat:** pure
  forwards and deleted noise don't land in incoming folders (they leave via Sent / deletion), so the
  folder view can't measure the forward-rate — that needs the Sent corpus (2,357) + a body pass.
  **Net: Koen's "Router, gooit niets weg" is NOT clearly supported by the live archive; the shape
  looks Handler/Hybrid (order-feeding) with a routing tail.** Settle via PASS 2 + sent-items.

- **H2 — 72/25/3 split → NOT CONFIRMED (inconclusive on PASS 1).** Folders are survivorship-biased
  and subject-only leaves **44.6% "other"** — neither cleanly yields a noise share. Visible
  order-related core by subject: order 27.2% + offerte 10.4% + factuur 8.7%. The "ruis 25%" bucket
  is not separable without the body/LLM pass. In the 451-week, 245/451 (54%) were already filed as
  Orders-verwerkt, 114 still in Inbox. **Verdict deferred to PASS 2.**

- **H3 — intent set holds / survives full corpus → INCONCLUSIVE on PASS 1, one strong signal.**
  Subject-only can't validate the intent vocabulary (44.6% residue). But an independent structural
  signal supports Koen's own intent-first worry: external orders arrive overwhelmingly via a few
  **procurement portals** (Coupa `cbre/equans.coupahost.com`, Ariba, Facilitor, Planon) — i.e.
  sender/portal is a structural **attribute**, which is exactly why hard-coding sender-specific
  intents (`noise_equans_…`) over-fits. **PASS 2 (LLM over bodies on the full ~30k) needed** to
  confirm coverage and whether the one-week set generalises.

- **H4 — ~53% attachment-dependent → PARTIAL / overstated.** Full-corpus attachment rate = **46.2%**,
  not 53% (Koen's 53% was the one-week slice). The qualitative point holds (≈half carry attachments
  → PDF/bijlage extraction is load-bearing for hard Stage-4 decisions), but the long-run number is
  **~46%**.

- **D — volume baseline → ESTABLISHED.** 30,469 incoming since 2024-04-15; **~1,600/month ≈ 53/day**,
  stable. + 2,357 sent. Confirms the roadmap's "largest e-mail load" rationale for choosing Order
  Entry as the flagship. **43.4% own-domain (smeba/MR-group sender) traffic** is the standout shape
  fact. **Operator-confirmed interpretation (Nick, 2026-06-22): this is NOT internal workflow CC — it
  is mostly customers who mailed the WRONG address, then internal staff FORWARD to order@.** So the
  sender is internal but **the real customer sits in the forwarded/quoted body**, not the from-field.
  **Stage-2 implication (load-bearing):** entity resolution must do **quoted-body sender recovery**
  (cf. spikes 006/009 thread-recovery + "namens/on-behalf-of"), not resolve on the smeba.nl sender —
  else ~44% of the corpus mis-resolves to the internal forwarder. This is a bigger driver than Koen's
  framing captured.

## Results — PASS 2 FULL CORPUS (30,469, complete 2026-06-23)

Whole `order@smeba.nl` incoming corpus classified by haiku-4.5 EU (runner `web/scripts/spike-012-pass2.ts`).
**100% coverage, 0 gaps, 0 failed batches** (one mid-run network blip auto-recovered via resume+retry).

**Shape: order_work 54.0% (16,358) · forward 24.8% (7,511) · archive 21.8% (6,600).** Exactly tracks
every interim reading → **Hybrid confirmed on the full corpus** (Koen's "Router/25% doorsturen" = the
24.8% forward; 54% is order-feeding the desk acts on).

**Top intents:** external_purchase_order 6,783 (22%) · work_instruction 4,098 (13%) ·
raise_order_valtimo 3,916 (13%) · **quote_accepted 2,208 (7% — the offerte→order trigger)** ·
status_question 2,029 (7%) · auto_notification/rap_chat/noise ~1,035 · invoice_approval ~600 ·
backorder 334 · quote_retracted 167 · credit_return 151 · opzegging 144.

**Forward destinations:** planning ~3,980 · sales/verkoop ~1,055 · operations 897 · finance/accounting
~410 · logistics 138 → the router mostly feeds **planning**.

**Attachment-dependent: 9,815/30,469 = 32%** decision-blocking (between the n=60's 15% and the 46%
"has attachment" — ~1-in-3 truly needs the PDF).

**V10.5 implications:** act-layer volume = ~2,200 quote-accepts + ~3,900 Valtimo backorders + ~6,800
external POs (the create-order stream spike 013 targets); the 25% router tail → mostly planning.
⚠️ intents/destinations are free-text (casing variants planning/Planning, sales/verkoop) — normalise
before any registry use. Output: `/Volumes/Developer/pass2.jsonl` (the V10.5 eval reference dataset).

## Results — PASS 2 (bounded live, n=60, 2026-06-22) — superseded by the full corpus above

Random sample of 60 incoming emails (deterministic md5 order), classified by the chosen workhorse
**`aws/eu.anthropic.claude-haiku-4-5`** (EU) with the LOCKED `order_work`/`forward`/`archive`
definition (see spike 016), schema-enforced. Cost **$0.015 for 60 → ~$7.6 for the full 30k**.

**Realized split: `order_work` 62% (37) · `forward` 25% (15) · `archive` 13% (8).**

- **H1 — shape → CONFIRMED as HYBRID (not pure Router, not pure Handler).** Dominant **order-feeding
  62%** (portal POs, "raise order in Valtimo", quote-accepted, internal book-this-order forwards) +
  a **real 25% routing tail** (hand-offs to planning/sales/finance/ops) + **13% archive**. Koen's
  "Router / 1-op-1 doorsturen" insight is *correct for the 25% forward slice*, but his framing
  under-counted the 62% the desk itself acts on. Swarm shape = **Hybrid** (Stage-3 router + an
  order-feeding act handler).
- **H2 — 72/25/3 → SUBSTANTIALLY CONFIRMED (refined to ~62/25/13).** The **25% forward** matches
  Koen's claimed 25% almost exactly; order-work is ~62% (vs his 72%, which lumped routing in);
  archive ~13% (vs his 3% — he under-counted true no-action/noise). Close enough that the voorwerk
  was directionally right on live data.
- **H3 — intent vocabulary → plausible, portal-attribute confirmed.** Clean intents emerged
  (external_purchase_order, raise_order_valtimo, quote_accepted, quote_retracted, backorder_process,
  invoice_approval→forward). Spot-checks correct: offerte-akkoord (#10/50/56)→order_work; "graag NOG
  NIET akkoord" (#21)→archive; RAP-chat/auto-notifs→archive. Full-corpus coverage still pending the
  real sweep, but the locked definition generalised well beyond Koen's week.
- **H4 — attachment dependence → refined.** 46.2% *carry* an attachment (PASS 1), but only **~15%
  (9/60) are decision-blocking** (`needs_attachment=true`). So hard Stage-4 PDF extraction is needed
  for ~1-in-6, not ~half — less of a blocker than the raw 46/53% suggested.

> Bounded (n=60) → directional, not final. The full 30k sweep is the handoff (runner below).

### Body-length A/B (2026-06-22)
160 vs 1000 chars of `body_unique_text` on the same 60: **12/60 (20%) of buckets flipped**, and the
flips were mostly *improvements* (longer body revealed FYI-vs-action, validation requests, partial
quote-acceptance that 160 chars truncated). Aggregate split barely moved (62/25/13 → 67/22/12) so
160 is OK for headline buckets, but per-email accuracy needs more. **Locked: 1000 chars + strip the
"CAUTION: External Sender" banner.** Cost ~$5.7/30k (body_unique_text is deduped → only ~+50% tokens).
**Scope: intent IS labeled in the sweep** (shape + intent + dispatch_to + needs_attachment), not buckets-only.

### Full 30k sweep — RUNNING (kicked off 2026-06-23)
Runner: **`web/scripts/spike-012-pass2.ts`** (self-contained: dotenv `.env.local` → Supabase
service-role → Orq Router via the repo `orqRouterChat` wrapper → haiku-4.5 EU). Batches of 30,
1000-char body (+CAUTION strip), JSONL out (`source_id, shape, intent, dispatch_to, needs_attachment`).
Two binding gotchas found + fixed: the Router **ignores `response_format` json_schema** for haiku
(returns prose) → use a **forced function tool**; and the SDK returns **`toolCalls`** (camelCase),
not `tool_calls`. Bounded n=90 validated clean (order_work 59% / forward 24% / archive 17%); full
sweep ~$5.7, ~hours. Output → `/Volumes/Developer/pass2.jsonl`. Per spike 016, sharpen edge cases
(invoice-approval vs order, FYI vs forward) into few-shots if precision needs lifting.

## Out of scope (Idea 3)

- Consuming Koen's labels / `INTENT-VALIDATIE.md` / intent-first set as input.
- Any new `order-entry` swarm registration or registry INSERT (a V10.5 phase).
- Outlook label/forward automation for `order@smeba.nl`.
- The NXT act-layer endpoint inventory (spike 013) and the task-model / sales-transfer dims (014/015).
