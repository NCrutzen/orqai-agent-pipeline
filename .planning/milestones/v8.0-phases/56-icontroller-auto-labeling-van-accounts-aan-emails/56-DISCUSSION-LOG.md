# Phase 56 Discussion Log

**Date:** 2026-04-28
**Mode:** discuss (default)
**Areas selected:** 4/4 (NXT lookup transport, LLM tiebreaker, iController DOM/Browserless, dry-run review + flip)

## Carried Forward (not re-asked)

From `2026-04-23-debtor-email-auto-labeling-in-icontroller.md` (source todo):
- 4-laag pipeline (thread → invoice → sender → LLM) — REORDERED in this discussion to thread → sender → identifier-parse → LLM
- iController URL pattern `https://walkerfire.icontroller.eu/messages/index/mailbox/{id}`
- Mailbox IDs (smeba=4, berki=171, sicli-noord=15, sicli-sud=16, smeba-fire=5)
- Single iController login covers all mailboxes
- Live on/off lives in Zapier; Vercel has only `dry_run` per mailbox
- Email-not-yet-ingested: 404 sync response, Zapier retries (todo doc)

From Phase 60 (just shipped):
- `public.classifier_rules` schema + RLS + Wilson-CI cron + `/classifier-rules` dashboard
- `public.agent_runs` cross-swarm telemetry
- Phase 59 broadcast subscription pattern
- v7 drawer + table tokens
- Inngest cron `TZ=Europe/Amsterdam ... 1-5` business-hours window

## Area 1 — NXT lookup transport

**Q1: Wiring shape?**
- Options presented: dedicated batched Zap / two separate Zaps / reuse existing NXT-SQL Zap
- **User answer:** "Note that each email has different contents and therefor the rules to match email to customer account isn't that strict. First step should be fetch the sender email to match a 'contactperson' in the SQL database that should give you a hit on the Customer Account it is related to. Please note we have 3 (future possible more) Database environments to query against. When the sender email doesn't give a result we should parse the email for identifiers like an invoice id for instance and thand learn over time to make more rules for specific SQL queries."
- **Captured as:** D-00 (sender-first reorder), D-01 (contactperson lookup), D-04 (one generic NXT-lookup Zap), D-06/D-07 (multi-database routing via labeling_settings.nxt_database)

**Q2: Auth?**
- Options presented: per-Zap secret / shared NXT secret / Zapier URL secret
- **User answer:** "Option 2. But note we are not talking about Invoice Look-up specifically"
- **Captured as:** D-05 (shared `NXT_ZAPIER_WEBHOOK_SECRET`)

**Follow-up Q3: Database routing?**
- Options presented: keyed by mailbox / Zap auto-detects / operator decides
- **User answer:** "We could add Database name to the mailbox settingstabel in Supabase?"
- **Captured as:** D-06 (`nxt_database` column on `debtor.labeling_settings`)

**Follow-up Q4: Learning loop store?**
- Options presented: reuse `classifier_rules` / new `debtor.label_rules` / no persistent rules
- **User answer:** "Reuse public.classifier_rules with kind='label_resolver' (Recommended)"
- **Captured as:** D-08 (extend CHECK), D-09 (rule_key namespacing), D-10 (telemetry via agent_runs.swarm_type='debtor-email-labeling'), D-11 (no auto-mining in Phase 56)

## Area 2 — LLM tiebreaker mechanics

**Q1: When fires?**
- Options: only multi-candidate ambiguity / both ambiguity + zero-hit / never
- **User answer:** Only on multi-candidate ambiguity
- **Captured as:** D-03

**Q2: Context?**
- Options: pre-fetched candidate details inline / agent + tools / email body only
- **User answer:** Pre-fetched candidate details inline
- **Captured as:** D-12, D-13 (response_format=json_schema), D-14 (audit-grade notes)

## Area 3 — iController label-DOM mapping + Browserless

**Q1: DOM probe?**
- Options: standalone probe-script / inline / manual screenshots
- **User answer:** "I believe we did a probe allready"
- **Captured as:** D-17 (researcher verifies first; if absent, planner adds Wave 0 task)

**Q2: Label module input?**
- Options: graph_message_id+mailbox+account / subject+from+account / pre-resolved URL
- **User answer:** Pre-resolved iController message-URL
- **Captured as:** D-15 (URL contract), D-16 (idempotency on already-labeled), D-18 (Browserless via playwright-core), D-19 (single login)

## Area 4 — Dry-run review surface + flip criteria

**Q1: Review surface?**
- Options: new UI page / SQL view / reuse classifier-rules dashboard
- **User answer:** New UI page `/automations/debtor-email-labeling`
- **Captured as:** D-20 (page + drawer), D-21 (approve/reject), D-22 (RPC counts), D-23 (broadcast)

**Q2: Flip gate?**
- Options: operator spot-check + N / Wilson-CI auto-flip / manual only
- **User answer:** Wilson-CI auto-flip (mirrors Phase 60 cron)
- **Captured as:** D-24 (N≥50 + CI-lo≥0.95 per mailbox), D-25 (demote at <0.92 hysteresis), D-26 (`LABELING_CRON_MUTATE` env flag for shadow → live), D-30 (Smeba-first rollout)

## Claude's Discretion (deferred to research/planner)

- NXT contactperson table exact schema — researcher confirms via Zapier exploration
- Whether per-mailbox flip cron is new or branched into Phase 60's cron
- Whether `classifier_rules.definition jsonb` is added now (defer until 2+ resolver rules need it)
- Drawer component variant (re-skin vs new)
- LLM agent slug + Orq.ai project_id (suggest reuse Debiteuren Email project seeded 2026-04-28)
- Storage bucket for screenshots
- Specific column types/lengths on email_labels migration

## Deferred Ideas (kept, not in scope)

- Pattern-mining UI / DB-backed regex sandbox / per-rule manual flip approval / multi-database UNION fallback / async retry queue / FireControl mailbox / label-removal flow / bulk approve / labeling provenance chips in Outlook

## Resulting Artifacts

- `56-CONTEXT.md` — 32 locked decisions (D-00..D-31) across 8 sections
- `56-DISCUSSION-LOG.md` — this file
