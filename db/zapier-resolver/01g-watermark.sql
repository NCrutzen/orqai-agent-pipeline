/* =============================================================================
   01g-watermark.sql  —  CHUNK of the one-time seed (watermark bump).

   RUN THIS IN THE OPERATOR DIRECT-SQL SESSION (SSMS / Azure Data Studio /
   Beekeeper Studio — GO-free, run the whole file as ONE batch) — NOT through
   Zapier. The LAST seed chunk (run 01a → 01b → 01c → 01d → 01e → 01f → 01g,
   each on its own, in order). Runs in seconds and is already IDEMPOTENT — it is
   an UPDATE to the seed high-water, so no DELETE is needed; re-running it after a
   dropped Beekeeper connection simply re-bumps the watermark.

   ESTATE BOUNDARY: SQL Server zapier.dbo over nxt.dbo.* — NOT supabase/migrations/.

   HARD INVARIANT: environment_id = 'BX' in EVERY WHERE.
   ============================================================================= */

SET NOCOUNT ON;

/* -----------------------------------------------------------------------------
   F) Bump the watermark to the seed high-water so the FIRST scheduled refresh
      tick is a true delta (not a re-scan of everything already seeded).
      02-refresh-resolver.sql applies the gap-lookback on top of this.
   --------------------------------------------------------------------------- */
UPDATE w
   SET w.last_modified_on = ISNULL(s.hw, w.last_modified_on),
       w.refreshed_at      = SYSUTCDATETIME()
FROM zapier.dbo.resolver_watermark AS w
CROSS APPLY (
  SELECT CASE w.table_name
           WHEN 'customer'      THEN (SELECT MAX(modified_on) FROM nxt.dbo.customer       WHERE environment_id='BX')
           WHEN 'site'          THEN (SELECT MAX(modified_on) FROM nxt.dbo.site           WHERE environment_id='BX')
           WHEN 'invoice'       THEN (SELECT MAX(modified_on) FROM nxt.dbo.invoice        WHERE environment_id='BX')
           WHEN 'contact_email' THEN (SELECT MAX(modified_on) FROM nxt.dbo.contact_person WHERE environment_id='BX')
         END AS hw
) AS s;

/* -----------------------------------------------------------------------------
   VERIFY (run after all seed chunks; compare against nxt masterdata — README step 1):
     SELECT identifier_kind, COUNT(*) FROM zapier.dbo.resolver_index
      WHERE environment_id='BX' GROUP BY identifier_kind;
     SELECT COUNT(*) FROM zapier.dbo.resolver_customer WHERE environment_id='BX';
   --------------------------------------------------------------------------- */
