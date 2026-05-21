import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteOrderLines } from "@/lib/automations/heeren-oefeningen/delete-order-line";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import {
  createInvoiceDraft,
  type DraftOrderLine,
} from "@/lib/automations/heeren-oefeningen/create-invoice-draft";
import {
  resolveNxtEnvironment,
  type NxtEnvironment,
} from "@/lib/automations/heeren-oefeningen/nxt-environment";

const AUTOMATION_NAME = "heeren-oefeningen";

/**
 * Inngest function: Verwijder een oefening-orderregel uit NXT via Browserless.
 *
 * Flow:
 *   1. Zapier detecteert een oefening-orderregel in de SQL query
 *   2. Zapier POST naar /api/automations/heeren-oefeningen
 *   3. API route triggert dit Inngest event
 *   4. Sla de rij op in heeren_oefeningen_staging (idempotent via UNIQUE billing_order_line_id)
 *   5. Voer browser automation uit om de orderregel uit NXT te verwijderen
 *   6. Update staging record met resultaat en screenshots
 */
export const processHeerenOefening = inngest.createFunction(
  {
    id: "process-heeren-oefening",
    retries: 2,
    onFailure: async ({ error, event }) => {
      const admin = createAdminClient();
      // Update staging record naar 'failed' als die bestaat
      await admin
        .from("heeren_oefeningen_staging")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("billing_order_line_id", event.data.event.data.billingOrderLineId);

      await admin.from("automation_runs").insert({
        automation: AUTOMATION_NAME,
        status: "failed",
        error_message: error.message,
        triggered_by: event.data.event.data.triggeredBy,
        completed_at: new Date().toISOString(),
      });
      await emitAutomationRunStale(admin, AUTOMATION_NAME);
    },
  },
  { event: "automation/heeren-oefeningen.triggered" },
  async ({ event, step }) => {
    const {
      billingOrderCode,
      billingOrderId,
      billingOrderLineId,
      billingItemId,
      courseId,
      // Fase 2 velden — optioneel; komen mee uit uitgebreide Zapier SQL query
      customerId,
      siteId,
      brandId,
      orderTypeId,
      orderReference,
      quantity,
      unitPrice,
      description,
      environment,
    } = event.data;

    const nxtEnv: NxtEnvironment = (environment === "acceptance" ? "acceptance" : "production");

    // Step 1: Sla op in staging (idempotent — UNIQUE op billing_order_line_id)
    const stagingId = await step.run("save-to-staging", async () => {
      const admin = createAdminClient();

      // Check of deze regel al verwerkt is (idempotency)
      const { data: existing } = await admin
        .from("heeren_oefeningen_staging")
        .select("id, status")
        .eq("billing_order_line_id", billingOrderLineId)
        .single();

      if (existing) {
        if (existing.status === "processed") {
          throw new Error(`Orderregel ${billingOrderLineId} is al verwerkt (status: processed). Overgeslagen.`);
        }
        // 'pending' of 'failed': doorgaan met bestaande rij (eventueel nieuwe Fase 2 data mergen)
        const fase2Updates: Record<string, unknown> = {};
        if (customerId) fase2Updates.customer_id = customerId;
        if (siteId) fase2Updates.site_id = siteId;
        if (brandId) fase2Updates.brand_id = brandId;
        if (orderTypeId) fase2Updates.order_type_id = orderTypeId;
        if (orderReference) fase2Updates.order_reference = orderReference;
        if (quantity != null) fase2Updates.quantity = quantity;
        if (unitPrice != null) fase2Updates.unit_price = unitPrice;
        if (description) fase2Updates.description = description;
        if (Object.keys(fase2Updates).length > 0) {
          await admin
            .from("heeren_oefeningen_staging")
            .update(fase2Updates)
            .eq("id", existing.id);
        }
        return existing.id as string;
      }

      const { data, error } = await admin
        .from("heeren_oefeningen_staging")
        .insert({
          billing_order_code: billingOrderCode,
          billing_order_id: billingOrderId,
          billing_order_line_id: billingOrderLineId,
          billing_item_id: billingItemId,
          course_id: courseId,
          status: "pending",
          // Fase 2 velden (NULL als niet aanwezig in payload)
          customer_id: customerId ?? null,
          site_id: siteId ?? null,
          brand_id: brandId ?? null,
          order_type_id: orderTypeId ?? null,
          order_reference: orderReference ?? null,
          quantity: quantity ?? null,
          unit_price: unitPrice ?? null,
          description: description ?? null,
        })
        .select("id")
        .single();

      if (error) throw new Error(`Staging insert mislukt: ${error.message}`);
      return data.id as string;
    });

    // Step 2: Voer browser automation uit
    const result = await step.run("delete-order-line-in-nxt", async () => {
      const auth = await resolveNxtEnvironment(nxtEnv);
      return deleteOrderLines({
        billingOrderCode,
        billingOrderId,
        billingOrderLineId,
        billingItemId,
        courseId,
        auth,
      });
    });

    // Step 3: Update staging record met resultaat
    await step.run("update-staging-result", async () => {
      const admin = createAdminClient();

      if (result.success) {
        const update: Record<string, unknown> = {
          status: "processed",
          processed_at: new Date().toISOString(),
          screenshot_before: result.screenshots?.before ?? null,
          screenshot_after: result.screenshots?.after ?? null,
        };
        // Merge captured velden uit NXT als Zapier ze niet stuurde.
        // Zapier-waarden (als aanwezig) hebben voorrang, anders DOM-scrape.
        if (result.captured) {
          if (quantity == null && result.captured.quantity != null) update.quantity = result.captured.quantity;
          if (unitPrice == null && result.captured.unitPrice != null) update.unit_price = result.captured.unitPrice;
          if (!description && result.captured.description) update.description = result.captured.description;
        }
        await admin
          .from("heeren_oefeningen_staging")
          .update(update)
          .eq("id", stagingId);
      } else {
        await admin
          .from("heeren_oefeningen_staging")
          .update({
            status: "failed",
            invoice_error: result.error ?? "Onbekende Browserless fout",
            screenshot_before: result.screenshots?.before ?? null,
            screenshot_after: result.screenshots?.after ?? null,
          })
          .eq("id", stagingId);
        throw new Error(`NXT browser automation mislukt: ${result.error}`);
      }
    });

    // Step 4: Log succesvol run
    await step.run("log-success", async () => {
      const admin = createAdminClient();
      await admin.from("automation_runs").insert({
        automation: AUTOMATION_NAME,
        status: "completed",
        result: {
          billingOrderCode,
          billingOrderLineId,
          billingItemId,
          stagingId,
          screenshotBefore: result.screenshots?.before,
          screenshotAfter: result.screenshots?.after,
        },
        triggered_by: event.data.triggeredBy,
        completed_at: new Date().toISOString(),
      });
      await emitAutomationRunStale(admin, AUTOMATION_NAME);
    });

    return {
      success: true,
      billingOrderCode,
      billingOrderLineId,
      stagingId,
    };
  },
);

