-- Phase 75 — rename swarm_categories → swarm_noise_categories.
-- The table now contains ONLY noise-filter rows (auto_reply, ooo_*,
-- payment_admittance, unknown). Real intents live in swarm_intents.
-- The new name makes the purpose explicit and prevents future drift
-- where intent rows accidentally land back in this table.
--
-- ALTER TABLE preserves all indexes, FKs, RLS policies, and grants.
-- Column name `category_key` is kept — the table name now carries the
-- "noise" semantic, and renaming the column would touch hundreds of
-- unrelated `category_key` references in queries/JSON without value.
--
-- Pairs with the atomic web/ code refactor in the same commit:
--   - swarm_categories → swarm_noise_categories (all .from() calls)
--   - loadSwarmCategories → loadSwarmNoiseCategories
--   - SwarmCategoryRow → SwarmNoiseCategoryRow

ALTER TABLE public.swarm_categories RENAME TO swarm_noise_categories;
