-- Phase 84 D-01 / D-04 / D-08 — 8 Stage-1 noise categories × 2 swarms = 16 rows.
--
-- Stage 1 only (noise filter). Hard-separation invariant: NO row added to
-- swarm_intents. Enforced by
-- web/__tests__/static-checks/swarm-hard-separation.test.ts.
--
-- Routing asymmetry per swarm (per RESEARCH Pitfall 5 / docs/agentic-pipeline/stage-1-regex.md):
--   - debtor-email: 7 of 8 categories are caught by the Pass 1 regex module
--     in web/lib/debtor-email/classify.ts (the in-classifier matchers wired
--     in Wave 2). The 8th, `own_outbound_invoice_loopback`, lives in
--     classifier-screen-worker.ts (D-03 — needs `from` + `direction` which
--     classify.ts does not carry). All 8 keys ALSO appear here so the
--     registry surface is symmetric across both swarms.
--   - sales-email: NO Pass 1 regex module (stage1_regex_module=null per the
--     Phase 74 seed). The Pass 2 LLM (`stage-1-category-classifier`) reads
--     the enabled swarm_noise_categories at call time and picks the matching
--     `category_key` from the call-time closed list. This migration alone
--     exposes the keys to the LLM — no Studio json_schema edit needed (the
--     agent uses `response_format={"type":"json_object"}` without an
--     enum-constrained schema).
--
-- All 16 rows share: action='categorize_archive' (D-04), swarm_dispatch=null.
-- display_order >= 70 places them after the existing noise families
-- (auto_reply ~10-20, payment_admittance ~25-30, ooo ~40-50).
--
-- Idempotent ON CONFLICT keeps re-runs safe (mirrors
-- 20260511_swarm_noise_spam_key.sql verbatim).

BEGIN;

-- 1. Coupa invoice-paid notification (ISS-anchored, sender pinned to
--    do_not_reply@issworld.coupahost.com; CBRE-forwarded variants stay in
--    Stage 3 per D-06).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'coupa_invoice_paid_notification', 'Coupa: Invoice Paid', 'Payment Admittance', 'categorize_archive', null, 80),
  ('sales-email',  'coupa_invoice_paid_notification', 'Coupa: Invoice Paid', 'Payment Admittance', 'categorize_archive', null, 80)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 2. Coupa invoice-approved-for-payment notification (same anchor as #1).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'coupa_invoice_approved_notification', 'Coupa: Invoice Approved for Payment', 'Payment Admittance', 'categorize_archive', null, 81),
  ('sales-email',  'coupa_invoice_approved_notification', 'Coupa: Invoice Approved for Payment', 'Payment Admittance', 'categorize_archive', null, 81)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 3. ISS PtP auto-reply (Invoice-PtP@nl.issworld.com; body literally says
--    "Verdere e-mails worden hier niet gelezen").
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'iss_ptp_autoreply', 'ISS PtP Auto-Reply', 'Auto-Reply', 'categorize_archive', null, 70),
  ('sales-email',  'iss_ptp_autoreply', 'ISS PtP Auto-Reply', 'Auto-Reply', 'categorize_archive', null, 70)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 4. FrieslandCampina portal reject (sender-pinned to
--    Robbie.Robot@frieslandcampina.com; legitimate Christiaan.Knipping
--    sales contact is structurally excluded).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'frieslandcampina_portal_reject', 'FrieslandCampina Portal Reject', 'System Notification', 'categorize_archive', null, 90),
  ('sales-email',  'frieslandcampina_portal_reject', 'FrieslandCampina Portal Reject', 'System Notification', 'categorize_archive', null, 90)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 5. Microsoft 365 quarantine digest (q2q@... apexfire tenant; existing
--    subject_spam_prefix rule wins for `[SPAM]`-prefixed unsolicited variants
--    per first-match-wins ordering — boundary test pins this).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'm365_quarantine', 'Microsoft 365 Quarantine', 'System Notification', 'categorize_archive', null, 91),
  ('sales-email',  'm365_quarantine', 'Microsoft 365 Quarantine', 'System Notification', 'categorize_archive', null, 91)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 6. Sender phishing notice (R-03 narrow — one supplier today:
--    melanie@rskinstallatie.nl; subject-anchored on "pishing" / "niet openen").
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'sender_phishing_notice', 'Sender Phishing Notice', 'System Notification', 'categorize_archive', null, 92),
  ('sales-email',  'sender_phishing_notice', 'Sender Phishing Notice', 'System Notification', 'categorize_archive', null, 92)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 7. Supplier bank-change notification (sender-pinned to info@farmplus.nl).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'supplier_bank_change_notification', 'Supplier Bank Change Notification', 'System Notification', 'categorize_archive', null, 93),
  ('sales-email',  'supplier_bank_change_notification', 'Supplier Bank Change Notification', 'System Notification', 'categorize_archive', null, 93)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

-- 8. Own outbound invoice loopback (D-03 dynamic — direction='inbound' AND
--    from_address.domain ∈ swarms.tenant_domains). Evaluated in
--    classifier-screen-worker.ts (Wave 2), NOT in classify.ts. Both swarms
--    self-scope via their own tenant_domains entry (debtor-email has 4
--    domains, sales-email has 1).
insert into public.swarm_noise_categories
  (swarm_type, category_key, display_label, outlook_label, action, swarm_dispatch, display_order)
values
  ('debtor-email', 'own_outbound_invoice_loopback', 'Own Outbound Invoice Loopback', 'System Notification', 'categorize_archive', null, 95),
  ('sales-email',  'own_outbound_invoice_loopback', 'Own Outbound Invoice Loopback', 'System Notification', 'categorize_archive', null, 95)
on conflict (swarm_type, category_key) do update set
  display_label  = excluded.display_label,
  outlook_label  = excluded.outlook_label,
  action         = excluded.action,
  swarm_dispatch = excluded.swarm_dispatch,
  display_order  = excluded.display_order,
  updated_at     = now();

COMMIT;
