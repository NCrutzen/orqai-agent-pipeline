---
spike: 003
name: smeba-vs-debtor-noise-overlap
type: standard
validates: "Given debtor-email's production classify() with its 6 categories, when we run it against the 5,316-row Smeba inbound corpus, then we measure category overlap, identify rules that transfer cleanly cross-swarm, and answer: is info@smeba.nl genuinely its own swarm or a brand variant of debtor-email?"
verdict: VALIDATED — info-routing IS a distinct swarm, but ~56% of its Stage 1 noise rules transfer cleanly from debtor-email
related: [001, 002]
tags: [recon, architecture, cross-swarm, smeba]
---

# Spike 003: smeba-vs-debtor-noise-overlap

## What This Validates

Given `web/lib/debtor-email/classify.ts`'s 6-category production classifier (`spam`, `payment_admittance`, `auto_reply`, `ooo_temporary`, `ooo_permanent`, `unknown`) — and 17 named regex rules tuned over a year of debtor-collection traffic — when we run it against the 5,316-row Smeba inbound corpus, then we get a quantitative answer to: which rules transfer, which don't, and is info-routing genuinely its own swarm.

## How to Run

```bash
cd web/debtor-email-analyzer
npx tsx src/spike-003-overlap.ts
```

Dynamic import of `../../lib/debtor-email/classify.ts`. Note: static import failed under tsx + Node 24 ESM resolution; dynamic import works. Documented as a one-off; doesn't merit a CONVENTIONS entry.

## Results

**Verdict: VALIDATED — info-routing is a distinct swarm, but with significant Stage 1 rule reuse.**

### Coverage when debtor-email's classifier is applied to the Smeba corpus

| debtor-email category | count | % of inbound | Transferability |
|---|---:|---:|---|
| `spam` | 2,899 | 54.5% | **Perfect** — already shared across swarms (`20260511_swarm_noise_spam_key.sql`) |
| `payment_admittance` | 62 | 1.2% | **Real** — info inbox really does receive payment confirmations (Jumbo `Betalingsadvies`, AECOM remittance, etc.). Cheap to ship cross-swarm. |
| `ooo_temporary` | 8 | 0.2% | Transfers cleanly, low volume |
| `auto_reply` | 5 | 0.1% | Transfers cleanly, low volume |
| `ooo_permanent` | 1 | 0.0% | Transfers cleanly, trivial volume |
| `unknown` | 2,341 | 44.0% | The router agent's workload |

Debtor-email classifier covers **56.0% of Smeba inbound** with its existing rules. The other 44% is `unknown`.

### Comparison to Spike 002's info-flavor rules

Spike 002 classified 76.9% as noise; debtor-email classifier classifies only 56.0%. **Delta = ~20 points**, attributable to two info-specific categories debtor-email has no rule for:

| Spike 002 rule | Volume | What debtor-email does with it |
|---|---:|---|
| `noreply_notification` | 214 (4.0%) | All fall into `unknown` — debtor-email's `SENDER_SYSTEM` gate exists but isn't terminal; downstream payment/OoO subject rules don't fire on these |
| `own_domain_loopback` | 950 (17.9%) | **98.5% (936) fall into `unknown`** — debtor-email has no concept of internal workflow CC. Phase 84 is fixing this for debtor-email; info-routing inherits the fix |

### Big architectural findings

1. **The cross-swarm thesis holds — partially.** 56% of debtor-email's regex set transfers cleanly to info-routing without modification (`spam` + `payment_admittance` + `auto_reply` + `ooo_*`). The remaining 20-point gap is two info-flavor categories that don't exist in debtor-email today, only one of which (`own_domain_loopback`) is already on Phase 84's roadmap.
2. **`payment_admittance` fires 62 times in an info inbox** (Jumbo `Excel specificatie`, `FA@heuvelgroep.nl Betaalspecificatie`, AECOM remittance advice). Customers misroute payment confirmations to `info@` instead of `debiteuren@`. **Info-routing should treat these identically — `categorize_archive` to the Payment Admittance label** — so finance still gets the signal even on the wrong inbox.
3. **`own_domain_loopback` (950 rows) is the architectural standout.** debtor-email's classifier treats these as `unknown`, which sends them to Stage 3 to be force-classified as a debtor intent. For info-routing the same emails would reach Stage 3 and be force-classified as a department intent. Both behaviours are wrong. **Phase 84's `swarms.tenant_domains` column + own-domain rule is the right fix for both swarms.** Info-routing onboards by inserting Smeba's domains into that registry — no info-specific code path needed.
4. **Two false-positives in `ooo_permanent` / `auto_reply` are worth noting.** debtor-email's `SUBJECT_TICKET_REF` matched two `[KB0]-` subjects from `learningnetwork@ictforag.com` and `menitola@tolatiles.com` that are actually phishing impersonations of a service-desk pattern. These currently classify as `auto_reply` and would be auto-archived. Low-stakes for now (2 emails out of 5,316) but a reminder that subject-regex rules pick up phishing impersonations of business patterns.
5. **The router agent's workload (the unknown bucket) is genuinely smaller.** With debtor-email's regex applied, unknown = 2,341 = ~26 emails/day. With Spike 002's info-flavor rules applied on top (noreply + own_domain), unknown = 1,227 = ~14 emails/day. **The cross-swarm Stage 1 narrows the router's surface area meaningfully — but only if the info-specific rules ALSO ship.** Without them, the router sees ~2x the volume.

