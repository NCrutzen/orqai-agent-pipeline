# Phase 56: iController auto-labeling van accounts aan emails — Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Inbound debtor-emails in iController (na cleanup-stap) automatisch labelen aan het juiste **klant-account** (NXT customer / debtor). Per-mailbox aan/uit via Zapier. Onbekende mails blijven onaangeroerd. Vercel-laag heeft alleen een `dry_run` kill-switch.

**Resolution pipeline (LOCKED — order matters):**

1. **Thread-inheritance** (cheap, deterministic) — same `conversation_id` already labeled → inherit.
2. **Sender → contactperson → customer account** in NXT (NEW PRIMARY — flipped from invoice-first per discussion 2026-04-28).
3. **Body parse → identifier patterns** (invoice IDs, customer codes, project numbers, …) → NXT lookup. **Fallback only when sender lookup misses.** Successful patterns feed the learning loop.
4. **LLM tiebreaker (Orq.ai)** — only on multi-candidate ambiguity. Skipped for single-hit (high confidence) and zero-hit (mark `unresolved`).

**Cross-brand routing:** each Outlook mailbox maps to one NXT *database* (per brand). Vercel knows the database from `debtor.labeling_settings.nxt_database` (new column).

**Cross-swarm rules engine reuse:** identifier patterns (sender → account, regex → account, etc.) live in `public.classifier_rules` with new `kind='label_resolver'`. Phase 60's Wilson-CI cron auto-promotes resolver rules. Operator dashboard at `/automations/classifier-rules` already surfaces them.

**Expliciet uit scope:** schaalbaar pattern-mining UI (Phase 57+ if needed), per-rule manual edit UI (use Studio for now), automated email-not-yet-ingested retry queue (synchronous 404 acceptable), generieke "label any inbound email anywhere" (Phase 56 is debtor-only).

</domain>

<decisions>
## Implementation Decisions

### Resolution pipeline shape (architectural anchor)

- **D-00:** Resolution order is **thread → sender → identifier-parse → LLM tiebreaker**. Sender is primary because each email has different content; sender is the only stable signal across brands. Invoice/identifier parsing is fallback.
- **D-01:** Sender lookup queries a **`contactperson` table** (or equivalent join) in NXT, not just `debtors.email`. Contactperson can map to one customer account; multiple contactpersons mapping to different accounts trigger LLM tiebreaker.
- **D-02:** Identifier-parse is generic — not just invoice regex. Regex/parse rules live in `public.classifier_rules` (D-09). Phase 56 ships with the existing invoice regex `\b(17|25|30|32|33)\d{6}\b` as the seed; new patterns are added as data, not code.
- **D-03:** LLM tiebreaker fires **only on multi-candidate ambiguity** (sender lookup ≥ 2 contactpersons OR identifier-parse ≥ 2 invoices on different accounts). Zero-hit → `status='unresolved'`, no LLM call. Single-hit → label directly with `confidence='high'`.

### NXT lookup transport

- **D-04:** **One generic NXT-lookup Zap** accepting `{nxt_database, lookup_kind, payload}` and returning normalized rows. Sync POST → JSON response. `lookup_kind` switches in the Zap (`sender_to_account`, `identifier_to_account`, etc.). Adding a new lookup = adding a Zapier branch, no new env var.
- **D-05:** Auth: **shared `NXT_ZAPIER_WEBHOOK_SECRET` env var** in Vercel; Zap validates `Authorization: Bearer ...`. One secret rotation rotates all NXT-bound calls — acceptable since they share the whitelisted-IP transport.
- **D-06:** **`nxt_database` column added to `debtor.labeling_settings`** (additive migration). One row per Outlook mailbox; populated per brand. Vercel reads it post-mailbox-resolve and forwards to the Zap. Default `null` (no auto-labeling) is safe for new mailboxes.
- **D-07:** Vercel passes `nxt_database` in the Zap payload; Zap routes to the corresponding NXT database connection. **No multi-database UNION fan-out.** Cross-brand sender resolution is handled by an explicit follow-up call only when ambiguity surfaces.

### Identifier-parse + learning loop

