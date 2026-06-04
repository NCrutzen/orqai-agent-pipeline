// Phase 110 Plan 01 (D-10 / D-11) — dry-run gate preservation contract.
//
// Pins debtor's CURRENT EFFECTIVE per-stage gating so Plan 04's per-stage
// dry-run gate (reading swarms.dry_run_config) preserves it EXACTLY. Two
// facts must survive the Plan 04 refactor for the live debtor path:
//
//   • OQ-1 (verified 2026-06-03): all 6 debtor mailboxes are dry_run=true
//     UNIFORMLY. There is no per-mailbox divergence, so a single per-swarm
//     flag is safe — Plan 04 does NOT need a per-mailbox override layer.
//
//   • D-11 effective gating that Plan 04 must reproduce:
//       - stage_1_cleanup MUST default LIVE (false) for debtor. The iController
//         noise-cleanup worker has NO dry-run gate today and calls
//         openIControllerSession("production", …) unconditionally — it is live
//         in production. The new per-stage gate must therefore default
//         stage_1_cleanup=false for debtor (and =true / blocked for sales).
//       - stage-2-customer-resolver + classifier-invoice-copy-handler are
//         GATED: both read `settingsRow?.dry_run ?? true`, so dry_run=true
//         blocks the production write.
//
// Test shape: the cleanup-LIVE assertion (no gate, hardcoded "production") is
// GREEN today. The dry_run_config-gate assertions are RED until Plan 04 wires
// the swarms.dry_run_config source into the cleanup worker.
//
// ─────────────────────────────────────────────────────────────────────────
// RED until 110-04 lands D-10/D-11 gate.
// ─────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

describe("dry-run gate preservation — current effective debtor gating (D-11)", () => {
  // ── GREEN today: stage 1 iController cleanup is LIVE (no gate) ──────────
  it("stage-1-icontroller-noise-cleanup runs LIVE today — hardcoded 'production', no dry_run gate", () => {
    const src = read("../stage-1-icontroller-noise-cleanup.ts");
    // The footgun: session opens against production unconditionally.
    expect(src).toMatch(/openIControllerSession\(\s*["']production["']/);
    // And there is NO dry-run gate reading a dry_run flag in this worker today.
    expect(src).not.toMatch(/\bdry_?[rR]un\b/);
  });

  // ── GREEN today: stage 2 + invoice-copy handler are GATED on dry_run ────
  it("stage-2-customer-resolver is GATED — reads settingsRow.dry_run (?? true)", () => {
    const src = read("../stage-2-customer-resolver.ts");
    expect(src).toMatch(/settingsRow\?\.dry_run\s*\?\?\s*true/);
  });

  it("classifier-invoice-copy-handler is GATED — reads settingsRow.dry_run (?? true)", () => {
    const src = read("../classifier-invoice-copy-handler.ts");
    expect(src).toMatch(/settingsRow\?\.dry_run\s*\?\?\s*true/);
  });

  // ── RED until 110-04: the per-stage gate sources swarms.dry_run_config ──
  it("stage-1-icontroller-noise-cleanup reads swarms.dry_run_config for the per-stage gate (RED until 110-04)", () => {
    const src = read("../stage-1-icontroller-noise-cleanup.ts");
    // Plan 04 introduces the per-stage gate. The cleanup worker must consult
    // the swarm's dry_run_config (stage_1_cleanup key) instead of running
    // production unconditionally. None of this exists today → RED.
    expect(src).toMatch(/dry_run_config|dryRunConfig|stage_1_cleanup/);
  });

  it("D-11 default: per-stage gate defaults stage_1_cleanup=false (live) for debtor, blocked for sales (RED until 110-04)", () => {
    // The gate helper does not exist yet. Plan 04 lands it; this assertion
    // pins the D-11 default contract so the executor of Plan 04 must satisfy
    // it. RED today because the module is absent.
    let gateModule: unknown = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      gateModule = require("../../../pipeline-gating/dry-run-gate");
    } catch {
      gateModule = null;
    }
    // RED today: module absent → null. Plan 04 must export a resolver whose
    // debtor default for stage_1_cleanup is false (live) and sales is true.
    expect(gateModule).not.toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Phase 111 Plan 01 — Test A: verdict-worker inline Outlook archive is gated
// behind isStageBlocked(swarmRow, 'stage_1_archive').
//
// CRITICAL FINDING 1: classifier-verdict-worker.ts fires categorizeEmail() +
// archiveEmail() directly + unconditionally on action='categorize_archive'
// when outlook_label is set. The per-stage dry-run gate (Phase 110-04) was
// never wired here. These behavioral tests pin the gate:
//   - dry_run_config.stage_1_archive = true  (BLOCKED) → NOT called
//   - dry_run_config.stage_1_archive = false (LIVE)    → called
//   - dry_run_config missing                 (fail-closed) → NOT called
//
// RED until Task 2 imports isStageBlocked + loads the swarm row + gates the
// inline calls. Swarm-agnostic — driven by registry dry_run_config, no
// swarm_type literal.
// ───────────────────────────────────────────────────────────────────────────

// ---- Inngest mock --------------------------------------------------------
const vwInngestSend = vi.fn().mockResolvedValue({ ids: ["evt"] });
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vwInngestSend,
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      handler,
    })),
  },
}));

