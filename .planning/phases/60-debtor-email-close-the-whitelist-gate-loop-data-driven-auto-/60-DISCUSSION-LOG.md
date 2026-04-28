# Phase 60: Debtor email — close the whitelist-gate loop - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-
**Areas discussed:** Cross-swarm anchor (user-volunteered), Telemetry source & gates, Promotion store + cron shape, Queue-UI scope + Outlook coupling, Approval semantics + rollout safety, Rule lifecycle, Observability + scope edges, Migration / topology

---

## Cross-swarm anchor (user-volunteered during area selection)

User added during area-selection: *"And note we need to build one generic system to manage the rules cross mailbox and cross entity so not only debtor but also sales, planning, order entry, etc."*

**Result:** locked as architectural anchor across all subsequent decisions — `swarm_type` discriminator on every new table, `public.classifier_*` schema, no debtor-specific names.

---

## Telemetry source & gates

| Option | Description | Selected |
|--------|-------------|----------|
| agent_runs.human_verdict only | Phase 55 cross-swarm table; one source | ✓ |
| automation_runs.status='feedback' only | Reuse current bulk-review writes | |
| Both, prefer agent_runs | Hybrid with fallback | |

| Option | Description | Selected |
|--------|-------------|----------|
| N≥30 AND CI-lo ≥95% | Matches empirical thresholds in route.ts comments | ✓ |
| N≥100 AND CI-lo ≥95% | More conservative | |
| N≥30 + no recent failures (7d) | Adds clock-dependence | |

| Option | Description | Selected |
|--------|-------------|----------|
| Hysteresis demote at <92% | 5% gap, prevents flapping | ✓ |
| Symmetric demote at <95% | Risk of flapping | |
| Flag-only, never auto-demote | Manual gating | |

| Option | Description | Selected |
|--------|-------------|----------|
| Migration backfills from automation_runs | Verifiable provenance | ✓ |
| Hardcode 6 rules as 'promoted' | Trust comments | |
| Empty whitelist, first cron run promotes | Window of zero auto-action | |

**User's choice:** All recommendeds.

---

## Promotion store + cron shape

| Option | Description | Selected |
|--------|-------------|----------|
| public.classifier_rules — generic | Cross-swarm shape | ✓ |
| debtor.auto_action_rules now, refactor later | Faster but reverses Phase 55 discipline | |
| classifier_rules + per-swarm overrides table | More moving parts | |

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory cache 60s TTL | Zero per-request DB cost | ✓ |
| Per-request DB read | +5-10ms per ingest call | |
| Realtime subscription | Overkill | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inngest cron, daily 06:00 Amsterdam, biz-day | Matches CLAUDE.md cron rules | ✓ |
| Hourly within business window | 14× more runs for negligible benefit | |
| Event-trigger only | Relies on external trigger | |
| Both | Daily + ad-hoc rerun | |

| Option | Description | Selected |
|--------|-------------|----------|
| classifier_rule_evaluations append-only | Trend + flapping debug | ✓ |
| No history, only current state | Loses drift visibility | |
| History only on state change | Loses smooth trend line | |

**User's choice:** All recommendeds.

---

## Queue-UI scope + Outlook coupling

| Option | Description | Selected |
|--------|-------------|----------|
| Pure automation_runs.status='predicted' | Drop Outlook walk entirely | ✓ |
| automation_runs primary, Outlook on-demand | Hybrid verifier | |
| Keep Outlook walk + automation_runs overlay | Dual source | |

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs at top per entity | Tabs don't scale | |
| Single unified queue | Free-text reframe — see notes | |
| Per-entity routes | Free-text reframe | |

**User's choice:** *"at some point we need to manage 50 to a 100 mailboxes from a broad range of over 15 entities and multiple topics debtor, sales, planning, etc."*

→ Triggered follow-up question on hierarchy.

| Option | Description | Selected |
|--------|-------------|----------|
| Topic→entity→mailbox hierarchy in sidebar | Reframed to right-sliding drawer | ✓ |
| Top-level swarm switcher + filters | Flatter | |
| Saved-views model | Premature | |

**User's choice + notes:** *"Option 1 → but look at the UI of our current dashboard so a sidebar will probably be a list that slides in from the right."* → mapped to `web/components/v7/drawer/agent-detail-drawer.tsx` pattern.

| Option | Description | Selected |
|--------|-------------|----------|
| Ship structure + debtor populated | Auto-light other topics later | (see notes) |
| Debtor-only, generalize later | Reverses Phase 55 discipline | |
| Hierarchy + seed empty placeholders | Adds tiny config table | |

**User's choice:** *"Forwarding email to our swarms is a Zapier Outlook Trigger to Vercel Webhook flow. Maybe adding a Category to the email is an idea?"* → Initially read as scope expansion; clarified follow-up showed user wanted *classification awareness*, not Zapier topology change. Schema decision (D-11 typed columns) covers it. Category-router flow deferred.

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor on created_at, page size 100 | Stable under concurrent inserts | ✓ |
| Offset pagination | Suffers under concurrent inserts | |
| Infinite scroll | Needs more client state | |

| Option | Description | Selected |
|--------|-------------|----------|
| Filter on result.predicted.rule | Same UX, JSONB query | |
| Drop rule-filter, add Pending-promotion tab | Curated path | |
| Both — rule filter + pending-promotion tab | Power-user + curated | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — typed swarm_type/topic/entity/mailbox_id columns | Index-friendly, future-proof | ✓ |
| Only swarm_type, rest in jsonb | Minimal change | |
| No schema change | Slower counts | |

---

## Approval semantics + rollout safety

| Option | Description | Selected |
|--------|-------------|----------|
| Verdict-write only, async worker handles side-effects | Instant UI, retry-friendly | ✓ |
| Synchronous categorize+archive+iController inline | Current pattern, 5min timeouts | |
| Optimistic verdict + fire event | Best UX but riskier | |