- **D-08:** **Reuse `public.classifier_rules` with `kind='label_resolver'`** (alongside `regex` and `agent_intent`). Migration extends the CHECK constraint: `kind in ('regex','agent_intent','label_resolver')`. Cross-swarm — same store as Phase 60's whitelist-gate rules.
- **D-09:** `rule_key` namespacing for label resolvers: `resolver:invoice_legacy`, `resolver:invoice_2026`, `resolver:project_code`, etc. `definition jsonb` column carries the regex + extraction shape (deferred to Phase 56+1 if not needed initially — Phase 56 ships with hardcoded regex and seeds one rule pointing at it).
- **D-10:** Learning-loop telemetry: each successful resolution writes a row to `public.agent_runs` with `swarm_type='debtor-email-labeling'`, `verdict_reason='auto'`, `corrected_category=<account_id>`. Operator approve/reject in the dashboard writes `human_verdict`. Phase 60's cron computes Wilson CI-lo per resolver rule and auto-promotes — **same code path, no new cron**.
- **D-11:** **No new resolver rules created automatically in Phase 56.** Pattern-mining (clusters of unresolved emails → candidate rules) is deferred to Phase 61+. Phase 56 only consumes existing rules + the seeded invoice regex.

### LLM tiebreaker

- **D-12:** **Pre-fetched candidate details inline** — Vercel fetches each candidate's contact details (name, email, recent invoices, last interaction) via NXT Zap, packages into a structured Orq.ai prompt with email subject + body. Single LLM call, no agent tool-use loop. Predictable cost (~3-5k tokens).
- **D-13:** Orq.ai contract: `response_format: json_schema` returning `{selected_account_id: string, confidence: 'high'|'medium'|'low', reason: string}`. Per CLAUDE.md `orqai-patterns.md`. Primary model: `anthropic/claude-sonnet-4-6` + 3-4 fallbacks. 45s timeout (orq internal retry = 31s).
- **D-14:** LLM result writes `confidence` and `reason` into `debtor.email_labels.notes`; `email_labels.method='llm_tiebreaker'`. Audit-grade — operator can re-run later from the same context.

### iController Browserless step