// =============================================================================
// FASE 2: Dagelijkse facturatie — autoInvoice flow
//
// Cron: dagelijks 18:00 Europe/Amsterdam, ma-vr. Voor elke staging-row met
// status=processed (Fase 1 done) en zonder facturatie-traces: maak een NXT
// order met autoInvoice=true → doorloopt automatisch confirm → invoice →
// process (PROCESSING) zodat de factuur direct de deur uit is.
// =============================================================================

interface StagingRecord {
  id: string;
  billing_order_code: string;
  billing_item_id: string;
  customer_id: string | null;
  site_id: string | null;
  brand_id: string | null;
  order_type_id: string | null;
  order_reference: string | null;
  quantity: number | null;
  unit_price: number | null;
  description: string | null;
}

/**
 * Groep staging records op (customer_id, site_id) — één NXT order per groep.
 * Records zonder verplichte Fase 2 velden worden geskipt.
 */
function groupForInvoicing(records: StagingRecord[]): Map<string, StagingRecord[]> {
  const groups = new Map<string, StagingRecord[]>();
  for (const r of records) {
    if (!r.customer_id || !r.brand_id || !r.order_type_id || r.quantity == null || r.unit_price == null) {
      console.warn(`[fase2] Skip staging ${r.id} — ontbrekende velden (customer/brand/type/qty/price)`);
      continue;
    }
    // site_id is optional — top-level customers zonder mother-company hebben geen site
    const key = `${r.customer_id}|${r.site_id ?? "_nosite"}|${r.brand_id}|${r.order_type_id}`;
    const existing = groups.get(key) ?? [];
    existing.push(r);
    groups.set(key, existing);
  }
  return groups;
}

