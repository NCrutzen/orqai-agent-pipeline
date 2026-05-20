/**
 * E2E test: createInvoiceDraft met autoInvoice=true draait de hele lifecycle.
 * Acceptance NXT, Heeren-realistische input.
 */
import * as path from "path";
require("dotenv").config({ path: path.join(__dirname, "../../../../.env.local") });
import { resolveNxtEnvironment } from "../nxt-environment";
import { createInvoiceDraft } from "../create-invoice-draft";

(async () => {
  const auth = await resolveNxtEnvironment("acceptance");
  const result = await createInvoiceDraft({
    customerId: "587819",
    siteId: "632845",
    brandId: "BB",
    orderTypeId: "DOTR",
    orderReference: "AutoInvoice-test",
    autoInvoice: true,
    lines: [{ itemId: "6410005107", quantity: 1, unitPrice: 33, stagingId: "test-auto-invoice" }],
    sourceBillingOrderCodes: ["AUTO-INVOICE-TEST"],
    auth,
  });
  console.log("\n=== Resultaat ===");
  console.log(JSON.stringify(result, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
