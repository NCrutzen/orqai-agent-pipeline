// Plan 04-05 Task 1 — vendor-signal.ts tests (RED → GREEN).
//
// Tests the pure function detectVendorSignal.
//
// SIX behaviors covered:
//   V1 - transcript contains keyword → { isVendorSignal:true, matched_keywords:[k1], system_key, vendor_locale, vendor_email }
//   V2 - case-insensitive: 'BUG IN NXT' vs vendor_signal_keywords=['nxt'] → match
//   V3 - empty vendor_signal_keywords array → { isVendorSignal:false }
//   V4 - proposed_system='unknown' (not in registry) → { isVendorSignal:false }
//   V5 - vendor_email null on registry row → isVendorSignal:true (keyword matched) but vendor_email:null
//   V6 - multiple keywords match → matched_keywords contains all hits (deduplicated)

import { describe, it, expect } from "vitest";

import { detectVendorSignal } from "../vendor-signal";
import type { VendorSignalRegistryRow } from "../vendor-signal";

// ---------------------------------------------------------------------------
// Registry fixtures
// ---------------------------------------------------------------------------

const NXT_ROW: VendorSignalRegistryRow = {
  system_key: "NXT",
  vendor_email: "support@nxt.example",
  vendor_locale: "nl",
  vendor_signal_keywords: ["nxt", "nxt crm", "nxt bug"],
};

const ICONTROLLER_ROW: VendorSignalRegistryRow = {
  system_key: "iController",
  vendor_email: "bugs@icontroller.example",
  vendor_locale: "en",
  vendor_signal_keywords: ["icontroller"],
};

const EMPTY_KEYWORDS_ROW: VendorSignalRegistryRow = {
  system_key: "NoKeywords",
  vendor_email: "noop@example.com",
  vendor_locale: "en",
  vendor_signal_keywords: [],
};

const NULL_EMAIL_ROW: VendorSignalRegistryRow = {
  system_key: "NullEmail",
  vendor_email: null,
  vendor_locale: "fr",
  vendor_signal_keywords: ["nullemail"],
};

const REGISTRY = [NXT_ROW, ICONTROLLER_ROW, EMPTY_KEYWORDS_ROW, NULL_EMAIL_ROW];

describe("detectVendorSignal", () => {
  it("V1: transcript contains keyword → isVendorSignal:true with matched keyword and system info", () => {
    const result = detectVendorSignal("There is a bug in nxt module", "NXT", REGISTRY);
    expect(result.isVendorSignal).toBe(true);
    expect(result.matched_keywords).toContain("nxt");
    expect(result.system_key).toBe("NXT");
    expect(result.vendor_locale).toBe("nl");
    expect(result.vendor_email).toBe("support@nxt.example");
  });

  it("V2: case-insensitive match — 'BUG IN NXT' vs keyword 'nxt'", () => {
    const result = detectVendorSignal("BUG IN NXT — crashes on save", "NXT", REGISTRY);
    expect(result.isVendorSignal).toBe(true);
    expect(result.matched_keywords).toContain("nxt");
  });

  it("V3: empty vendor_signal_keywords array → { isVendorSignal:false, matched_keywords:[] }", () => {
    const result = detectVendorSignal("some transcript about NoKeywords", "NoKeywords", REGISTRY);
    expect(result.isVendorSignal).toBe(false);
    expect(result.matched_keywords).toEqual([]);
  });

  it("V4: proposed_system not in registry → { isVendorSignal:false }", () => {
    const result = detectVendorSignal("transcript with nxt in it", "unknown", REGISTRY);
    expect(result.isVendorSignal).toBe(false);
    expect(result.system_key).toBeNull();
    expect(result.vendor_email).toBeNull();
    expect(result.vendor_locale).toBeNull();
  });

  it("V5: vendor_email null on registry row → isVendorSignal:true, vendor_email:null", () => {
    const result = detectVendorSignal("this has nullemail bug in it", "NullEmail", REGISTRY);
    expect(result.isVendorSignal).toBe(true);
    expect(result.matched_keywords).toContain("nullemail");
    expect(result.vendor_email).toBeNull();
    expect(result.vendor_locale).toBe("fr");
  });

  it("V6: multiple keywords match → matched_keywords contains all hits (deduplicated)", () => {
    const result = detectVendorSignal("nxt crm issue and also plain nxt crash plus nxt bug", "NXT", REGISTRY);
    expect(result.isVendorSignal).toBe(true);
    // Should contain all three keywords, deduplicated
    expect(result.matched_keywords).toContain("nxt");
    expect(result.matched_keywords).toContain("nxt crm");
    expect(result.matched_keywords).toContain("nxt bug");
    // Deduplicated — no repeats
    const unique = new Set(result.matched_keywords);
    expect(unique.size).toBe(result.matched_keywords.length);
  });
});
