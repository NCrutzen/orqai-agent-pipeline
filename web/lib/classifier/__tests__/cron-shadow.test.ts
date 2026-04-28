// Phase 60-03 (D-19). Shadow-mode vs live-mode behaviour for the daily
// classifier promotion cron. Drives evaluateRule() directly so we don't need
// to construct an Inngest test harness -- the helper carries the full per-rule
// decision logic the cron loops over.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  evaluateRule,
  type RuleRow,
  type TelemetryRow,
} from "@/lib/inngest/functions/classifier-promotion-cron";

/**
 * Build a fluent stub that mimics the Supabase JS builder we use in the cron:
 *   admin.from(table).upsert(row, opts)
 *   admin.from(table).update(row).eq(col, val).eq(col, val)
 * Each call resolves to { data: null, error: null }.
 *
 * Returns the admin stub plus the underlying spies so tests can assert which
 * tables were written and how many times.
 */
function makeAdminStub() {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  // .update(...).eq(...).eq(...) -> resolves
  const eqInner = vi.fn().mockResolvedValue({ data: null, error: null });
  const eqOuter = vi.fn().mockReturnValue({ eq: eqInner });
  const update = vi.fn().mockReturnValue({ eq: eqOuter });

  const fromCalls: string[] = [];
  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    return { upsert, update };
  });

  return {
    admin: { from },
    spies: { from, upsert, update, eqOuter, eqInner, fromCalls },
  };
}

const tel = (
  rule_key: string,
  n: number,
  agree: number,
): TelemetryRow => ({
  swarm_type: "debtor-email",
  rule_key,
  n,
  agree,
});

const rule = (rule_key: string, status: RuleRow["status"]): RuleRow => ({
  swarm_type: "debtor-email",
  rule_key,
  status,
});

