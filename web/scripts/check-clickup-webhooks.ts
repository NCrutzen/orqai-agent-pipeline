#!/usr/bin/env tsx
/**
 * Lists the ClickUp webhooks on every team the CLICKUP_API_TOKEN can see, and
 * checks whether the "Support" inbound webhook is subscribed to all the events
 * the ticket read-cache needs (created/updated/status/comment/deleted).
 *
 * Why: the cache-sync function (clickup-cache-sync.ts) re-fetches the full task
 * on ANY of these events, so missing one means that kind of change (e.g. a new
 * comment) never reaches the cache. Run this to verify operator-step 4 before
 * relying on the cache in production.
 *
 * Usage:
 *   CLICKUP_API_TOKEN=... npm run check:clickup-webhooks
 * (the token is read from web/.env.local automatically, like check:supabase.)
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const token = process.env.CLICKUP_API_TOKEN;
if (!token) {
  console.error("CLICKUP_API_TOKEN missing (looked in web/.env.local and environment).");
  process.exit(2);
}

// Events the read-cache relies on. ClickUp has no wildcard subscription — each
// must be selected explicitly when the webhook is created/updated.
const REQUIRED_EVENTS = [
  "taskCreated",
  "taskUpdated",
  "taskStatusUpdated",
  "taskCommentPosted",
  "taskDeleted",
] as const;

const API = "https://api.clickup.com/api/v2";

type Team = { id: string; name?: string };
type Webhook = {
  id: string;
  endpoint?: string;
  events?: string[];
  health?: { status?: string; fail_count?: number };
  task_id?: string | null;
  list_id?: string | null;
  space_id?: string | null;
  folder_id?: string | null;
};

async function clickup<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: token! } });
  if (!res.ok) {
    throw new Error(`ClickUp API ${res.status} for ${path}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function main() {
  const { teams } = await clickup<{ teams: Team[] }>("/team");
  if (!teams?.length) {
    console.error("No teams visible to this token.");
    process.exit(1);
  }

  let sawSupportWebhook = false;
  let allGood = true;

  for (const team of teams) {
    const { webhooks } = await clickup<{ webhooks: Webhook[] }>(`/team/${team.id}/webhook`);
    console.log(`\nTeam ${team.id}${team.name ? ` (${team.name})` : ""} — ${webhooks.length} webhook(s)`);

    for (const wh of webhooks) {
      const scope =
        wh.list_id ? `list ${wh.list_id}` :
        wh.space_id ? `space ${wh.space_id}` :
        wh.folder_id ? `folder ${wh.folder_id}` :
        wh.task_id ? `task ${wh.task_id}` : "team-wide";
      console.log(`\n  • ${wh.endpoint ?? "(no endpoint)"}`);
      console.log(`    id=${wh.id}  scope=${scope}  health=${wh.health?.status ?? "?"}`);
      console.log(`    events: ${(wh.events ?? []).join(", ") || "(none)"}`);

      // Treat the cache-feeding webhook as the one pointing at our route.
      const isSupport = (wh.endpoint ?? "").includes("/support-tickets/clickup-webhook");
      if (!isSupport) continue;
      sawSupportWebhook = true;

      const missing = REQUIRED_EVENTS.filter((e) => !(wh.events ?? []).includes(e));
      if (missing.length === 0) {
        console.log("    ✅ subscribed to all events the read-cache needs");
      } else {
        allGood = false;
        console.log(`    ⚠️  MISSING required events: ${missing.join(", ")}`);
      }
    }
  }

  if (!sawSupportWebhook) {
    console.log(
      "\n⚠️  No webhook endpoint matching '/support-tickets/clickup-webhook' was found.\n" +
        "    Either it isn't registered yet, or it's fronted by a Zapier/automation shim\n" +
        "    (the route expects a body 'auth' field) whose endpoint differs — verify the\n" +
        "    event subscriptions on whatever forwards to that route.",
    );
    process.exit(1);
  }

  process.exit(allGood ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(2);
});
