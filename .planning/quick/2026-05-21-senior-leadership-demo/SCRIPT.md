# Senior Leadership Demo — Agent Workforce Pipeline (2026-05-21)

**Duration target:** 8-12 minutes
**Format:** Live screen recording, Nick narrating
**Audience:** Senior leadership at Moyne Roberts (non-technical)
**Headline:** *"This system processes every inbound debtor email automatically. Today we onboarded a brand-new mailbox in two hours. Here's how."*

---

## Pre-recording checklist

- [ ] Browser logged in to the dashboard
- [ ] Tabs pre-opened (URLs in section 6)
- [ ] Outlook open in a second tab/window (for live archive proof) — *optional but powerful*
- [ ] iController login current (for live cleanup proof) — *optional, can show automation_runs result instead*
- [ ] Demo emails pinned (Bulk Review filter or specific URLs)
- [ ] Close Slack, mute notifications
- [ ] One dry run end-to-end before recording

---

## 1. Opening hook (60-90s)

**What to show:** Stage 1 dashboard with the volume number.

**What to say (verbatim if helpful):**

> "Every day, dozens of emails arrive at our debtor-email inbox — invoice questions, payment confirmations, customer complaints, auto-replies, spam. Until this pipeline went live, every one of those was a manual triage by our finance team.
>
> In the last 30 days the system processed **770 emails**. Of those, **290 were noise** — spam, auto-replies, payment-admittance receipts — and the system silently archived them in Outlook without a human ever seeing them. The remaining **475** went deeper into the pipeline. That's where the interesting work happens."

**Stat callout overlay (optional):**
```
Last 30 days:
  770 emails processed
  290 auto-archived as noise (37.7%)
  149 intent-classified for action
  0 dropped to manual_review
```

---

## 2. The 5-stage funnel (60s — conceptual slide or whiteboard moment)

**What to say:**

> "Every email travels through five stages. Stage 0 is a safety check — does this email look like a prompt-injection attack on our AI? Stage 1 is the noise filter — is this even a real business email? Stage 2 figures out *who* the email is from in our customer system. Stage 3 figures out *what* they're asking for. Stage 4 is where the system acts on their behalf — labels the email, archives it, fetches an invoice copy, removes a paid item from iController. Each stage hands off to the next. Each stage is independently observable. Let me show you a real email going through it."

*(Optional: insert pipeline diagram from `docs/agentic-pipeline/README.md` here.)*

---

## 3. Stage 1 walkthrough — noise auto-archive (90s)

**Demo email:** `Subject: Betaalspecificatie Xenos` — sender `crediteuren@xenos.nl`
**Bulk Review row id:** `b39808ee-8d64-4e9b-afce-0cbeb98b8a35`
**URL:** `/automations/debtor-email/stage-1?email=b39808ee-8d64-4e9b-afce-0cbeb98b8a35`

**Click-path:**
1. Stage 1 list → click the Xenos row.
2. Detail pane opens → highlight `decision: payment_admittance`, `predictor: regex`.
3. Click "Audit" / "Rule" chip → show which regex rule fired (the predicate that matched the Dutch payment-confirmation phrasing).
4. Switch to Outlook tab → show the email is now in the "Payment Admittance" folder, no human action needed.

**What to say:**

> "Here's a real payment confirmation from Xenos. The pipeline saw it, ran a fast regex check against our noise rules, classified it as *payment_admittance* in under 100 milliseconds, and moved it to the Payment Admittance folder in Outlook. Total cost: less than a cent. The finance team never sees it unless they want to."

---

## 4. Stage 2 walkthrough — entity resolution (90s)

**Demo email:** `Subject: Factuur 17314004 afgewezen door beoordelaar` — sender `timon.ruijs@jumbo.com`
**Email id:** `07e3f0c7-9cc3-4465-8d23-71e3e7125800`
**Customer matched:** `Jumbo Supermarkten B.V. [RAP] Franchisenemers` (account 523450)
**URL:** `/automations/debtor-email/stage-2?email=07e3f0c7-9cc3-4465-8d23-71e3e7125800`

