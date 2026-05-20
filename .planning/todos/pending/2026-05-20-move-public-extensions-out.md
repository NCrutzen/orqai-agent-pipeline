---
created: 2026-05-20
priority: low
category: security-hygiene
---

# Move `pg_trgm` and `vector` out of the public schema

Supabase advisor flags 2 WARN-level `extension_in_public` findings. Both are currently in `public`. Best practice is `extensions` schema.

## Why deferred from 2026-05-20 sweep

`vector` is referenced by `sales.search_kb` and likely by every kb-chunk embedding path. `pg_trgm` similar for fuzzy search. Un-qualified usage scattered across migrations + TS code. A move requires:

1. `CREATE SCHEMA IF NOT EXISTS extensions; GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;`
2. `ALTER EXTENSION vector SET SCHEMA extensions;` (and `pg_trgm`).
3. Update PostgREST `db_extra_search_path` to include `extensions` (already includes `public,extensions`, so this part is fine).
4. Audit every function that uses `vector` types/ops:
   - `sales.search_kb` — adjust `SET search_path = sales, extensions, pg_catalog, pg_temp` (currently `sales, public, ...`).
   - Any column definitions like `embedding vector(1536)` — those resolve by type OID so the column itself survives the move, but new migrations referencing `public.vector` would break. Grep migrations for `public.vector` and `vector(` to find references.
5. Verify pg_trgm operators (`%`, `<%`, `<<%`, etc.) still resolve. The operators are namespaced to the extension's schema; they remain in the operator search path if `extensions` is on `db_extra_search_path`.

## Steps when picking this up

1. `grep -rn "public\.vector\|public\.gin_trgm\|public\.gtrgm" supabase/migrations/ web/` — find any explicit qualifications to rewrite.
2. Write `supabase/migrations/YYYYMMDD_move_extensions.sql` doing the schema move + function search_path updates.
3. Apply in a low-traffic window; verify with `npm run check:supabase` (should drop the 2 WARN).
4. Smoke-test sales kb retrieval (`sales.search_kb` call path) and any trigram search.

## Risk

Moderate. The extension move itself is one statement, but the audit/test surface is real. Don't combine with other migrations.
