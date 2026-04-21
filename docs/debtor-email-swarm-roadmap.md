# Debtor Email Swarm — Delivery Roadmap

**Status:** Phase A in progress (iController tool live, Outlook tools + classifier pending)
**Owner:** Nick Crutzen
**Last updated:** 2026-04-21

This is the **incremental delivery plan** for the debtor email swarm. The target-state architecture lives in [`email-agent-swarm-architecture.md`](./email-agent-swarm-architecture.md) — this document describes how we build toward it in ship-safe slices, deferring LLM agents until the ambiguous bucket genuinely needs judgment.

## Current state (2026-04-21)

- **iController delete tool**: live-proven end-to-end on production (`walkerfire.icontroller.eu`, smebabrandbeveiliging mailbox test, 2026-04-21).
- **Route** `/api/automations/debtor-email-cleanup` accepts `{mode: preview|delete, env: acceptance|production, email: {...}}`.
- **Audit trail**: `automation_runs` + before/after screenshots in Supabase Storage `automation-screenshots/`, with red-outline highlighting on the target row.
- **Find strategy**: pagination + timestamp-match (HH:MM + date parts). The in-app Search box is unreliable and must not be used — see learnings.
- **Not yet built**: Outlook categorize/archive tools, server-side classifier, Zapier Zap, idempotency layer, dashboard view.

## Principles (non-negotiable)

1. **Deterministic-first.** Use string/regex rules until LLM judgment is genuinely needed. Auto-Reply and Payment Admittance are string-matchable across NL/FR/EN — no LLM round-trip per email.
2. **Server-side classifier.** Classification logic lives in Vercel API routes (TypeScript, Zod-validated, unit-tested, structured-logged). Never as Zapier Code steps. Same endpoint is later reusable as an Orq.ai agent tool for the ambiguous bucket.
3. **Idempotency.** Zapier retries. Every mutating stage checks `(message_id, stage)` in `automation_runs` before acting. Duplicate delivery must be a no-op.
4. **Shadow mode before live.** New classifier rules / new agents run in predict-only mode for ≥48h, decisions compared against human actions, before they're allowed to mutate state.
5. **Pattern-first, rules-second.** Classifier rules are derived from the existing email corpus (`email_pipeline.emails`, ~34k analyzed), not written from imagination. Rules ship with precision/recall numbers against the historical dataset.

## Label taxonomy

Labels are the classifier's API — small set, clear semantics.

- `auto_reply` — **unattended-mailbox** auto-generated reply. Sender is a system, not a person: `noreply@`, `no-reply@`, `donotreply@`, `mailer-daemon@`, `postmaster@`, plus subject prefixes `Auto-Reply:`, `Automatic reply:`, `Automatisch antwoord:`, `Réponse automatique:`. Action: categorize + archive in Outlook, delete in iController.
- `out_of_office` — **attended-mailbox** human-set vacation/absence reply. Sender is a real person; they'll eventually read real replies; message may contain delegation info ("please contact X until DATE"). **Decision required in Phase A0** whether this merges with `auto_reply` or stays separate with a different action (likely: archive in Outlook, *keep* in iController for human follow-up on delegation info).
- `payment_admittance` — confirmation from bank/ERP/customer that a payment has been scheduled, sent, or received. Subject terms: `Betalingsbevestiging`, `Betaaladvies`, `Payment advice`, `Payment confirmation`, `Avis de paiement`, `Confirmation de paiement`. Action: categorize + archive in Outlook, delete in iController.
- `unknown` — everything else. Routed to the ambiguous bucket for Phase C (Orq.ai triage).

All categorization output includes `{category, confidence, matched_rule}` so rule attribution is auditable.

## Phases

### Phase A — Auto-Reply vertical (in progress)

**Goal:** ~15% of incoming debtor mail fully automated end-to-end.

