// Phase 60-06 (D-16/D-17/D-29). Verifies recordVerdict is verdict-write only:
// flips automation_runs.status, writes agent_runs telemetry, fires
// classifier/verdict.recorded, emits broadcast. NO Outlook / iController
// inline (those moved to classifier-verdict-worker).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- Mocks ----------------------------------------------------------------

// Capture admin-client interactions
type UpdateCall = { table: string; payload: Record<string, unknown>; eqCol: string; eqVal: unknown };
type InsertCall = { table: string; payload: Record<string, unknown> };

const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];
let updateError: { message: string } | null = null;
let insertError: { message: string } | null = null;
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

// Import AFTER mocks
import { recordVerdict } from "@/app/(dashboard)/automations/debtor-email-review/actions";

// ---- Test helpers ---------------------------------------------------------

const baseInput = {
  automation_run_id: "ar-uuid-1",
  rule_key: "subject_paid_marker",
  message_id: "AAMkAG-graph-id",
  source_mailbox: "debiteuren@smeba.nl",
  entity: "smeba",
  predicted_category: "payment_admittance",
} as const;

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  updateError = null;
  insertError = null;
  insertedAgentRunId = "agent-run-uuid-1";
  adminClientMock.from.mockClear();
  sendMock.mockClear();
  emitMock.mockClear();
});

// ---- Tests ----------------------------------------------------------------

describe("D-16: recordVerdict — verdict-write only, no inline side-effects", () => {
  it("approve path: flips status -> feedback, inserts agent_runs(approved), fires Inngest, emits broadcast", async () => {
    const result = await recordVerdict({ ...baseInput, decision: "approve" });
    expect(result).toEqual({ ok: true });

    // 1. UPDATE automation_runs SET status='feedback'
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe("automation_runs");
    expect(updateCalls[0].payload).toMatchObject({ status: "feedback" });
    expect(updateCalls[0].payload.completed_at).toBeTypeOf("string");
    expect(updateCalls[0].eqCol).toBe("id");
    expect(updateCalls[0].eqVal).toBe("ar-uuid-1");

    // 2. INSERT public.agent_runs with swarm_type, rule_key, human_verdict='approved'
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe("agent_runs");
    expect(insertCalls[0].payload).toMatchObject({
      swarm_type: "debtor-email",
      automation_run_id: "ar-uuid-1",
      rule_key: "subject_paid_marker",
      human_verdict: "approved",
      corrected_category: null,
      context: {
        message_id: "AAMkAG-graph-id",
        source_mailbox: "debiteuren@smeba.nl",
        entity: "smeba",
        predicted_category: "payment_admittance",
      },
    });

    // 3. Inngest event fired
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith({
      name: "classifier/verdict.recorded",
      data: expect.objectContaining({
        automation_run_id: "ar-uuid-1",
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

    // 4. emitAutomationRunStale called with the queue automation
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
    const actionsPath = resolve(__dirname, "../../app/(dashboard)/automations/debtor-email-review/actions.ts");
    const src = readFileSync(actionsPath, "utf8");
    // No Outlook side-effect imports
    expect(src).not.toMatch(/categorizeEmail/);
    expect(src).not.toMatch(/archiveEmail/);
    // No iController helpers (case-insensitive — covers icontroller dir too)
    expect(src).not.toMatch(/icontroller/i);
    expect(src).not.toMatch(/openIControllerSession/);
    expect(src).not.toMatch(/deleteEmailOnPage/);
    // Sanity: it DOES fire the verdict event
    expect(src).toMatch(/classifier\/verdict\.recorded/);
  });
});
