/**
 * One-off local bootstrap for behavior-tracking folders that exceed Vercel's
 * 60s FUNCTION_INVOCATION_TIMEOUT inside the `swarm/behavior-sync` per-folder
 * step (2026-06-11: verkoop@ "Sugar Archive" / "Sent Items" never finish their
 * delta enumeration, blocking every folder after them in the loop — including
 * "afgehandeld/2026").
 *
 * Runs the EXACT same logic as the worker's `delta-<swarm>-<folderId>` step
 * (deltaPage → upsert outlook_delta_tokens with bootstrapped=true), but
 * locally, where no 60s cap applies. Bootstrap pages emit 0 signals by design,
 * so doing this out-of-band loses nothing. After this, the cron's steady-state
 * deltas are small and fit the limit.
 *
 * Usage:
 *   cd web && npx tsx scripts/bootstrap-behavior-folders.ts             # dry-run: lists folders missing a token
 *   cd web && npx tsx scripts/bootstrap-behavior-folders.ts --apply     # bootstrap them (Graph reads + token upserts)
 *
 * Auth: Zapier SDK keychain (npx zapier-sdk login) or ZAPIER_CREDENTIALS_* envs.
 * Supabase: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from web/.env.local.
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { deltaPage } from "../lib/email-behavior/delta-client";

const MAILBOX = "verkoop@smeba.nl";
const DELTA_PREFER = 'IdType="ImmutableId", odata.maxpagesize=100';

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!url || !key) {
  console.error("✗ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}
const admin = createClient(url.replace(/"/g, ""), key.replace(/"/g, ""));

const apply = process.argv.includes("--apply");

async function main() {
  const { data: folders, error } = await admin
    .from("outlook_folder_map")
    .select("folder_id, display_name, bucket")
    .eq("mailbox", MAILBOX);
  if (error) throw new Error(error.message);

  const { data: tokens } = await admin
    .from("outlook_delta_tokens")
    .select("folder_id")
    .eq("mailbox", MAILBOX);
  const have = new Set((tokens ?? []).map((t) => t.folder_id as string));

  const missing = (folders ?? []).filter((f) => !have.has(f.folder_id));
  console.log(`Folders zonder delta-token (${missing.length}):`);
  for (const f of missing) console.log(`  - ${f.display_name} [${f.bucket}]`);

  if (!apply) {
    console.log("\nDry-run. Re-run met --apply om te bootstrappen.");
    return;
  }

  // Smallest-first is not knowable upfront; just do them sequentially and log timing.
  for (const f of missing) {
    const t0 = Date.now();
    process.stdout.write(`→ bootstrap "${f.display_name}" … `);
    const page = await deltaPage({
      mailbox: MAILBOX,
      folderId: f.folder_id,
      deltaLinkOrNull: null,
      prefer: DELTA_PREFER,
    });
    const { error: upErr } = await admin.from("outlook_delta_tokens").upsert(
      {
        folder_id: f.folder_id,
        mailbox: MAILBOX,
        bucket: f.bucket,
        delta_link: page.deltaLink,
        bootstrapped: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "folder_id" },
    );
    if (upErr) throw new Error(`token upsert (${f.display_name}): ${upErr.message}`);
    console.log(
      `OK — ${page.events.length} items geënumereerd in ${Math.round((Date.now() - t0) / 1000)}s`,
    );
  }
  console.log("\n✓ Alle ontbrekende folders gebootstrapt.");
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