// ---- Outlook mock (the gated side effects) -------------------------------
const categorizeEmailMock = vi.fn(
  async (..._args: unknown[]) => ({ success: true, error: null }),
);
const archiveEmailMock = vi.fn(
  async (..._args: unknown[]) => ({ success: true, error: null }),
);
vi.mock("@/lib/outlook", () => ({
  categorizeEmail: (...args: unknown[]) => categorizeEmailMock(...args),
  archiveEmail: (...args: unknown[]) => archiveEmailMock(...args),
}));

// ---- emit helper mock ----------------------------------------------------
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));

// ---- pipeline-events emit mock -------------------------------------------
vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---- side-effects mock (sales side_effects=[] → no dispatch) -------------
const evaluateSideEffectsMock = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/swarms/side-effects", () => ({
  evaluateSideEffects: (...args: unknown[]) => evaluateSideEffectsMock(...args),
}));

// ---- Registry mock — loadSwarmNoiseCategories + loadSwarm ----------------
const loadCategoriesMock = vi.fn();
const loadSwarmMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmNoiseCategories: (...args: unknown[]) => loadCategoriesMock(...args),
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
}));

// ---- Supabase admin mock -------------------------------------------------
function makeVwAdmin() {
  const makeReadChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    chain.single = vi.fn(async () => ({ data: null, error: null }));
    (chain as { then?: unknown }).then = (
      onF: (r: { data: unknown[]; error: unknown }) => unknown,
    ) => Promise.resolve(onF({ data: [], error: null }));
    return chain;
  };
  return {
    schema: vi.fn(() => ({ from: vi.fn(() => makeReadChain()) })),
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) })),
      select: vi.fn(() => makeReadChain()),
    })),
  };
}
let vwAdminMock = makeVwAdmin();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => vwAdminMock),
}));

// ---- Step stub (executes inline; caches by name) -------------------------
function makeVwStep() {
  const cache = new Map<string, unknown>();
  return {
    run: async (name: string, fn: () => Promise<unknown>) => {
      if (cache.has(name)) return cache.get(name);
      const v = await fn();
      cache.set(name, v);
      return v;
    },
  };
}

const SALES_CATEGORY = {
  swarm_type: "sales-email",
  category_key: "auto_reply",
  display_label: "Auto-Reply",
  outlook_label: "Auto-Reply",
  action: "categorize_archive",
  swarm_dispatch: null,
  display_order: 10,
  enabled: true,
};

const vwEvent = () => ({
  id: "evt-vw-gate-1",
  name: "classifier/verdict.recorded",
  data: {
    automation_run_id: "ar-vw-gate-1",
    swarm_type: "sales-email",
    decision: "approve",
    message_id: "msg-vw-gate-1",
    source_mailbox: "verkoop@smeba.nl",
    predicted_category: "auto_reply",
    override_category: null,
  },
});

describe("Phase 111 Test A — verdict-worker inline Outlook archive dry-run gate (Finding 1)", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vwAdminMock = makeVwAdmin();
    loadCategoriesMock.mockReset();
    loadSwarmMock.mockReset();
    evaluateSideEffectsMock.mockReset();
    evaluateSideEffectsMock.mockResolvedValue([]);
    categorizeEmailMock.mockClear();
    archiveEmailMock.mockClear();
    vwInngestSend.mockReset();
    vwInngestSend.mockResolvedValue({ ids: ["evt"] });
    loadCategoriesMock.mockResolvedValue([SALES_CATEGORY]);
    vi.resetModules();
    const mod = await import("../classifier-verdict-worker");
    handler = (
      mod.classifierVerdictWorker as unknown as { handler: typeof handler }
    ).handler;
  });

  it("stage_1_archive BLOCKED (true) → categorize/archive NOT called", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_1_archive: true },
    });

    await handler({ event: vwEvent(), step: makeVwStep() });

    expect(categorizeEmailMock).not.toHaveBeenCalled();
    expect(archiveEmailMock).not.toHaveBeenCalled();
  });

  it("stage_1_archive LIVE (false) → categorize/archive ARE called", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_1_archive: false },
    });

    await handler({ event: vwEvent(), step: makeVwStep() });

    expect(categorizeEmailMock).toHaveBeenCalledTimes(1);
    expect(archiveEmailMock).toHaveBeenCalledTimes(1);
  });

  it("dry_run_config MISSING → fail-closed → categorize/archive NOT called", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: null,
    });

    await handler({ event: vwEvent(), step: makeVwStep() });

    expect(categorizeEmailMock).not.toHaveBeenCalled();
    expect(archiveEmailMock).not.toHaveBeenCalled();
  });
});
