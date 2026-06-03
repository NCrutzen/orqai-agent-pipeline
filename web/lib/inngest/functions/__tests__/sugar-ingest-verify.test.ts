// Phase 110 Plan 04 — VERIFY-01 ingest-health + Sugar-disposition evidence.
//
// This is a VERIFICATION-TIME check, NOT pipeline machinery (D-13 forbids any
// Sugar disposition machinery — no delete, no mark, no migrate). It captures
// three pieces of evidence and is deliberately INFORMATIVE on the Sugar count:
// it surfaces the actual number and flags a non-trivial count for operator
// disposition rather than hard-failing at 0.
//
//   (1) Sales ingest is Outlook-only — SALES_SOURCE='outlook' in the ingest
//       route (a static source assertion, always runnable).
//   (2) The actual count of source='sugarcrm' rows is SURFACED. CONTEXT D-13
//       assumed this was 0 ("Sugar never connected"). The 2026-06-03 live query
//       proved that FALSE: 34,725 historical analyzer rows exist on
//       verkoop@smeba.nl. The assertion MUST report the count and flag it,
//       NEVER crash on a non-zero value — dead-data cleanup is out of Phase 110
//       scope (Phase 115 owns SugarCRM dead-code decommission).
//   (3) The per-mailbox throughput query for verkoop@smeba.nl is documented for
//       operator confirmation (~33/day visible via the Plan 04 per-mailbox
//       health dimension, populated after the next monitor tick).
//
// The live-DB portion runs ONLY when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
// are present (they are stubbed to localhost in test-setup.ts, so by default
// the live probe is skipped and the test stays a pure, offline source check —
// CI never depends on a live DB). When real creds are wired, the probe prints
// the count informatively and still never fails on its value.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const routeSrc = () =>
  readFileSync(
    resolve(__dirname, "../../../../app/api/automations/sales-email/ingest/route.ts"),
    "utf8",
  );

// The per-mailbox throughput query an operator runs to confirm ~33/day
// verkoop@smeba.nl visibility (Plan 04 D-12 per-mailbox health dimension).
export const VERKOOP_THROUGHPUT_QUERY = `
SELECT checked_at, throughput_6h, failures_6h, notes
FROM public.pipeline_health_snapshots
WHERE swarm_type = 'sales-email'
  AND source_mailbox = 'verkoop@smeba.nl'
ORDER BY checked_at DESC
LIMIT 12;  -- ~33/day → ~8 completed per 6h window`;

function hasLiveCreds(): boolean {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  // test-setup.ts stubs these to localhost / a fake key; treat those as "no
  // live DB" so the probe stays offline by default.
  return (
    url.startsWith("https://") &&
    !url.includes("localhost") &&
    key.length > 40 &&
    key !== "test-service-role-key"
  );
}

describe("VERIFY-01 — sales ingest is Outlook-only; Sugar count surfaced (informative)", () => {
  it("ingest route declares SALES_SOURCE='outlook' (Outlook-only ingest)", () => {
    const src = routeSrc();
    expect(src).toMatch(/const\s+SALES_SOURCE\s*=\s*["']outlook["']/);
    expect(src).toMatch(/verkoop@smeba\.nl/);
    // Must NOT ingest from sugarcrm — the source constant is the only writer.
    expect(src).not.toMatch(/SALES_SOURCE\s*=\s*["']sugarcrm["']/);
  });

  it("documents the per-mailbox verkoop@smeba.nl throughput query (VERIFY-01)", () => {
    expect(VERKOOP_THROUGHPUT_QUERY).toMatch(/source_mailbox = 'verkoop@smeba\.nl'/);
    expect(VERKOOP_THROUGHPUT_QUERY).toMatch(/pipeline_health_snapshots/);
  });

  it("SURFACES the source='sugarcrm' count — informative, never hard-fails (D-13)", async () => {
    if (!hasLiveCreds()) {
      // Offline default: no live DB wired into this test run. The 2026-06-03
      // live query (recorded in the SUMMARY) found 34,725 sugarcrm rows — the
      // D-13 premise of 0 is FACTUALLY WRONG. Nothing to assert offline; this
      // test never fails on the count.
      // eslint-disable-next-line no-console
      console.info(
        "[VERIFY-01] live DB not wired; sugarcrm count recorded as 34,725 on 2026-06-03 (D-13 premise count==0 is WRONG). Flagged for operator disposition (Phase 115). No rows touched.",
      );
      expect(true).toBe(true);
      return;
    }

    const url = (process.env.SUPABASE_URL ?? "").replace(/['"]/g, "");
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/['"]/g, "");
    const res = await fetch(
      `${url}/rest/v1/emails?source=eq.sugarcrm&select=id`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Accept-Profile": "email_pipeline",
          Prefer: "count=exact",
          Range: "0-0",
        },
      },
    );
    const contentRange = res.headers.get("content-range") ?? "*/0";
    const total = Number(contentRange.split("/")[1] ?? "0");

    // INFORMATIVE: report + flag, do NOT assert ==0 and do NOT crash on a
    // non-zero value. A non-trivial count is an anomaly to disposition later,
    // not a test failure.
    // eslint-disable-next-line no-console
    console.info(
      `[VERIFY-01] source='sugarcrm' count = ${total}. ` +
        (total > 0
          ? "Non-zero → historical analyzer corpus on verkoop@smeba.nl; FLAGGED for operator disposition (Phase 115 owns SugarCRM dead-code/data decommission). D-13 premise (count==0) is WRONG. No rows touched."
          : "Zero — matches the (now superseded) D-13 premise."),
    );
    // Sanity only: the read itself succeeded (status 2xx). Never assert on the
    // value of `total`.
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(Number.isFinite(total)).toBe(true);
  });
});
