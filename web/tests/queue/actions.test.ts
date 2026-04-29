// Phase 56.7-03 (D-15, Pitfall 5). Verifies that recordVerdict is now
// swarm-agnostic:
//   - swarm_type threads through agent_runs.swarm_type, the Inngest event
//     payload, and the broadcast automation name (`${swarm_type}-review`).
//   - override_category is validated against loadSwarmCategories at runtime
//     (NOT against a static OVERRIDE_CATEGORIES const).
//   - Pre-existing 60-06 / 61-01 contracts are intact (status flip, agent_runs
//     telemetry, jsonb merge, decision routing, notes max 2000).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- Mocks ----------------------------------------------------------------

type UpdateCall = { table: string; payload: Record<string, unknown>; eqCol: string; eqVal: unknown };
type InsertCall = { table: string; payload: Record<string, unknown> };
type SelectCall = { table: string; cols: string; eqCol: string; eqVal: unknown };

const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];
const selectCalls: SelectCall[] = [];
let updateError: { message: string } | null = null;
let insertError: { message: string } | null = null;
let selectError: { message: string } | null = null;
let existingResult: Record<string, unknown> | null = {};
let insertedAgentRunId: string = "agent-run-uuid-1";

const adminClientMock = {
  from: vi.fn((table: string) => ({
    update: (payload: Record<string, unknown>) => ({
      eq: (col: string, val: unknown) => {
        updateCalls.push({ table, payload, eqCol: col, eqVal: val });
        return Promise.resolve({ error: updateError });
      },
    }),
    insert: (payload: Record<string, unknown>) => ({
      select: (_cols: string) => ({
        single: () => {
          insertCalls.push({ table, payload });
          if (insertError) {
            return Promise.resolve({ data: null, error: insertError });
          }
          return Promise.resolve({ data: { id: insertedAgentRunId }, error: null });
        },
      }),
    }),
    select: (cols: string) => ({
      eq: (col: string, val: unknown) => ({
        single: () => {
          selectCalls.push({ table, cols, eqCol: col, eqVal: val });
          if (selectError) {
            return Promise.resolve({ data: null, error: selectError });
          }
          return Promise.resolve({ data: { result: existingResult }, error: null });
        },
      }),
    }),
  })),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClientMock,
}));

const sendMock = vi.fn(async (_payload: unknown) => undefined);
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: (payload: unknown) => sendMock(payload) },
}));

const emitMock = vi.fn(async (_admin: unknown, _automation: string) => undefined);
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (admin: unknown, automation: string) =>
    emitMock(admin, automation),
}));

// Phase 56.7-03 / Pitfall 5: registry-driven override_category validation.
// The seven debtor-email categories from the migration seed.
const DEBTOR_CATS = [
  { swarm_type: "debtor-email", category_key: "payment", display_label: "Payment", outlook_label: "Payment", action: "categorize_archive", swarm_dispatch: null, display_order: 10, enabled: true },
  { swarm_type: "debtor-email", category_key: "payment_admittance", display_label: "Payment Admittance", outlook_label: "Payment Admittance", action: "categorize_archive", swarm_dispatch: null, display_order: 15, enabled: true },
  { swarm_type: "debtor-email", category_key: "auto_reply", display_label: "Auto-reply", outlook_label: "Auto-Reply", action: "categorize_archive", swarm_dispatch: null, display_order: 20, enabled: true },
  { swarm_type: "debtor-email", category_key: "ooo_temporary", display_label: "OOO (temporary)", outlook_label: "OoO Temp", action: "categorize_archive", swarm_dispatch: null, display_order: 30, enabled: true },
  { swarm_type: "debtor-email", category_key: "ooo_permanent", display_label: "OOO (permanent)", outlook_label: "OoO Perm", action: "categorize_archive", swarm_dispatch: null, display_order: 40, enabled: true },
  { swarm_type: "debtor-email", category_key: "invoice_copy_request", display_label: "Invoice copy request", outlook_label: "Invoice Copy Request", action: "categorize_archive", swarm_dispatch: null, display_order: 50, enabled: true },
  { swarm_type: "debtor-email", category_key: "unknown", display_label: "Skip (label-only)", outlook_label: null, action: "reject", swarm_dispatch: null, display_order: 60, enabled: true },
];
const loadSwarmCategoriesMock = vi.fn(async (_admin: unknown, swarmType: string) => {
  if (swarmType === "debtor-email") return DEBTOR_CATS;
  return [];
});
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmCategories: (admin: unknown, swarmType: string) =>
    loadSwarmCategoriesMock(admin, swarmType),
  loadSwarm: vi.fn(),
}));

// Import AFTER mocks
import { recordVerdict } from "@/app/(dashboard)/automations/[swarm]/review/actions";

// ---- Test helpers ---------------------------------------------------------

