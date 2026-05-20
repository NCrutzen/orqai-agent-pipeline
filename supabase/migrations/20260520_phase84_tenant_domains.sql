-- Phase 84 D-03 — public.swarms.tenant_domains jsonb column.
--
-- Purpose: registry-driven source-of-truth for the per-swarm list of tenant
-- mail domains. Powers two Phase 84 surfaces:
--   (a) The own_outbound_invoice_loopback Stage-1 noise rule — the worker
--       checks whether `lower(split_part(from_address,'@',2))` is in the
--       swarm's tenant_domains array AND direction='inbound' (D-03 guard /
--       R-02 spoofing mitigation).
--   (b) Retiring the Phase 83 fallback stub at
--       web/lib/inngest/functions/debtor-email-coordinator.ts:50 — the
--       coordinator reads tenant_domains via the codegen-emitted
--       tenant-domains.generated.ts instead of a hardcoded list.
--
-- Stage 1 only (noise filter). NO swarm_intents row is added in this phase.
-- Hard-separation invariant enforced by
-- web/__tests__/static-checks/swarm-hard-separation.test.ts.
--
-- Additive column-add: inherits the existing RLS policies on public.swarms
-- (see 20260429b_swarm_registry.sql:67-83). NOT NULL DEFAULT '[]'::jsonb so
-- every existing row is populated automatically (CONTEXT §6 satisfied).
-- Per-swarm UPDATE statements below then set the operator-confirmed domain
-- lists for the two enabled swarms.
--
-- Idempotency: `add column if not exists` makes the column-add safe to
-- re-run; the UPDATE statements are also idempotent (set the same value).

BEGIN;

-- 1. Column-add — additive jsonb with default ensures backfill.
alter table public.swarms
  add column if not exists tenant_domains jsonb not null default '[]'::jsonb;

-- 2. Per-swarm backfill. Domains are operator-confirmed in
--    .planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/84-CONTEXT.md
--    and CORPUS-SAMPLES.md (administratie@fire-control.nl loopback positives).
--    Alphabetical order keeps diffs stable with the codegen output.
update public.swarms
   set tenant_domains = '["fire-control.nl","moyneroberts.com","smeba-fire.be","smeba.nl"]'::jsonb
 where swarm_type = 'debtor-email';

update public.swarms
   set tenant_domains = '["smeba.nl"]'::jsonb
 where swarm_type = 'sales-email';

COMMIT;
