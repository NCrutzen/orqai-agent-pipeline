// Phase 135 Plan 01 Task 1 (MODEL-03 / MODEL-05 / D-05-R) — RED scaffold for the
// derived per-mailbox lifecycle mode.
//
// This file is RED ON PURPOSE until 135-02 lands: it imports `deriveMailboxMode`
// from the gate module, a symbol that does NOT exist pre-cutover. The cutover
// (135-02) renames `dry_run_config`→`gating_config`, promotes the handler map to
// a tri-state (`off|dry|live`), and adds this pure derive fn co-located with the
// five gate helpers. These assertions pin the RESEARCH Pattern 3 ladder so the
// cutover is provably correct, not assumed.
//
// Derive ladder (D-01 / D-02, from 135-RESEARCH Pattern 3):
//   Live   = at least one real side-effect fires — ANY live handler, OR any
//            released forward bucket, OR archive live (stage_1_archive===false),
//            OR cleanup live (stage_1_cleanup===false). Highest-wins (D-02).
//   Dry    = the AI: label write is live (stage_3_intent_label===false) but NO
//            real side-effect fires.
//   Shadow = neither — fail-closed default for a new/empty swarm (MODEL-05).
//
// Fixtures use the POST-cutover `gating_config` key (RED until 135-02 renames
// the interface) and the tri-state handler strings.

import { describe, it, expect } from "vitest";
// RED: `deriveMailboxMode` is not exported pre-cutover (135-02 adds it). The
// import resolves to `undefined`, so every assertion below throws/fails now and
// only passes once 135-02 ships the fn.
import { deriveMailboxMode } from "../index";

// Loose post-cutover swarm shape: `gating_config` jsonb with tri-state handlers.
// (esbuild strips these types at test time; the runtime RED is the missing fn.)
interface GatingConfigShape {
  stage_1_archive?: boolean;
  stage_1_cleanup?: boolean;
  stage_2_resolution?: boolean;
  stage_3_labeling?: boolean;
  stage_3_routing?: boolean;
  stage_3_intent_label?: boolean;
  stage_4_handlers?: Record<string, "off" | "dry" | "live">;
  stage_4_forward_buckets?: Record<string, boolean>;
}
function swarm(gating_config: GatingConfigShape | null | undefined) {
  return { gating_config } as unknown as Parameters<typeof deriveMailboxMode>[0];
}

describe("deriveMailboxMode — derived lifecycle (MODEL-03 / MODEL-05 / D-05-R)", () => {
  it("missing / null gating_config → Shadow (MODEL-05 fail-closed; new-swarm default)", () => {
    // The DISTINCT fail-closed default for a brand-new swarm — kept SEPARATE
    // from the sales-Dry case below (that one PRESENTS held flags).
    expect(deriveMailboxMode(swarm(null))).toBe("Shadow");
    expect(deriveMailboxMode(swarm(undefined))).toBe("Shadow");
    expect(deriveMailboxMode(swarm({}))).toBe("Shadow");
  });

  it("support-tickets-shaped empty config → Shadow (D-08 dormant)", () => {
    // support-tickets is enabled but has zero gating flags → every flag missing
    // → fail-closed → Shadow.
    expect(deriveMailboxMode(swarm({ stage_4_handlers: {} }))).toBe("Shadow");
  });

  it("Dry ladder: archive+cleanup held, label live, no side-effect → Dry (D-01)", () => {
    // Generic Dry-ladder pin (abstract, NOT the sales row — see the sales-applied
    // case below). When archive + cleanup are HELD, no live handler, no released
    // bucket, but the AI: label write is live (stage_3_intent_label=false), the
    // derive fn must return "Dry" (operator-visible, nothing acts), not "Live".
    expect(
      deriveMailboxMode(
        swarm({
          stage_1_archive: true, // HELD
          stage_1_cleanup: true, // held
          stage_2_resolution: true, // held
          stage_3_labeling: true, // held
          stage_3_routing: false, // routing live (no side-effect by itself)
          stage_3_intent_label: false, // AI: label LIVE → operator-visible → Dry, not Shadow
          stage_4_handlers: {},
        }),
      ),
    ).toBe("Dry");
  });

  it("sales-email APPLIED seed (archive LIVE, label live, no handlers) → Live (OQ-3 Path A falsified → Option A)", () => {
    // The ACTUAL applied sales-email live seed (135-05). OQ-3 Path A's "archive
    // inert → hold → Dry" premise was FALSIFIED: sales stage_1_archive is live +
    // firing (12 sales swarm_noise_categories carry outlook_label +
    // categorize_archive; classifier-verdict-worker.ts fires a live Outlook
    // archive). Operator decision = Option A (accept sales = Live, honor D-09 "no
    // behavior change at cutover"); migration applied AS AUTHORED with NO sales
    // UPDATE. archive live (stage_1_archive=false) is a live side-effect → the
    // derive fn must return "Live" (highest-wins, D-02), NOT "Dry".
    expect(
      deriveMailboxMode(
        swarm({
          stage_1_archive: false, // LIVE + firing (OQ-3 Path A falsified)
          stage_1_cleanup: true, // held
          stage_2_resolution: true, // held
          stage_3_labeling: true, // held
          stage_3_routing: false, // LIVE
          stage_3_intent_label: false, // AI: label live
          stage_4_handlers: {},
        }),
      ),
    ).toBe("Live");
  });

  it("debtor-shaped config (cleanup handler live) → Live (D-06 highest-wins, D-02)", () => {
    expect(
      deriveMailboxMode(
        swarm({
          stage_1_archive: false, // archive live
          stage_3_routing: false,
          stage_3_intent_label: false,
          stage_4_handlers: { "invoice-copy": "dry", stage_1_cleanup: "live" },
        }),
      ),
    ).toBe("Live");
  });

  it("info-routing-shaped config (forward bucket released) → Live (D-07 highest-wins)", () => {
    expect(
      deriveMailboxMode(
        swarm({
          stage_1_archive: false, // archive live
          stage_3_routing: true, // routing HELD (Pitfall 2 — info-routing keeps routing held)
          stage_4_forward_buckets: { verkoop: true, opleidingen: true },
        }),
      ),
    ).toBe("Live");
  });

  it("mixed handlers (one live, one dry) → Live (D-02 highest-wins)", () => {
    expect(
      deriveMailboxMode(
        swarm({
          stage_1_archive: true, // held — so liveness comes ONLY from the live handler
          stage_3_intent_label: false,
          stage_4_handlers: { "invoice-copy": "dry", "label-resolver": "live" },
        }),
      ),
    ).toBe("Live");
  });
});