const baseInput = {
  swarm_type: "debtor-email",
  automation_run_id: "00000000-0000-0000-0000-000000000001",
  rule_key: "subject_paid_marker",
  message_id: "AAMkAG-graph-id",
  source_mailbox: "debiteuren@smeba.nl",
  entity: "smeba",
  predicted_category: "payment_admittance",
} as const;

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  selectCalls.length = 0;
  updateError = null;
  insertError = null;
  selectError = null;
  existingResult = {};
  insertedAgentRunId = "agent-run-uuid-1";
  adminClientMock.from.mockClear();
  sendMock.mockClear();
  emitMock.mockClear();
  loadSwarmCategoriesMock.mockClear();
});

// ---- D-16 contract preserved ---------------------------------------------

describe("D-16: recordVerdict — verdict-write only, no inline side-effects", () => {
  it("approve path: flips status -> feedback, inserts agent_runs(approved), fires Inngest, emits broadcast", async () => {
    const result = await recordVerdict({ ...baseInput, decision: "approve" });
    expect(result).toEqual({ ok: true });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe("automation_runs");
    expect(updateCalls[0].payload).toMatchObject({ status: "feedback" });
    expect(updateCalls[0].payload.completed_at).toBeTypeOf("string");
    expect(updateCalls[0].eqCol).toBe("id");
    expect(updateCalls[0].eqVal).toBe(baseInput.automation_run_id);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe("agent_runs");
    expect(insertCalls[0].payload).toMatchObject({
      swarm_type: "debtor-email",
      automation_run_id: baseInput.automation_run_id,
      entity: "smeba",
      rule_key: "subject_paid_marker",
      human_verdict: "approved",
      human_notes: null,
      corrected_category: null,
    });
    expect(insertCalls[0].payload).not.toHaveProperty("context");

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      name: "classifier/verdict.recorded",
      data: expect.objectContaining({
        automation_run_id: baseInput.automation_run_id,
        agent_run_id: "agent-run-uuid-1",
        swarm_type: "debtor-email",
        rule_key: "subject_paid_marker",
        decision: "approve",
        message_id: "AAMkAG-graph-id",
        source_mailbox: "debiteuren@smeba.nl",
        entity: "smeba",
        predicted_category: "payment_admittance",
      }),
    });

    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(adminClientMock, "debtor-email-review");
  });

  it("reject path: human_verdict='rejected_other', decision='reject' in event", async () => {
    await recordVerdict({ ...baseInput, decision: "reject" });

    expect(insertCalls[0].payload).toMatchObject({
      human_verdict: "rejected_other",
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "classifier/verdict.recorded",
        data: expect.objectContaining({ decision: "reject" }),
      }),
    );
  });

  it("D-25: override_category lands in agent_runs.corrected_category", async () => {
    await recordVerdict({
      ...baseInput,
      decision: "approve",
      override_category: "auto_reply",
    });
    expect(insertCalls[0].payload).toMatchObject({
      corrected_category: "auto_reply",
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ override_category: "auto_reply" }),
      }),
    );
  });

  it("throws when automation_runs UPDATE fails (and does NOT fire event)", async () => {
    updateError = { message: "row not found" };
    await expect(recordVerdict({ ...baseInput, decision: "approve" })).rejects.toThrow(
      /automation_runs update failed: row not found/,
    );
    expect(sendMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("throws when agent_runs INSERT fails (and does NOT fire event)", async () => {
    insertError = { message: "fk violation" };
    await expect(recordVerdict({ ...baseInput, decision: "approve" })).rejects.toThrow(
      /agent_runs insert failed: fk violation/,
    );
    expect(sendMock).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("static check: actions.ts does NOT import categorizeEmail / archiveEmail / iController helpers", () => {
    const actionsPath = resolve(__dirname, "../../app/(dashboard)/automations/[swarm]/review/actions.ts");
    const src = readFileSync(actionsPath, "utf8");
    expect(src).not.toMatch(/categorizeEmail/);
    expect(src).not.toMatch(/archiveEmail/);
    expect(src).not.toMatch(/icontroller/i);
    expect(src).not.toMatch(/openIControllerSession/);
    expect(src).not.toMatch(/deleteEmailOnPage/);
    expect(src).toMatch(/classifier\/verdict\.recorded/);
  });

  it("static check: actions.ts does NOT import a static OVERRIDE_CATEGORIES const (Pitfall 5)", () => {
    const actionsPath = resolve(__dirname, "../../app/(dashboard)/automations/[swarm]/review/actions.ts");
    const src = readFileSync(actionsPath, "utf8");
    expect(src).not.toMatch(/OVERRIDE_CATEGORIES/);
    expect(src).toMatch(/loadSwarmCategories/);
  });
});

// ---- 61-01: jsonb merge + decision routing + notes -----------------------

describe("Phase 61-01 contracts (preserved by 56.7-03)", () => {
  it("schema accepts notes up to 2000 chars; rejects 2001", async () => {
    const ok = "a".repeat(2000);
    await expect(
      recordVerdict({ ...baseInput, decision: "approve", notes: ok }),
    ).resolves.toEqual({ ok: true });

    const bad = "a".repeat(2001);
    await expect(
      recordVerdict({ ...baseInput, decision: "approve", notes: bad }),
    ).rejects.toThrow();
  });

  it("merges {review_override, review_note} into automation_runs.result without dropping existing keys", async () => {
    existingResult = { message_id: "msg-1", source_mailbox: "x@y.nl", predicted: { category: "payment" } };
    await recordVerdict({
      ...baseInput,
      decision: "approve",
      override_category: "auto_reply",
      notes: "Looks like a vacation reply",
    });
    expect(selectCalls).toHaveLength(1);
    expect(selectCalls[0].table).toBe("automation_runs");
    expect(selectCalls[0].cols).toContain("result");
    expect(updateCalls).toHaveLength(1);
    const updated = updateCalls[0].payload as { result: Record<string, unknown> };
    expect(updated.result).toMatchObject({
      message_id: "msg-1",
      source_mailbox: "x@y.nl",
      predicted: { category: "payment" },
      review_override: "auto_reply",
      review_note: "Looks like a vacation reply",
    });
  });

  it("inngest.send payload carries override_category AND notes when supplied", async () => {
    await recordVerdict({
      ...baseInput,
      decision: "approve",
      override_category: "ooo_temporary",
      notes: "Out until June 1",
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          override_category: "ooo_temporary",
          notes: "Out until June 1",
        }),
      }),
    );
  });

  it("D-LABEL-ONLY-SKIP: override_category='unknown' forces decision='reject' in the event", async () => {
    await recordVerdict({
      ...baseInput,
      decision: "approve",
      override_category: "unknown",
      notes: "Can't tell",
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decision: "reject",
          override_category: "unknown",
        }),
      }),
    );
  });

  it("override_category equal to predicted_category: decision is preserved (no-op override)", async () => {
    await recordVerdict({
      ...baseInput,
      predicted_category: "auto_reply",
      decision: "approve",
      override_category: "auto_reply",
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ decision: "approve" }),
      }),
    );
  });

  it("override_category differs from predicted_category and != 'unknown' → decision forced to 'approve'", async () => {
    await recordVerdict({
      ...baseInput,
      decision: "reject",
      override_category: "auto_reply",
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          decision: "approve",
          override_category: "auto_reply",
        }),
      }),
    );
  });

  it("notes lands in agent_runs.human_notes when provided", async () => {
    await recordVerdict({
      ...baseInput,
      decision: "approve",
      notes: "Reviewer note here",
    });
    expect(insertCalls[0].payload).toMatchObject({
      human_notes: "Reviewer note here",
    });
  });

  it("agent_runs.corrected_category is null when no override supplied", async () => {
    await recordVerdict({ ...baseInput, decision: "approve" });
    expect(insertCalls[0].payload).toMatchObject({ corrected_category: null });
  });
});

