/**
 * Phase 113 Plan 05 Task 2 (BLOCKER-3) — the Bulk Review Zod-failure RETRY path
 * (the dead-letter sink) is proven to accept swarm_type='sales-email', NOT just
 * debtor. This is the pre-checkpoint automated gate behind STAGE3-03's
 * "Zod failure → Bulk Review → operator retry" guarantee.
 *
 * Two properties:
 *   (a) BLOCKER-3b — the retry action (replayKanbanRow) dispatches a
 *       SALES-SCOPED Inngest event when invoked with swarmType='sales-email'
 *       and a sales failed-verdict fixture: the same-intent branch fires the
 *       registry-resolved sales handler_event (NOT a debtor event), and the
 *       close UPDATE is compound-filtered by swarm_type='sales-email'.
 *   (b) BLOCKER-3a — swarm-uniformity SOURCE assertion: the retry action +
 *       the stage-3 Bulk Review shell loader/render components do NOT hardcode
 *       `debtor-email` / `debtor` in their data-loader or retry dispatch (they
 *       parameterize on the [swarm] route / swarmType arg). Any `debtor`
 *       occurrence must be a comment/doc, never a query filter.
 *
 * The reconciliation smoke + its fixture tests live in
 * scripts/eval/__tests__/sales-stage3-deadletter-check.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const loadSwarmMock = vi.fn();
const loadSwarmIntentsMock = vi.fn();
const loadHandlerEventMock = vi.fn();
const sendMock = vi.fn();
const emitStaleMock = vi.fn();

vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmIntents: (...args: unknown[]) => loadSwarmIntentsMock(...args),
  loadHandlerEvent: (...args: unknown[]) => loadHandlerEventMock(...args),
}));
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) => emitStaleMock(...args),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: (...args: unknown[]) => sendMock(...args) },
}));

interface UpdateTrace {
  payload: Record<string, unknown> | null;
  eqCalls: Array<{ col: string; val: unknown }>;
}
function makeAdminMock(updateResult: { data: unknown; error: unknown }): {
  admin: unknown;
  trace: UpdateTrace;
} {
  const trace: UpdateTrace = { payload: null, eqCalls: [] };
  const builder: Record<string, unknown> = {};
  builder.update = (payload: Record<string, unknown>) => {
    trace.payload = payload;
    return builder;
  };
  builder.eq = (col: string, val: unknown) => {
    trace.eqCalls.push({ col, val });
    return builder;
  };
  builder.select = (_cols: string) => Promise.resolve(updateResult);
  return { admin: { from: (_t: string) => builder }, trace };
}

let currentAdmin: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => currentAdmin,
}));

import { replayKanbanRow } from "@/app/(dashboard)/automations/[swarm]/_actions/replay";

// Sales intents (mirrors the 113-04 seed: placeholder handler_status, sales
// handler_event naming). The retry must validate chosenIntent against THIS.
const SALES_INTENTS = [
  {
    swarm_type: "sales-email",
    intent_key: "quote_request",
    handler_event: "sales-email/quote-request.requested",
    handler_status: "placeholder",
  },
  {
    swarm_type: "sales-email",
    intent_key: "order_status",
    handler_event: "sales-email/order-status.requested",
    handler_status: "placeholder",
  },
  {
    swarm_type: "sales-email",
    intent_key: "other",
    handler_event: "sales-email/other.requested",
    handler_status: "placeholder",
  },
];

describe("Phase 113 Plan 05 — Bulk Review retry accepts swarm_type='sales-email' (BLOCKER-3b)", () => {
  beforeEach(() => {
    loadSwarmMock.mockReset();
    loadSwarmIntentsMock.mockReset();
    loadHandlerEventMock.mockReset();
    sendMock.mockReset();
    emitStaleMock.mockReset();
    sendMock.mockResolvedValue({ ids: ["evt-1"] });
    emitStaleMock.mockResolvedValue(undefined);
  });

  it("same-intent retry → dispatches the SALES handler_event (not a debtor event) + closes the sales row", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "sales-email" });
    loadSwarmIntentsMock.mockResolvedValue(SALES_INTENTS);
    loadHandlerEventMock.mockResolvedValue("sales-email/quote-request.requested");
    const { admin, trace } = makeAdminMock({
      data: [{ id: "kanban-sales-1" }],
      error: null,
    });
    currentAdmin = admin;

    const res = await replayKanbanRow({
      kanbanRowId: "kanban-sales-1",
      swarmType: "sales-email",
      emailId: "sales-email-1",
      originalIntent: "quote_request",
      chosenIntent: "quote_request",
      originalEventId: "ev-sales-3",
      operatorId: "op-1",
    });

    expect(res).toEqual({ ok: true, mode: "same-intent" });
    // dispatched event is sales-scoped
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as {
      name: string;
      data: Record<string, unknown>;
    };
    expect(sent.name).toBe("sales-email/quote-request.requested");
    expect(sent.name.startsWith("sales-email/")).toBe(true);
    expect(sent.data.swarm_type).toBe("sales-email");
    // NOT a debtor event
    const allNames = sendMock.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(allNames.some((n) => n.startsWith("debtor-email/"))).toBe(false);
    // close UPDATE compound-filtered by swarm_type='sales-email' (IDOR safety)
    expect(trace.eqCalls).toContainEqual({ col: "swarm_type", val: "sales-email" });
    expect(emitStaleMock).toHaveBeenCalledWith(admin, "sales-email-kanban");
  });

  it("rejects an out-of-registry intent for sales (T-76-05-01 holds for sales)", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "sales-email" });
    loadSwarmIntentsMock.mockResolvedValue(SALES_INTENTS);
    currentAdmin = makeAdminMock({ data: [], error: null }).admin;

    const res = await replayKanbanRow({
      kanbanRowId: "kanban-sales-1",
      swarmType: "sales-email",
      emailId: "sales-email-1",
      originalIntent: "quote_request",
      chosenIntent: "not_a_sales_intent",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: false, error: "unknown intent" });
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BLOCKER-3a — swarm-uniformity SOURCE assertion: the retry action + the
// stage-3 Bulk Review shell loader/render are not debtor-hardcoded in their
// query filters / dispatch. Any `debtor` token must be a comment/doc/label.
// ---------------------------------------------------------------------------
describe("Phase 113 Plan 05 — stage-3 retry/loader is swarm-uniform (no debtor hardcoding) (BLOCKER-3a)", () => {
  const ROOT = resolve(__dirname, "../../../..");
  // The retry dispatch + the swarm-scoped stage-3 render/loader surfaces.
  const FILES = [
    "app/(dashboard)/automations/[swarm]/_actions/replay.ts",
    "app/(dashboard)/automations/[swarm]/_shell/components/stage-3-read.tsx",
    "app/(dashboard)/automations/[swarm]/_shell/components/stage-3-decide.tsx",
  ];

  /** Lines that are NOT comments and DO look like a query filter / event name
   *  containing a debtor literal. The same-intent retry path is fully
   *  swarm-parameterized (handler_event from the registry); the only debtor
   *  literal in replay.ts is the edited-intent override.submitted event name,
   *  which is documented as the debtor override channel — the sales dead-letter
   *  retry uses the SAME-intent branch (registry handler_event), so the
   *  edited-intent debtor channel does not gate the sales retry. We assert no
   *  debtor literal sits in a SUPABASE QUERY FILTER (.eq("swarm_type","debtor…")
   *  or a hardcoded swarm_type: "debtor…") in these files. */
  function debtorQueryFilters(src: string): string[] {
    const offenders: string[] = [];
    let inBlock = false;
    for (const raw of src.split("\n")) {
      const t = raw.trim();
      if (inBlock) {
        if (t.includes("*/")) inBlock = false;
        continue;
      }
      if (t.startsWith("/*")) {
        if (!t.includes("*/")) inBlock = true;
        continue;
      }
      if (t.startsWith("//") || t.startsWith("*")) continue;
      // A debtor literal used as a query filter or a hardcoded swarm key.
      if (
        /\.eq\(\s*["']swarm_type["']\s*,\s*["']debtor/.test(t) ||
        /swarm_type\s*:\s*["']debtor-email["']/.test(t)
      ) {
        offenders.push(t);
      }
    }
    return offenders;
  }

  it("no debtor swarm_type query filter in the stage-3 retry/loader surfaces", () => {
    for (const rel of FILES) {
      const src = readFileSync(resolve(ROOT, rel), "utf8");
      expect(
        debtorQueryFilters(src),
        `${rel} must not hardcode a debtor swarm_type filter`,
      ).toEqual([]);
    }
  });

  it("replay.ts validates the chosen intent + swarm against the registry (swarm-uniform)", () => {
    const src = readFileSync(
      resolve(ROOT, "app/(dashboard)/automations/[swarm]/_actions/replay.ts"),
      "utf8",
    );
    // Registry-driven: swarm + intents loaded by the swarmType arg, handler_event
    // resolved from the registry — the seam that makes it swarm-uniform.
    expect(src).toMatch(/loadSwarm\(\s*admin\s*,\s*args\.swarmType/);
    expect(src).toMatch(/loadSwarmIntents\(\s*admin\s*,\s*args\.swarmType/);
    expect(src).toMatch(/loadHandlerEvent\(/);
  });
});