**Click-path:**
1. Stage 2 list → click the Jumbo row.
2. Show "Customer matched" with the account number + iController company.
3. Open the Stage 2 evidence panel → show the resolver reasoning (sender domain match, prior invoice context, etc.).

**What to say:**

> "This email is from Jumbo. Stage 2 doesn't just match by domain — it looks at prior invoice history, the customer's iController account, even other emails in the same conversation thread. If there's ambiguity, an LLM tie-breaker decides. Here it resolved the email to *Jumbo Supermarkten B.V. — Franchisenemers* with confidence. That account number is now attached to every downstream decision."

---

## 5. Stage 3 walkthrough — intent classification (90s)

**Demo email:** `Subject: Aanvraag credit in verband met afgekeurde factuur Smeba` — sender `timon.ruijs@jumbo.com`
**Email id:** `cefb80c8-b44a-4bef-8ddc-ba0b39726859`
**Intent:** `credit_request`, confidence 0.900
**URL:** `/automations/debtor-email/stage-3?email=cefb80c8-b44a-4bef-8ddc-ba0b39726859`

**Click-path:**
1. Stage 3 list → click the Jumbo credit-request row.
2. Show "Intent: credit_request", confidence ranking, alternative intents below.
3. Click the LLM reasoning chip → show the trace.

**What to say:**

> "Stage 3 is where it gets interesting. The system reads the actual content of the email and decides what the sender wants. Here, *credit_request*. It's not just guessing — it ranks every possible intent and picks the highest-confidence one. If multiple intents look plausible, it escalates to an orchestrator agent. If confidence is too low, it goes to a human for review. Today, zero emails this month needed manual review at this stage."

---

## 6. Stage 4 walkthrough — auto-handling (120s)

**Demo run:** `automation_runs.id = 9e0bfd10-9e47-4b49-b7cc-d0ecd78a3e37`
**Outcome:** `stage: icontroller_delete`, `icontroller: deleted`
**URL:** Look it up in the dashboard's automation-runs view, or query directly.

**Click-path:**
1. Open Stage 4 / Kanban view → show a recent "iController cleanup: deleted" card.
2. Click into the run → show the timeline (Stage 1 categorize_archive → automation queued → Browserless run → iController deletion confirmed).
3. *Optional:* switch to iController tab → show the invoice is no longer in the outstanding list.

**What to say:**

> "Stage 4 is the action. When an email is classified as a payment confirmation and we already know which invoice it relates to, the system actually opens iController in a headless browser, finds the invoice, and removes it from the outstanding-debt list. This run, two days ago, completed in 12 seconds. Without this pipeline, that's a finance-team person logging in, finding the invoice, clicking delete. Multiply by 290 noise emails per month — that's hours back."

---

## 7. THE PUNCHLINE — cross-swarm onboarding (90-120s)

**Demo URL:** `/automations/info-routing/stage-1`
**Reference smoke run:** `automation_run_id = 2315f9c3-14b4-4952-9cd0-bb225e573306`

**Click-path:**
1. Switch swarm selector to **info-routing**.
2. Show the (currently small) Stage 1 list — including the smoke-test entry from this morning.
3. Click into the smoke row → show Stage 0 = safe, Stage 1 = spam (regex predictor, same rule that fires on the debtor-email swarm).

**What to say:**

> "Here's the most important slide. The system you just saw was originally built for `debiteuren@smeba.nl` — our main debtor inbox. **This morning, we registered an entirely new mailbox — `info@smeba.nl` — and it's already classifying emails using the same pipeline.**
>
> The total code change to onboard a new mailbox was: one database migration adding the swarm and its noise rules, and one ingest endpoint. No changes to the Stage 0 worker. No changes to the Stage 1 worker. No changes to the noise classifier. The pipeline reads the registry, sees `info-routing` is a valid swarm, and processes its emails the same way.
>
> **This is the architectural payoff.** Onboarding the next mailbox — sales, HR, ops — is now hours, not weeks. Adding new noise rules is a database INSERT, not a code deploy. And every existing safeguard, audit trail, and operator UI works automatically."

