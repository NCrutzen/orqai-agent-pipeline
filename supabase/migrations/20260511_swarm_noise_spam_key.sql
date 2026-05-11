-- Add `spam` noise key to the debtor-email and sales-email swarms.
--
-- Background: Exchange's upstream spam filter tags unsolicited marketing with
-- a `[SPAM]` subject prefix. These currently fall through to `unknown` and
-- pile up in Bulk Review. They are noise (terminal categorize_archive), but
-- semantically distinct from auto_reply / ooo / payment_admittance — those
-- are responses to our outbound mail; spam is unsolicited inbound.
--
-- Stage 1 only (noise filter). Does NOT add a row to swarm_intents.
--
-- Routing per swarm:
--  - debtor-email: regex Pass 1 catches `^\[SPAM\]` subject prefix in
--    web/lib/debtor-email/classify.ts → returns category 'spam'.
--    Verdict worker dispatches `categorize_archive`: Outlook label "Spam" +
--    archive + iController cleanup (same side-effect bundle as other noise
--    keys).
--  - sales-email: no regex module (stage1_regex_module=null per Phase 74
--    seed). The LLM 2nd-pass is the only Stage 1 pass; it reads enabled
--    swarm_noise_categories at call time and will pick `spam` for
--    `[SPAM]`-prefixed subjects from the categories block in the prompt.
--    Verdict worker dispatches `categorize_archive`: Outlook label "Spam" +
--    archive (no iController cleanup wired for sales-email today).
--
-- Studio note: the `stage-1-category-classifier` Orq agent uses
-- response_format `{"type":"json_object"}` with no enum on category_key —
-- the closed list is injected per-call via the `<categories>` block from
-- swarm_noise_categories. So this migration alone is enough to expose
-- `spam` to the LLM; no Studio json_schema edit required.

insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'spam', 'Spam', 'Spam', 'categorize_archive', null, 25),
  ('sales-email',  'spam', 'Spam', 'Spam', 'categorize_archive', null, 25)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();