// ---- 56.7-03: swarm-aware contracts ---------------------------------------

describe("swarm-aware: registry-driven override_category validation (Pitfall 5)", () => {
  it("accepts a known override_category for the swarm (looked up via loadSwarmCategories)", async () => {
    await expect(
      recordVerdict({
        ...baseInput,
        decision: "approve",
        override_category: "payment",
      }),
    ).resolves.toEqual({ ok: true });
    // Registry was consulted with the input's swarm_type
    expect(loadSwarmCategoriesMock).toHaveBeenCalledWith(adminClientMock, "debtor-email");
  });

  it("rejects an override_category not in the registry for that swarm", async () => {
    await expect(
      recordVerdict({
        ...baseInput,
        decision: "approve",
        override_category: "bogus-not-seeded",
      }),
    ).rejects.toThrow(/unknown override_category: bogus-not-seeded for swarm debtor-email/);
    // No write side-effects when validation fails
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("threads swarm_type into the broadcast automation name (`${swarm_type}-review`)", async () => {
    await recordVerdict({ ...baseInput, decision: "approve" });
    expect(emitMock).toHaveBeenCalledWith(adminClientMock, "debtor-email-review");
  });

  it("a different swarm_type would emit on its own channel (e.g. 'sales-email-review')", async () => {
    // Arrange: registry returns a category list for sales-email so the
    // post-validation step doesn't reject the test's override.
    loadSwarmCategoriesMock.mockImplementationOnce(async () => [
      { swarm_type: "sales-email", category_key: "lead", display_label: "Lead", outlook_label: null, action: "categorize_archive", swarm_dispatch: null, display_order: 10, enabled: true },
    ]);
    await recordVerdict({
      ...baseInput,
      swarm_type: "sales-email",
      decision: "approve",
      override_category: "lead",
    });
    expect(emitMock).toHaveBeenCalledWith(adminClientMock, "sales-email-review");
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ swarm_type: "sales-email" }),
      }),
    );
  });

  it("inngest event payload carries swarm_type from the input", async () => {
    await recordVerdict({ ...baseInput, decision: "approve" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ swarm_type: "debtor-email" }),
      }),
    );
  });
});
