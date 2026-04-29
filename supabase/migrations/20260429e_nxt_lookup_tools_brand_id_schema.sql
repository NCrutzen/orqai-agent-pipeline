-- Phase 56-02: add brand_id to all 3 NXT lookup tools' input schemas.
-- Format ^[A-Z]{2}$ enforced in client; schema documents the requirement.

update public.zapier_tools
set input_schema = jsonb_set(
  jsonb_set(
    input_schema,
    '{required}',
    case
      when input_schema->'required' is null then to_jsonb(array['nxt_database','brand_id'])
      else (select jsonb_agg(distinct e) from jsonb_array_elements_text(input_schema->'required' || to_jsonb(array['nxt_database','brand_id']::text[])) as e)
    end
  ),
  '{properties,brand_id}',
  jsonb_build_object('type','string','pattern','^[A-Z]{2}$','description','Two-letter NXT brand code')
),
notes = notes || ' [2026-04-29: brand_id required for multi-entity disambiguation.]',
updated_at = now()
where tool_id in ('nxt.contact_lookup','nxt.identifier_lookup','nxt.candidate_details');
