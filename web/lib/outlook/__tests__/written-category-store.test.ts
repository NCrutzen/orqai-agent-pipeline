// Phase 117 Plan 01 Task 3 (D-4 / D-5) — written-category store helper.
//
// recordWrittenCategory upserts on conflict (email_id) so re-recording the same
// message updates ai_category + written_at and NEVER inserts a duplicate (D-4
// idempotency). readWrittenCategory returns the baseline row or null on a missing
// row — the worker treats null as "never written, safe to write". email_id is the
// conflict target + the join key Phase 112.5's swarm-behavior-sync uses to seed
// prevCategories from this baseline (D-5).
//
// Uses the shared chainable Supabase admin mock (web/test-utils/supabase-mock.ts).

import { describe, it, expect } from "vitest";
import { createSupabaseAdminMock } from "@/test-utils/supabase-mock";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordWrittenCategory, readWrittenCategory } from "../written-category-store";

describe("written-category-store — recordWrittenCategory (D-4 idempotency)", () => {
  it("upserts on conflict email_id with the written-category payload", async () => {
    const admin = createSupabaseAdminMock();
    admin.queueResponse({ data: null, error: null });

    await recordWrittenCategory(admin as unknown as SupabaseClient, {
      email_id: "11111111-1111-1111-1111-111111111111",
      swarm_type: "sales-email",
      source_mailbox: "verkoop@smeba.nl",
      ai_category: "AI: quote_request",
    });

    expect(admin.calls).toContainEqual({
      method: "from",
      args: ["swarm_written_categories"],
    });

    const upsertCall = admin.calls.find((c) => c.method === "upsert");
    expect(upsertCall).toBeDefined();
    // Conflict target is email_id (the idempotency key).
    expect(upsertCall!.args[1]).toEqual({ onConflict: "email_id" });
    // Payload carries the four columns; written_at is set by the helper.
    const payload = upsertCall!.args[0] as Record<string, unknown>;
    expect(payload.email_id).toBe("11111111-1111-1111-1111-111111111111");
    expect(payload.swarm_type).toBe("sales-email");
    expect(payload.source_mailbox).toBe("verkoop@smeba.nl");
    expect(payload.ai_category).toBe("AI: quote_request");
    expect(typeof payload.written_at).toBe("string");
  });
});

describe("written-category-store — readWrittenCategory (null-on-missing)", () => {
  it("returns {ai_category, written_at} for a recorded row", async () => {
    const admin = createSupabaseAdminMock();
    admin.queueResponse({
      data: { ai_category: "AI: order_status", written_at: "2026-06-15T10:00:00Z" },
      error: null,
    });

    const result = await readWrittenCategory(
      admin as unknown as SupabaseClient,
      "22222222-2222-2222-2222-222222222222",
    );

    expect(result).toEqual({
      ai_category: "AI: order_status",
      written_at: "2026-06-15T10:00:00Z",
    });
    expect(admin.calls).toContainEqual({
      method: "eq",
      args: ["email_id", "22222222-2222-2222-2222-222222222222"],
    });
  });

  it("returns null (not throw) when the row is absent", async () => {
    const admin = createSupabaseAdminMock();
    admin.queueResponse({ data: null, error: null });

    const result = await readWrittenCategory(
      admin as unknown as SupabaseClient,
      "33333333-3333-3333-3333-333333333333",
    );

    expect(result).toBeNull();
  });
});
