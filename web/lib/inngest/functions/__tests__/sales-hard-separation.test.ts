/**
 * Phase 113 Plan 04 Task 1 — HARD-SEPARATION guard (T-113-05 / T-113-SC).
 *
 * docs/agentic-pipeline/stage-3-coordinator.md locks the rule: a row exists in
 * EXACTLY ONE of swarm_noise_categories (Stage 1) or swarm_intents (Stage 3) —
 * never both. This test asserts that the sales-email intent_keys seeded by the
 * Plan 04 migration have ZERO intersection with the sales-email
 * swarm_noise_categories keys.
 *
 * Source-of-truth coupling: the test PARSES the seed migration file for the
 * sales intent_keys (so a future edit to the migration is caught here), and
 * holds the sales noise keys as an inline fixture mirroring the live
 * swarm_noise_categories rows (migrations 20260520_phase84 + the sales
 * calibration follow-ups). A collision is the highest-cost violation
 * (out-of-enum / noise-key leakage), so the assertion is exact-set, not a spot
 * check.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The Plan 04 seed migration (current-date prefix, orders after 20260609_*).
const MIGRATION_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
  "20260609b_phase113_sales_swarm_intents.sql",
);

// The 13 sales-email swarm_noise_categories keys (Stage 1 noise filter) — the
// hard-separation counterparty. None of these may appear in swarm_intents.
// Mirrors the live swarm_noise_categories rows for swarm_type='sales-email':
//   - the 8 agent_intent AP-noise keys (Phase 84, migration 20260520):
//       coupa_invoice_paid_notification, coupa_invoice_approved_notification,
//       iss_ptp_autoreply, frieslandcampina_portal_reject, m365_quarantine,
//       sender_phishing_notice, supplier_bank_change_notification,
//       own_outbound_invoice_loopback
//   - the generic Stage 1 noise keys carried by every swarm:
//       auto_reply, ooo_temporary, payment_admittance, system_notification,
//       unknown
const SALES_NOISE_KEYS = new Set<string>([
  // AP-automation FYI traffic (Phase 84).
  "coupa_invoice_paid_notification",
  "coupa_invoice_approved_notification",
  "iss_ptp_autoreply",
  "frieslandcampina_portal_reject",
  "m365_quarantine",
  "sender_phishing_notice",
  "supplier_bank_change_notification",
  "own_outbound_invoice_loopback",
  // Generic Stage 1 noise.
  "auto_reply",
  "ooo_temporary",
  "payment_admittance",
  "system_notification",
  "unknown",
]);

/** Parse the seeded sales-email intent_keys out of the migration INSERT. */
function seededSalesIntentKeys(): string[] {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const keys: string[] = [];
  // Match: ('sales-email', 'some_intent_key', …
  const re = /\(\s*'sales-email'\s*,\s*'([a-z][a-z0-9_]*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

describe("Phase 113 sales Stage 3 — hard separation (intents ⊥ noise keys)", () => {
  const seeded = seededSalesIntentKeys();

  it("the migration seeds a non-trivial vocabulary including 'other'", () => {
    expect(seeded.length).toBeGreaterThanOrEqual(2);
    expect(seeded).toContain("other");
  });

  it("NO seeded sales intent_key collides with a sales noise key (∅ intersection)", () => {
    const collisions = seeded.filter((k) => SALES_NOISE_KEYS.has(k));
    expect(collisions).toEqual([]);
  });

  it("conversely, no sales noise key leaks into the seeded intents", () => {
    const seededSet = new Set(seeded);
    const leaked = [...SALES_NOISE_KEYS].filter((k) => seededSet.has(k));
    expect(leaked).toEqual([]);
  });
});
