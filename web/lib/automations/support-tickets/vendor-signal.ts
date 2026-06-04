// Plan 04-05 Task 2 — Vendor signal detection pure function.
//
// Checks a ticket transcript against vendor_signal_keywords[] from the
// support_software_systems registry to determine if the issue involves a
// third-party vendor and a vendor-draft email should be produced.
//
// Pure function — no DB calls, no side effects. Takes the registry rows as
// input so callers (clickup-escalate-handler, vendor-draft-handler) can pass
// the already-loaded row without additional DB round-trips.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VendorSignalRegistryRow {
  system_key: string;
  vendor_email: string | null;
  vendor_locale: string | null;
  vendor_signal_keywords: string[] | null;
}

export interface VendorSignalResult {
  isVendorSignal: boolean;
  matched_keywords: string[];
  system_key: string | null;
  vendor_locale: string | null;
  vendor_email: string | null;
}

// ---------------------------------------------------------------------------
// detectVendorSignal
// ---------------------------------------------------------------------------

/**
 * Detect whether the transcript for a given proposed_system contains any
 * vendor signal keywords from the registry.
 *
 * Rules:
 *   - If proposedSystem is null or not in registry → isVendorSignal:false
 *   - If row.vendor_signal_keywords is null or empty → isVendorSignal:false
 *   - Keyword matching is case-insensitive
 *   - Multiple matching keywords are collected and deduplicated
 *   - vendor_email may be null even when isVendorSignal:true (V5) — handlers
 *     decide what to do with a null vendor_email
 *
 * @param transcript - The ticket transcript (may be null)
 * @param proposedSystem - system_key to look up in registry (may be null)
 * @param registry - Array of VendorSignalRegistryRow from support_software_systems
 */
export function detectVendorSignal(
  transcript: string | null,
  proposedSystem: string | null,
  registry: VendorSignalRegistryRow[],
): VendorSignalResult {
  const NO_SIGNAL: VendorSignalResult = {
    isVendorSignal: false,
    matched_keywords: [],
    system_key: null,
    vendor_locale: null,
    vendor_email: null,
  };

  // Guard: no proposed system
  if (!proposedSystem) return NO_SIGNAL;

  // Look up registry row by system_key
  const row = registry.find((r) => r.system_key === proposedSystem);
  if (!row) return NO_SIGNAL;

  // Guard: empty or null keywords
  const keywords = row.vendor_signal_keywords ?? [];
  if (keywords.length === 0) {
    return {
      isVendorSignal: false,
      matched_keywords: [],
      system_key: row.system_key,
      vendor_locale: row.vendor_locale,
      vendor_email: row.vendor_email,
    };
  }

  // Guard: null transcript — no text to match against
  if (!transcript) {
    return {
      isVendorSignal: false,
      matched_keywords: [],
      system_key: row.system_key,
      vendor_locale: row.vendor_locale,
      vendor_email: row.vendor_email,
    };
  }

  // Lowercase transcript once for efficiency
  const lowercaseTranscript = transcript.toLowerCase();

  // Collect all matching keywords (deduplicated via Set)
  const matchedSet = new Set<string>();
  for (const kw of keywords) {
    const lowercaseKw = kw.toLowerCase();
    if (lowercaseTranscript.includes(lowercaseKw)) {
      matchedSet.add(kw); // preserve original casing
    }
  }

  const matched_keywords = Array.from(matchedSet);

  return {
    isVendorSignal: matched_keywords.length > 0,
    matched_keywords,
    system_key: row.system_key,
    vendor_locale: row.vendor_locale,
    vendor_email: row.vendor_email,
  };
}
