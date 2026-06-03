# Operator Language — Translation Lock-Table

**Purpose:** every internal technical term has an operator-facing equivalent. Coding agents writing operator-visible copy MUST check against this table. Internal terms stay in code, comments, types, server actions, and engineer-facing surfaces — never in the operator UI.

This isn't a style guide preference. The Bulk Review UX milestone serves non-technical operators clearing email queues. If they see `swarm_intents` or `Wilson-CI gate` on screen, the product is failing.

---

## Pipeline stage names

| Internal | Operator-facing | Notes |
|---|---|---|
| `stage=0` · safety_review | **Safety** | Always paired with the number — "Stage 0 · Safety" in section heads, just "Safety" in stage tabs |
| `stage=1` · `swarm_noise_categories` | **Noise** (filter) | Never name the table |
| `stage=2` · entity resolver · sender_map | **Customer** (match) | "Customer resolver" is OK in section heads |
| `stage=3` · coordinator · `swarm_intents` | **Topic** | Sometimes "intent" reads OK in context, but default to "Topic" |
| `stage=3.5` · dispatcher | — | Internal only; operator never sees this |
| `stage=4` · handler | **Action** or **Draft reply** | Use "Action" in row strips; "Draft reply" when talking about the email-content step |

## Override axes

| Internal | Operator-facing |
|---|---|
| Axis 1 (`agent_runs.corrected_category` for noise key) | **Category** (Stage 1) |
| Axis 2 (`email_labels.corrected_customer_account_id`) | **Customer** (Stage 2) |
| Axis 3 (`agent_runs.corrected_intent` + ranked-list reorder) | **Topic** (Stage 3) |
| Axis 4 (handler-output correction) | **Reply edits** (Stage 4) |

## Statuses and verdicts

| Internal | Operator-facing |
|---|---|
| `agent_runs.human_verdict = 'confirm'` | "Confirm" or "system got it right" |
| `agent_runs.human_verdict = 'override'` | "Override" or "actually, …" |
| `agent_runs.human_verdict = 'edited_minor'` | "Minor edit" |
| `agent_runs.human_verdict = 'rejected_*'` | "Rejected" |
| `agent_runs.status = 'classifying'` | (internal — operator sees "Topic" stage as pending) |
| `agent_runs.status = 'predicted'` | (internal — between Stage 3 and 3.5) |
| `agent_runs.status = 'routed_human_queue'` | "Routed to the human queue" or "escalated for manual handling" |
| `agent_runs.status = 'fetching_document'` / `creating_draft` / `done` | "In progress" / "Drafting" / "Done" — depending on UI position |
| `agent_runs.status = 'failed'` | "Failed" or specific error |

## Decisions per stage

