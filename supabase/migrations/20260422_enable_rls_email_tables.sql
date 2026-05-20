-- Enable Row Level Security on exposed email tables.
-- Server-side access uses the service role key, which bypasses RLS,
-- so enabling RLS without policies effectively blocks anon/public access
-- while leaving existing automations unaffected.

alter table email_pipeline.emails enable row level security;
alter table sales.email_analysis enable row level security;
alter table debtor.email_analysis enable row level security;
