// Phase 112 Plan 01 Task 1 — RED-first tests for the backfill disposition
// split (D-05/D-06) and the Graph-id-aware candidate resolution (D-07 /
// Pitfall 4). Implementation files (GREEN): ../disposition.ts and
// ../select-backfill-candidates.ts.
//
// Behaviour map (PLAN.md Task 1):
//   1  AUTO set = registry rows action='categorize_archive' minus loopback
//   2  predicted='own_outbound_invoice_loopback' → 'skip'
//   3  payment_admittance / unknown → 'queue' (even at high confidence)
//   4  AUTO-set key high-conf → 'auto'; low/medium → 'queue'
//   5  registry row with action!='categorize_archive' → 'queue', never 'auto'
//   6  candidate with source_id → graphId=source_id, no live-presence lookup;
//      candidate without source_id → needsLivePresenceLookup=true (no crash)
//   7  purity — same input yields same output (no clock/random)

import { describe, it, expect } from "vitest";
import {
  buildAutoKeySet,
  classifyDisposition,
} from "../disposition";
import { resolveGraphIdSource } from "../select-backfill-candidates";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";

// Minimal registry fixture mirroring the live sales-email noise set: the 3
// flipped safe keys + the 7 inherited AP keys carry categorize_archive,
// loopback also carries categorize_archive (so the filter must drop it),
// payment_admittance + unknown stay manual_review.
function cat(
  category_key: string,
  action: SwarmNoiseCategoryRow["action"],
): SwarmNoiseCategoryRow {
  return {
    swarm_type: "sales-email",
    category_key,
    display_label: category_key,
    outlook_label: action === "categorize_archive" ? "Noise" : null,
    action,
    swarm_dispatch: null,
    display_order: 0,
    enabled: true,
  };
}

const REGISTRY: SwarmNoiseCategoryRow[] = [
  cat("auto_reply", "categorize_archive"),
  cat("ooo_temporary", "categorize_archive"),
  cat("ooo_permanent", "categorize_archive"),
  cat("delivery_status_notification", "categorize_archive"),
  cat("calendar_notification", "categorize_archive"),
  cat("own_outbound_invoice_loopback", "categorize_archive"), // MUST be dropped
  cat("payment_admittance", "manual_review"),
  cat("unknown", "manual_review"),
];

describe("buildAutoKeySet (D-05/D-06)", () => {
  it("1: derives the auto set from action='categorize_archive' minus loopback", () => {
    const auto = buildAutoKeySet(REGISTRY);
    const expected = new Set([
      "auto_reply",
      "ooo_temporary",
      "ooo_permanent",
      "delivery_status_notification",
      "calendar_notification",
    ]);
    expect(auto).toEqual(expected);
    // loopback explicitly excluded even though its action is categorize_archive
    expect(auto.has("own_outbound_invoice_loopback")).toBe(false);
    // manual_review keys never enter the auto set
    expect(auto.has("payment_admittance")).toBe(false);
    expect(auto.has("unknown")).toBe(false);
  });

  it("5: a registry key with action!='categorize_archive' is never in the auto set", () => {
    const auto = buildAutoKeySet([cat("payment_admittance", "manual_review")]);
    expect(auto.size).toBe(0);
  });
});

describe("classifyDisposition (D-05/D-06)", () => {
  const AUTO = buildAutoKeySet(REGISTRY);

  it("2: own_outbound_invoice_loopback → 'skip' (not auto, not queue)", () => {
    expect(
      classifyDisposition("own_outbound_invoice_loopback", "high", AUTO),
    ).toBe("skip");
    // skip short-circuits regardless of confidence
    expect(
      classifyDisposition("own_outbound_invoice_loopback", "low", AUTO),
    ).toBe("skip");
  });

  it("3: payment_admittance + unknown → 'queue' even at high confidence", () => {
    expect(classifyDisposition("payment_admittance", "high", AUTO)).toBe(
      "queue",
    );
    expect(classifyDisposition("unknown", "high", AUTO)).toBe("queue");
  });

  it("4: auto-set key high-conf → 'auto'; low/medium → 'queue'", () => {
    expect(classifyDisposition("auto_reply", "high", AUTO)).toBe("auto");
    expect(classifyDisposition("auto_reply", "medium", AUTO)).toBe("queue");
    expect(classifyDisposition("auto_reply", "low", AUTO)).toBe("queue");
  });

  it("5: a non-auto-set predicted key → 'queue', never 'auto'", () => {
    expect(classifyDisposition("payment_admittance", "high", AUTO)).toBe(
      "queue",
    );
  });
});

describe("resolveGraphIdSource (D-07 / Pitfall 4)", () => {
  it("6: source_id present → graphId=source_id, no live-presence lookup", () => {
    const r = resolveGraphIdSource({
      email_id: "e-1",
      source_id: "AAMkAGraph123",
      internet_message_id: "<rfc-abc@smeba.nl>",
    });
    expect(r.graphId).toBe("AAMkAGraph123");
    expect(r.needsLivePresenceLookup).toBe(false);
  });

  it("6: source_id absent → needs live-presence lookup, no crash", () => {
    const r = resolveGraphIdSource({
      email_id: "e-2",
      source_id: null,
      internet_message_id: "<rfc-def@smeba.nl>",
    });
    expect(r.graphId).toBeNull();
    expect(r.needsLivePresenceLookup).toBe(true);
  });

  it("7: purity — same input yields the same output", () => {
    const input = {
      email_id: "e-3",
      source_id: "AAMkGraphZ",
      internet_message_id: "<z@smeba.nl>",
    };
    expect(resolveGraphIdSource(input)).toEqual(resolveGraphIdSource(input));
  });
});
