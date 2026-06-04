// Plan 02-04 Task 2 — loadUserContext tests.
//
// ENRICH-03 Supabase half: "last 5 tickets by submitter_id" — fully delivered.
// ENRICH-03 M365 half: stable stub (project_2_concern=true) — Project 2 wires real Graph API.
//
// Strategy: minimal supabase mock that records the select/eq/order/limit chain
// and returns scripted rows. No DB roundtrip.

import { describe, it, expect, vi } from "vitest";
import { loadUserContext, m365StubLookup, UserContextError } from "../user-context";

interface Row {
  id: string;
  submission_id: string;
  user_chosen_type: string;
  proposed_system: string | null;
  final_intent: string | null;
  clickup_status: string | null;
  submitted_at: string;
  transcript: string | null;
}

function buildSupabaseMock(opts: {
  rows: Row[] | null;
  error?: { message: string } | null;
}) {
  const calls = {
    selects: [] as string[],
    eqs: [] as Array<{ col: string; val: unknown }>,
    orders: [] as Array<{ col: string; opts: unknown }>,
    limits: [] as number[],
  };
  type Chain = {
    select: (cols: string) => Chain;
    eq: (col: string, val: unknown) => Chain;
    order: (col: string, o?: unknown) => Chain;
    limit: (n: number) => Promise<{ data: Row[] | null; error: unknown }>;
  };
  const chain: Chain = {
    select(cols: string) {
      calls.selects.push(cols);
      return chain;
    },
    eq(col, val) {
      calls.eqs.push({ col, val });
      return chain;
    },
    order(col, o) {
      calls.orders.push({ col, opts: o });
      return chain;
    },
    async limit(n) {
      calls.limits.push(n);
      return { data: opts.rows, error: opts.error ?? null };
    },
  };
  const supabase = {
    from(_table: string) {
      return chain;
    },
  };
  return { supabase, calls };
}

function makeRow(i: number, opts: Partial<Row> = {}): Row {
  return {
    id: `id-${i}`,
    submission_id: `sub-${i}`,
    user_chosen_type: "bug",
    proposed_system: null,
    final_intent: null,
    clickup_status: null,
    submitted_at: `2026-05-${20 + i}T10:00:00.000Z`,
    transcript: `Transcript ${i}`,
    ...opts,
  };
}

describe("loadUserContext — Plan 02-04 Task 2", () => {
  it("Test 1: returns top 5 prior tickets by submitted_at DESC (caller passes limit=5)", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => makeRow(i + 1));
    const { supabase, calls } = buildSupabaseMock({ rows });
    const result = await loadUserContext({
      submitterId: "alice",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
    });
    expect(result.prior_tickets.length).toBe(5);
    expect(calls.limits).toEqual([5]);
    expect(calls.orders[0]).toMatchObject({ col: "submitted_at" });
    expect(calls.eqs[0]).toEqual({ col: "submitter_id", val: "alice" });
  });

  it("Test 2: each PriorTicketSummary matches the tightened schema (id, submission_id, ...)", async () => {
    const rows = [makeRow(1, { proposed_system: "printer", final_intent: "printer-issue" })];
    const { supabase } = buildSupabaseMock({ rows });
    const result = await loadUserContext({
      submitterId: "alice",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
    });
    const t = result.prior_tickets[0];
    expect(t.id).toBe("id-1");
    expect(t.submission_id).toBe("sub-1");
    expect(t.user_chosen_type).toBe("bug");
    expect(t.proposed_system).toBe("printer");
    expect(t.final_intent).toBe("printer-issue");
    expect(t.submitted_at).toBe("2026-05-21T10:00:00.000Z");
  });

  it("Test 3: transcript_excerpt is first 300 chars of transcript; null when transcript null", async () => {
    const longText = "x".repeat(500);
    const rows = [
      makeRow(1, { transcript: longText }),
      makeRow(2, { transcript: null }),
    ];
    const { supabase } = buildSupabaseMock({ rows });
    const result = await loadUserContext({
      submitterId: "alice",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
    });
    expect(result.prior_tickets[0].transcript_excerpt?.length).toBe(300);
    expect(result.prior_tickets[1].transcript_excerpt).toBeNull();
  });

  it("Test 4: zero prior tickets → prior_tickets=[]", async () => {
    const { supabase } = buildSupabaseMock({ rows: [] });
    const result = await loadUserContext({
      submitterId: "alice",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
    });
    expect(result.prior_tickets).toEqual([]);
  });

  it("Test 5: m365 returns stub by default; injected m365Lookup is honored when provided", async () => {
    const { supabase } = buildSupabaseMock({ rows: [] });
    // Default — stub.
    const r1 = await loadUserContext({
      submitterId: "alice",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
    });
    expect(r1.m365).toEqual({
      department: null,
      device: null,
      email: null,
      display_name: null,
      project_2_concern: true,
    });

    // Injected.
    const r2 = await loadUserContext({
      submitterId: "alice",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      m365Lookup: async () => ({
        department: "Engineering",
        device: { os: "macOS", browser: "Chrome" },
        email: "alice@moyneroberts.com",
        display_name: "Alice",
        project_2_concern: true,
      }),
    });
    expect(r2.m365?.department).toBe("Engineering");
    expect(r2.m365?.device?.os).toBe("macOS");
  });

  it("Test 6: supabase .error surfaces as UserContextError with the error message", async () => {
    const { supabase } = buildSupabaseMock({
      rows: null,
      error: { message: "RLS denied" },
    });
    await expect(
      loadUserContext({
        submitterId: "alice",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
      }),
    ).rejects.toThrow(/RLS denied/);
  });

  it("m365StubLookup returns the canonical stub shape", async () => {
    const r = await m365StubLookup("any-id");
    expect(r).toEqual({
      department: null,
      device: null,
      email: null,
      display_name: null,
      project_2_concern: true,
    });
  });

  it("UserContextError is a real Error subclass with a code field", () => {
    const e = new UserContextError("supabase_select_failed", { message: "boom" });
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("supabase_select_failed");
  });
});
