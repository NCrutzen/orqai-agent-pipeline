// Phase 56-02 wave 3 part 2: classifier-invoice-copy-handler Inngest worker.
//
// Listens on `debtor-email/invoice-copy.requested` (emitted by
// classifier-verdict-worker when the swarm_categories row for
// (debtor-email, invoice_copy_request) has action='swarm_dispatch').
//
// Operator-driven flow today: an operator override in Bulk Review
// reclassifies an email into invoice_copy_request. The verdict-worker
// dispatches; this worker:
//   1. Loads the email + per-mailbox labeling settings.
//   2. Extracts NXT invoice numbers from subject + body.
//   3. Fetches the first hydrated PDF via /api/automations/debtor/fetch-document.
//   4. Calls the registry-driven debtor-copy-document-body-agent for HTML body.
//   5. Saves an iController draft via /api/automations/debtor/create-draft.
//   6. Writes an audit row in debtor.email_labels (method='invoice_copy_drafted').
//
// What this worker explicitly does NOT do:
//   - Run the intent agent. Intent is known (operator override → invoice_copy_request).
//   - Archive the Outlook message. The operator must still review + send the
//     draft from inside iController.
//
// retries: 0 — same rationale as the resolver worker. NXT-Zap and Browserless
// failures surface as automation_runs.status='failed' with an error_message;
// the queue UI's retry button is the recovery path.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { extractInvoiceCandidates } from "@/lib/automations/debtor-email/extract-invoices";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { detectEmotion } from "@/lib/automations/debtor-email/triage/detect-emotion";
import {
  bodyAgentOutputSchema,
  BODY_VERSION,
  type Entity,
  type Language,
} from "@/lib/automations/debtor-email/triage/types";

const BODY_AGENT_KEY = "debtor-copy-document-body-agent";

