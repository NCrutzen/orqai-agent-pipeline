#!/usr/bin/env tsx
/**
 * Compares the ticket read-cache (support_tickets_cache) against the live ClickUp
 * "Support" list, so you can confirm the cache is in sync — e.g. after a deploy,
 * to verify the Zapier event-delivery is actually feeding clickup-cache-sync.
 *
 * Reports:
 *   - ClickUp task count vs cached row count
 *   - tasks present in ClickUp but missing from the cache (sync not flowing)
 *   - rows in the cache no longer in ClickUp (deleted-but-not-purged)
 *   - newest synced_at + its age (how fresh the cache is)
 *
 * Exit 0 = in sync; 1 = drift detected; 2 = misconfig/transport error.
 *
 * Usage:  npm run check:ticket-cache
 * (reads CLICKUP_API_TOKEN / CLICKUP_LIST_ID / NEXT_PUBLIC_SUPABASE_URL /
 *  SUPABASE_SERVICE_ROLE_KEY from web/.env.local, like the other check:* scripts.)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const token = process.env.CLICKUP_API_TOKEN;
const listId = process.env.CLICKUP_LIST_ID;
const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!token || !listId || !supaUrl || !srk) {
  console.error(
    "Missing env (need CLICKUP_API_TOKEN, CLICKUP_LIST_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).",
  );
  process.exit(2);
}

const CLICKUP_API = "https://api.clickup.com/api/v2";
const MAX_LIST = 25; // safety cap on previewed drift entries

/** All task ids on the Support list (include_closed so resolved/rejected count). */
async function clickupTaskIds(): Promise<string[]> {
  const ids: string[] = [];
  let page = 0;
  for (;;) {
    const res = await fetch(
      `${CLICKUP_API}/list/${listId}/task?include_closed=true&page=${page}`,
      { headers: { Authorization: token! } },
    );
    if (!res.ok) throw new Error(`ClickUp ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { tasks?: { id: string }[]; last_page?: boolean };
    const tasks = body.tasks ?? [];
    for (const t of tasks) ids.push(t.id);
    if (body.last_page === true || tasks.length === 0) break;
    page++;
  }
  return ids;
}

/** All cached rows (id + synced_at). */
async function cachedRows(): Promise<Array<{ external_task_id: string; synced_at: string }>> {
  const res = await fetch(
    `${supaUrl}/rest/v1/support_tickets_cache?select=external_task_id,synced_at`,
    {
      headers: {
        apikey: srk!,
        Authorization: `Bearer ${srk!}`,
        Range: "0-99999",
      },
    },
  );
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return (await res.json()) as Array<{ external_task_id: string; synced_at: string }>;
}

function preview(ids: string[]): string {
  if (ids.length <= MAX_LIST) return ids.join(", ");
  return `${ids.slice(0, MAX_LIST).join(", ")} … (+${ids.length - MAX_LIST} more)`;
}

async function main() {
  const [clickupIds, rows] = await Promise.all([clickupTaskIds(), cachedRows()]);

  const clickupSet = new Set(clickupIds);
  const cacheSet = new Set(rows.map((r) => r.external_task_id));

  const missingInCache = clickupIds.filter((id) => !cacheSet.has(id));
  const staleInCache = [...cacheSet].filter((id) => !clickupSet.has(id));

  const newest = rows.reduce<string | null>(
    (max, r) => (max === null || r.synced_at > max ? r.synced_at : max),
    null,
  );
  const ageMin =
    newest === null ? null : Math.round((Date.now() - new Date(newest).getTime()) / 60000);

  console.log(`ClickUp Support list : ${clickupIds.length} tasks`);
  console.log(`Cache                : ${cacheSet.size} rows`);
  console.log(
    `Newest synced_at     : ${newest ?? "(empty cache)"}${ageMin !== null ? `  (${ageMin} min ago)` : ""}`,
  );

  let ok = true;
  if (missingInCache.length) {
    ok = false;
    console.log(`\n⚠️  ${missingInCache.length} task(s) in ClickUp but NOT cached — sync not flowing:`);
    console.log(`    ${preview(missingInCache)}`);
  }
  if (staleInCache.length) {
    ok = false;
    console.log(`\n⚠️  ${staleInCache.length} cached row(s) no longer in ClickUp (deleted, not purged):`);
    console.log(`    ${preview(staleInCache)}`);
  }

  if (ok) {
    console.log("\n✅ Cache matches the ClickUp Support list.");
    process.exit(0);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(2);
});
