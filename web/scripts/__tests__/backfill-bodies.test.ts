// Phase 83 Plan 05 — RED tests for backfill-bodies.ts (D-05).
//
// The script `../backfill-bodies` is built in Task 2 (GREEN). For now this
// file pins the contract:
//   - throttleDelay(reqsPerSec) → 250ms at 4 req/s.
//   - selectBackfillCandidates() filters by `body_full_text IS NULL` + recency
//     window + mailbox membership from the `swarms` registry.
//   - runBackfill() drives N rows through fetchMessageBody + writes (or skips
//     writes on --dry-run) and tallies failures without aborting the batch.
//
// Mocks:
//   - @supabase/supabase-js — chainable mock with .schema/.from/.select/.is/
//     .gte/.in/.order/.limit/.update/.upsert.
//   - @/lib/outlook — fetchMessageBody + fetchConversationMessages stubs.
//
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks for the outlook lib — per-test override of the fetch implementations.
// ---------------------------------------------------------------------------
const fetchMessageBodyMock = vi.fn();
const fetchConversationMessagesMock = vi.fn();

vi.mock("@/lib/outlook", () => ({
  fetchMessageBody: (...args: unknown[]) => fetchMessageBodyMock(...args),
  fetchConversationMessages: (...args: unknown[]) =>
    fetchConversationMessagesMock(...args),
}));

// ---------------------------------------------------------------------------
// Supabase mock — fixture-driven select results + capture of update/upsert.
// ---------------------------------------------------------------------------
type CandidateRow = { id: string; source_id: string; mailbox: string };

let swarmsResult: { data: Array<{ mailboxes: string[] }> | null; error: { message: string } | null } = {
  data: [{ mailboxes: ["debiteuren@smeba.nl"] }],
  error: null,
};
let candidatesResult: { data: CandidateRow[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};

const captured = {
  updates: [] as Array<{ schema: string; table: string; patch: Record<string, unknown>; eqs: Array<[string, unknown]> }>,
  upserts: [] as Array<{ schema: string; table: string; rows: Array<Record<string, unknown>>; opts?: Record<string, unknown> }>,
  selects: [] as Array<{
    schema: string | null;
    table: string;
    columns: string;
    filters: Array<{ kind: string; col?: string; val?: unknown }>;
    limit?: number;
  }>,
};

function makeChain(schema: string | null, table: string) {
  const sel = {
    schema,
    table,
    columns: "",
    filters: [] as Array<{ kind: string; col?: string; val?: unknown }>,
    limit: undefined as number | undefined,
  };
  captured.selects.push(sel);

  const chain: Record<string, unknown> = {};
  chain.select = vi.fn((cols: string) => {
    sel.columns = cols;
    return chain;
  });
  chain.is = vi.fn((col: string, val: unknown) => {
    sel.filters.push({ kind: "is", col, val });
    return chain;
  });
  chain.gte = vi.fn((col: string, val: unknown) => {
    sel.filters.push({ kind: "gte", col, val });
    return chain;
  });
  chain.in = vi.fn((col: string, val: unknown) => {
    sel.filters.push({ kind: "in", col, val });
    return chain;
  });
  chain.eq = vi.fn((col: string, val: unknown) => {
    sel.filters.push({ kind: "eq", col, val });
    // For the swarms lookup, eq is terminal-ish: support `await q`.
    (chain as unknown as { then: (r: (v: unknown) => unknown) => unknown }).then = (
      resolve: (v: unknown) => unknown,
    ) => resolve(table === "swarms" ? swarmsResult : candidatesResult);
    return chain;
  });
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn((n: number) => {
    sel.limit = n;
    (chain as unknown as { then: (r: (v: unknown) => unknown) => unknown }).then = (
      resolve: (v: unknown) => unknown,
    ) => resolve(candidatesResult);
    return chain;
  });
  // Allow direct `await` on the chain (no .limit / no .eq).
  (chain as unknown as { then: (r: (v: unknown) => unknown) => unknown }).then = (
    resolve: (v: unknown) => unknown,
  ) => resolve(table === "swarms" ? swarmsResult : candidatesResult);

  chain.update = vi.fn((patch: Record<string, unknown>) => {
    const updEqs: Array<[string, unknown]> = [];
    const updChain: Record<string, unknown> = {};
    updChain.eq = vi.fn((col: string, val: unknown) => {
      updEqs.push([col, val]);
      (updChain as unknown as { then: (r: (v: unknown) => unknown) => unknown }).then = (
        resolve: (v: unknown) => unknown,
      ) => {
        captured.updates.push({ schema: schema ?? "public", table, patch, eqs: updEqs });
        return resolve({ data: null, error: null });
      };
      return updChain;
    });
    return updChain;
  });
  chain.upsert = vi.fn(async (rows: Array<Record<string, unknown>>, opts?: Record<string, unknown>) => {
    captured.upserts.push({ schema: schema ?? "public", table, rows, opts });
    return { data: null, error: null };
  });
  return chain;
}

function makeClient() {
  return {
    from: vi.fn((table: string) => makeChain(null, table)),
    schema: vi.fn((schema: string) => ({
      from: vi.fn((table: string) => makeChain(schema, table)),
    })),
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => makeClient()),
}));