export const classifierInvoiceCopyHandler = inngest.createFunction(
  { id: "classifier/invoice-copy-handler", retries: 0 },
  { event: "debtor-email/invoice-copy.requested" },
  async ({ event, step }) => {
    const {
      automation_run_id,
      message_id,
      source_mailbox,
      category_key,
      swarm_type,
    } = event.data;

    const admin = createAdminClient();

    const [emailRow, settingsRow] = await Promise.all([
      step.run("load-email", async () => {
        const { data, error } = await admin
          .schema("email_pipeline")
          .from("emails")
          .select(
            "id, conversation_id, subject, body_text, sender_email, sender_first_name, mailbox",
          )
          .eq("internet_message_id", message_id)
          .maybeSingle();
        if (error) {
          throw new Error(`emails lookup failed: ${error.message}`);
        }
        return data;
      }),
      step.run("load-settings", async () => {
        const { data } = await admin
          .schema("debtor")
          .from("labeling_settings")
          .select("dry_run, entity, icontroller_company")
          .eq("source_mailbox", source_mailbox)
          .maybeSingle();
        return data;
      }),
    ]);

    if (!emailRow) {
      return await failRun(
        admin,
        automation_run_id,
        swarm_type,
        `email row not found for message_id=${message_id}`,
      );
    }

    const dryRun = settingsRow?.dry_run ?? true;
    const entity = (settingsRow?.entity ?? null) as Entity | null;

    if (!entity) {
      return await failRun(
        admin,
        automation_run_id,
        swarm_type,
        `labeling_settings.entity not configured for mailbox=${source_mailbox}`,
      );
    }

    // ---- 1) Extract invoice candidates ------------------------------------
    const invoices = extractInvoiceCandidates(
      emailRow.subject ?? "",
      emailRow.body_text ?? "",
    );

    if (invoices.candidates.length === 0) {
      // No reference → no document to fetch. Write an audit row and close
      // the run as 'predicted' so the operator can triage in the kanban.
      await step.run("write-no-invoice-label", async () => {
        const { error } = await admin
          .schema("debtor")
          .from("email_labels")
          .insert({
            email_id: emailRow.id,
            icontroller_mailbox_id: 0,
            source_mailbox,
            conversation_id: emailRow.conversation_id ?? null,
            confidence: "none",
            method: "unresolved",
            reason:
              "invoice_copy_request: no invoice number present in subject or body",
            status: dryRun ? "dry_run" : "skipped",
          });
        if (error) {
          throw new Error(`email_labels insert failed: ${error.message}`);
        }
      });
      await closeRun(admin, automation_run_id, swarm_type, {
        status: "predicted",
        result: {
          stage: "no_invoice_reference",
          email_id: emailRow.id,
          dry_run: dryRun,
        },
      });
      return { ok: true, reason: "no_invoice_reference", category_key };
    }

    const invoiceRef = invoices.candidates[0];

    // ---- 2) Fetch PDF -----------------------------------------------------
    const fetchResult = await step.run("fetch-document", async () => {
      const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/automations/debtor/fetch-document`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AUTOMATION_WEBHOOK_SECRET ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          docType: "invoice",
          reference: invoiceRef,
          entity,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | {
            found: true;
            pdf: { base64: string; filename: string };
            metadata: {
              invoice_id?: string | null;
              document_type?: string | null;
              created_on?: string | null;
            };
          }
        | { found: false; reason?: string };
      if (!res.ok || json.found === false) {
        const reason = (json as { reason?: string }).reason ?? "fetch_failed";
        throw new Error(`fetch-document failed: ${reason}`);
      }
      return json;
    });

    // ---- 3) Detect emotion (deterministic pre-pass) ----------------------
    const language: Language = inferLanguageFromEntity(entity);
    const emotion = await step.run("detect-emotion", () =>
      detectEmotion(emailRow.body_text ?? "", language),
    );

    // ---- 4) Generate body via registry-driven Orq agent ------------------
    const body = await step.run("generate-body", async () => {
      const inputs = {
        email_id: emailRow.id,
        inngest_run_id: event.id ?? `local-${emailRow.id}`,
        stage: "generate_body",
        email_subject: emailRow.subject ?? "",
        email_body_text: emailRow.body_text ?? "",
        email_sender_email: emailRow.sender_email ?? "",
        email_sender_first_name: emailRow.sender_first_name ?? null,
        email_mailbox: emailRow.mailbox ?? source_mailbox,
        email_entity: entity,
        email_language: language,
        intent_result_intent: "copy_document_request",
        intent_result_sub_type: "invoice",
        intent_result_document_reference: invoiceRef,
        intent_result_confidence: "high",
        fetched_document_invoice_id:
          fetchResult.metadata.invoice_id ?? invoiceRef,
        fetched_document_filename: fetchResult.pdf.filename,
        fetched_document_document_type:
          fetchResult.metadata.document_type ?? "invoice",
        fetched_document_created_on: fetchResult.metadata.created_on ?? "",
        body_version: BODY_VERSION,
        emotion_trigger_match: emotion.match,
      };
      const { raw } = await invokeOrqAgent(BODY_AGENT_KEY, inputs, {
        jsonSchemaName: "debtor_copy_document_body_result",
      });
      return bodyAgentOutputSchema.parse(raw);
    });

    // ---- 5) Create iController draft -------------------------------------
    const draft = await step.run("create-draft", async () => {
      const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/automations/debtor/create-draft`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AUTOMATION_WEBHOOK_SECRET ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "reply",
          messageId: message_id,
          bodyHtml: body.body_html,
          pdfBase64: fetchResult.pdf.base64,
          filename: fetchResult.pdf.filename,
          env: dryRun ? "acceptance" : "production",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | {
            success: true;
            draftUrl?: string;
            screenshots?: Record<string, string | undefined>;
          }
        | { success: false; reason?: string; details?: unknown };
      if (!res.ok || json.success === false) {
        const reason = (json as { reason?: string }).reason ?? "save_failed";
        throw new Error(`create-draft failed: ${reason}`);
      }
      return json;
    });

    // ---- 6) Write email_labels audit row ---------------------------------
    await step.run("write-email-label", async () => {
      const { error } = await admin
        .schema("debtor")
        .from("email_labels")
        .insert({
          email_id: emailRow.id,
          icontroller_mailbox_id: 0,
          source_mailbox,
          conversation_id: emailRow.conversation_id ?? null,
          confidence: "high",
          method: "invoice_copy_drafted",
          reason: `invoice_copy_request: drafted reply with invoice ${invoiceRef} (body_version=${body.body_version}, tone=${body.detected_tone})`,
          invoice_numbers: invoices.candidates,
          status: dryRun ? "dry_run" : "labeled",
        });
      if (error) {
        throw new Error(`email_labels insert failed: ${error.message}`);
      }
    });

    // ---- 7) Close run ----------------------------------------------------
    // Both dry_run and live drafts require operator action in iController
    // (we never auto-send), so the run lands in 'predicted' for the kanban
    // review-lane regardless of dry_run.
    await closeRun(admin, automation_run_id, swarm_type, {
      status: "predicted",
      result: {
        stage: "draft_created",
        email_id: emailRow.id,
        invoice_reference: invoiceRef,
        candidates: invoices.candidates,
        body_version: body.body_version,
        detected_tone: body.detected_tone,
        draft_url: (draft as { draftUrl?: string }).draftUrl ?? null,
        dry_run: dryRun,
      },
    });

    return {
      ok: true,
      invoice_reference: invoiceRef,
      detected_tone: body.detected_tone,
      draft_url: (draft as { draftUrl?: string }).draftUrl ?? null,
      category_key,
    };
  },
);

async function failRun(
  admin: ReturnType<typeof createAdminClient>,
  automation_run_id: string,
  swarm_type: string,
  errorMessage: string,
) {
  await admin
    .from("automation_runs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", automation_run_id);
  await emitAutomationRunStale(admin, `${swarm_type}-review`);
  return { ok: false, reason: errorMessage };
}

async function closeRun(
  admin: ReturnType<typeof createAdminClient>,
  automation_run_id: string,
  swarm_type: string,
  args: { status: "predicted" | "completed"; result: Record<string, unknown> },
) {
  await admin
    .from("automation_runs")
    .update({
      status: args.status,
      result: args.result,
      completed_at: new Date().toISOString(),
    })
    .eq("id", automation_run_id);
  await emitAutomationRunStale(admin, `${swarm_type}-review`);
}

/**
 * Map the per-mailbox `entity` to a working draft language. The body agent
 * accepts `nl | en | de | fr` only; Flemish entities use NL with Flemish
 * register words coming from the entity_register block in the prompt. The
 * francophone-BE entity (sicli-sud) gets `fr`. Inbound emails in another
 * language are still drafted in the entity's default — operators can edit
 * before sending.
 */
function inferLanguageFromEntity(entity: Entity): Language {
  return entity === "sicli-sud" ? "fr" : "nl";
}
