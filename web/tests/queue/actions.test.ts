// Phase 60-06 (D-16/D-17/D-29). Verifies recordVerdict is verdict-write only:
// flips automation_runs.status, writes agent_runs telemetry, fires
// classifier/verdict.recorded, emits broadcast. NO Outlook / iController
// inline (those moved to classifier-verdict-worker).
//
// Phase 61-01: extends recordVerdict with override_category enum + notes,
// jsonb merge of {review_override, review_note} into automation_runs.result,
// and decision-routing per D-LABEL-ONLY-SKIP.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- Mocks ----------------------------------------------------------------

// Capture admin-client interactions
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

// Import AFTER mocks
import { recordVerdict } from "@/app/(dashboard)/automations/debtor-email-review/actions";

// ---- Test helpers ---------------------------------------------------------

const baseInput = {
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
    expect(updateCalls[0].eqVal).toBe(baseInput.automation_run_id);

    // 2. INSERT public.agent_runs with swarm_type, rule_key, human_verdict='approved'
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe("agent_runs");
    expect(insertCalls[0].payload).toMatchObject({
      swarm_type: "debtor-email",
      automation_run_id: baseInput.automation_run_id,
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

// ---- Phase 61-01: override_category enum + notes + decision routing -------

describe("Phase 61-01: recordVerdict extended schema (override + notes)", () => {
  it("schema accepts override_category in the 5-value enum (zod parse OK)", async () => {
    for (const cat of ["payment", "auto_reply", "ooo_temporary", "ooo_permanent", "unknown"] as const) {
      await expect(
        recordVerdict({
          ...baseInput,
          decision: "approve",
          override_category: cat,
        }),
      ).resolves.toEqual({ ok: true });
    }
  });

  it("schema rejects an unknown override_category value (zod throws)", async () => {
    await expect(
      recordVerdict({
        ...baseInput,
        decision: "approve",
        // @ts-expect-error — intentionally invalid
        override_category: "foo",
      }),
    ).rejects.toThrow();
  });

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
    // first the select-then-update fetch, then the update
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
      decision: "approve", // reviewer pressed approve but selected unknown — skip wins
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
    // Use a predicted_category that is itself a valid enum value so the
    // override equality branch can fire. (baseInput.predicted_category is
    // "payment_admittance" which is not in the 5-value enum — that's fine
    // for other tests but not for this equality case.)
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
      decision: "reject", // reviewer pressed reject, but supplied a real override → approve override
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

  it("notes lands in agent_runs.context when provided", async () => {
    await recordVerdict({
      ...baseInput,
      decision: "approve",
      notes: "Reviewer note here",
    });
    const ctx = (insertCalls[0].payload.context ?? {}) as Record<string, unknown>;
    expect(ctx.notes).toBe("Reviewer note here");
  });

  it("agent_runs.corrected_category is null when no override supplied", async () => {
    await recordVerdict({ ...baseInput, decision: "approve" });
    expect(insertCalls[0].payload).toMatchObject({ corrected_category: null });
  });
});
