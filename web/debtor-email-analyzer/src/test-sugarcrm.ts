import { createZapierSdk } from "@zapier/zapier-sdk";
import "dotenv/config";

const zapier = createZapierSdk(
  process.env.ZAPIER_CLIENT_ID
    ? {
        credentials: {
          clientId: process.env.ZAPIER_CLIENT_ID,
          clientSecret: process.env.ZAPIER_CLIENT_SECRET!,
        },
      }
    : undefined
);

// Sugar CRM // NCrutzen connection
const CONNECTION_ID = "58816663";
const SUGAR_BASE = "https://walkerfire.sugaropencloud.eu/rest/v11_0";

async function run() {
  // Step 1: Test basic API access — fetch 5 most recent emails
  console.log("=== Step 1: Fetching recent emails from SugarCRM ===\n");

  const emailsRes = await zapier.fetch(
    `${SUGAR_BASE}/Emails?max_num=5&order_by=date_sent:DESC&fields=id,name,date_sent,from_addr_name,to_addrs_names,description,state,direction`,
    { method: "GET", connectionId: CONNECTION_ID }
  );

  if (!emailsRes.ok) {
    console.error("Emails fetch failed:", emailsRes.status, emailsRes.statusText);
    const body = await emailsRes.text();
    console.error("Response:", body.substring(0, 1000));

    // Maybe the Zapier SugarCRM app doesn't proxy raw fetch?
    // Try using runAction instead
    console.log("\n--- Trying Zapier actions approach ---");
    const actions = await zapier.listActions({ appKey: "SugarCRMCLIAPI" });
    console.log("Available SugarCRM actions:");
    for (const action of (actions as any).data || actions) {
      console.log(`  ${action.key || action.id}: ${action.label || action.name} (${action.type})`);
    }
    return;
  }

  const emailsData = (await emailsRes.json()) as any;
  console.log(`Found ${emailsData.records?.length || 0} emails\n`);

  for (const email of (emailsData.records || []).slice(0, 5)) {
    console.log(`---`);
    console.log(`  Subject: ${email.name}`);
    console.log(`  Date: ${email.date_sent}`);
    console.log(`  From: ${email.from_addr_name}`);
    console.log(`  To: ${email.to_addrs_names}`);
    console.log(`  Direction: ${email.direction}`);
    console.log(`  State: ${email.state}`);
  }

  // Step 2: Search for Smeba accounts
  console.log("\n=== Step 2: Searching for 'Smeba' accounts ===\n");

  const accountRes = await zapier.fetch(
    `${SUGAR_BASE}/Accounts?filter[0][name][$contains]=Smeba&fields=id,name&max_num=10`,
    { method: "GET", connectionId: CONNECTION_ID }
  );

  if (accountRes.ok) {
    const accountData = (await accountRes.json()) as any;
    console.log(`Found ${accountData.records?.length || 0} Smeba accounts:`);
    for (const acc of accountData.records || []) {
      console.log(`  ID: ${acc.id} | Name: ${acc.name}`);
    }

    // Fetch linked emails for first match
    if (accountData.records?.length > 0) {
      const accountId = accountData.records[0].id;
      const accountName = accountData.records[0].name;
      console.log(`\n=== Step 3: Emails linked to "${accountName}" ===\n`);

      const relatedRes = await zapier.fetch(
        `${SUGAR_BASE}/Accounts/${accountId}/link/emails?max_num=10&order_by=date_sent:DESC&fields=id,name,date_sent,from_addr_name,to_addrs_names,state,direction`,
        { method: "GET", connectionId: CONNECTION_ID }
      );

      if (relatedRes.ok) {
        const relatedData = (await relatedRes.json()) as any;
        console.log(`Found ${relatedData.records?.length || 0} linked emails:\n`);
        for (const email of relatedData.records || []) {
          console.log(`  ${email.date_sent} | ${email.direction || "?"} | ${email.name}`);
          console.log(`    From: ${email.from_addr_name} → To: ${email.to_addrs_names}`);
        }
      } else {
        console.error("Related emails failed:", relatedRes.status);
        const body = await relatedRes.text();
        console.error(body.substring(0, 500));
      }
    }
  } else {
    console.error("Account search failed:", accountRes.status);
    const body = await accountRes.text();
    console.error(body.substring(0, 500));
  }
}

run().catch(console.error);
