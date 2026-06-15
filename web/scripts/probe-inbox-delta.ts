/**
 * Read-only probe: call the STORED inbox + 2026 delta links once and print
 * what Graph returns. Does NOT touch outlook_delta_tokens — a deltaLink is a
 * stateless cursor; the worker will re-consume the same events on its next tick.
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import { graphFetch } from "../lib/outlook/client";

const url = (
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
).replace(/"/g, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/"/g, "");
const admin = createClient(url, key);

const FOLDERS: Record<string, string> = {
  Inbox:
    "AQMkADlkNmVhNWJmLTM3YWQtNDhjZC1hOGNlLTg1MTEAYjJmODdmNzYALgAAAyQqelWWK5RJn1IhLYHXoDoBAMSB4CExleJKpu1M1yAj6bkAAAIBDAAAAA==",
  "2026":
    "AAMkADlkNmVhNWJmLTM3YWQtNDhjZC1hOGNlLTg1MTFiMmY4N2Y3NgAuAAAAAAAkKnpVliuUSZ9SIS2B16A6AQDEgeAhMZXiSqbtTNcgI_m5AAKaztw9AAA=",
};

async function main() {
  for (const [name, folderId] of Object.entries(FOLDERS)) {
    const { data } = await admin
      .from("outlook_delta_tokens")
      .select("delta_link")
      .eq("folder_id", folderId)
      .maybeSingle();
    const link = (data as { delta_link?: string } | null)?.delta_link;
    if (!link) {
      console.log(`${name}: geen delta_link`);
      continue;
    }
    const res = await graphFetch(link, {
      method: "GET",
      prefer: 'IdType="ImmutableId", odata.maxpagesize=100',
    });
    const body = (await res.json()) as {
      value?: Record<string, unknown>[];
      "@odata.nextLink"?: string;
      error?: { code?: string; message?: string };
    };
    if (!res.ok) {
      console.log(`${name}: HTTP ${res.status} — ${body.error?.code}: ${(body.error?.message ?? "").slice(0, 120)}`);
      continue;
    }
    const events = body.value ?? [];
    console.log(`${name}: ${events.length} pending events${body["@odata.nextLink"] ? " (+nextLink)" : ""}`);
    for (const ev of events.slice(0, 6)) {
      const removed = (ev["@removed"] as { reason?: string } | undefined)?.reason;
      const subj = (ev as { subject?: string }).subject ?? "";
      console.log(`  - ${removed ? `@removed(${removed})` : "changed/new"} ${subj.slice(0, 50)} id=${String(ev.id).slice(0, 20)}…`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