// ---------------------------------------------------------------------------
// Setup.
// ---------------------------------------------------------------------------
beforeEach(() => {
  fetchMessageBodyMock.mockReset();
  fetchConversationMessagesMock.mockReset();
  captured.updates.length = 0;
  captured.upserts.length = 0;
  captured.selects.length = 0;
  swarmsResult = {
    data: [{ mailboxes: ["debiteuren@smeba.nl"] }],
    error: null,
  };
  candidatesResult = { data: [], error: null };
  process.env.SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
  vi.resetModules();
});

async function importBackfill() {
  return import("../backfill-bodies");
}

describe("backfill-bodies", () => {
  it("Test 1: selectBackfillCandidates filters on body_full_text IS NULL + recency + mailbox membership", async () => {
    candidatesResult = {
      data: [
        { id: "em-1", source_id: "graph-1", mailbox: "debiteuren@smeba.nl" },
      ],
      error: null,
    };

    const mod = await importBackfill();
    const client = makeClient() as unknown as Parameters<typeof mod.selectBackfillCandidates>[0];
    const rows = await mod.selectBackfillCandidates(client, "debtor-email", 30);

    expect(rows).toHaveLength(1);
    // Find the SELECT against emails.
    const emailsSel = captured.selects.find((s) => s.table === "emails");
    expect(emailsSel).toBeDefined();
    expect(emailsSel!.schema).toBe("email_pipeline");
    // Filters present: IS NULL on body_full_text, GTE on received_at, IN on mailbox.
    expect(
      emailsSel!.filters.some((f) => f.kind === "is" && f.col === "body_full_text" && f.val === null),
    ).toBe(true);
    expect(emailsSel!.filters.some((f) => f.kind === "gte" && f.col === "received_at")).toBe(true);
    expect(emailsSel!.filters.some((f) => f.kind === "in" && f.col === "mailbox")).toBe(true);
    // The swarms registry must have been consulted with swarm_type filter.
    const swarmsSel = captured.selects.find((s) => s.table === "swarms");
    expect(swarmsSel).toBeDefined();
    expect(swarmsSel!.filters.some((f) => f.kind === "eq" && f.col === "swarm_type" && f.val === "debtor-email")).toBe(true);
  });

  it("Test 2: throttleDelay(4) returns 250ms", async () => {
    const mod = await importBackfill();
    expect(mod.throttleDelay(4)).toBe(250);
    expect(mod.throttleDelay(2)).toBe(500);
    expect(mod.throttleDelay(1)).toBe(1000);
  });

  it("Test 3: runBackfill with --dry-run=false invokes fetchMessageBody 5x and writes 5x", async () => {
    candidatesResult = {
      data: Array.from({ length: 5 }, (_, i) => ({
        id: `em-${i}`,
        source_id: `graph-${i}`,
        mailbox: "debiteuren@smeba.nl",
      })),
      error: null,
    };
    fetchMessageBodyMock.mockResolvedValue({
      bodyText: "full thread",
      bodyUniqueText: "new bit",
      bodyHtml: "<p>x</p>",
      bodyType: "html",
      rawJson: { conversationId: "conv-A" },
    });
    fetchConversationMessagesMock.mockResolvedValue([]);

    const mod = await importBackfill();
    const client = makeClient() as unknown as Parameters<typeof mod.runBackfill>[0];
    const res = await mod.runBackfill(client, {
      swarmType: "debtor-email",
      days: 30,
      dryRun: false,
      reqsPerSec: 1000, // make delay ~1ms to keep test fast
    });

    expect(fetchMessageBodyMock).toHaveBeenCalledTimes(5);
    expect(res.processed).toBe(5);
    expect(res.failed).toBe(0);
    // Each row triggers an update against email_pipeline.emails.
    const emailUpdates = captured.updates.filter((u) => u.schema === "email_pipeline" && u.table === "emails");
    expect(emailUpdates).toHaveLength(5);
    // Update payload carries the new body fields.
    expect(emailUpdates[0].patch).toHaveProperty("body_full_text");
    expect(emailUpdates[0].patch).toHaveProperty("body_unique_text");
    expect(emailUpdates[0].patch).toHaveProperty("body_html");
    expect(emailUpdates[0].patch).toHaveProperty("raw_json");
  });

  it("Test 4: runBackfill with --dry-run=true fetches but does not write", async () => {
    candidatesResult = {
      data: Array.from({ length: 5 }, (_, i) => ({
        id: `em-${i}`,
        source_id: `graph-${i}`,
        mailbox: "debiteuren@smeba.nl",
      })),
      error: null,
    };
    fetchMessageBodyMock.mockResolvedValue({
      bodyText: "x",
      bodyUniqueText: "x",
      bodyHtml: "",
      bodyType: "text",
      rawJson: {},
    });

    const mod = await importBackfill();
    const client = makeClient() as unknown as Parameters<typeof mod.runBackfill>[0];
    const res = await mod.runBackfill(client, {
      swarmType: "debtor-email",
      days: 30,
      dryRun: true,
      reqsPerSec: 1000,
    });

    expect(fetchMessageBodyMock).toHaveBeenCalledTimes(5);
    expect(res.processed).toBe(5);
    expect(captured.updates).toHaveLength(0);
    expect(captured.upserts).toHaveLength(0);
  });

  it("Test 5: a row that throws is logged failure; processing continues; summary reports {processed:4, failed:1}", async () => {
    candidatesResult = {
      data: Array.from({ length: 5 }, (_, i) => ({
        id: `em-${i}`,
        source_id: `graph-${i}`,
        mailbox: "debiteuren@smeba.nl",
      })),
      error: null,
    };
    // Third row throws.
    fetchMessageBodyMock.mockImplementation(async (mailbox: string, msgId: string) => {
      if (msgId === "graph-2") throw new Error("Graph 404");
      return {
        bodyText: "ok",
        bodyUniqueText: "ok",
        bodyHtml: "",
        bodyType: "text" as const,
        rawJson: {},
      };
    });
    fetchConversationMessagesMock.mockResolvedValue([]);

    const mod = await importBackfill();
    const client = makeClient() as unknown as Parameters<typeof mod.runBackfill>[0];
    const res = await mod.runBackfill(client, {
      swarmType: "debtor-email",
      days: 30,
      dryRun: false,
      reqsPerSec: 1000,
    });

    expect(res.processed).toBe(4);
    expect(res.failed).toBe(1);
    expect(fetchMessageBodyMock).toHaveBeenCalledTimes(5);
  });
});
