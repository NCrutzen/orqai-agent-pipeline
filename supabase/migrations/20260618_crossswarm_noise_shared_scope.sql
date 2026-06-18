-- Quick task 260618-iwx — cross-swarm noise rules: shared scope.
-- See .planning/quick/260618-iwx-cross-swarm-noise-rules-shared-scope-op-/
--   260618-iwx-{CONTEXT,RESEARCH,PLAN}.md
--
-- Two statements:
--   (1) Re-scope info-routing's 7 junk-mail noise categories to the reserved
--       shared sentinel swarm_type='*'. The Stage-1 closed-list builder
--       (loadSwarmNoiseCategories) unions [swarmType, '*'], so debtor-email +
--       sales-email now see these categories in their call-time closed list,
--       while info-routing keeps seeing them via the same union. Re-scope in
--       place (NOT additive copies) avoids duplicate-row drift. PK is
--       (swarm_type, category_key), no FK, and no '*' rows exist yet -> no
--       conflict.
--   (2) A cross-swarm telemetry VIEW (visibility only — promotion stays
--       strictly per-swarm via classifier_rules). Pools human_verdict by
--       rule_key across ALL swarms. Source-agnostic on human_verdict so a
--       future Outlook-delta verdict source (P112.5/P117) feeds it with zero
--       rework.
--
-- NOTE: the per-swarm promotion gate is INVIOLABLE and untouched here —
-- classifier_rules is NOT modified; readWhitelist still reads per-swarm
-- promoted rows only. Post-deploy, re-fire `classifier/llm-rules-seed.run`
-- once so debtor-email + sales-email get per-swarm CANDIDATE llm:{cat}:high
-- rows for the newly-shared categories (scoped to each consuming swarm).

-- (1) Re-scope the 7 junk categories to the shared sentinel.
update public.swarm_noise_categories
set swarm_type = '*',
    updated_at = now()
where swarm_type = 'info-routing'
  and category_key in (
    'spam',
    'marketing_newsletter',
    'cold_sales_outreach',
    'auto_dealer_spam',
    'unsolicited_job_application',
    'survey_feedback_invite',
    'automated_security_report'
  );

-- (2) Cross-swarm telemetry view (visibility only; security_invoker so the
-- caller's RLS applies — CLAUDE.md). rule_key embeds the category as
-- llm:{cat}:high, so pooling by rule_key gives per-category cross-swarm counts.
create or replace view public.classifier_rule_telemetry_crossswarm
  with (security_invoker = true) as
select
  ar.rule_key,
  count(*)::int                                                                 as n_total,
  count(*) filter (where ar.human_verdict in ('approved', 'edited_minor'))::int as agree_total,
  count(distinct ar.swarm_type)::int                                            as swarm_count
from public.agent_runs ar
where ar.rule_key is not null
  and ar.human_verdict is not null
group by ar.rule_key;

grant select on public.classifier_rule_telemetry_crossswarm to service_role;
