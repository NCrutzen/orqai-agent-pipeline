import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// --- Config ---
const SUGAR_BASE = `${process.env.SUGARCRM_URL}/rest/v11_0`;
const TEAM_FILTER = "Smeba Brandbeveiliging";
const DATE_FROM = "2025-04-15T00:00:00";
const DIRECTIONS = ["Inbound", "Outbound", "Internal"];
const PAGE_SIZE = 100;
const INSERT_BATCH_SIZE = 50;

// Supabase client targeting the email_pipeline schema (shared with debtor)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { db: { schema: "email_pipeline" } }
);

// --- SugarCRM Auth ---
let accessToken = "";
let tokenExpiry = 0;

async function authenticate(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry - 60_000) return accessToken;

  console.log("  [auth] Refreshing SugarCRM token...");
  const res = await fetch(`${SUGAR_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: "sugar",
      client_secret: "",
      username: process.env.SUGARCRM_USERNAME,
      password: process.env.SUGARCRM_PASSWORD,
      platform: "base",
    }),
  });

  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return accessToken;
}

// --- Fetch one page from SugarCRM ---
async function fetchPage(
  direction: string,
  offset: number
): Promise<{ records: any[]; nextOffset: number }> {
  const token = await authenticate();

  const res = await fetch(`${SUGAR_BASE}/Emails/filter`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "OAuth-Token": token,
    },
    body: JSON.stringify({
      filter: [
        { team_name: { $contains: TEAM_FILTER } },
        { date_sent: { $gte: DATE_FROM } },
        { direction },
      ],
      fields: [
        "id",
        "name",
        "date_sent",
        "from_addr_name",
        "to_addrs_names",
        "description",
        "description_html",
        "direction",
        "state",
        "type",
        "status",
        "flagged",
        "message_id",
        "parent_type",
        "parent_name",
        "parent_id",
        "assigned_user_name",
        "team_name",
        "total_attachments",
        "tag",
      ].join(","),
      max_num: PAGE_SIZE,
      offset,
      order_by: "date_sent:ASC",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fetch failed (${res.status}): ${body.substring(0, 300)}`);
  }

  const data = await res.json();
  return {
    records: data.records || [],
    nextOffset: data.next_offset ?? -1,
  };
}

// --- Parse SugarCRM email → Supabase row ---
function parseEmail(record: any) {
  // Extract sender email and name from "Name <email>" format
  const fromMatch = (record.from_addr_name || "").match(
    /^(.*?)\s*<([^>]+)>$/
  );
  const senderName = fromMatch ? fromMatch[1].trim() : record.from_addr_name;
  const senderEmail = fromMatch ? fromMatch[2].trim() : null;

  // Parse recipients from "Name <email>, Name2 <email2>" format
  const recipientParts = (record.to_addrs_names || "")
    .split(/,(?=\s*[^<]*<)/)
    .filter(Boolean);
  const recipients = recipientParts.map((r: string) => {
    const m = r.trim().match(/^(.*?)\s*<([^>]+)>$/);
    return m
      ? { name: m[1].trim(), email: m[2].trim() }
      : { name: r.trim(), email: r.trim() };
  });

  // Map direction to match our schema
  const directionMap: Record<string, string> = {
    Inbound: "inbound",
    Outbound: "outbound",
    Internal: "internal",
  };

  // Build team string for mailbox field
  const teams = (record.team_name || [])
    .map((t: any) => t.name)
    .filter(Boolean)
    .join(", ");

  return {
    source_id: record.id,
    source: "sugarcrm",
    mailbox: teams || "Smeba Brandbeveiliging BV",
    direction: directionMap[record.direction] || record.direction?.toLowerCase() || "unknown",
    subject: record.name || null,
    body_text: record.description || null,
    body_html: record.description_html || null,
    sender_email: senderEmail,
    sender_name: senderName,
    recipients,
    received_at: record.date_sent || null,
    has_attachments: (record.total_attachments || 0) > 0,
    is_read: true, // archived emails are always read
    importance: record.flagged ? "high" : "normal",
    conversation_id: record.parent_id || null,
    internet_message_id: record.message_id || null,
    raw_json: record,
  };
}

// --- Insert batch into Supabase ---
async function insertBatch(rows: any[]): Promise<number> {
  const { error } = await supabase
    .from("emails")
    .upsert(rows, { onConflict: "source_id", ignoreDuplicates: true });

  if (error) {
    console.error(`  Batch upsert error: ${error.message}`);
    // Fall back to individual inserts
    let inserted = 0;
    for (const row of rows) {
      const { error: singleError } = await supabase
        .from("emails")
        .upsert(row, { onConflict: "source_id", ignoreDuplicates: true });
      if (singleError) {
        console.error(`  Single insert error: ${singleError.message} (${row.source_id})`);
      } else {
        inserted++;
      }
    }
    return inserted;
  }

  return rows.length;
}

// --- Main ---
async function main() {
  console.log("=== SugarCRM Sales Email Fetcher ===");
  console.log(`Team: ${TEAM_FILTER}`);
  console.log(`Date from: ${DATE_FROM}`);
  console.log(`Directions: ${DIRECTIONS.join(", ")}\n`);

  let totalFetched = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const direction of DIRECTIONS) {
    console.log(`\n--- Fetching ${direction} emails ---`);
    let offset = 0;
    let directionCount = 0;
    let batch: any[] = [];

    while (true) {
      const { records, nextOffset } = await fetchPage(direction, offset);

      if (records.length === 0) break;

      // Parse records
      const parsed = records.map(parseEmail);
      batch.push(...parsed);
      directionCount += records.length;
      totalFetched += records.length;

      // Insert in batches
      while (batch.length >= INSERT_BATCH_SIZE) {
        const chunk = batch.splice(0, INSERT_BATCH_SIZE);
        const inserted = await insertBatch(chunk);
        totalInserted += inserted;
        totalSkipped += chunk.length - inserted;
      }

      // Progress
      console.log(
        `  ${direction}: fetched ${directionCount} (offset ${offset}) → total ${totalFetched} fetched, ${totalInserted} inserted`
      );

      // Next page
      if (nextOffset < 0 || records.length < PAGE_SIZE) break;
      offset = nextOffset;

      // Small delay to be nice to the API
      await new Promise((r) => setTimeout(r, 200));
    }

    // Flush remaining batch
    if (batch.length > 0) {
      const inserted = await insertBatch(batch);
      totalInserted += inserted;
      totalSkipped += batch.length - inserted;
      batch = [];
    }

    console.log(`  ${direction} complete: ${directionCount} emails`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Total fetched: ${totalFetched}`);
  console.log(`Total inserted: ${totalInserted}`);
  console.log(`Total skipped (duplicates): ${totalSkipped}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