| Step | Description | Exit criteria |
|------|-------------|---------------|
| **A0** | Pattern mining: query existing email corpus for `auto_reply`-like / `out_of_office`-like / `payment`-like patterns across NL/FR/EN. Produce `docs/debtor-email-patterns.md` with candidate rules + hit rates + decision on OoO labeling. | ≥95% precision, ≥90% recall for `auto_reply` against historical labels. |
| **A1** | Server-side classifier: `POST /api/debtor-email/classify`. Input: `{subject, from, headers?, body_snippet?}`. Output: `{category, confidence, matched_rule}`. Pure function in `web/lib/debtor-email/classify.ts` + unit tests. | Unit tests pass; endpoint deployed; returns expected categories for 10 hand-picked cases per language. |
| **A2** | Outlook tool: `POST /api/tools/outlook/categorize` (messageId, category). | Live test: categorizes a real email in the shared mailbox. |
| **A3** | Outlook tool: `POST /api/tools/outlook/archive` (messageId). | Live test: moves a real email to Archived folder. |
| **A4** | Orchestrator: `POST /api/automations/debtor-email/ingest` — the Zapier target. Calls classifier → branches to Outlook tools → calls iController delete. Writes staged rows to `automation_runs` keyed on `message_id` for idempotency. | Double-delivery of the same message_id is a no-op (second call returns `skipped_idempotent`). |
| **A5** | Zapier Zap: shared debtor inbox trigger → POST to `/ingest`. | Zap active; test email flows through all stages. |
| **A6** | Dashboard: view of `automation_runs` grouped by category / stage / outcome / last 24h / last 7d. | Shows today's processed count + any failures. |

**Phase A exit criteria (in production):** ≥48h live, Auto-Reply ingest handles ≥95% of arriving `auto_reply`-matched mail without human intervention, zero double-archive / double-delete incidents observed in `automation_runs`.

### Phase B — Payment Admittance

**Goal:** +~11% of incoming debtor mail automated, total ~26%.

Reuses all Phase A infrastructure. Only net new work:

- **B1.** Extend classifier with `payment_admittance` rules from A0 pattern mining.
- **B2.** Enable `payment_admittance` branch in `/ingest` (same tool chain: categorize "Payment Admittance" + archive + iController delete).
- **B3.** One-week false-positive monitoring against `automation_runs`.

### Phase C — Orq.ai triage agent for the ambiguous bucket

**Goal:** handle the remaining ~74% (`unknown` category) with LLM judgment.

- **C1.** Use `/orq-agent` skill to design the triage agent. Tools: `read_email`, `classify`, `categorize`, `archive`, `delete_icontroller`, `escalate_to_human`.
- **C2.** Shadow mode ≥48h: agent predicts, does not act. Compare to human baseline in `automation_runs`.
- **C3.** Graduate to live action only for decisions above a confidence threshold (TBD from shadow data). Low-confidence cases continue to escalate_to_human.

### Phase D — Formalize as swarm (optional)

Once Phase C is stable, model Auto-Reply + Payment Admittance as deterministic sub-agents inside the Orq.ai swarm purely for architectural consistency. No new functionality. Only pursue if there's concrete team value (single control plane, unified observability). Otherwise skip.

## Observability contract

Every stage writes to `automation_runs` with:

```
{
  automation:    "debtor-email-{stage}",   // e.g. "debtor-email-classify"
  status:        "completed" | "failed" | "skipped_idempotent",
  message_id:    "<outlook message-id>",   // idempotency key
  result:        { category, stage-specific details },
  error_message: string | null,
  triggered_by:  "zapier-webhook" | "orq-agent:<agent-id>" | "manual",
  completed_at:  ISO timestamp
}
```

Screenshots (for iController stage only) always highlight the target row (scrollIntoView + red outline + pink background). See `feedback_automation_screenshots_highlight_target` memory.

## Open questions

1. **`out_of_office` label decision** — merge with `auto_reply` or separate? → resolve in A0 based on observed behavior in the corpus. Default recommendation: separate, with `archive-only` action (no iController delete) to preserve delegation info.
2. **Shared-mailbox trigger** — Zapier built-in Outlook trigger vs. Microsoft Graph change notification subscription. Latency, reliability, cost.
3. **Non-Latin characters in subject/sender** — confirm Zapier payload preserves UTF-8 (NL accents like `é`, French `ç`, `à` — a broken byte sequence will silently break regex rules).
4. **Idempotency key** — Outlook message-id vs. internet message-id. Confirm which survives the categorize/archive operations (some mail systems rewrite one but not the other).
5. **Classifier in-loop retraining** — if rules drift, do we ship rule updates via PR + unit tests, or introduce a learning layer that tunes thresholds from `automation_runs` feedback? Defer to Phase C / D.

## References

- Target-state architecture: [`email-agent-swarm-architecture.md`](./email-agent-swarm-architecture.md)
- Automation README: [`web/lib/automations/debtor-email-cleanup/README.md`](../web/lib/automations/debtor-email-cleanup/README.md)
- Patterns (to be authored in A0): `docs/debtor-email-patterns.md`
- Relevant learnings in Supabase `learnings` table (system filter: `iController`, `agent-workforce`).
