-- Phase 60-00 (D-07, D-20). Per-mailbox kill-switch / force-promote matrix.
-- Cross-swarm symmetric: a single dashboard row {swarm_type, rule_key,
-- source_mailbox} controls whether the auto-action gate applies for that
-- mailbox. Replaces the ad-hoc per-mailbox column on debtor.labeling_settings.

create table if not exists public.classifier_rules_mailbox_overrides (
  id              uuid primary key default gen_random_uuid(),
  swarm_type      text not null,
  rule_key        text not null,
  source_mailbox  text not null,
  override        text not null check (override in ('block', 'force_promote')),
  set_by          text,
  set_at          timestamptz not null default now(),
  unique (swarm_type, rule_key, source_mailbox)
);

create index if not exists classifier_overrides_lookup_idx
  on public.classifier_rules_mailbox_overrides (swarm_type, source_mailbox);

alter table public.classifier_rules_mailbox_overrides enable row level security;
