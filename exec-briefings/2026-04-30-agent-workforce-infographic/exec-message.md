Goodmorning Gentlemen,

The previous weeks I doubled down on the Agent Workforce for Moyne Roberts. The building blocks are in place, the first AI Agents are actually live and running the mailbox **debiteuren@smeba.nl**. I added **debiteuren@berki.nl** yesterday and will start adding **Fire Control** and **Smeba Fire** next week — putting us at **4 of 6 NL/BE debtor mailboxes inside two weeks**. **Phase 64 (Stage 0 input safety + per-run cost ceilings) shipped today** — the platform is hardened and ready to scale.

**Where we stand today**

- **11 agents** built on a single canonical pipeline — 4 Triage + 7 Handler specialists
- **Three categories handled end-to-end with zero human touch:** out-of-office replies · auto-replies · payment confirmations. The Triage Agent labels them in Outlook, archives them, and clears the row from the iController operator queue. No LLM cost, no operator time.
- Every other intent today still requires human verification — the Handler agents reduce that work from "compose the reply" to "review and click Send", but the human-in-the-loop stays on purpose
- **6 brands** flowing through production (Smeba · Smeba-Fire · Fire Control · Sicli-Noord · Sicli-Sud · Berki) on a **6,114-email** classifier corpus tuned NL/BE
- **8 intents** classified across **4 languages** (NL · EN · DE · FR)
- **1 of 7 Handlers live**: the Invoice-Copy Drafter (drafts the reply with the right PDF attached, in iController, in the customer's language — operator hits Send)
- **6 Handlers designed and ready to switch on**: Payment-Dispute · Address-Change · Credit-Note · Contract-Inquiry · Peppol · General-Inquiry

**Volume opportunity (real telemetry)**

13-month sample (Apr 2025 → Apr 2026), LLM-confirmed: **197 copy-document requests**, recall-corrected to **~45/month and trending up** (Feb-Mar 2026: 23–30/mo confirmed). 92% Dutch · 6% English · 2% German. **This is debtor + sales combined across the current Benelux scope** — and Sales is the larger half: **43 of 85 invoice copies**, **30 of 36 contracts**, **27 of 27 quotes**, **17 of 17 work orders**, **7 of 7 delivery notes**. Pointing the Drafter at **verkoop@smeba.nl** is not a bonus — it's where most of the copy-document volume actually lives.

ROI on copy-document alone: ~72 hrs/yr manual handling in Benelux → **~€2,500/yr saved** at realistic ~65% automation coverage. **UK and Ireland represent a similar revenue base** — extrapolated, that's another **~€2,500/yr in copy-document savings alone** once they're onboarded, taking the total to **~€5,000/yr on this single intent**. And copy-document is **1 of 7 Handler agents**; the other six address recurring intents at similar or higher volume. The compounding number across all 7 Handlers × all entities (Benelux + UK + IE) is where the real value sits.

**The ask: full focus on the Agent Workforce for the next 8 weeks.**

Three outcomes by the end of the window:

**1. Sales mailbox onboarded next week.** Triage Team points at **verkoop@smeba.nl** — same end-to-end automation on the noise categories, plus the Drafter against the larger Sales copy-document volume. **9 of 11 agents reused as-is**; onboarding effort ~1 day, not a project.

**2. All 7 Handlers in production.** From 1-of-7 to 7-of-7 active. Turns "queue cleared" coverage into "draft ready" coverage on the volume that today is fully manual — payment disputes, address changes, credit notes, contract questions, Peppol, general inquiries.

**3. UK & Ireland live.** Architecture is brand-agnostic by design — onboarding the **14 Walker Fire (UK)** brands and the **IE brands** (Apex Fire et al.) is a registry insert, not a rebuild. English-keyword tuning pass already mapped. Target: first UK debtor mailbox live before the 8 weeks end. UK + IE roughly double the copy-document savings on day one — every additional Handler we ship multiplies that further.

Updated infographic attached. Happy to walk through it whenever.
