-- Phase 82.9 Plan 01 (D-03) — extend nxt.candidate_details Zap output_schema
-- to declare contact_person (nullable string) + recent_invoices (max-5 string array).
-- Tier 1 of three-tier bound: SQL LIMIT 5 (Zap-side); Tier 2: Zod .max(5)
-- (nxt-zap-client.ts CandidateDetailMatchSchema); Tier 3: mapper .slice(0, 5) (Plan 03).
--
-- Reference: zapier-tools registry pattern (migration 20260429c, CLAUDE.md "Zapier" section).
-- Auth/transport unchanged: same DEBTOR_FETCH_WEBHOOK_SECRET, same callback route,
-- same allowed_for_intents ('unknown'), same enabled=true.

update public.zapier_tools
set
  output_schema = jsonb_set(
    jsonb_set(
      output_schema,
      '{properties,matches,items,properties,contact_person}',
      '{"type": ["string", "null"], "description": "Primary contact person name on the customer record; null when not set."}'::jsonb,
      true
    ),
    '{properties,matches,items,properties,recent_invoices}',
    '{"type": "array", "items": {"type": "string"}, "maxItems": 5, "description": "Top 5 invoice numbers (newest first) for the customer; bounded by SQL LIMIT 5 in the Zap."}'::jsonb,
    true
  ),
  updated_at = now()
where tool_id = 'nxt.candidate_details';

-- Smoke-check: row still exists and was actually updated.
do $$
declare
  row_count integer;
begin
  select count(*) into row_count
  from public.zapier_tools
  where tool_id = 'nxt.candidate_details'
    and output_schema #> '{properties,matches,items,properties,contact_person}' is not null
    and output_schema #> '{properties,matches,items,properties,recent_invoices}' is not null;
  if row_count <> 1 then
    raise exception 'Phase 82.9 Plan 01: nxt.candidate_details registry row update failed (expected 1, got %)', row_count;
  end if;
end $$;
