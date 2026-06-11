-- Phase 91 (RESL-01/RESL-03) — widen debtor.nxt_lookup_requests for the
-- nxt.resolve_candidates tool so the engine can route Stage-2 NXT resolution
-- through the single materialized resolve_candidates substrate call.
--
-- WHY: the table's tool_id + lookup_kind CHECK constraints predate Phase 90's
-- resolve_candidates tool (migration 20260429b only knew the 3 legacy tools).
-- nxt-zap-client.ts already maps tool_id='nxt.resolve_candidates' →
-- lookup_kind='resolve_candidates' (LookupKindByTool), but inserting that row
-- would fail both checks. Same constraint-drift class as the 8-day nxt_database
-- outage (learning a841a391) — widen the constraint BEFORE the engine writes.
--
-- Additive only: each check gains ONE allowed value. No existing row can break
-- (the new value is a superset). nxt_database_check is deliberately UNCHANGED —
-- the engine keeps sending 'nxt_benelux_prod' on resolve_candidates per the #82
-- fallback until RESL-16 consolidates onto environment_id (P1).

alter table debtor.nxt_lookup_requests
  drop constraint nxt_lookup_requests_tool_id_check,
  add constraint nxt_lookup_requests_tool_id_check check (tool_id in (
    'nxt.contact_lookup',
    'nxt.identifier_lookup',
    'nxt.candidate_details',
    'nxt.resolve_candidates'
  ));

alter table debtor.nxt_lookup_requests
  drop constraint nxt_lookup_requests_lookup_kind_check,
  add constraint nxt_lookup_requests_lookup_kind_check check (lookup_kind in (
    'sender_to_account',
    'identifier_to_account',
    'candidate_details',
    'resolve_candidates'
  ));
