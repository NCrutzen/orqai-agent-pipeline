// Phase 90 Wave 0 RED — RED until Plan 02 seeds resolution_blocklists (RESL-04).
//
// RESL-04: Lists 1–4 (DESIGN-GUIDE §5 / §0.7) are seeded into the new shared
// public.resolution_blocklists table as registry data. This test asserts the
// seeded row counts per (list_kind, value_kind) meet the minimums traceable to
// DESIGN-GUIDE §5:
//   List 1 own_entity:               domains ≥10, postcodes ≥8, VAT = 7, KvK = 5, phones ≥6
//   List 2 freemail:                 domains ≥25
//   List 3 platform:                 domains ≥18 (7 score-confirmed + 11 curated)
//   List 4 own_domain_as_customer:   domains = 8 (smeba.nl, smeba-fire.be, sicli-noord.be,
//                                                 sicli.be, berki.nl, fire-control.nl,
//                                                 moyneroberts.com, sicli-zuid.be)
//
// RED today: the loader the engine uses to read resolution_blocklists does not
// exist yet — `loadResolutionBlocklists` is built in Plan 02/05. Import of
// `../blocklists` fails → RED for the right reason. Once the loader exists AND
// the table is seeded, this turns GREEN.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseAdminMock } from "@/test-utils/supabase-mock";

const adminMock = createSupabaseAdminMock();
vi.mock("@/lib/supabase/admin", () => ({
  admin: adminMock,
  createAdminClient: () => adminMock,
}));

// RED: Plan 02/05 builds web/lib/agentic-pipeline/resolve/blocklists.ts exporting
// loadResolutionBlocklists(admin, swarmType) → BlocklistRow[].
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — Plan 02/05 builds web/lib/agentic-pipeline/resolve/blocklists.ts.
import { loadResolutionBlocklists } from "../blocklists";

// Expected minimum counts, traceable to DESIGN-GUIDE §5 Lists 1–4.
const EXPECTED_MIN: Record<string, Record<string, number>> = {
  own_entity: { domain: 10, postcode: 8, vat: 7, kvk: 5, phone: 6 },
  freemail: { domain: 25 },
  platform: { domain: 18 }, // 7 score-confirmed + 11 curated
  own_domain_as_customer: { domain: 8 },
};

describe("Phase 90 RESL-04: resolution_blocklists seed counts (DESIGN-GUIDE §5)", () => {
  beforeEach(() => {
    // A representative seed shape the GREEN state would read back. In the RED
    // state the import already failed, so this never executes.
    adminMock.queueResponse({ data: [], error: null });
  });

  it("freemail list has ≥25 domains (List 2)", async () => {
    const rows = (await loadResolutionBlocklists(adminMock, "debtor-email")) as Array<{
      list_kind: string;
      value_kind: string;
    }>;
    const n = rows.filter(
      (r) => r.list_kind === "freemail" && r.value_kind === "domain",
    ).length;
    expect(n).toBeGreaterThanOrEqual(EXPECTED_MIN.freemail.domain);
  });

  it("own_domain_as_customer list has exactly 8 domains (List 4)", async () => {
    const rows = (await loadResolutionBlocklists(adminMock, "debtor-email")) as Array<{
      list_kind: string;
      value_kind: string;
    }>;
    const n = rows.filter(
      (r) => r.list_kind === "own_domain_as_customer" && r.value_kind === "domain",
    ).length;
    expect(n).toBe(EXPECTED_MIN.own_domain_as_customer.domain);
  });

  it("each (list_kind, value_kind) meets its DESIGN-GUIDE §5 minimum", async () => {
    const rows = (await loadResolutionBlocklists(adminMock, "debtor-email")) as Array<{
      list_kind: string;
      value_kind: string;
    }>;
    for (const [listKind, byValueKind] of Object.entries(EXPECTED_MIN)) {
      for (const [valueKind, min] of Object.entries(byValueKind)) {
        const n = rows.filter(
          (r) => r.list_kind === listKind && r.value_kind === valueKind,
        ).length;
        expect(
          n,
          `${listKind}/${valueKind} expected ≥ ${min}, got ${n}`,
        ).toBeGreaterThanOrEqual(min);
      }
    }
  });
});
