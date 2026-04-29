-- Phase 56-02: NXT brand discriminator per mailbox.
-- Multiple NXT brands share invoice-number ranges (Smeba/Fire Control/Sicli/etc.),
-- so the resolver must filter NXT lookups by brand_id. Operator populates this
-- per-mailbox; until populated, NXT lookups skip (resolver falls through to
-- thread_inheritance / unresolved).
alter table debtor.labeling_settings
  add column if not exists brand_id text
    check (brand_id is null or brand_id ~ '^[A-Z]{2}$');

comment on column debtor.labeling_settings.brand_id is
  'Two-letter NXT brand code (e.g. SB=Smeba, FI=Fire Control). Required for all NXT lookups; null disables them for the mailbox.';