export const createMonthlyInvoiceDrafts = inngest.createFunction(
  {
    id: "heeren-oefeningen-create-monthly-invoice-drafts",
    name: "Heeren Oefeningen — dagelijkse autoInvoice run",
    retries: 1,
  },
  [
    // Dagelijks 18:00 Europe/Amsterdam, ma-vr. Geen last-workday gate meer —
    // we maken iedere werkdag een facturatie-batch zodat oefening-regels niet
    // langer dan ~24u in staging blijven hangen.
    { cron: "TZ=Europe/Amsterdam 0 18 * * 1-5" },
    // Handmatige trigger (met forceRun=true heeft nu alleen nog effect voor logging).
    { event: "automation/heeren-oefeningen.create-invoices" },
  ],
  async ({ event, step, logger }) => {
    // Phase 88.2-03 lint-narrow (D-11 fallback — D-10 inline interface for
    // event.data; this trigger has no registered EventSchema).
    // TODO(phase-88.2-followup): register "automation/heeren-oefeningen.create-invoices" schema in lib/inngest/client.ts
    const eventData = (event as { data?: { triggeredBy?: string; environment?: string } })?.data;
    const triggeredBy = String(eventData?.triggeredBy ?? "cron");
    const rawEnv = eventData?.environment;
    const nxtEnv: NxtEnvironment = rawEnv === "acceptance" ? "acceptance" : "production";

    // Step 1: haal staging records op (processed, nog niet gefactureerd, laatste 2 maanden)
    const records = await step.run("load-pending-records", async () => {
      const admin = createAdminClient();
      const twoMonthsAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 62).toISOString();
      const { data, error } = await admin
        .from("heeren_oefeningen_staging")
        .select("id, billing_order_code, billing_item_id, customer_id, site_id, brand_id, order_type_id, order_reference, quantity, unit_price, description")
        .eq("status", "processed")
        .is("new_billing_order_code", null)
        .is("invoice_draft_created_at", null)
        .gte("processed_at", twoMonthsAgo)
        .order("processed_at", { ascending: true });
      if (error) throw new Error(`Staging query mislukt: ${error.message}`);
      return (data ?? []) as StagingRecord[];
    });

    logger.info(`[fase2] ${records.length} staging records te verwerken`);
    if (records.length === 0) {
      return { skipped: true, reason: "geen records te verwerken" };
    }

    // Step 2: groepeer per (customer+site+brand+orderType)
    const groups = groupForInvoicing(records);
    logger.info(`[fase2] ${groups.size} unieke groepen`);

    // Step 3: per groep een nieuwe draft order aanmaken
    const results: Array<{ group: string; success: boolean; newOrderUuid: string | null; error?: string; recordCount: number }> = [];

    for (const [key, group] of groups.entries()) {
      const first = group[0];
      const lines: DraftOrderLine[] = group.map(r => ({
        itemId: r.billing_item_id,
        quantity: r.quantity as number,
        unitPrice: r.unit_price as number,
        stagingId: r.id,
      }));
      const sourceCodes = [...new Set(group.map(r => r.billing_order_code))];

      const result = await step.run(`create-draft-${key.replace(/\|/g, "-")}`, async () => {
        const auth = await resolveNxtEnvironment(nxtEnv);
        return createInvoiceDraft({
          customerId: first.customer_id as string,
          siteId: first.site_id as string,
          brandId: first.brand_id as string,
          orderTypeId: first.order_type_id as string,
          orderReference: first.order_reference ?? null,
          autoInvoice: true,
          lines,
          sourceBillingOrderCodes: sourceCodes,
          auth,
        });
      });

      // Step 4: update staging records met resultaat (per groep)
      await step.run(`update-staging-${key.replace(/\|/g, "-")}`, async () => {
        const admin = createAdminClient();
        const ids = group.map(r => r.id);
        const update: Record<string, unknown> = {
          invoice_draft_created_at: new Date().toISOString(),
        };
        if (result.success) {
          update.new_order_uuid = result.newOrderUuid;
          if (result.newOrderCode) update.new_billing_order_code = result.newOrderCode;
          if (!result.newOrderCode && result.newOrderUuid) update.new_billing_order_code = result.newOrderUuid;
          if (result.screenshotUrl) update.invoice_draft_screenshot = result.screenshotUrl;
          // autoInvoice lifecycle-traces (alleen aanwezig bij autoInvoice=true)
          if (result.confirmedAt) update.confirmed_at = result.confirmedAt;
          if (result.invoicedAt) update.invoiced_at = result.invoicedAt;
          if (result.processedAt) update.invoice_processed_at = result.processedAt;
          if (result.invoiceUuid) update.invoice_uuid = result.invoiceUuid;
          if (result.invoiceUrl) update.invoice_url = result.invoiceUrl;
          if (result.finalInvoiceStatus) update.final_invoice_status = result.finalInvoiceStatus;
          update.invoice_error = null;
        } else {
          // Gedeeltelijke flow: schrijf wat we wél hebben weg samen met de error
          if (result.newOrderUuid) update.new_order_uuid = result.newOrderUuid;
          if (result.newOrderCode) update.new_billing_order_code = result.newOrderCode;
          if (result.confirmedAt) update.confirmed_at = result.confirmedAt;
          if (result.invoicedAt) update.invoiced_at = result.invoicedAt;
          if (result.invoiceUuid) update.invoice_uuid = result.invoiceUuid;
          if (result.invoiceUrl) update.invoice_url = result.invoiceUrl;
          if (result.finalInvoiceStatus) update.final_invoice_status = result.finalInvoiceStatus;
          update.invoice_error = result.error ?? "onbekende fout";
        }
        const { error } = await admin
          .from("heeren_oefeningen_staging")
          .update(update)
          .in("id", ids);
        if (error) throw new Error(`Staging update mislukt: ${error.message}`);
      });

      results.push({
        group: key,
        success: result.success,
        newOrderUuid: result.newOrderUuid,
        error: result.error,
        recordCount: group.length,
      });
    }

    // Step 5: log run
    await step.run("log-run", async () => {
      const admin = createAdminClient();
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;
      const fase2Name = `${AUTOMATION_NAME}-fase2`;
      await admin.from("automation_runs").insert({
        automation: fase2Name,
        status: failCount === 0 ? "completed" : "partial",
        result: { groups: results.length, success: successCount, failed: failCount, details: results },
        triggered_by: triggeredBy,
        completed_at: new Date().toISOString(),
      });
      await emitAutomationRunStale(admin, fase2Name);
    });

    return {
      totalGroups: results.length,
      successCount: results.filter(r => r.success).length,
      results,
    };
  },
);