describe("D-19: classifier-promotion-cron shadow vs live mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("CLASSIFIER_CRON_MUTATE !== 'true' -> writes evaluation row but DOES NOT update classifier_rules.status", async () => {
    const { admin, spies } = makeAdminStub();
    // n=169, agree=169 -> ci_lo=0.97777 (matches the historical
    // subject_paid_marker seed; clears the 0.95 promote gate).
    const t = tel("subject_paid_marker", 169, 169);
    const r = rule("subject_paid_marker", "candidate");

    const result = await evaluateRule(admin, t, r, /* mutate */ false);

    // Evaluation row was upserted (write path).
    expect(spies.upsert).toHaveBeenCalledTimes(1);
    expect(spies.fromCalls).toContain("classifier_rule_evaluations");

    // classifier_rules.update was NEVER invoked in shadow mode.
    expect(spies.update).not.toHaveBeenCalled();
    expect(spies.fromCalls).not.toContain("classifier_rules");

    // ON CONFLICT idempotency target is the (swarm,rule,date) compound key.
    expect(spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        swarm_type: "debtor-email",
        rule_key: "subject_paid_marker",
        action: "shadow_would_promote",
      }),
      { onConflict: "swarm_type,rule_key,evaluated_at" },
    );

    expect(result.action).toBe("shadow_would_promote");
    expect(result.ci_lo).toBeGreaterThanOrEqual(0.95);
  });

  it("shadow run records action='shadow_would_promote' for rules crossing the promotion gate", async () => {
    const { admin, spies } = makeAdminStub();
    // n=151, agree=151 -> ci_lo > 0.95 (mirrors payment_subject seed).
    const t = tel("payment_subject", 151, 151);
    const r = rule("payment_subject", "candidate");

    const result = await evaluateRule(admin, t, r, false);

    expect(result.action).toBe("shadow_would_promote");
    expect(spies.update).not.toHaveBeenCalled();
  });

  it("shadow run records action='shadow_would_demote' for rules dropping below 0.92", async () => {
    const { admin, spies } = makeAdminStub();
    const t = tel("payment_sender+body", 100, 85); // ci_lo ~0.768 < 0.92
    const r = rule("payment_sender+body", "promoted");

    const result = await evaluateRule(admin, t, r, false);

    expect(result.action).toBe("shadow_would_demote");
    expect(result.ci_lo).toBeLessThan(0.92);
    expect(spies.update).not.toHaveBeenCalled();
    expect(spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "shadow_would_demote" }),
      { onConflict: "swarm_type,rule_key,evaluated_at" },
    );
  });

  it("shadow run records action='no_change' when N is below the floor", async () => {
    const { admin, spies } = makeAdminStub();
    const t = tel("payment_sender+hint+body", 10, 10); // N below 30 floor
    const r = rule("payment_sender+hint+body", "candidate");

    const result = await evaluateRule(admin, t, r, false);

    expect(result.action).toBe("no_change");
    expect(spies.update).not.toHaveBeenCalled();
  });

  it("CLASSIFIER_CRON_MUTATE === 'true' -> updates classifier_rules.status when promotion gate passes", async () => {
    const { admin, spies } = makeAdminStub();
    // n=169, agree=169 -> ci_lo well above 0.95.
    const t = tel("subject_paid_marker", 169, 169);
    const r = rule("subject_paid_marker", "candidate");

    const result = await evaluateRule(admin, t, r, /* mutate */ true);

    expect(result.action).toBe("promoted");
    // classifier_rules.update was called with status: 'promoted'
    expect(spies.update).toHaveBeenCalledTimes(1);
    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "promoted" }),
    );
    expect(spies.fromCalls).toContain("classifier_rules");
    // Evaluation row written with concrete (non-shadow) action.
    expect(spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "promoted" }),
      { onConflict: "swarm_type,rule_key,evaluated_at" },
    );
  });

  it("CLASSIFIER_CRON_MUTATE === 'true' -> demoted rule fires console.warn AND updates status to 'demoted'", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin, spies } = makeAdminStub();
    const t = tel("payment_sender+body", 100, 85); // ci_lo < 0.92
    const r = rule("payment_sender+body", "promoted");

    const result = await evaluateRule(admin, t, r, true);

    expect(result.action).toBe("demoted");
    expect(spies.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "demoted" }),
    );
    // D-03 alert: console.warn carries rule_key + n + ci_lo
    expect(warn).toHaveBeenCalledWith(
      "[classifier-cron] DEMOTION",
      expect.objectContaining({
        rule_key: "payment_sender+body",
        n: 100,
      }),
    );
  });

  it("CLASSIFIER_CRON_MUTATE === 'true' -> no-change still refreshes counters on classifier_rules", async () => {
    const { admin, spies } = makeAdminStub();
    // Promoted rule, ci_lo well inside hysteresis band -> no transition, but
    // counters should still flow through to keep the table fresh.
    const t = tel("payment_subject", 200, 196); // ci_lo > 0.95, status already promoted
    const r = rule("payment_subject", "promoted");

    const result = await evaluateRule(admin, t, r, true);

    expect(result.action).toBe("no_change");
    expect(spies.update).toHaveBeenCalledTimes(1);
    // status NOT in the payload -- only counter columns.
    const updatePayload = spies.update.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(updatePayload).not.toHaveProperty("status");
    expect(updatePayload).toHaveProperty("n", 200);
    expect(updatePayload).toHaveProperty("agree", 196);
  });

  it("manual_block rules are NEVER promoted or demoted regardless of telemetry (T-60-03-05)", async () => {
    // Even in live mode, with telemetry that would otherwise promote.
    const { admin, spies } = makeAdminStub();
    const t = tel("subject_paid_marker", 500, 500);
    const r = rule("subject_paid_marker", "manual_block");

    const result = await evaluateRule(admin, t, r, /* mutate */ true);

    expect(result.action).toBe("no_change");
    expect(spies.update).not.toHaveBeenCalled();
    // Still records an evaluation row so the audit trail exists.
    expect(spies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ action: "no_change" }),
      { onConflict: "swarm_type,rule_key,evaluated_at" },
    );
  });

  it("ON CONFLICT (swarm_type, rule_key, evaluated_at::date) DO UPDATE -- same-day re-trigger is idempotent", async () => {
    const { admin, spies } = makeAdminStub();
    const t = tel("payment_subject", 151, 151);
    const r = rule("payment_subject", "candidate");

    await evaluateRule(admin, t, r, false);
    await evaluateRule(admin, t, r, false);

    // Both calls hit upsert with the same compound conflict target -- the DB
    // unique index collapses them to a single row per day.
    expect(spies.upsert).toHaveBeenCalledTimes(2);
    for (const call of spies.upsert.mock.calls) {
      expect(call[1]).toEqual({
        onConflict: "swarm_type,rule_key,evaluated_at",
      });
    }
  });
});
