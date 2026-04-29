/**
 * Test Outlook tools against a real mailbox.
 * Run: cd web && npx tsx lib/outlook/test-tools.ts
 */
import { createZapierSdk } from "@zapier/zapier-sdk";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const CONNECTION_ID = "56014785";
const TEST_MAILBOX = "debiteuren@smeba.nl";

async function main() {
  const zapier = createZapierSdk();

  // Step 1: Fetch one recent email to get its ID
  console.log(`Fetching recent email from ${TEST_MAILBOX}...`);
  const res = await zapier.fetch(
    `${GRAPH_BASE}/users/${TEST_MAILBOX}/mailFolders/inbox/messages?$select=id,subject,categories,from&$top=1&$orderby=receivedDateTime desc`,
    { method: "GET", connectionId: CONNECTION_ID },
  );

  if (!res.ok) {
    console.error("Failed to fetch:", res.status, await res.text());
    return;
  }

  const data = await res.json() as { value: Array<{ id: string; subject: string; categories: string[]; from: { emailAddress: { address: string } } }> };
  if (!data.value?.length) {
    console.log("No emails found in inbox");
    return;
  }

  const email = data.value[0];
  console.log(`Found: "${email.subject}" from ${email.from.emailAddress.address}`);
  console.log(`  ID: ${email.id}`);
  console.log(`  Current categories: ${JSON.stringify(email.categories)}`);

  // Step 2: Test categorize (add a test category, then remove it)
  console.log("\n--- Test: Categorize ---");
  const newCategories = [...(email.categories || []), "TEST-Auto-Reply"];

  const catRes = await zapier.fetch(
    `${GRAPH_BASE}/users/${TEST_MAILBOX}/messages/${email.id}`,
    {
      method: "PATCH",
      connectionId: CONNECTION_ID,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: newCategories }),
    },
  );

  if (catRes.ok) {
    console.log("  Categorize: SUCCESS");

    // Verify
    const verifyRes = await zapier.fetch(
      `${GRAPH_BASE}/users/${TEST_MAILBOX}/messages/${email.id}?$select=categories`,
      { method: "GET", connectionId: CONNECTION_ID },
    );
    const verified = await verifyRes.json() as { categories: string[] };
    console.log(`  Verified categories: ${JSON.stringify(verified.categories)}`);

    // Remove test category
    const cleanRes = await zapier.fetch(
      `${GRAPH_BASE}/users/${TEST_MAILBOX}/messages/${email.id}`,
      {
        method: "PATCH",
        connectionId: CONNECTION_ID,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories: email.categories || [] }),
      },
    );
    console.log(`  Cleanup (remove test category): ${cleanRes.ok ? "OK" : "FAILED"}`);
  } else {
    console.log(`  Categorize: FAILED (${catRes.status})`, await catRes.text());
  }

  // Step 3: Test archive folder lookup
  console.log("\n--- Test: Find Archive folder ---");
  const archiveRes = await zapier.fetch(
    `${GRAPH_BASE}/users/${TEST_MAILBOX}/mailFolders?$filter=displayName eq 'Archive'&$select=id,displayName`,
    { method: "GET", connectionId: CONNECTION_ID },
  );

  if (archiveRes.ok) {
    const folders = await archiveRes.json() as { value: Array<{ id: string; displayName: string }> };
    if (folders.value?.length) {
      console.log(`  Archive folder found: ${folders.value[0].id}`);
    } else {
      // Try well-known name
      const wellKnownRes = await zapier.fetch(
        `${GRAPH_BASE}/users/${TEST_MAILBOX}/mailFolders/archive?$select=id`,
        { method: "GET", connectionId: CONNECTION_ID },
      );
      if (wellKnownRes.ok) {
        const wk = await wellKnownRes.json() as { id: string };
        console.log(`  Archive folder (well-known): ${wk.id}`);
      } else {
        console.log("  Archive folder: NOT FOUND");
      }
    }
  }

  // We do NOT test move or delete to avoid modifying real data
  console.log("\n--- Skipping move/delete tests (production safety) ---");
  console.log("  Archive (move) and Delete are not tested to avoid data loss.");
  console.log("  The Graph API calls are identical patterns to categorize (PATCH/POST/DELETE).");

  console.log("\n✅ Test complete!");
}

main().catch(console.error);
