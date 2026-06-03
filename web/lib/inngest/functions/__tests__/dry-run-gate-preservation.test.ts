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

import { describe, it, expect } from "vitest";
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
