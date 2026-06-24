#!/usr/bin/env tsx
/**
 * Phase 132.1 Plan 03 Task 2 (D-03 colour go-live) — the ACTIVATION home for the
 * `ensureRoutingMasterCategories` provisioning that Plan 02 BUILT but left inert.
 *
 * Plan 02 added `ensureRoutingMasterCategories(mailbox, buckets)` to
 * web/lib/outlook/client.ts (idempotent GET-before-POST; provisions every routing
 * master-category with the ONE chosen non-grey colour `preset5`). It does NOTHING
 * until it is INVOKED per mailbox. This script is that invocation: it fires the
 * ensure-call for EXACTLY the two info@ mailboxes so the D-03 non-grey routing
 * colour goes live and operators distinguish routing labels from the grey `AI:`
 * intent labels.
 *
 * Buckets are sourced from the routing_destinations REGISTRY (via
 * loadRoutingDestinations), never a hard-coded list — same source the coordinator
 * verdict uses. The `unrouted` framework sentinel is excluded (it is the
 * no-destination/triage outcome, not a forwardable bucket; triage has its own
 * static category from buildRoutingCategory).
 *
 * Idempotent by construction (GET-before-POST in Plan 02): re-running creates no
 * duplicate master-category — safe to run twice to PROVE idempotency (threat
 * T-132.1-11: never PATCH/delete, only POST the missing names).
 *
 * Usage:
 *   cd web && npx tsx scripts/ensure-info-routing-categories.ts
 *   cd web && npx tsx scripts/ensure-info-routing-categories.ts --dry-run   # print buckets only, no Graph writes
 *
 * Reads SUPABASE + Graph credentials from web/.env.local.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

import { createAdminClient } from "../lib/supabase/admin";
import { loadRoutingDestinations, UNROUTED_BUCKET } from "../lib/swarms/registry";
import {
  ensureRoutingMasterCategories,
  ROUTING_CATEGORY_PRESET_COLOR,
} from "../lib/outlook/client";

const INFO_MAILBOXES = ["info@smeba.nl", "info@fire-control.nl"] as const;
const SWARM_TYPE = "info-routing";
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const admin = createAdminClient();

  // Source the active routing buckets from the registry — NOT a hard-coded list.
  const destinations = await loadRoutingDestinations(admin, SWARM_TYPE);
  const buckets = [
    ...new Set(
      destinations
        .map((d) => d.destination_key)
        .filter((b) => b !== UNROUTED_BUCKET),
    ),
  ].sort();

  if (buckets.length === 0) {
    console.error(
      `No active routing_destinations for swarm_type='${SWARM_TYPE}' — nothing to provision.`,
    );
    process.exit(1);
  }

  console.log(`swarm_type:        ${SWARM_TYPE}`);
  console.log(`preset colour:     ${ROUTING_CATEGORY_PRESET_COLOR} (non-grey)`);
  console.log(`buckets (registry): ${JSON.stringify(buckets)}`);
  console.log(`mailboxes:         ${JSON.stringify(INFO_MAILBOXES)}\n`);

  if (DRY_RUN) {
    console.log("--dry-run: no Graph writes performed.");
    return;
  }

  for (const mailbox of INFO_MAILBOXES) {
    try {
      const { created, existing } = await ensureRoutingMasterCategories(
        mailbox,
        buckets,
      );
      console.log(
        `${mailbox}: existing=${existing} created=${created.length}` +
          (created.length ? ` → ${JSON.stringify(created)}` : " (idempotent no-op)"),
      );
    } catch (err) {
      console.error(`${mailbox}: ensureRoutingMasterCategories FAILED:`, String(err));
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
