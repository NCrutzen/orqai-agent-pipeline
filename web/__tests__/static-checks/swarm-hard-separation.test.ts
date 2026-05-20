// Phase 84 Pitfall 1 — see 84-RESEARCH.md.
//
// Hard-separation invariant: a (swarm_type, key) tuple exists in EXACTLY ONE
// of `public.swarm_noise_categories` or `public.swarm_intents`. Phase 75
// established this contract; Phase 84 introduces 8 new noise keys and this
// test prevents any accidental dual-registration regression.
//
// Today this test PASSES (the 8 Phase 84 keys exist in NEITHER table yet).
// Wave 1 (84-02) INSERTs the noise rows — the test must CONTINUE to pass.
// Any Wave-2+ accident that registers a Phase-84 key as a swarm_intents row
// would surface here.
//
// Implementation note: no `exec_sql` RPC is assumed (PATTERNS.md analog
// comment). The test reads both registries directly via .from() and computes
// the intersection client-side over (swarm_type, key) tuples.

import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, "..", "..", ".env.local") });

// Phase 84 D-01 — 8 locked noise category keys (CONTEXT.md, 2026-05-20).
// MUST stay in `swarm_noise_categories` ONLY, NEVER `swarm_intents`.
const PHASE_84_NOISE_KEYS = [
  "coupa_invoice_paid_notification",
  "coupa_invoice_approved_notification",
  "iss_ptp_autoreply",
  "frieslandcampina_portal_reject",
  "m365_quarantine",
  "sender_phishing_notice",
  "supplier_bank_change_notification",
  "own_outbound_invoice_loopback",
] as const;

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

const hasCreds = Boolean(url && key);

describe("Hard-separation invariant: swarm_noise_categories ∩ swarm_intents = ∅", () => {
  it.skipIf(!hasCreds)(
    "the 8 Phase 84 D-01 keys never appear simultaneously in both registries (Pitfall 1)",
    async () => {
      const admin = createClient(url, key);

      const { data: noiseRows, error: noiseErr } = await admin
        .from("swarm_noise_categories")
        .select("swarm_type, category_key")
        .in("category_key", PHASE_84_NOISE_KEYS as unknown as string[]);
      expect(noiseErr).toBeNull();

      const { data: intentRows, error: intentErr } = await admin
        .from("swarm_intents")
        .select("swarm_type, intent_key")
        .in("intent_key", PHASE_84_NOISE_KEYS as unknown as string[]);
      expect(intentErr).toBeNull();

      // Build (swarm_type, key) set for noise rows.
      const noiseTuples = new Set(
        (noiseRows ?? []).map(
          (r) => `${r.swarm_type}::${r.category_key}`,
        ),
      );

      // Intersection: any intent row whose (swarm_type, intent_key) tuple
      // also appears in noise rows is a hard-separation breach.
      const intersection = (intentRows ?? []).filter((r) =>
        noiseTuples.has(`${r.swarm_type}::${r.intent_key}`),
      );

      expect(intersection).toEqual([]);
    },
  );

  it.skipIf(!hasCreds)(
    "broader sweep: no (swarm_type, key) tuple from swarm_noise_categories overlaps with swarm_intents (full registries)",
    async () => {
      // Defence-in-depth — not scoped to the 8 Phase 84 keys; catches any
      // historical drift across the full registries. Independent of Phase 84
      // but co-located here so the invariant lives in one place.
      const admin = createClient(url, key);

      const { data: noiseRows, error: noiseErr } = await admin
        .from("swarm_noise_categories")
        .select("swarm_type, category_key");
      expect(noiseErr).toBeNull();

      const { data: intentRows, error: intentErr } = await admin
        .from("swarm_intents")
        .select("swarm_type, intent_key");
      expect(intentErr).toBeNull();

      const noiseTuples = new Set(
        (noiseRows ?? []).map(
          (r) => `${r.swarm_type}::${r.category_key}`,
        ),
      );
      const intersection = (intentRows ?? []).filter((r) =>
        noiseTuples.has(`${r.swarm_type}::${r.intent_key}`),
      );

      expect(intersection).toEqual([]);
    },
  );
});
