// Phase 60-02 (D-04). Tests the classifier-backfill seeding logic by isolating
// the inner step.run callback. We mock the admin client so the upsert payload
// can be inspected without a live DB. The Inngest function wrapping is a thin
// shell — the real behavior under test is the seed loop + Wilson CI-lo math.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { wilsonCiLower } from "@/lib/classifier/wilson";

// Capture upsert calls
type UpsertCall = {
  payload: Record<string, unknown>;
  options: { onConflict: string };
};
const upsertCalls: UpsertCall[] = [];

const upsertMock = vi.fn(
  async (
    payload: Record<string, unknown>,
    options: { onConflict: string },
  ) => {
    upsertCalls.push({ payload, options });
    return { error: null };
  },
);

const fromMock = vi.fn((_table: string) => ({ upsert: upsertMock }));
const adminClientMock = { from: fromMock };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClientMock,
}));

// Stub the inngest client so importing the function doesn't try to register
// against a real Inngest instance during test.
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      _trigger: unknown,
      handler: (ctx: { step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>,
    ) => ({
      __handler: handler,
    }),
  },
}));

// Import AFTER mocks are wired up so the function picks up the mocked client.
import { classifierBackfill } from "@/lib/inngest/functions/classifier-backfill";

describe("D-04: classifier-backfill seeds 6 hardcoded debtor-email rules", () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    upsertMock.mockClear();
    fromMock.mockClear();
  });

  async function invoke() {
    const stepRun = async <T>(_name: string, fn: () => Promise<T>): Promise<T> => fn();
    const handler = (classifierBackfill as unknown as {
      __handler: (ctx: { step: { run: typeof stepRun } }) => Promise<{ seeded: number }>;
    }).__handler;
    return handler({ step: { run: stepRun } });
  }

  it("inserts 6 rows with status='promoted' and notes for category-rollup rules", async () => {
    const result = await invoke();
    expect(result).toEqual({ seeded: 6 });
    expect(upsertCalls).toHaveLength(6);
    expect(fromMock).toHaveBeenCalledWith("classifier_rules");

    // All rows are debtor-email + status=promoted + kind=regex
    for (const call of upsertCalls) {
      expect(call.payload).toMatchObject({
        swarm_type: "debtor-email",
        kind: "regex",
        status: "promoted",
      });
      expect(call.options).toEqual({ onConflict: "swarm_type,rule_key" });
    }

    // 4th, 5th, 6th seeds carry the payment_admittance category-rollup note
    const rollupCalls = upsertCalls.slice(3);
    for (const call of rollupCalls) {
      expect(call.payload.notes).toMatch(/payment_admittance/);
    }
    // First three have no notes
    for (const call of upsertCalls.slice(0, 3)) {
      expect(call.payload.notes).toBeNull();
    }
  });

  it("computes ci_lo via wilsonCiLower (subject_paid_marker N=169 -> 0.978)", async () => {
    await invoke();
    const first = upsertCalls[0].payload;
    expect(first.rule_key).toBe("subject_paid_marker");
    expect(first.n).toBe(169);
    expect(first.agree).toBe(169);
    expect(first.ci_lo).toBeCloseTo(wilsonCiLower(169, 169), 6);
    expect(first.ci_lo as number).toBeCloseTo(0.978, 3);

    const second = upsertCalls[1].payload;
    expect(second.rule_key).toBe("payment_subject");
    expect(second.ci_lo).toBeCloseTo(wilsonCiLower(151, 151), 6);

    const third = upsertCalls[2].payload;
    expect(third.rule_key).toBe("payment_sender+subject");
    expect(third.ci_lo).toBeCloseTo(wilsonCiLower(79, 79), 6);
    expect(third.ci_lo as number).toBeCloseTo(0.954, 3);
  });

  it("uses ON CONFLICT(swarm_type,rule_key) DO UPDATE so re-running is idempotent", async () => {
    await invoke();
    await invoke();
    // 6 + 6; every call carries the same onConflict directive
    expect(upsertCalls).toHaveLength(12);
    for (const call of upsertCalls) {
      expect(call.options.onConflict).toBe("swarm_type,rule_key");
    }
  });

  it("returns { seeded: 6 } from the step", async () => {
    const result = await invoke();
    expect(result).toEqual({ seeded: 6 });
  });
});