- **D-15:** **Pre-resolved iController message-URL contract.** Module signature: `labelEmail({icontroller_message_url, customer_account_id, screenshot_dir})`. URL pattern is the operator/probe artifact (`/messages/show/<id>` or similar). This decouples the labeling step from graph_message_id ↔ iController ID resolution — a separate concern handled before the label call.
- **D-16:** Idempotency: module first reads current label state. If already labeled with `customer_account_id` → no-op + return success. If labeled with a different account → log warning + skip (don't overwrite operator decisions).
- **D-17:** **Probe artifact:** user notes "probe believed to exist already." Researcher MUST verify during scout (search `web/lib/automations/**` for label-related probe). If absent: planner adds a Wave 0 task `probe-label-ui.ts` mirroring `cleanup/probe-email-popup.ts`. Output: DOM excerpts + screenshots + a comment block in `label-email-in-icontroller.ts` describing selectors.
- **D-18:** Browserless via `playwright-core` + `chromium.connectOverCDP` (CLAUDE.md). Screenshots before/after to Supabase storage; paths persisted in `email_labels.screenshot_before_url` + `screenshot_after_url`. SPA navigation `waitUntil: 'domcontentloaded'`. Shadow-DOM via `.evaluate()` per CLAUDE.md.
- **D-19:** Single iController login covers all 5 mailboxes (per Phase 22 / `session.ts`). Browserless module reuses `openIControllerSession`. No per-brand credentials.

### Dry-run review surface

- **D-20:** **New UI page `/automations/debtor-email-labeling`** — Next.js (dashboard) route, v7 design tokens. Per-mailbox aggregate (counts: total / by method / by confidence / unresolved) + recent rows table with email subject + sender + chosen account + confidence + method. Click a row → drawer showing full email body + LLM rationale + screenshots.
- **D-21:** **Approve/Reject buttons per row** in the drawer. Approve → writes `human_verdict='approve'` on the agent_runs row + updates `email_labels.reviewed_by`/`reviewed_at`. Reject → `human_verdict='reject'` + `corrected_category` (operator picks the right account). This is the telemetry signal Wilson-CI consumes.
- **D-22:** Counts query via Postgres RPC `label_dashboard_counts(p_nxt_database text DEFAULT NULL)` (mirrors Phase 60's `classifier_queue_counts` pattern). Cursor pagination on `created_at`, page-size 100.
- **D-23:** Realtime: subscribe via existing `automation-realtime-provider.tsx` (Phase 59 broadcast) with channel `automations:debtor-email-labeling:stale`. Approve/reject + new inbound rows trigger refetch.

### Per-mailbox flip gate (Wilson-CI auto-flip)

- **D-24:** Per-mailbox flip from `dry_run=true` to `dry_run=false` is **Wilson-CI gated**, mirroring Phase 60's per-rule cron. New cron OR extension to `classifier-promotion-cron`: aggregate `agent_runs` for `swarm_type='debtor-email-labeling'` per mailbox, compute Wilson 95% CI-lo on `human_verdict='approve'` rate. Promote (set `dry_run=false`) when **N≥50 AND CI-lo≥95%**.
- **D-25:** Per-mailbox demote with hysteresis — flip back to `dry_run=true` when CI-lo<92% over the recent N=50 window. Slack/log alert on demotion. Mirrors D-03 from Phase 60.
- **D-26:** Flip events are operator-visible (env-flag-gated like Phase 60: `LABELING_CRON_MUTATE`). Shadow-mode default writes `would_have_flipped` evaluation rows to `classifier_rule_evaluations` with `swarm_type='debtor-email-labeling'`. Operator flips `LABELING_CRON_MUTATE=true` after spot-check.

### Audit + rollout safety

- **D-27:** `debtor.email_labels` already exists (migrated 2026-04-23) with `conversation_id` + index. Phase 56 adds columns: `nxt_database`, `customer_account_id`, `method`, `confidence`, `reviewed_by`, `reviewed_at`, `screenshot_before_url`, `screenshot_after_url`. Additive migration.
- **D-28:** Every email lookup ALWAYS produces an `email_labels` row, even on `unresolved` (`method='unresolved'`, `customer_account_id=null`). Audit trail is complete — no silent drops.
- **D-29:** Email-not-yet-ingested race (`email_pipeline.emails` empty when Zapier fires): synchronous 404 to Zapier with `error='email_not_ingested'`. Zapier retry handles it. No async queue. Acceptable per todo doc note ("observatie nodig" → log frequency, escalate if > 1%).
- **D-30:** Rollout: Smeba (`mailbox_id=4`) shadow-flips first via Wilson-CI cron. Other 4 mailboxes (Smeba-Fire, Sicli-Noord, Sicli-Sud, Berki) stay `dry_run=true` until their N=50 + CI-lo gate passes individually. FireControl deferred until iController access for FireControl is confirmed.

### Zapier-tool registry (architectural anchor — added 2026-04-29)

- **D-32:** **`public.zapier_tools` registry replaces per-Zap env vars.** One row per Zapier-bound tool (sync lookup, async fetch, future). Adding an automation = INSERT one row + build the Zap. No Vercel env var. No code change. No deploy. Schema: `tool_id pk, backend, pattern ('sync'|'async_callback'), target_url, auth_method ('body_field'|'header_bearer'), auth_secret_env, auth_field_name, input_schema jsonb, output_schema jsonb, callback_route, enabled`. Migration: `supabase/migrations/20260429_zapier_tools_registry.sql`.
- **D-33:** **Auth secrets stay in env vars; the registry references them BY NAME** via `auth_secret_env` column (e.g. value `"DEBTOR_FETCH_WEBHOOK_SECRET"`). Many tools share one secret: all NXT tools point at `DEBTOR_FETCH_WEBHOOK_SECRET` (existing, established by invoice-fetch). Per-tool override possible. Rotation = update one env var + the corresponding Zap's filter.
- **D-34:** **Phase 56 ships 3 seeded rows** under `backend='nxt'`: `nxt.contact_lookup`, `nxt.identifier_lookup`, `nxt.candidate_details`. All `pattern='sync'`, all point at the new generic-lookup Zap, all use `body_field` auth with field `auth`. The Zap's `lookup_kind` discriminator branches inside Zapier. Resolver code uses tool-id-keyed wrappers (`lookupSenderToAccount`, `lookupIdentifierToAccount`, `lookupCandidateDetails`).
- **D-35:** **Generic `/api/zapier-tools/[tool_id]/route.ts` bridge route is DEFERRED** to a follow-up phase. Phase 56's resolver calls Zapier directly (with URL read from registry). Follow-up phase consolidates: (a) generic bridge route that reads registry, validates input_schema, formats auth, forwards; (b) generic async-callback handler; (c) migrate existing invoice-fetch into the registry; (d) document for Orq.ai agent consumption (input_schema doubles as agent tool spec).

### Migration ordering

- **D-31:** **Additive-first, switch-reads** zero-downtime:
  1. Migration: extend `classifier_rules.kind` CHECK to include `'label_resolver'`; add columns to `debtor.email_labels` (D-27); add `nxt_database` to `debtor.labeling_settings` (D-06); seed `nxt_database` per existing mailbox row.
  2. Backfill: insert one seed `classifier_rules` row with `kind='label_resolver'`, `rule_key='resolver:invoice_legacy_regex'`, `status='candidate'`, definition pointing at the existing `extract-invoices.ts` regex.
  3. Deploy route refactor (sender-first pipeline + LLM tiebreaker + screenshots wiring + `email_labels` writes for every call).
  4. Deploy dashboard `/automations/debtor-email-labeling` + approve/reject server actions.
  5. Deploy Wilson-CI flip cron (shadow-mode default).
  6. Operator: create 5 Zapier Zaps, enable Smeba first, wait for N=50 + CI-lo, flip `LABELING_CRON_MUTATE=true`, watch live flip.

### Claude's Discretion

- Exact name + DDL of the contactperson lookup query (depends on NXT schema — researcher confirms with operator or via Zapier exploration).
- Specific column types/lengths on `email_labels` additive migration.
- Whether the per-mailbox flip cron is a new Inngest function or a branch inside `classifier-promotion-cron` (lean toward extending the existing cron — same eval-write pattern, gated by `swarm_type`).
- Drawer component variant (re-skin `agent-detail-drawer` or new specialization).
- LLM agent slug + Orq.ai project_id (suggest reusing the Debiteuren Email project: `60c730a3-be04-4b59-87e8-d9698b468fc9`, orqai_project_id seeded 2026-04-28).
- Storage bucket for screenshots (existing Phase 55-03 pattern probably already has one).
- Whether `definition jsonb` column is added to `classifier_rules` in this phase (defer if seeded rule fits the existing schema; add if any new resolver needs structured config).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source todo / phase documents
- `.planning/phases/56-icontroller-auto-labeling-van-accounts-aan-emails/todos/2026-04-23-debtor-email-auto-labeling-in-icontroller.md` — original architecture doc, status, TODO list
- `.planning/phases/55-debtor-email-pipeline-hardening/55-CONTEXT.md` — `agent_runs` schema, swarm_type, multi-mailbox via `labeling_settings`
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-CONTEXT.md` — `classifier_rules` schema, Wilson-CI cron, kind='regex'|'agent_intent' (Phase 56 adds 'label_resolver')
- `.planning/phases/60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-/60-RESEARCH.md` — cron + telemetry-view contract that Phase 56 reuses
- `.planning/STATE.md` — Phase 50 closed; Phase 60 60-07 calendar-gated

### Codebase hotspots — already shipped
- `web/app/api/automations/debtor/label-email/route.ts` — MVP route skeleton (auth + dry-run + invoice extract); needs full pipeline rewrite
- `web/lib/automations/debtor-email/mailboxes.ts` — `ICONTROLLER_MAILBOXES` constant
- `web/lib/automations/debtor-email/extract-invoices.ts` — invoice regex extractor
- `supabase/migrations/20260423_debtor_email_labeling.sql` — `debtor.email_labels` + `debtor.labeling_settings` (live)
- `web/lib/automations/icontroller/session.ts` — iController login + session reuse pattern
- `web/lib/automations/debtor-email-cleanup/probe-email-popup.ts` — analog probe pattern for the label-DOM probe (D-17)

### Codebase hotspots — to be created/modified
- `supabase/migrations/2026MMDD_debtor_email_labeling_phase56.sql` — additive: classifier_rules.kind extension + email_labels columns + labeling_settings.nxt_database
- `web/lib/automations/debtor-email/label-email-in-icontroller.ts` — Browserless label module
- `web/lib/automations/debtor-email/probe-label-ui.ts` — IF probe doesn't already exist (researcher verifies first)
- `web/lib/automations/debtor-email/resolve-debtor.ts` — sender → contactperson → account pipeline
- `web/lib/automations/debtor-email/llm-tiebreaker.ts` — Orq.ai pre-fetched-context call
- `web/app/api/automations/debtor/label-email/route.ts` — full rewrite from MVP skeleton
- `web/app/(dashboard)/automations/debtor-email-labeling/page.tsx` + drawer + actions
- `web/lib/inngest/functions/labeling-flip-cron.ts` (or extension to `classifier-promotion-cron.ts`) — per-mailbox Wilson flip

### Phase 60 reusable assets
- `web/lib/classifier/{wilson.ts,cache.ts,read.ts,types.ts}` — Wilson math + 60s cache + service-role read
- `web/lib/inngest/functions/classifier-promotion-cron.ts` — cron pattern with shadow-mode flag
- `web/lib/inngest/functions/classifier-verdict-worker.ts` — event-trigger pattern
- `web/components/automations/automation-realtime-provider.tsx` — Phase 59 broadcast subscription
- `web/lib/automations/runs/emit.ts` — broadcast helper
- `web/components/v7/drawer/agent-detail-drawer.tsx` — drawer pattern
- `web/app/(dashboard)/automations/classifier-rules/{rules-table,ci-lo-sparkline,rule-status-badge}.tsx` — v7 table + sparkline analogs

### Project-level
- `CLAUDE.md` — Stack, Zapier-first decision tree, Inngest cron rules (TZ-prefix verplicht, business-hours window default), JSONB double-encoding, service-role writes
- `docs/inngest-patterns.md` — step.run boundaries, idempotency, cron defaults
- `docs/orqai-patterns.md` — response_format=json_schema, model fallbacks, 45s timeout, XML-tagged prompts
- `docs/zapier-patterns.md` — NXT SQL via Zapier whitelisted IP, batched-lookup patterns
- `docs/supabase-patterns.md` — RLS, service-role, JSONB
- `docs/browserless-patterns.md` — playwright-core, connectOverCDP, screenshots-before-close

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Phase 60 classifier engine** — `public.classifier_rules` + Wilson-CI cron + `/classifier-rules` dashboard. Adding `kind='label_resolver'` extends it to labeling resolution rules with zero new infrastructure.
- **Phase 60 cron + worker patterns** — `classifier-promotion-cron.ts` (cron template) and `classifier-verdict-worker.ts` (event-trigger). Phase 56's flip-cron extends or mirrors these.
- **Phase 59 broadcast** — single-channel realtime fanout per page; new dashboard subscribes with channel `automations:debtor-email-labeling:stale`.
- **Phase 55 multi-mailbox foundation** — `debtor.labeling_settings` already keyed by `source_mailbox` + `icontroller_mailbox_id`. Adding `nxt_database` extends per-mailbox routing.
- **`agent_runs.swarm_type`** — adding `'debtor-email-labeling'` extends the cross-swarm telemetry without schema changes.
- **iController session** — `openIControllerSession` reused; no new login flow.
- **`extract-invoices.ts`** — keep as-is, reference from a `classifier_rules.kind='label_resolver'` row with definition pointing at the regex.

### Established Patterns

- **Status-driven swarm-bridge** (Phase 55+60) — `automation_runs.status` drives UI stage. Labeling has its own status flow inside `email_labels` (`pending → resolved → labeled` or `pending → unresolved`).
- **Idempotency via UNIQUE + ON CONFLICT** — `email_labels(conversation_id, graph_message_id)` UNIQUE for thread-inheritance and re-fire safety.
- **Service-role writes** — cron + label module run as service-role; RLS only protects client paths.
- **Generic-from-day-1** — Phase 60 chose `classifier_rules` over `debtor.auto_action_rules`. Phase 56 follows: `kind='label_resolver'` is generic across swarms.
- **Inngest cron with `TZ=Europe/Amsterdam` prefix** (CLAUDE.md, learning `eb434cfd`); business-hours window default.
- **Orq.ai response_format=json_schema mandatory** (CLAUDE.md / `orqai-patterns.md` §1).

### Integration Points

- `email_labels` (additive) — written by route on every call; read by dashboard.
- `labeling_settings` (additive `nxt_database`) — read by route to route NXT lookups.
- `classifier_rules` (extended CHECK) — read by resolver pipeline; written by Wilson-CI cron.
- `agent_runs` (cross-swarm) — labeling writes telemetry; cron consumes it for Wilson math.
- `classifier_rule_evaluations` (existing) — flip-cron writes per-mailbox flip evaluations as rows with `rule_key='mailbox_flip:<mailbox_id>'`.
- Inngest event `labeling/verdict.recorded` (mirror of Phase 60's `classifier/verdict.recorded`) — fired by approve/reject server actions; consumed by an optional worker if async side-effects are needed (Phase 56 keeps approve/reject sync; worker reserved for future).
- Zapier (`NXT lookup` Zap) — single endpoint, multiple `lookup_kind` branches.
- Browserless — single label module reuses iController session.

</code_context>

<specifics>
## Specific Ideas

- **Sender lookup as primary** is the user's strong preference based on real email-content variability. Each email body is too varied to parse reliably; sender is the only stable identifier across brands.
- **NXT contactperson table** is the join target — likely structure `contactperson(id, email, customer_account_id, ...)`. Researcher confirms exact name during Zapier exploration.
- **Multi-database routing** — 5 brands × 1 NXT database each (Smeba, Smeba-Fire, Sicli-Noord, Sicli-Sud, Berki). Source of truth = `debtor.labeling_settings.nxt_database`.
- **Existing invoice regex** `\b(17|25|30|32|33)\d{6}\b` covers current sample; new prefixes are additive via `classifier_rules` rows (definition jsonb) when needed.
- **Smeba-first rollout** — `mailbox_id=4` is the de-facto canary. Wilson-CI per-mailbox flip ensures other brands don't auto-flip until they hit their own N=50.
- **Probe artifact reuse** — user believes a label-DOM probe already exists. Researcher's first job: grep for it; if found, use; if not, add a probe sub-task.
- **Reuse Debiteuren Email Orq.ai project** (`60c730a3-...` Supabase id, `019db9c0-...` Orq.ai project_id seeded 2026-04-28) for the LLM tiebreaker agent.

</specifics>

<deferred>
## Deferred Ideas

- **Pattern-mining UI** — surface clusters of unresolved emails, suggest candidate `label_resolver` rules for operator approval. Phase 57+. Telemetry already accumulating via `agent_runs`.
- **DB-backed regex sandbox** — generic `classifier_rules.definition jsonb` containing executable regex with sandboxed evaluation. Defer until 2+ resolver rules need new regex; Phase 56 ships with one seed pointing at `extract-invoices.ts`.
- **Per-rule manual flip approval flow** — operator confirms each Wilson-CI promotion. Defeats auto-promotion purpose; only add if drift incidents force it.
- **Multi-database UNION fallback** — if a sender exists in 2 brands' contactperson tables, try the secondary if the primary returns no invoice match. Requires cross-brand routing logic; defer until single-brand routing produces measurable cross-brand miss rate.
- **Async retry queue** for `email_not_ingested` — if 404 frequency exceeds 1%, build a queue + Inngest retry. Currently relying on Zapier retry (acceptable per todo doc).
- **FireControl mailbox** — out of scope until iController access is confirmed for that brand.
- **Label-removal / re-label flow** — if operator rejects a row, currently we update `email_labels` but do NOT auto-remove the iController label (D-16 says no-op on conflict). A "remove and re-apply" Browserless flow can be added if false-positives accumulate.
- **Bulk approve in dashboard** — Phase 55's deferred-bulk criterion (≥200 rows + <5% disagreement) carries forward. Phase 56 ships per-row only.
- **Labeling provenance chips on emails** in Outlook — show which method labeled (sender / regex / llm). Outlook UI is not Phase 56's surface.

### Reviewed Todos (not folded)

None — only the in-folder todo is folded directly as the source spec.

</deferred>

---

*Phase: 56-icontroller-auto-labeling-van-accounts-aan-emails*
*Context gathered: 2026-04-28*
