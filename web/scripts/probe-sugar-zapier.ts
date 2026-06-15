/** Read-only probe: kan de Zapier-connectie "Sugar CRM // NCrutzen" (58816663)
 *  de Sugar REST API bereiken? GET 1 Case — geen writes. */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(__dirname, "..", ".env.local") });
import { createZapierSdk } from "@zapier/zapier-sdk";

const SUGAR_CONNECTION_ID = "58816663";
const SUGAR_BASE = "https://walkerfire.sugaropencloud.eu/rest/v11";

async function main() {
  const zapier = createZapierSdk();
  const res = await zapier.fetch(`${SUGAR_BASE}/Cases?max_num=1&fields=name,status`, {
    method: "GET",
    connectionId: SUGAR_CONNECTION_ID,
  });
  console.log("status:", res.status);
  const text = await res.text();
  console.log(text.slice(0, 300));
}
main().catch((e) => { console.error("ERR:", e instanceof Error ? e.message : e); process.exit(1); });