| Internal | Operator-facing |
|---|---|
| Stage 0 verdict = `safe` | **Safe** (sometimes "Cleared safety check" in long form) |
| Stage 0 verdict = `injection_suspected` | **Injection suspected** |
| Stage 0 verdict = `over_budget` | **Too large** (out of scope this milestone — placeholder copy) |
| Stage 1 verdict = `auto_reply` / `ooo_temporary` / `ooo_permanent` / `payment_admittance` | **Auto-reply** / **Out-of-office** / **Out-of-office (permanent)** / **Payment confirmation** |
| Stage 1 verdict = `unknown` | **No rule matched** or **Customer message** (depending on context — `unknown` = "Customer message" after Pass-2 confirms it's not noise) |
| Stage 1 Pass-2 LLM | **AI** (capitalized once; avoid "LLM") |
| Stage 2 winner = sender_map | **Matched by sender** |
| Stage 2 winner = identifier extraction | **Matched by reference** |
| Stage 2 winner = LLM tiebreaker | **AI picked** (or **AI guess** when low confidence) |
| Stage 3 intent_key (e.g. `invoice_copy_request`) | **Invoice copy request** (sentence-case the underscore_case) |
| Stage 4 handler_agent_key | **Action** (the operator may see the agent name in tooltips for transparency, but the primary label is action-oriented) |

## Pattern discovery (sketch 006)

| Internal | Operator-facing |
|---|---|
| `promotion_candidate` | **Suggestion** |
| `promotion_candidates.kind = 'regex_rule'` | **Filter rule** |
| `promotion_candidates.kind = 'sender_mapping'` | **Known sender** |
| `promotion_candidates.kind = 'new_intent'` | **New topic** |
| `promotion_candidates.kind = 'prompt_tune'` (Stage 3) | **AI tuning** |
| `promotion_candidates.kind = 'prompt_tune'` (Stage 4) | **Draft style** |
| `promotion_candidates.status = 'open'` | **needs review** |
| `promotion_candidates.status = 'in_review'` | **being reviewed** |
| `promotion_candidates.status = 'approved'` | **applied** |
| `promotion_candidates.status = 'rejected'` | **dismissed** |
| `promotion_candidates.status = 'rolled_back'` | **dismissed** (operator doesn't distinguish) |
| `expected_volume / 30d` | **N times this month** |
| `expected_savings` | **est. saved** |
| Total `SUM(expected_savings)` | "could save the company €N / month" |
| Evidence rows | "Recent emails this rule would have caught" / "Emails from this sender (last N days)" |
| Cluster signature (raw — regex / domain / intent flip) | **Plain-English description** generated server-side. Never expose raw regex in the operator UI. |

## Promotion handoff (sketch 007)

| Internal | Operator-facing |
|---|---|
| `applyCandidate` server action | **Apply this suggestion** / "Apply this filter rule" / "Apply this sender link" |
| `refineCandidate` server action | **Refine before applying** |
| `dismissCandidate` server action | **Dismiss with a reason** |
| `before_after_payload.before` | **Today** (column heading in the change-card flow) |
| `before_after_payload.after` | **After applying** |
| `proposed_change.regex_pattern` | **Pattern to match (subject line)** |
| `proposed_change.sender_pattern` | **Sender pattern** |
| `proposed_change.customer_account_id` | **Customer account number** |
| `proposed_change.intent_key` | **Topic key** (rare — operator usually picks from a dropdown) |
| `promotion_candidates.dismissal_reason` | **Why are you dismissing this suggestion?** (the audit-block question) |

## Things operators NEVER see in the UI

These terms only appear in code, types, server actions, engineer admin surfaces, and these docs:

- `pipeline_events`, `agent_runs`, `coordinator_runs`, `automation_runs`, `email_feedback`, `email_labels`
- `swarm_noise_categories`, `swarm_intents`, `classifier_rules`
- `Wilson-CI gate`, `confidence interval`, `Wilson lower bound`
- `LLM` capitalized — use "AI" instead. (`stage-1-category-classifier` is OK in cost-summary monospace because it's a model identifier, and operators understand opaque IDs that look like model names. Don't expand to "Large Language Model".)
- `LLM tiebreaker` — use "AI picked" or "AI guess"
- `eval_type`, `regression`, `capability`
- `confirm rate`, `Wilson-CI`, `binomial sample`
- `regex`, raw regex syntax (`Re:.+afwezig tot \d{2}/\d{2}`)
- `Kanban` — use "human queue" or "manual handling"
- `swarm_type` — say the swarm's display name ("debtor-email" is the internal key; the operator might see "Debtor Email" or just the swarm's branded display name)
- `Inngest`, `cron`, `replay`, `step.run`
- `Orq.ai`, `Anthropic`, `OpenAI` (the AI is "the AI" — the provider is irrelevant to the operator)
- `JSON schema`, `response_format`
- HTTP / API mechanics
- Stage 3.5 dispatcher (entirely internal — the operator sees Stage 3 → Stage 4 transition naturally)
- `human_verdict`, `corrected_*` columns
- `coordinator_runs.ranked_intents` — the array is shown, but never named

## Things that are OK in operator copy (clarification)

- **AI** (capitalized as a noun, e.g. "the AI guessed") — operators understand this term, and it abstracts away which LLM model / provider
- **Stage 1 · Noise** (combined number + name) — operators learn the stage numbers naturally because the navigation surfaces them
- **Email · Subject · Sender · Body · Thread** — common email terminology
- **Customer · Account number · Invoice · Payment** — domain-specific but universal in this context
- **Filter rule · Pattern · Match · Confidence** — kept (no jargon-free equivalent; operators learn these in this context)
- **Confirm · Override · Apply · Refine · Dismiss · Escalate** — kept
- **Regex** is NOT OK in operator copy except in engineer tooltips/admin surfaces. Use "pattern" or "filter."

## When in doubt

If a coding agent is unsure whether a string is operator-facing or engineer-facing:

- Is this on a page operators land on? → operator-facing → translate
- Is this in an engineer admin route (under `/admin/`, `/qa/`, etc.)? → engineer-facing → internal terms OK
- Is this in a server-action error message that surfaces in a toast? → operator-facing → translate
- Is this in a debug console / log line? → engineer-facing → internal terms OK
- Is this in a code comment / TypeScript type / function name? → engineer-facing → internal terms OK
