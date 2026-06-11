-- Phase 90 (P0 resolver substrate) — D-06/D-07 Stage 2 dispatch cutover.
--
-- ⚠️  APPLY ONLY AFTER `cd web && npm run dry-run:equality` reports 0 regressions.
--     The equality dry-run is the cardinal-constraint gate (T-90-18): the
--     ~35% already-correctly-resolved population MUST return the SAME customer
--     under the new substrate before this flip. The flip is gated on 0
--     regressions — NEVER on a point estimate / precision sample.
--
-- WHAT THIS DOES (data-only, no DDL, no deploy):
--   Flips the Stage 2 dispatch pointer for the debtor-email swarm from the
--   1:1-ported adapter to the generic config-ordered engine. The debtor-email
--   swarm is a SINGLE registry row shared by all 4 active mailboxes, so this one
--   UPDATE cuts over every active mailbox at once (big-bang, D-06 — the low
--   correctly-resolved volume doesn't justify a prolonged shadow window).
--
--   Both module paths resolve to the SAME engine entrypoint (the adapter's
--   resolveDebtor delegates to resolveEntity), so the flip is byte-identical —
--   the cutover changes WHICH module loadStage2Resolver imports, not the logic.
--   The engine path '@/lib/agentic-pipeline/resolve/engine' is one of the two
--   entries in STAGE2_RESOLVER_MODULES (web/lib/swarms/dynamic.ts) and exports
--   `resolveEntity` directly, which loadStage2Resolver asserts on. No deploy is
--   needed — loadStage2Resolver reads this column live (60s TTL cache).
--
-- TWO-step registry-rename guard (90-RESEARCH §Pitfall 6): this migration IS the
-- registry-side change. There is no paired code rename — the worker already
-- dispatches THROUGH the column (Plan 05 removed the hardcoded resolveDebtor
-- import). The pairing here is operational: flip the column AFTER the equality
-- dry-run passes AND AFTER the operator confirms the seeded zapier.dbo + both
-- Zaps are live (the resolver-read Zap's catch-hook URL landed in
-- zapier_tools.target_url, replacing the PENDING_OPERATOR_ZAP_URL placeholder).

begin;

UPDATE public.swarms
   SET stage2_entity_resolver = '@/lib/agentic-pipeline/resolve/engine'
 WHERE swarm_type = 'debtor-email';

-- ── REVERT (kill-switch, D-07) ──────────────────────────────────────────────
-- Instant fallback to the 1:1-ported adapter. Data-only, per-swarm, no deploy;
-- Stage 2 returns to the legacy live-`nxt` per-signal path within one 60s cache
-- TTL. Run this UPDATE to revert:
--
--   UPDATE public.swarms
--      SET stage2_entity_resolver = '@/lib/automations/debtor-email/resolve-debtor'
--    WHERE swarm_type = 'debtor-email';
--
-- (The adapter module still exports resolveEntity/resolveDebtor — preserved as
--  the kill-switch revert target in Plan 05.)

commit;
