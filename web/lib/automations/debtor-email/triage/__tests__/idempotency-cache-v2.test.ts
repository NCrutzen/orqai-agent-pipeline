/**
 * Phase 65 Plan 03 — CORD-04 idempotency cache invalidation on intent_version flip.
 *
 * Asserts the cache lookup is keyed on INTENT_VERSION_V2; v1 rows do not match.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { findCachedOutput } from "../agent-runs";
import { INTENT_VERSION_V2 } from "../types";

const EMAIL_ID = "00000000-0000-0000-0000-000000000001";

type Row = { id: string; tool_outputs: Record<string, unknown> | null };

function buildAdminMock(rows: Row[]) {
  // Build a chainable supabase query mock that filters in-memory.
  const calls = {
    selectArg: "" as string,
    eqs: [] as Array<{ field: string; value: unknown }>,
    notArg: null as null | { field: string; arg: string },
  };
  const builder: any = {};
  builder.select = vi.fn((cols: string) => {
    calls.selectArg = cols;
    return builder;
  });
  builder.eq = vi.fn((field: string, value: unknown) => {
    calls.eqs.push({ field, value });
    return builder;
  });
  builder.not = vi.fn((field: string, _op: "is", arg: string) => {
    calls.notArg = { field, arg };
    return builder;
  });
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => {
    // Apply eq filters.
    let filtered = rows.slice();
    for (const { field, value } of calls.eqs) {
      filtered = filtered.filter((r: any) => r[field] === value);
    }
    if (calls.notArg && calls.notArg.arg === "null") {
      filtered = filtered.filter((r: any) => r[calls.notArg!.field] !== null);
    }
    return { data: filtered[0] ?? null, error: null };
  });
  const from = vi.fn(() => builder);
  return {
    admin: { from } as unknown as Parameters<typeof findCachedOutput>[0],
    calls,
    from,
  };
}

describe("CORD-04 idempotency cache V2 invalidation", () => {
  it("findCachedOutput keyed on intent_version=2026-05-01.v2 returns cached IntentAgentOutputV2 when present", async () => {
    const cachedV2 = {
      ranked: [
        {
          intent: "copy_document_request",
          confidence: "high",
          document_reference: "INV-1",
          sub_type: "invoice",
          reasoning: "r",
        },
      ],
      language: "nl",
      urgency: "normal",
      intent_version: INTENT_VERSION_V2,
    };
    const rows: Row[] = [
      {
        id: "row-v2",
        // Row needs both the version filter columns and the tool_outputs.
        // The mock filters by eq on email_id + intent_version which we
        // simulate via top-level keys, then returns tool_outputs as the
        // selected output_field.
        tool_outputs: { intent_first_pass: cachedV2 },
        ...({ email_id: EMAIL_ID, intent_version: INTENT_VERSION_V2 } as any),
      } as any,
    ];
    const { admin } = buildAdminMock(rows);

    const result = await findCachedOutput<{
      intent_first_pass?: typeof cachedV2;
    }>(admin, EMAIL_ID, "intent_version", INTENT_VERSION_V2, "tool_outputs");

    expect(result?.intent_first_pass).toBeDefined();
    expect(result?.intent_first_pass?.intent_version).toBe(INTENT_VERSION_V2);
  });

  it("v1 row does NOT match v2 lookup — cache miss when only v1 row exists", async () => {
    const rows: Row[] = [
      {
        id: "row-v1",
        tool_outputs: {
          intent_first_pass: {
            intent: "copy_document_request",
            intent_version: "2026-04-23.v1",
          },
        },
        ...({ email_id: EMAIL_ID, intent_version: "2026-04-23.v1" } as any),
      } as any,
    ];
    const { admin } = buildAdminMock(rows);

    const result = await findCachedOutput(
      admin,
      EMAIL_ID,
      "intent_version",
      INTENT_VERSION_V2,
      "tool_outputs",
    );

    expect(result).toBeNull();
  });
});