| Option | Description | Selected |
|--------|-------------|----------|
| status transition predicted→feedback on verdict write | Single write, broadcast updates UI | ✓ |
| Only when Outlook MR-label appears | Stronger but complex | |
| Two-phase: dim + hide | Marginal benefit | |

| Option | Description | Selected |
|--------|-------------|----------|
| Existing predicted rows stay; new emails go auto | Telemetry preserved | ✓ |
| Bulk auto-approve pending rule rows | Conflates cron with human verdict | |
| Mark rows 'auto_promotion_pending' | Extra UI state | |

| Option | Description | Selected |
|--------|-------------|----------|
| (Initial) Shadow 14 days then flip | Lowest risk | |
| Live from day 1 | Trust math + hysteresis | |
| Hybrid debtor live, others shadow | Per-swarm flag | |

**User's choice on first ask:** *"Not quite sure what you want here ergo what is the goal here?"* → Re-explained the goal (cron is new actor that flips rules unilaterally). Reframed:

| Option | Description | Selected |
|--------|-------------|----------|
| Shadow 14 days, then flag-flip | Lowest risk | ✓ |
| Live immediately + hysteresis | Trust the math | |
| Hybrid per-swarm | Cross-swarm fairness | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-mailbox kill-switch on labeling_settings | Mirrors Phase 55 pattern | |
| No, global on/off | Simpler | |
| Generic swarm_type × mailbox matrix | Cross-swarm symmetric | ✓ |

---

## Rule lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Surface unknown clusters, rule-authoring stays manual | Visibility only | |
| Full DB-backed rule definitions | Massive scope | |
| Defer entirely | Phase 60 stays focused | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Agent intents in their own table | Two parallel lifecycles | |
| Same table, kind column ('regex'/'agent_intent') | Unified store | ✓ |
| One-and-only-one classifier_rules | (covered by recommended) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reject feeds normal eval; demotion via cron+hysteresis | Predictable | ✓ |
| Tripwire ≥K rejects in 24h | Adds side-channel | |
| Both | Belt-and-braces | |

| Option | Description | Selected |
|--------|-------------|----------|
| Store only — Phase 61+ mines | Consistent with deferral | |
| Store + 'lookalike' visualization | Cheap rendering | |
| Defer corrected_category column | Smallest scope | |

**User's choice on first ask:** *"Need more explanation on this topic"* → Re-explained hand-label flow; reframed with the same options.

| Option | Description | Selected |
|--------|-------------|----------|
| Store only — Phase 61+ mines | Stays in scope | ✓ |
| Store + lookalike visualization | Optional cheap render | |
| Defer corrected_category column | Worse data shape | |

---

## Observability + scope edges

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated /automations/classifier-rules page | Cross-swarm | ✓ |
| Tab on existing review page | Couples surfaces | |
| No UI, SQL + Slack only | Cheapest | |

| Option | Description | Selected |
|--------|-------------|----------|
| Per-row only | Aligns with Phase 55 deferred bulk-approve | (combined) |
| Bulk within group | Hidden-bad-row risk | |
| Bulk only for promoted rules (post-shadow) | Race-cohort cleanup | (combined) |

**User's choice:** *"Go for 1 and 3"* → Per-row by default; bulk-approve only available for the race-condition cohort (rules just promoted by cron). Locked as D-21.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep all rows forever, rely on indexes | Volume small | ✓ |
| Archive feedback >180d | Premature | |
| Delete >1y | Loses telemetry | |

| Option | Description | Selected |
|--------|-------------|----------|
| One global flag classifier_cron.mutate | Smeba goes live | ✓ |
| Per-swarm flip | Hybrid pattern | |
| Per-rule manual flip | Defeats automation | |

---

## Migration ordering + Inngest topology

| Option | Description | Selected |
|--------|-------------|----------|
| Additive first, switch reads, drop fallback | Zero-downtime 4-step | ✓ |
| Big-bang one migration + deploy | No fallback | |
| Feature flag rules.engine.enabled | Adds retire-debt flag | |

| Option | Description | Selected |
|--------|-------------|----------|
| classify.ts unchanged | Regex stays in code | ✓ |
| Move regex defs to jsonb | Already rejected | |
| Hybrid notes/owner jsonb | Cheap dashboard helper | |

| Option | Description | Selected |
|--------|-------------|----------|
| Two functions: cron + verdict-worker | Cross-swarm reusable | ✓ |
| Three functions (+bulk-promote-handler) | Extra monitoring surface | |
| One mega-function | Mixes cron-time + event-time | |

| Option | Description | Selected |
|--------|-------------|----------|
| GROUP BY query at page-load + Phase 59 broadcast | Single query, live updates | ✓ |
| Materialized view 1min refresh | Premature | |
| Compute client-side | Breaks at scale | |

---

## Claude's Discretion

- `rule_key` agent-intent namespacing convention
- Index-strategie voor counts-query (covering vs multi-column)
- Wilson-CI implementatie (SQL vs Postgres function vs TS)
- Schema-naam voor classifier-tabellen (`public.classifier_*` vs eigen schema)
- v7 drawer-component variant + tree-component
- Broadcast-channel-naam (Phase 59-style)
- Backfill-script formaat (standalone TS vs Inngest one-shot)
- Naming voor `corrected_category` veld op `agent_runs`

## Deferred Ideas

(Full list in CONTEXT.md `<deferred>`. Highlights: Outlook Category-as-routing-key generic intake, rule-discovery from unknowns, DB-backed regex defs, LLM prompt-iteration loop, drift-tripwire, per-rule manual approval, saved-views, materialized counts view, archive/delete retention, generic bulk-approve UI.)
