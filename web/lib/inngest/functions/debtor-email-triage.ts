import { NonRetriableError } from "inngest";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { invokeIntentAgent } from "@/lib/automations/debtor-email/triage/invoke-intent";
import { invokeBodyAgent } from "@/lib/automations/debtor-email/triage/invoke-body";
import { detectEmotion } from "@/lib/automations/debtor-email/triage/detect-emotion";
import {
  checkBreaker,
  openBreaker,
  closeBreaker,
} from "@/lib/automations/debtor-email/triage/circuit-breaker";
import {
  createRun,
  findCachedOutput,
  mergeToolOutputs,
  updateRun,
} from "@/lib/automations/debtor-email/triage/agent-runs";
import {
  BODY_VERSION,
  INTENT_VERSION,
  type CreateDraftResponse,
  type FetchDocumentResponse,
  type IntentAgentOutput,
  type SubType,
} from "@/lib/automations/debtor-email/triage/types";

const BREAKER_KEY = "icontroller_drafter_breaker";

/**
 * Phase-1 triage for `debtor/email.received`. See
 * `Agents/debtor-email-swarm/ORCHESTRATION.md` for the authoritative spec.
 *
 * Retry strategy — Inngest v3.52 only supports FUNCTION-level `retries` (no
 * per-step override). Entire function retries up to 3× on thrown errors;
 * NonRetriableError skips retry. Per-step retry granularity (fetch-document
 * 3×, create-draft 1×, etc.) is simulated by throwing NonRetriableError for
 * terminal failures and relying on Orq Router's internal retries for LLM
 * calls. See TODOs below.
 */
