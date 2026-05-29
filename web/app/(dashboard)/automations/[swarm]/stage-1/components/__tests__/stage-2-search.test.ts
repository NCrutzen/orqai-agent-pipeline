// Plan 03-12 (gap-closure r3-1, Task 3). Tests for searchCustomers, which
// resolves a customer NAME → account match for Stage 2 override validation.
//
// Source correction proved here: searchCustomers queries
// debtor.email_labels (debtor_name + customer_account_id), NOT the old
// public.coordinator_runs (customer_name) — a column that does not exist
// (PostgREST 42703), which made every override-validation lookup silently
// return []. The test asserts (a) a populated email_labels result yields a
// deduped hit list with customer_name sourced from debtor_name, (b) an empty
// result yields [], and (c) a <2-char query short-circuits to [] WITHOUT a
// DB call (the 2-char guard + 20-cap bound the result — T-03-12-01).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { fromCalls, schemaCalls, setResult, createAdminMock } = vi.hoisted(
  () => {
    const fromCalls: string[] = [];
    const schemaCalls: string[] = [];
    let result: { data: unknown; error: unknown } = { data: [], error: null };

    // Chainable PostgREST builder. Every filter method returns `this`; the
    // chain resolves (await) to `result`.
    const makeBuilder = () => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.ilike = vi.fn(() => b);
      b.not = vi.fn(() => b);
      b.limit = vi.fn(() => b);
      b.then = (resolve: (v: unknown) => unknown) => resolve(result);
      return b;
    };

    const createAdminMock = vi.fn(() => ({
      schema: (name: string) => {
        schemaCalls.push(name);
        return {
          from: (table: string) => {
            fromCalls.push(`${name}.${table}`);
            return makeBuilder();
          },
        };
      },
      // public-schema accessor (must NOT be used by searchCustomers anymore)
      from: (table: string) => {
        fromCalls.push(`public.${table}`);
        return makeBuilder();
      },
    }));

    return {
      fromCalls,
      schemaCalls,
      setResult: (r: { data: unknown; error: unknown }) => {
        result = r;
      },
      createAdminMock,
    };
  },
);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminMock,
}));

import { searchCustomers } from "../stage-2-search";

describe("searchCustomers (Plan 03-12)", () => {
  beforeEach(() => {
    fromCalls.length = 0;
    schemaCalls.length = 0;
    createAdminMock.mockClear();
    setResult({ data: [], error: null });
  });

  it("queries debtor.email_labels and maps debtor_name → customer_name (deduped)", async () => {
    setResult({
      data: [
        { customer_account_id: "506909", debtor_name: "Vos Logistics B.V." },
        // duplicate (same account+name) — must be collapsed
        { customer_account_id: "506909", debtor_name: "Vos Logistics B.V." },
        { customer_account_id: "592018", debtor_name: "SPIE Building Solutions" },
      ],
      error: null,
    });

    const hits = await searchCustomers("vos");

    // Real source: debtor.email_labels — never the broken coordinator_runs.
    expect(fromCalls).toContain("debtor.email_labels");
    expect(fromCalls).not.toContain("public.coordinator_runs");
    expect(schemaCalls).toContain("debtor");

    // debtor_name maps to customer_name; the duplicate is deduped.
    expect(hits).toEqual([
      { customer_account_id: "506909", customer_name: "Vos Logistics B.V." },
      { customer_account_id: "592018", customer_name: "SPIE Building Solutions" },
    ]);
  });

  it("returns [] when the query has no matching email_labels rows", async () => {
    setResult({ data: [], error: null });
    const hits = await searchCustomers("zzzznomatch");
    expect(fromCalls).toContain("debtor.email_labels");
    expect(hits).toEqual([]);
  });

  it("returns [] on a query error without throwing", async () => {
    setResult({ data: null, error: { message: "boom" } });
    const hits = await searchCustomers("vos");
    expect(hits).toEqual([]);
  });

  it("short-circuits a <2-char query to [] WITHOUT a DB call (2-char guard)", async () => {
    const hits = await searchCustomers("v");
    expect(hits).toEqual([]);
    // Guard fires before the admin client is even constructed.
    expect(createAdminMock).not.toHaveBeenCalled();
    expect(fromCalls).toEqual([]);
  });

  it("caps the result list at 20", async () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      customer_account_id: `acc-${i}`,
      debtor_name: `Customer ${i}`,
    }));
    setResult({ data, error: null });
    const hits = await searchCustomers("customer");
    expect(hits).toHaveLength(20);
  });
});
