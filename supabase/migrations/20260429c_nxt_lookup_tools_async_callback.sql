-- Phase 56-02 pivot: Custom Response is not supported on any Zapier plan
-- (verified 2026-04-29 via web search + Zapier community confirmation).
-- The 3 lookup tools must use async_callback like the existing invoice-fetch Zap.
-- Vercel inserts a debtor.nxt_lookup_requests row, POSTs the Zap with
-- {requestId, callback_url, secret, ...}, the Zap's terminal POST step calls
-- /api/automations/debtor/nxt-lookup/callback to UPDATE the row.

update public.zapier_tools
set
  pattern        = 'async_callback',
  callback_route = '/api/automations/debtor/nxt-lookup/callback',
  notes          = notes || ' [2026-04-29: flipped sync→async_callback. Zapier Catch Hook cannot return Custom Response.]',
  updated_at     = now()
where tool_id in (
  'nxt.contact_lookup',
  'nxt.identifier_lookup',
  'nxt.candidate_details'
);
