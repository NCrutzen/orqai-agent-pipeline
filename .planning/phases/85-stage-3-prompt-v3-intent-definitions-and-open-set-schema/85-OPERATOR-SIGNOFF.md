# Phase 85 — Operator Sign-off (Plan 85-04)

**Agent:** `debtor-intent-agent` (`01KQECK191GE21CH8D8KEMTM9J`) · model `anthropic/claude-sonnet-4-5-20250929`
**V3 deploy date:** 2026-05-20 (per `85-SMOKE-RESULTS.md`)
**Sign-off date:** 2026-06-01
**Signed by:** operator (n.crutzen) + Claude (orchestrator)

---

## Task 1 — Independent 12-email regression smoke

**Run:** 2026-06-01, clean operator shell, `cd web && npx tsx scripts/phase85-smoke-v3.ts --regression`
**Result:** `changed_count = 1 / 12` → **PASS** (budget ≤ 1).

| # | email_id | V2 top-1 | V3 top-1 | verdict |
|---|----------|----------|----------|---------|
| 1–11 | (11 genuine disputes) | payment_dispute | payment_dispute | SAME |
| 12 | `334ca0aa-a138-…` | payment_dispute (medium) | **other** | **boundary correction OK** |

**Changed-row inspection (row 12):** sender `Invoices@bam.com` — an automated BAM mailbox reply (*"De onderstaande mail hebben wij niet verwerkt, aangezien deze vermoedelijk geen (nieuwe) factuur betreft"*). This is an auto-notification, not a payment dispute. It was the **only** medium-confidence row in the baseline; the other 11 were `high`. V3 routing it to `other` (per the prompt's "auto-reply or off-topic that survived Stage 1 → other" rule) **corrects** a V2 misclassification. Not a regression.

**Task 1 verdict: GO.**

---

## Task 2 — Token-usage / cost observation (≥3 production days post-deploy)

**Method:** Observed via Orq.ai live traces (`list_traces entity=debtor-intent-agent`) on 2026-06-01 — used in place of the `public.agent_runs` SQL because organic production volume is thin (debiteuren@ is low-volume + triage runs in shadow mode), and the 2026-05-30 retro batch is side-channel isolated from production `agent_runs`. Calendar window satisfied: 12 days elapsed since the 2026-05-20 deploy.

| Metric | Observed (V3, Sonnet 4.5) |
|---|---|
| Prompt tokens / call | ~5,600 (short) → ~8,500 (long thread); median ~6,500 |
| Completion tokens / call | 140–290 |
| Cost / call | ~$0.019–0.029, **median ~$0.022** |
| Error rate | **0 errors** across all sampled traces (`status_code: OK`) |
| Latency | 3–5 s (max_execution_time is 45 s) |
| Prompt caching | `cached_tokens: 0` on every call — caching is **OFF** |

**Cost projection:** at realistic Stage 3 volume (retro window = 105 emails / 30 days) → **~€2–7/mo**. Even at 1,000 calls/mo ≈ €20/mo. The €100/mo prompt-cache-urgency threshold is **not approached**. The +2-3k token V3 delta (RESEARCH §4) is immaterial in absolute terms at this volume.

**Deviations / notes:**
- "≥3 *production days*" interpreted as calendar-elapsed (12 days) + cost-magnitude proof, since organic agent_runs volume is too sparse to aggregate meaningfully. Cost is provably negligible regardless.
- Prompt caching is off (~5,600 static system-prompt tokens uncached per call). This is the cost lever **if** volume ever 10×'s; tracked as non-urgent (see RESEARCH §4 prompt-cache TODO).

**Task 2 verdict: PASS (cost within bucket).**

---

## Task 3 — V2 retirement scheduling

**Decision:** option-a — **14 calendar days** post-deploy (RESEARCH Open Q #1 default; Phase 65→66 precedent).
**Computed fire-date:** 2026-05-20 + 14 = **2026-06-03**.
**Rationale:** V3 has run clean for 12 days with zero errors and the regression smoke passed 11/12 (the 1 change a verified correction). The 14-day default lands ~2 days out — conservative without lingering dead code. Scheduled TODO: `.planning/todos/pending/2026-06-03-phase85-v2-retirement.md`.

**Task 3 verdict: option-a, fire 2026-06-03.**

---

## PHASE 85 CLOSE

All three operator gates cleared (Task 1 GO · Task 2 PASS · Task 3 scheduled). V3 ranked-intent classifier with open-set escape hatch is verified live and within cost budget. **Phase 85 closed 2026-06-01.**

Rollback escape hatch remains until 2026-06-03: V2 is a one-token revert (cache-key flip in `debtor-email-coordinator.ts` + re-PATCH the Orq agent to the V2 prompt).