export const debtorEmailTriage = inngest.createFunction(
  {
    id: "automations/debtor-email-triage",
    name: "Debtor Email Triage",
    retries: 3,
    concurrency: [{ key: "event.data.entity", limit: 2 }],
  },
  { event: "debtor/email.received" },
  async ({ event, step }) => {
    const email = event.data;
    const { email_id, entity } = email;
    const inngest_run_id = event.id ?? `local-${email_id}`;
    const supabase = createAdminClient();

    // ----- 1) Create agent_runs row ----------------------------------------
    const agent_run_id = await step.run("create-run", async () =>
      createRun(supabase, { email_id, inngest_run_id, entity }),
    );

    // ----- 2) Classify intent (with idempotency cache) ---------------------
    const firstPass = await step.run("classify-intent", async () => {
      // Cache check: replay-safe skip.
      const cached = await findCachedOutput<Record<string, unknown>>(
        supabase,
        email_id,
        "intent_version",
        INTENT_VERSION,
        "tool_outputs",
      );
      const cachedFirst = cached?.intent_first_pass as
        | IntentAgentOutput
        | undefined;
      if (cachedFirst) return cachedFirst;

      const { output } = await invokeIntentAgent({
        email_id,
        inngest_run_id,
        subject: email.subject,
        body_text: email.body_text,
        sender_email: email.sender_email,
        sender_domain: email.sender_domain,
        mailbox: email.mailbox,
        entity,
        received_at: email.received_at,
      });

      await mergeToolOutputs(supabase, agent_run_id, "intent_first_pass", output);
      await updateRun(supabase, agent_run_id, {
        intent: output.intent,
        sub_type: output.sub_type,
        document_reference: output.document_reference,
        language: output.language,
        confidence: output.confidence,
        urgency: output.urgency,
        intent_version: output.intent_version,
        reasoning: output.reasoning,
      });
      return output;
    });

    // ----- 3) Hybrid Haiku→Sonnet escalation -------------------------------
    const needsEscalation =
      firstPass.confidence === "low" || firstPass.language === "fr";

    const classification: IntentAgentOutput = needsEscalation
      ? await step.run("classify-intent-escalate", async () => {
          const { output } = await invokeIntentAgent(
            {
              email_id,
              inngest_run_id,
              subject: email.subject,
              body_text: email.body_text,
              sender_email: email.sender_email,
              sender_domain: email.sender_domain,
              mailbox: email.mailbox,
              entity,
              received_at: email.received_at,
            },
            { modelOverride: "anthropic/claude-sonnet-4-6" },
          );
          await mergeToolOutputs(
            supabase,
            agent_run_id,
            "intent_escalated",
            output,
          );
          await updateRun(supabase, agent_run_id, {
            intent: output.intent,
            sub_type: output.sub_type,
            document_reference: output.document_reference,
            language: output.language,
            confidence: output.confidence,
            urgency: output.urgency,
            reasoning: output.reasoning,
          });
          return output;
        })
      : firstPass;

    // ----- 4) Route by intent ---------------------------------------------
    const route = await step.run("route-by-intent", async () => {
      const autoCopyDoc =
        classification.intent === "copy_document_request" &&
        classification.confidence === "high" &&
        classification.document_reference !== null &&
        classification.sub_type !== null;
      return { auto: autoCopyDoc } as const;
    });

    if (!route.auto) {
      await step.run("human-queue", async () => {
        await updateRun(supabase, agent_run_id, {
          status: "routed_human_queue",
          completed_at: new Date().toISOString(),
        });
      });
      return {
        agent_run_id,
        email_id,
        status: "routed_human_queue" as const,
      };
    }

    // From here on: document_reference + sub_type are guaranteed non-null.
    const documentReference = classification.document_reference!;
    const subType = classification.sub_type as SubType;

    // ----- 5) Fetch document ----------------------------------------------
    // TODO(inngest): Inngest v3.52 doesn't support per-step `retries`; the
    // spec calls for 3× exponential (30s / 2m / 10m) on this step specifically.
    // Current behaviour: function-level retries (3×) cover transient failures
    // but re-run earlier steps too. Revisit when Inngest exposes per-step retry.
    const fetchResult = await step.run("fetch-document", async () => {
      await updateRun(supabase, agent_run_id, { status: "fetching_document" });

      const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/automations/debtor/fetch-document`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AUTOMATION_WEBHOOK_SECRET ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          docType: subType,
          reference: documentReference,
          entity,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as FetchDocumentResponse;

      if (!res.ok || json.found === false) {
        const failure = json as { found: false; reason?: string };
        const reason = failure.reason ?? "fetch_failed";
        await mergeToolOutputs(supabase, agent_run_id, "fetch_result", {
          ok: false,
          reason,
        });
        if (reason === "not_found") {
          await updateRun(supabase, agent_run_id, {
            status: "copy_document_failed_not_found",
            completed_at: new Date().toISOString(),
          });
          throw new NonRetriableError(`fetch_not_found`);
        }
        if (reason === "invalid_reference_format" || reason === "unsupported_doc_type") {
          await updateRun(supabase, agent_run_id, {
            status: "copy_document_failed_not_found",
            completed_at: new Date().toISOString(),
          });
          throw new NonRetriableError(`fetch_${reason}`);
        }
        // timeout / upstream_error / fetch_failed → retriable
        throw new Error(`fetch-document transient: ${reason}`);
      }

      if (json.ambiguous) {
        await mergeToolOutputs(supabase, agent_run_id, "fetch_result", {
          ok: false,
          reason: "ambiguous",
          match_count: json.match_count ?? null,
        });
        await updateRun(supabase, agent_run_id, {
          status: "copy_document_needs_review",
          completed_at: new Date().toISOString(),
        });
        throw new NonRetriableError("fetch_ambiguous");
      }

      // Strip base64 before persisting — it belongs in memory, not JSONB.
      await mergeToolOutputs(supabase, agent_run_id, "fetch_result", {
        ok: true,
        filename: json.pdf.filename,
        metadata: json.metadata,
        request_id: json.request_id,
      });
      return json;
    });

    // ----- 6) Emotion detection -------------------------------------------
    const emotion = await step.run("detect-emotion", async () => {
      const result = detectEmotion(email.body_text, classification.language);
      await mergeToolOutputs(supabase, agent_run_id, "emotion", result);
      return result;
    });

    // ----- 7) Generate body (with one validator-retry) --------------------
    const body = await step.run("generate-body", async () => {
      await updateRun(supabase, agent_run_id, { status: "generating_body" });

      // NB: we previously tried a findCachedOutput against a non-existent
      // `agent_runs.body_html` column (it lives inside tool_outputs.body).
      // Inngest's own step memoization already handles replay-safety within
      // a function invocation, so a cross-invocation body cache is not
      // needed for phase-1 shadow mode.

      const input = {
        email_id,
        inngest_run_id,
        email_subject: email.subject,
        email_body_text: email.body_text,
        email_sender_email: email.sender_email,
        email_sender_first_name: email.sender_first_name ?? null,
        email_mailbox: email.mailbox,
        email_entity: entity,
        email_language: classification.language,
        intent_result_intent: "copy_document_request" as const,
        intent_result_sub_type: subType,
        intent_result_document_reference: documentReference,
        intent_result_confidence: "high" as const,
        fetched_document_invoice_id: fetchResult.metadata.invoice_id,
        fetched_document_filename: fetchResult.pdf.filename,
        fetched_document_document_type: fetchResult.metadata.document_type,
        fetched_document_created_on: fetchResult.metadata.created_on,
        emotion_trigger_match: emotion.match,
      };

      // TODO(validators): port the 8 body post-validators from
      // agents/debtor-copy-document-body-agent.md §Post-validator and retry
      // once with the appropriate addendum flag on failure. Scaffolding only
      // runs the single happy-path call right now.
      const { output } = await invokeBodyAgent(input);

      await mergeToolOutputs(supabase, agent_run_id, "body", {
        detected_tone: output.detected_tone,
        body_version: output.body_version,
        retries: 0,
      });
      await updateRun(supabase, agent_run_id, {
        body_version: output.body_version,
        detected_tone: output.detected_tone,
      });
      return output;
    });

    // ----- 8) Circuit-breaker check ---------------------------------------
    const breaker = await step.run("check-breaker", async () =>
      checkBreaker(supabase, BREAKER_KEY),
    );

    if (breaker === "open") {
      await step.run("human-queue-blocked", async () => {
        await updateRun(supabase, agent_run_id, {
          status: "login_failed_blocked",
          completed_at: new Date().toISOString(),
        });
      });
      return {
        agent_run_id,
        email_id,
        status: "login_failed_blocked" as const,
      };
    }

    // ----- 9) Create draft ------------------------------------------------
    // TODO(inngest): spec calls for per-step retries: 1 with screenshot
    // archival on transient failure. Simulated here via NonRetriableError for
    // terminal cases; function-level retry (3×) handles the 1× intent for
    // attach_failed / save_failed.
    const draft = await step.run("create-draft", async () => {
      await updateRun(supabase, agent_run_id, { status: "creating_draft" });

      const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/automations/debtor/create-draft`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.AUTOMATION_WEBHOOK_SECRET ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messageId: email.graph_message_id,
          bodyHtml: body.body_html,
          pdfBase64: fetchResult.pdf.base64,
          filename: fetchResult.pdf.filename,
          env: "production",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as CreateDraftResponse;

      if (!res.ok || json.success === false) {
        const failure = json as { success: false; reason?: string; screenshot?: string };
        const reason = failure.reason ?? "create_draft_failed";

        await mergeToolOutputs(supabase, agent_run_id, "draft_result", {
          ok: false,
          reason,
          screenshot: failure.screenshot ?? null,
        });

        if (reason === "login_failed") {
          await openBreaker(supabase, BREAKER_KEY, "iController login failed");
          // TODO(slack): port a Slack helper (see docs/browserless-patterns.md
          // or lib/alerts) and call it here. For scaffold, log only.
          await updateRun(supabase, agent_run_id, {
            status: "login_failed_blocked",
            completed_at: new Date().toISOString(),
          });
          throw new NonRetriableError("login_failed");
        }
        if (reason === "message_not_found") {
          await updateRun(supabase, agent_run_id, {
            status: "copy_document_needs_review",
            completed_at: new Date().toISOString(),
          });
          throw new NonRetriableError("message_not_found");
        }
        // attach_failed / save_failed → retriable
        throw new Error(`create-draft transient: ${reason}`);
      }

      // Probe succeeded from half_open → re-close the breaker.
      if (breaker === "half_open") {
        await closeBreaker(supabase, BREAKER_KEY);
      }

      await mergeToolOutputs(supabase, agent_run_id, "draft_result", {
        ok: true,
        draftUrl: json.draftUrl,
        screenshots: json.screenshots,
        bodyInjectionPath: json.bodyInjectionPath ?? null,
      });
      return json;
    });

    // ----- 10) Persist + mark drafted -------------------------------------
    await step.run("persist-run", async () => {
      await updateRun(supabase, agent_run_id, {
        draft_url: draft.draftUrl,
        status: "copy_document_drafted",
        completed_at: new Date().toISOString(),
      });
    });

    return {
      agent_run_id,
      email_id,
      status: "copy_document_drafted" as const,
      draft_url: draft.draftUrl,
    };
  },
);
