-- Phase 56-02 wave 3: route the unknown bucket to the resolver pipeline
-- via swarm_dispatch instead of the no-op 'reject' action. Listener:
-- web/lib/inngest/functions/classifier-label-resolver.ts.

update public.swarm_categories
set
  action          = 'swarm_dispatch',
  swarm_dispatch  = 'debtor-email/label-resolve.requested',
  updated_at      = now()
where swarm_type   = 'debtor-email'
  and category_key = 'unknown';