### Definitive answer: is info-routing its own swarm or a brand variant of debtor-email?

**Its own swarm.** Two pieces of evidence:

1. **Stage 3 intent set is fundamentally different.** debtor-email dispatches to `payment_dispute`, `credit_request`, `invoice_copy_request`, etc. — debt-collection-specific intents. info-routing dispatches by department: sales / finance / HR / support. There's no useful overlap at Stage 3.
2. **Stage 1 noise rules are mostly reusable, but the registry-driven shape means that's fine.** Phase 78's codegen wants `swarm_noise_categories` keyed by `(swarm_type, category_key)`. Same regex, different swarm_type — just an insert pattern. The fact that the rule fires on both swarms doesn't make them the same swarm; it makes the rule reusable.

### Revised noise-category proposal (post-Spike 003)

Drop one rule, share five with debtor-email, add one info-specific. **Smaller proposal than Spike 002 anticipated.**

| key | source | notes |
|---|---|---|
| `spam` | **share** debtor-email's rule verbatim (`subject_spam_prefix`) | Already cross-swarm registered. Just INSERT a `('info-routing','spam',...)` row in `swarm_noise_categories`. |
| `payment_admittance` | **share** debtor-email's rule set | 1.2% hit rate in info inbox — worth shipping. Same Outlook label, same `categorize_archive` action. |
| `auto_reply` | **share** | Tiny volume but cheap to include |
| `ooo_temporary` | **share** | Tiny volume but cheap to include |
| `ooo_permanent` | **share** | Trivial volume but cheap to include |
| `own_domain_loopback` | **inherit from Phase 84** | Once Phase 84 ships `swarms.tenant_domains` + the loopback rule, info-routing onboards by registering Smeba's tenant domains. **Do not ship a duplicate rule.** |
| `noreply_notification` | **new** for info-routing OR cross-swarm | Sender local-part `^(noreply\|no-reply\|donotreply\|notifications?\|automated\|mailer)`. 4.0% in Smeba info. Should we ship this debtor-email too? Spike 004 should check — if debtor mailboxes also have this volume, make it cross-swarm. Otherwise info-routing-only. |
| `unknown` | **share semantics** | `swarm_dispatch` → router-agent event |

Removed from Spike 002's proposal (data didn't support):
- ~~`m365_spam_tag`~~ → use existing `spam` key
- ~~`meta_facebook_notification`~~ → matched 1 phishing impersonation, otherwise zero. DOA.
- ~~`marketing_newsletter`~~ → 0.2% (most marketing caught upstream by `[SPAM]`). DOA.
- ~~`delivery_failure`~~ → caught by `[SPAM]` upstream. DOA.

## Investigation Trail

1. **Static `import { classify } from "../../lib/.../classify.ts"` failed** under `tsx 4.19` + Node 24.11 with "does not provide an export named 'classify'", despite the export existing. Both `.ts` and `.js` extensions failed. Worked around with dynamic `import()`. Logged as known-good workaround in the spike script; not promoting to CONVENTIONS because dynamic-import in production code is a smell.
2. **First run surfaced the 56%-vs-77% gap** between debtor-email's classifier and Spike 002's info-flavor classifier. Drilled into the unknown bucket's sender-domain distribution and verified the gap is entirely `noreply_*` + `own_domain_*` — no surprises.
3. **`own_domain_loopback` classified 98.5% as `unknown` by debtor-email** — the 8 ooo/3 auto_reply/2 spam/1 ooo_permanent hits are when an internal user's auto-reply happens to match a debtor-email subject rule. The own-domain pattern itself is invisible to debtor-email today. Phase 84's own-domain rule is the right (and only) fix.
4. **`payment_admittance` 1.2% hit rate on an info inbox was the biggest pleasant surprise.** Validates "ship payment_admittance for info-routing too" as a near-zero-cost decision.

## Files

- `web/debtor-email-analyzer/src/spike-003-overlap.ts` — dynamic-import driver running debtor-email classify against Smeba corpus
- `.planning/spikes/003-smeba-vs-debtor-noise-overlap/overlap-output.txt` — captured run output
