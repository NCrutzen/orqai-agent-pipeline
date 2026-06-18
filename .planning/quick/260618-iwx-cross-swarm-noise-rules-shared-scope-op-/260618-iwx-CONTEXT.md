# Quick Task 260618-iwx: Cross-Swarm Noise Rules — Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Task Boundary

Give `swarm_noise_categories` + `classifier_rules` a **shared scope** so noise
knowledge stops being siloed per `swarm_type`. Runtime readers (closed-list
builder at Stage 1, `readWhitelist`) union the swarm's own rows with shared
rows, minus per-swarm opt-outs. Add cross-swarm telemetry aggregation. Migrate
info-routing's junk-mail categories + their promoted rules to shared so
verkoop@ (sales-email) + debiteuren@ (debtor-email) immediately benefit.

Pain being solved (memory `cross-swarm-noise-rules`): sales lacks info-routing's
spam categories → ~92% of verkoop mail lands in `unknown`.
</domain>

<decisions>
## Implementation Decisions

### Scope of categories to share — DECIDED: all 7 junk categories
Migrate ALL of info-routing's junk-mail categories to shared, not just the 3
named in the task:
`spam`, `marketing_newsletter`, `cold_sales_outreach`, `auto_dealer_spam`,
`unsolicited_job_application`, `survey_feedback_invite`, `automated_security_report`.
Max recall against the "92% unknown" problem. Each swarm can opt out individually.

### Promotion trust model — DECIDED: per-swarm gate (NOT pooled)
**INVIOLABLE CONSTRAINT.** A rule promoted in swarm A must NEVER auto-archive in
swarm B without B's own accumulated evidence. The gate is exactly
`classifier_rules.status='promoted'` for `(swarm_type, llm:{cat}:high)`, read by
`readWhitelist`. Confirmed in `classifier-screen-worker.ts:600-716`:
not-whitelisted → `status='predicted'` (Bulk Review observe, no archive);
whitelisted → categorize+archive.

Consequence for the migration: share the category DEFINITIONS, but do NOT
transfer promoted status across swarms. info-routing keeps its 3 promoted rules
(`llm:marketing_newsletter:high`, `llm:cold_sales_outreach:high`,
`llm:auto_dealer_spam:high`). debtor-email + sales-email get **candidate** seed
rules (`llm:{cat}:high`, status=candidate) for all 7 cats via the existing
`classifier/llm-rules-seed.run` flow. So all swarms predict+observe immediately;
auto-archive flips on per-swarm as each earns its Wilson-CI gate.

This means any `readWhitelist` "shared union" must be scoped to rule DEFINITIONS,
never promoted status — a `swarm_type='*'` promoted row would violate the gate.

### Blast radius — DECIDED: both swarms now
Enable shared categories for debtor-email (LIVE) + sales-email (observe-mode)
immediately. Risk is bounded: LLM 2nd-pass only fires on regex-miss, and the
per-swarm gate keeps everything in observe (status='predicted') until earned.
Per-swarm opt-out is the safety valve for debtor-email if needed.

### Shared-scope mechanism — Claude's discretion → reserved sentinel `swarm_type='*'`
Neither table has an FK on `swarm_type` (verified: `swarm_noise_categories` PK
`(swarm_type, category_key)`, `classifier_rules` UK `(swarm_type, rule_key)`,
both plain `text not null`). So a reserved `swarm_type='*'` row + runtime union
`swarm_type IN (<swarm>, '*')` needs zero PK/UK migration. Precedence: an
own-swarm row with the same key SHADOWS the shared row.

### Per-swarm opt-out — Claude's discretion → shadow row, no new table
Opt-out = insert an own-swarm row for the shared key with `enabled=false`. The
own-row-shadows-shared precedence rule does double duty (customization + opt-out).
No dedicated opt-out table.

### Cross-swarm telemetry — Claude's discretion → aggregation view
Add a view aggregating `agent_runs.human_verdict` by `category_key` ACROSS all
swarms (cross-swarm visibility), alongside the existing per-swarm
`classifier_rule_telemetry`. Promotion stays per-swarm; this is visibility only.
`security_invoker=true`, service_role SELECT.
</decisions>

<specifics>
## Specific Ideas

### Outlook-delta verdict harvesting — OUT OF SCOPE (fast-follow)
Operator's instinct (correct): a per-swarm gate needs per-swarm human-verdicts,
and Bulk Review clicks are slow for verkoop@/debiteuren@. The right cheap source
is labeling the predicted category in Outlook and harvesting the Graph delta
(kept archived = agree; pulled back to inbox = disagree). This is the existing
P112.5 Graph-delta + P117 intent-label work, NOT this task.

Seam this task must honor: telemetry + promotion read `agent_runs.human_verdict`
**source-agnostically**, so Outlook-delta feeds the gates with zero rework here.

### Live data shape (verified 2026-06-18)
- `swarm_noise_categories`: debtor-email + sales-email share the 8 AP-noise cats
  + auto_reply/ooo_*/payment_admittance/unknown. info-routing additionally owns
  the 7 junk cats above. (The 8 AP-noise cats are already duplicated per swarm —
  candidates for a later shared migration, but OUT OF SCOPE here.)
- `classifier_rules`: info-routing has 3 promoted `llm:*:high` rules (the junk
  family) + 6 candidate agent_intent rows. debtor/sales have their own per-swarm
  rules.
</specifics>

<canonical_refs>
## Canonical References

- `docs/agentic-pipeline/stage-1-regex.md` — noise-key closed list is built at
  call-time from enabled `swarm_noise_categories` rows; NO codegen, NO Orq enum
  for noise keys (lines 83-95). Adding/sharing a noise key is pure registry data.
- `docs/debtor-email-pipeline-architecture.md` — Stage 1 registry + handlers.
- Hard-separation rule: a row exists in EXACTLY ONE of `swarm_noise_categories`
  (Stage 1) or `swarm_intents` (Stage 3) — never both.
- CLAUDE.md Supabase rules: RLS + explicit policy on every new table;
  `security_invoker=true` on every new view; `SET search_path` on SECURITY
  DEFINER funcs. `npm run check:supabase` gates CI on ERROR-level advisors.
</canonical_refs>
</content>
</invoke>