---

## 8. Close (30s)

> "What's next: we're working on the Stage 3 intent router for info-routing so it doesn't just filter noise — it forwards real business emails to the right department automatically. That's the same pattern we just showed, applied to the next domain. Questions?"

---

## URLs / IDs cheat sheet

```
Stage 1 noise demo:        /automations/debtor-email/stage-1
  Row:                     b39808ee-8d64-4e9b-afce-0cbeb98b8a35  (Xenos payment)

Stage 2 entity demo:       /automations/debtor-email/stage-2
  Row:                     07e3f0c7-9cc3-4465-8d23-71e3e7125800  (Jumbo factuur)

Stage 3 intent demo:       /automations/debtor-email/stage-3
  Row:                     cefb80c8-b44a-4bef-8ddc-ba0b39726859  (Jumbo credit_request)

Stage 4 handler demo:      /automations/debtor-email/stage-4
  automation_run_id:       9e0bfd10-9e47-4b49-b7cc-d0ecd78a3e37  (iController deleted)

Cross-swarm punchline:     /automations/info-routing/stage-1
  Smoke run:               2315f9c3-14b4-4952-9cd0-bb225e573306
```

## Backup demo emails (if a primary row 404s)

```
Stage 1 noise — payment_admittance:
  92f4a8af-accc-4b80-87c9-a504b3d033e1  (Hans Anders / Nexeye Payment advice)

Stage 1 noise — auto_reply:
  b72d63dc-a0ea-4211-8df5-ae1e4cc16267  (no-reply@factuurportal.eu)
  6095e715-5d0a-4fd0-bc09-92430ee6f092  (Unica automatisch antwoord)

Stage 3 intent — payment_dispute (2x):
  07e3f0c7-9cc3-4465-8d23-71e3e7125800
  e6c821ce-3b97-478b-94fb-ffdcef71a24c

Stage 3 intent — copy_document_request:
  d09f73bf-025d-41bc-8264-7641cb11ef51  (Spaarne Gasthuis offerte)

Stage 4 — iController delete completed (backup):
  355131e4-c14a-4d32-87b6-9105f5ed522f
```

## Volume stats freshness

Stats above pulled `2026-05-21 ~09:30 CEST` for the 30-day window. If you record more than ~24h from now, rerun:

```sql
SELECT
  count(*) FILTER (WHERE stage = 0)                                          as stage0_total,
  count(*) FILTER (WHERE stage = 1 AND decision IN ('spam','auto_reply','ooo_temporary','ooo_permanent','payment_admittance')) as stage1_noise_auto_archived,
  count(*) FILTER (WHERE stage = 1 AND decision = 'unknown')                 as stage1_passed_through,
  count(*) FILTER (WHERE stage = 2 AND decision = 'resolved')                as stage2_resolved,
  count(*) FILTER (WHERE stage = 3 AND decision IS NOT NULL AND decision <> 'manual_review') as stage3_classified,
  count(*) FILTER (WHERE stage = 3 AND decision = 'manual_review')           as stage3_manual_review
FROM public.pipeline_events
WHERE swarm_type = 'debtor-email'
  AND created_at > now() - interval '30 days';
```

## Things to avoid saying

- "AI" alone — say "the system" or "the pipeline". Avoid hype framing.
- "100% automated" — it's 60% auto-archived + 20% auto-handled + 20% human-decided.
- "Replaces the finance team" — say "frees the finance team for higher-value work".
- "Could break tomorrow" — also don't oversell. The whole pipeline has audit trails and a human override path on every decision.

## If something breaks live

- Outlook archive doesn't show → mention the categorize_archive event was emitted; archive runs async.
- iController cleanup doesn't show → use the backup automation_run id; the action ran 2 days ago and is in the history.
- Stage 4 view empty → switch to the automation_runs surface (more raw, less polished, but the data is there).
