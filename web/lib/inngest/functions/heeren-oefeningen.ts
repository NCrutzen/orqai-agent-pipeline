import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteOrderLines } from "@/lib/automations/heeren-oefeningen/delete-order-line";

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
    },
  },
  { event: "automation/heeren-oefeningen.triggered" },
  async ({ event, step }) => {
    const { billingOrderCode, billingOrderId, billingOrderLineId, billingItemId, courseId } = event.data;

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
        // 'pending' of 'failed': doorgaan met bestaande rij
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
        })
        .select("id")
        .single();

      if (error) throw new Error(`Staging insert mislukt: ${error.message}`);
      return data.id as string;
    });

    // Step 2: Voer browser automation uit
    const result = await step.run("delete-order-line-in-nxt", async () => {
      return deleteOrderLines({
        billingOrderCode,
        billingOrderId,
        billingOrderLineId,
        billingItemId,
        courseId,
      });
    });

    // Step 3: Update staging record met resultaat
    await step.run("update-staging-result", async () => {
      const admin = createAdminClient();

      if (result.success) {
        await admin
          .from("heeren_oefeningen_staging")
          .update({
            status: "processed",
            processed_at: new Date().toISOString(),
            screenshot_before: result.screenshots?.before ?? null,
            screenshot_after: result.screenshots?.after ?? null,
          })
          .eq("id", stagingId);
      } else {
        await admin
          .from("heeren_oefeningen_staging")
          .update({
            status: "failed",
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
    });

    return {
      success: true,
      billingOrderCode,
      billingOrderLineId,
      stagingId,
    };
  },
);
