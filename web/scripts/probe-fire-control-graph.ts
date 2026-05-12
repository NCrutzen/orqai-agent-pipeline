// Diagnostic probe for fire-control-graph-405 debug session.
//
// Exercises Microsoft Graph through the same Zapier Outlook connection
// (zapier@moyneroberts.com / connection 56014785) used by Stage 0
// categorize+archive, but tries MULTIPLE addressing strategies — NOT only the
// /users/{shared-mailbox} cross-user shape. Goal: prove whether the 405 is
// shared-mailbox-addressing-specific or affects every approach to fire-control.
//
// Read-only by default. The PATCH probe (#5) re-sets the message's existing
// categories to themselves — a no-op write that still triggers the same auth
// path as the real categorize call.
//
// Usage:
//   tsx web/scripts/probe-fire-control-graph.ts
//
// Env: requires Zapier SDK auth (keychain via `npx zapier-sdk login` locally,
// or ZAPIER_CREDENTIALS_CLIENT_ID/SECRET on Vercel).

import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { createZapierSdk } from "@zapier/zapier-sdk";

loadDotenv({ path: path.resolve(__dirname, "..", ".env.local") });

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const OUTLOOK_CONNECTION_ID = "56014785";
const FIRE_CONTROL = "administratie@fire-control.nl";

// Most recent fire-control message at script-write time. Override via
// FIRE_CONTROL_MSG_ID env if you want to probe a different one.
const MESSAGE_ID =
  process.env.FIRE_CONTROL_MSG_ID ??
  "AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0AKOHINYZLcUeBaDTqXgXywAAAKu4RwAAA";

const zapier = createZapierSdk();

async function gfetch(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; ok: boolean; body: string }> {
  const fullUrl = url.startsWith("http") ? url : `${GRAPH_BASE}${url}`;
  const opts: Record<string, unknown> = {
    method: init.method ?? "GET",
    connectionId: OUTLOOK_CONNECTION_ID,
  };
  if (init.body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(init.body);
  }
  try {
    const res = await zapier.fetch(fullUrl, opts);
    const text = await res.text();
    return { status: res.status, ok: res.ok, body: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 0, ok: false, body: `THROWN: ${msg}` };
  }
}

function trunc(s: string, n = 400): string {
  return s.length > n ? s.slice(0, n) + `… (${s.length - n} more bytes)` : s;
}

async function probe(label: string, fn: () => Promise<{ status: number; ok: boolean; body: string }>) {
  console.log(`\n── ${label} ──`);
  const r = await fn();
  console.log(`  status: ${r.status} ${r.ok ? "OK" : "FAIL"}`);
  console.log(`  body:   ${trunc(r.body)}`);
  return r;
}

async function main() {
  console.log(`Probing Graph via Zapier connection ${OUTLOOK_CONNECTION_ID} (zapier@moyneroberts.com)`);
  console.log(`Target mailbox: ${FIRE_CONTROL}`);
  console.log(`Message id:     ${MESSAGE_ID}`);

  // 1. Who am I? Confirms which UPN the OAuth token is bound to.
  await probe("1. GET /me  (auth principal)", () => gfetch("/me"));

  // 2. Can we read /me's own mailbox at all?
  await probe("2. GET /me/messages?$top=1  (own mailbox read)", () =>
    gfetch("/me/messages?$top=1&$select=id,subject,from"),
  );

  // 3. What mailboxes does the connection user see in /me/mailFolders?
  await probe("3. GET /me/mailFolders?$top=20  (own folder list)", () =>
    gfetch("/me/mailFolders?$top=20&$select=id,displayName,wellKnownName"),
  );

  // 4. Does the fire-control message appear under /me via auto-mapping?
  await probe("4. GET /me/messages/{fc-id}  (auto-mapping probe)", () =>
    gfetch(`/me/messages/${encodeURIComponent(MESSAGE_ID)}?$select=id,subject,from`),
  );

  // 5. Cross-user read — same shape as the working ingest path.
  await probe("5. GET /users/{fc}/messages?$top=1  (cross-user read baseline)", () =>
    gfetch(`/users/${encodeURIComponent(FIRE_CONTROL)}/messages?$top=1&$select=id,subject`),
  );

  // 6. Cross-user single-message read — the GET that precedes categorize.
  const single = await probe(
    "6. GET /users/{fc}/messages/{id}  (single-message read)",
    () =>
      gfetch(
        `/users/${encodeURIComponent(FIRE_CONTROL)}/messages/${encodeURIComponent(MESSAGE_ID)}?$select=id,subject,categories`,
      ),
  );

  // 7. Cross-user PATCH — reproduces the failing categorize call.
  // Use the message's current categories as a no-op write so we don't change state.
  let categories: string[] = [];
  try {
    const parsed = JSON.parse(single.body) as { categories?: string[] };
    categories = parsed.categories ?? [];
  } catch {
    // GET failed or non-JSON; PATCH with empty array (still hits same auth path)
  }
  await probe(
    `7. PATCH /users/{fc}/messages/{id}  (no-op categorize, reproduces 405)`,
    () =>
      gfetch(
        `/users/${encodeURIComponent(FIRE_CONTROL)}/messages/${encodeURIComponent(MESSAGE_ID)}`,
        { method: "PATCH", body: { categories } },
      ),
  );

  // 8. Try via the inbox-folder path instead of bare /messages/{id}.
  await probe(
    "8. GET /users/{fc}/mailFolders/inbox/messages/{id}  (folder-scoped read)",
    () =>
      gfetch(
        `/users/${encodeURIComponent(FIRE_CONTROL)}/mailFolders/inbox/messages/${encodeURIComponent(MESSAGE_ID)}?$select=id,subject`,
      ),
  );

  // 9. PATCH via folder-scoped path — sometimes Graph requires the folder
  // segment when delegated permissions are folder-bound.
  await probe(
    "9. PATCH /users/{fc}/mailFolders/inbox/messages/{id}  (folder-scoped no-op write)",
    () =>
      gfetch(
        `/users/${encodeURIComponent(FIRE_CONTROL)}/mailFolders/inbox/messages/${encodeURIComponent(MESSAGE_ID)}`,
        { method: "PATCH", body: { categories } },
      ),
  );

  // 10. List /users (does the connection have any directory read scope?)
  // Useful sanity — confirms the failure mode is permission-scoped, not API-scoped.
  await probe("10. GET /users/{fc}  (user-object read)", () =>
    gfetch(`/users/${encodeURIComponent(FIRE_CONTROL)}?$select=id,userPrincipalName,mail`),
  );

  console.log(`\n── done ──`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
