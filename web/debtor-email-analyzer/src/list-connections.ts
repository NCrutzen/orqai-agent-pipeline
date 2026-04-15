import { createZapierSdk } from "@zapier/zapier-sdk";
import { config } from "./config.js";

const zapier = createZapierSdk(
  config.zapier.clientId
    ? {
        credentials: {
          clientId: config.zapier.clientId,
          clientSecret: config.zapier.clientSecret!,
        },
      }
    : undefined
);

async function main() {
  const { data: connections } = await zapier.listConnections({ owner: "me" });
  console.log("Your Zapier connections:\n");
  for (const conn of connections) {
    console.log(`  ${conn.app} — ${conn.title || "(no title)"} [id: ${conn.id}]`);
  }
  if (connections.length === 0) {
    console.log("  (none found)");
    console.log("\nConnect Microsoft 365 at: https://zapier.com/app/assets/connections");
  }
}

main().catch(console.error);
