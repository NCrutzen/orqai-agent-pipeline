/**
 * Seed-en-test voor Fase 2: maandelijkse facturatie drafts.
 *
 * Voert end-to-end uit zonder Zapier/HTTP:
 *   1. Insert 1 test staging record met alle Fase 2 velden
 *   2. Roep createInvoiceDraft direct aan met dezelfde params
 *   3. Update het staging record met het resultaat
 *   4. Toon: UUID van de nieuwe order, staging rij, screenshot URL
 *
 * Gebruik:
 *   npx tsx lib/automations/heeren-oefeningen/seed-and-test-fase2.ts
 *
 * Prerequisite: migration 20260421_heeren_oefeningen_fase2.sql is uitgevoerd.
 * Als de kolommen nog niet bestaan krijg je een duidelijke error bij stap 1.
 */

import * as path from "path";
require("dotenv").config({ path: path.join(__dirname, "../../../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { createInvoiceDraft } from "./create-invoice-draft";
import { resolveNxtEnvironment } from "./nxt-environment";

// Default environment voor deze seed-test. Override met: ENV=production npx tsx ...
const TEST_ENV = (process.env.ENV === "production" ? "production" : "acceptance") as
  | "production"
  | "acceptance";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  // Unieke test-id zodat we nooit botsen met bestaande records
  const testRunId = `TEST-FASE2-${Date.now()}`;
  const record = {
    billing_order_code: testRunId,
    billing_order_id: `test-order-${testRunId}`,
    billing_order_line_id: `test-line-${testRunId}`,
    billing_item_id: "6410005107",
    course_id: "test-course",
    status: "processed",
    processed_at: new Date().toISOString(),
    screenshot_before: "test-before.png",
    screenshot_after: "test-after.png",
    // Fase 2 velden — Heeren Loo realistische input (vanuit echte Fase 1 staging-row)
    customer_id: process.env.SEED_CUSTOMER_ID ?? "590518",
    site_id: process.env.SEED_SITE_ID ?? "629195",
    brand_id: process.env.SEED_BRAND_ID ?? "BB",
    order_type_id: process.env.SEED_ORDER_TYPE_ID ?? "DOTR",
    order_reference: process.env.SEED_ORDER_REFERENCE ?? "TEST-KOSTENPLAATS",
    quantity: Number(process.env.SEED_QUANTITY ?? "1"),
    unit_price: Number(process.env.SEED_UNIT_PRICE ?? "45.0"),
    description: "Test oefening her-facturatie (seed-and-test-fase2)",
  };

  console.log(`[1/4] Insert test staging record: ${testRunId}`);
  const { data: inserted, error: insertErr } = await supabase
    .from("heeren_oefeningen_staging")
    .insert(record)
    .select("id")
    .single();
  if (insertErr) {
    console.error("Insert mislukt:", insertErr.message);
    if (insertErr.message.includes("column") || insertErr.message.includes("customer_id")) {
      console.error("\n⚠ Het lijkt of de migration nog niet is uitgevoerd.");
      console.error("  Voer eerst supabase/migrations/20260421_heeren_oefeningen_fase2.sql uit in de Supabase SQL editor.");
    }
    process.exit(1);
  }
  const stagingId = inserted.id as string;
  console.log(`     ✓ staging id: ${stagingId}`);

  console.log(`\n[2/4] Aanroepen createInvoiceDraft (env=${TEST_ENV})...`);
  const auth = await resolveNxtEnvironment(TEST_ENV);
  const result = await createInvoiceDraft({
    customerId: record.customer_id,
    siteId: record.site_id,
    brandId: record.brand_id,
    orderTypeId: record.order_type_id,
    orderReference: record.order_reference,
    lines: [{ itemId: record.billing_item_id, quantity: record.quantity, unitPrice: record.unit_price, stagingId }],
    sourceBillingOrderCodes: [testRunId],
    auth,
  });
  console.log(`     → success=${result.success}`);
  if (!result.success) {
    console.error(`     ✗ Fout: ${result.error}`);
    process.exit(1);
  }
  console.log(`     → newOrderUuid: ${result.newOrderUuid}`);
  console.log(`     → newOrderUrl: ${result.newOrderUrl}`);
  console.log(`     → screenshotUrl: ${result.screenshotUrl}`);

  console.log(`\n[3/4] Update staging record met resultaat...`);
  const update: Record<string, unknown> = {
    invoice_draft_created_at: new Date().toISOString(),
    new_order_uuid: result.newOrderUuid,
    new_billing_order_code: result.newOrderCode ?? result.newOrderUuid,
    invoice_draft_screenshot: result.screenshotUrl,
  };
  const { error: updateErr } = await supabase
    .from("heeren_oefeningen_staging")
    .update(update)
    .eq("id", stagingId);
  if (updateErr) {
    console.error("Update mislukt:", updateErr.message);
    process.exit(1);
  }
  console.log("     ✓ staging record bijgewerkt");

  console.log(`\n[4/4] Verifieer staging state:`);
  const { data: final } = await supabase
    .from("heeren_oefeningen_staging")
    .select("id, billing_order_code, customer_id, site_id, quantity, unit_price, new_order_uuid, new_billing_order_code, invoice_draft_created_at, invoice_draft_screenshot")
    .eq("id", stagingId)
    .single();
  console.log(JSON.stringify(final, null, 2));

  console.log(`\n✓ Fase 2 flow succesvol. Check de draft order in NXT: ${result.newOrderUrl}`);
  console.log(`  Screenshot: ${result.screenshotUrl ?? '(geen)'}`);
  console.log(`\n[cleanup] Je kunt het test staging record verwijderen met:`);
  console.log(`  DELETE FROM heeren_oefeningen_staging WHERE id = '${stagingId}';`);
}

main().catch(e => { console.error(e); process.exit(1); });
