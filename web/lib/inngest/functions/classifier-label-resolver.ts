// Phase 56-02 wave 3: classifier-label-resolver Inngest worker.
//
// Listens on `debtor-email/label-resolve.requested` (emitted by
// classifier-verdict-worker when category_key='unknown' approves).
// Runs the 4-layer resolveDebtor pipeline and writes an audit row in
// debtor.email_labels. NO outlook / iController side-effects today —
// matched-customer iController DOM step is Phase 56.8.
//
// retries: 0 — same rationale as the verdict-worker. NXT-Zap timeouts
// are surfaced as automation_runs.status='failed' so the kanban queue
// retry button is the recovery path; no cascading retries that would
// block the next event.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence } from "@/lib/pipeline-events/types";
import {
  resolveDebtor,
  type ResolveResult,
} from "@/lib/automations/debtor-email/resolve-debtor";
import { buildIcontrollerMessageUrl } from "@/lib/automations/icontroller/url";
import {
  ICONTROLLER_MAILBOXES,
  isKnownMailbox,
} from "@/lib/automations/debtor-email/mailboxes";
import { evaluateSideEffects } from "@/lib/swarms/side-effects";

// Inngest's typed `inngest.send` would reject a runtime-built event name
// here as well; we know the name statically but use the cast pattern from
// coordinator-orchestrator.ts:25 to keep CLAUDE.md commit-dae6276 binding-
// safety: NEVER destructure inngest.send.
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export const classifierLabelResolver = inngest.createFunction(
  { id: "classifier/label-resolver", retries: 0 },
  { event: "debtor-email/label-resolve.requested" },
  async ({ event, step }) => {
    const {
      automation_run_id,
      message_id,
      source_mailbox,
      category_key,
      swarm_type,
    } = event.data;

    const admin = createAdminClient();

    // Load email + per-mailbox labeling settings in parallel.
    const [emailRow, settingsRow] = await Promise.all([
      step.run("load-email", async () => {
        const { data, error } = await admin
          .schema("email_pipeline")
          .from("emails")
          .select(
            "id, conversation_id, subject, body_text, sender_email, mailbox",
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
          .select("dry_run, nxt_database, brand_id, entity, icontroller_company")
          .eq("source_mailbox", source_mailbox)
          .maybeSingle();
        return data;
      }),
    ]);

    if (!emailRow) {
      await step.run("mark-failed-email-missing", async () => {
        await admin
          .from("automation_runs")
          .update({
            status: "failed",
            error_message: `email row not found for message_id=${message_id}`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", automation_run_id);
        await emitAutomationRunStale(admin, `${swarm_type}-review`);
      });
      return { ok: false, reason: "email_not_found" };
    }

    const dryRun = settingsRow?.dry_run ?? true;
    const nxtDatabase: string | null = settingsRow?.nxt_database ?? null;
    const brandId: string | null = settingsRow?.brand_id ?? null;

    // Run resolver. Errors are caught + surfaced via email_labels.error so
    // the kanban can show the failure without blocking other events.
    const resolverResult = await step.run("resolve-debtor", async () => {
      let result: ResolveResult;
      let resolverError: string | null = null;
      if (!nxtDatabase) {
        // No NXT context → only thread inheritance is achievable.
        result = await runThreadInheritanceOnly({
          admin,
          conversation_id: emailRow.conversation_id ?? null,
        });
      } else {
        try {
          result = await resolveDebtor({
            nxt_database: nxtDatabase,
            brand_id: brandId,
            conversation_id: emailRow.conversation_id ?? null,
            from_email: emailRow.sender_email ?? null,
            subject: emailRow.subject ?? "",
            body_text: emailRow.body_text ?? "",
          });
        } catch (err) {
          resolverError = err instanceof Error ? err.message : String(err);
          result = {
            method: "unresolved",
            customer_account_id: null,
            customer_name: null,
            confidence: "none",
          };
        }
      }
      return { result, resolverError };
    });

    const { result, resolverError } = resolverResult;

    // Insert audit row in debtor.email_labels.
    const labelStatus = dryRun
      ? "dry_run"
      : result.customer_account_id
        ? "pending"
        : "skipped";

    // Phase 67 (D-10) — separate iController-tagging outcome from resolver
    // outcome. The label-resolver writes the initial value; the tagger
    // (Plan 67-05) UPDATEs to 'tagged'/'failed' on completion.
    const icontrollerTagStatus: string =
      result.customer_account_id === null
        ? "pending" // unresolved — column irrelevant but default-preserving
        : dryRun
          ? "skipped_dry_run"
          : (settingsRow?.icontroller_company ?? null) === null
            ? "skipped_unconfigured"
            : "pending";

    const labelInsertResult = await step.run("write-email-label", async () => {
      const { data, error } = await admin
        .schema("debtor")
        .from("email_labels")
        .insert({
          email_id: emailRow.id,
          icontroller_mailbox_id: isKnownMailbox(source_mailbox)
            ? ICONTROLLER_MAILBOXES[source_mailbox]
            : 0,
          source_mailbox,
          debtor_id: result.customer_account_id,
          debtor_name: result.customer_name,
          customer_account_id: result.customer_account_id,
          conversation_id: emailRow.conversation_id ?? null,
          confidence: result.confidence,
          method: result.method,
          reason: buildReason(result, {
            nxtDatabaseSet: !!nxtDatabase,
            brandIdSet: !!brandId,
            resolverError,
          }),
          nxt_database: nxtDatabase,
          status: labelStatus,
          icontroller_tag_status: icontrollerTagStatus,
          error: resolverError,
        })
        .select("id")
        .single();
      if (error) {
        throw new Error(`email_labels insert failed: ${error.message}`);
      }

      // Phase 70 — TELE-01 dual-write
      // Three branches share this step.run; emit one pipeline_events row
      // reflecting which one we're in:
      //  - resolver-error  → decision='unresolved', confidence=null,
      //                      decision_details.failure_reason set
      //  - matched         → decision='resolved', confidence from numericConfidence
      //  - no-match        → decision='unresolved', confidence from numericConfidence
      const isResolved = result.customer_account_id !== null;
      const decision = isResolved ? "resolved" : "unresolved";
      const confidence = resolverError
        ? null
        : numericConfidence(
            result.confidence as
              | "high"
              | "medium"
              | "low"
              | "none"
              | null
              | undefined,
          );
      await emitPipelineEvent(admin, {
        swarm_type: swarm_type ?? "debtor-email",
        stage: 2,
        email_id: emailRow.id,
        decision,
        confidence,
        decision_details: resolverError
          ? {
              failure_reason: resolverError,
              customer_account_id: result.customer_account_id,
              customer_name: result.customer_name,
              method: result.method,
              candidates_considered: result.candidates_considered ?? null,
            }
          : {
              customer_account_id: result.customer_account_id,
              customer_name: result.customer_name,
              method: result.method,
              candidates_considered: result.candidates_considered ?? null,
            },
        automation_run_id: automation_run_id ?? null,
        triggered_by: "pipeline",
      });

      return data as { id: string };
    });

    // Close out the automation_run. Status maps to kanban stage:
    //   matched + dry_run     → 'predicted' (kanban: review)
    //   matched + live        → 'completed' (kanban: done — option B)
    //   unresolved (any mode) → 'predicted' (kanban: review for manual triage)
    //   resolver error        → 'failed'
    const finalStatus = resolverError
      ? "failed"
      : !result.customer_account_id
        ? "predicted" // unresolved → kanban review for manual triage
        : dryRun
          ? "predicted" // matched dry_run → kanban review for HITL approve/reject
          : "completed"; // matched live → done (audit-only via Bulk Review)

    await step.run("close-automation-run", async () => {
      await admin
        .from("automation_runs")
        .update({
          status: finalStatus,
          error_message: resolverError,
          result: {
            method: result.method,
            confidence: result.confidence,
            customer_account_id: result.customer_account_id,
            customer_name: result.customer_name,
            candidates_considered: result.candidates_considered,
            dry_run: dryRun,
            email_id: emailRow.id,
          },
          completed_at: new Date().toISOString(),
        })
        .eq("id", automation_run_id);
      await emitAutomationRunStale(admin, `${swarm_type}-review`);
    });

    // Phase 66 D-03 — Stage 2 → Stage 3 seam. Emit coordinator.requested
    // with the resolved customer fields so the coordinator runs with full
    // Stage-2 context (no re-resolve). Wrapped in step.run for replay-
    // safety: `new Date().toISOString()` is non-deterministic and the
    // event payload becomes downstream coordinator state. Inline cast on
    // `inngest.send` per CLAUDE.md commit dae6276 — NEVER destructure.
    await step.run("emit-coordinator", async () =>
      (inngest.send as unknown as SendFn)({
        name: "debtor-email/coordinator.requested",
        data: {
          email_id: emailRow.id,
          automation_run_id,
          entity: settingsRow?.entity ?? null,
          subject: emailRow.subject ?? "",
          body_text: emailRow.body_text ?? "",
          sender_email: emailRow.sender_email ?? "",
          mailbox: emailRow.mailbox,
          received_at: new Date().toISOString(),
          graph_message_id: message_id,
          customer_account_id: result.customer_account_id,
          customer_name: result.customer_name,
        },
      }),
    );

    // Phase 68 (SWRM-04) — Stage 2 side-effect dispatch via swarms.side_effects[].
    // Call-site guard: isKnownMailbox is a function call, not an equality
    // match, so it stays inline (registry gates are simple equality only).
    // Registry gate (dry_run, customer_account_id_present, icontroller_company_present)
    // mirrors the prior literal AND-chain.
    if (isKnownMailbox(source_mailbox)) {
      const dispatches = await evaluateSideEffects(
        admin,
        "debtor-email",
        "stage2_match_live",
        {
          dry_run: dryRun,
          customer_account_id_present: result.customer_account_id !== null,
          icontroller_company_present:
            (settingsRow?.icontroller_company ?? null) !== null,
        },
      );
      if (dispatches.length > 0) {
        // Production-only: the acceptance iController host was retired by
        // Billtrust; the live-mode gate (dry_run=false) above already implies
        // production. Mirrors the hard-coded "production" in the tagger and
        // the cleanup-worker.
        const mailboxListUrl = buildIcontrollerMessageUrl({
          source_mailbox,
          env: "production",
        });
        for (const dispatch of dispatches) {
          if (dispatch.kind !== "inngest_event") continue;
          await step.run(`emit-${dispatch.event}`, async () =>
            (inngest.send as unknown as SendFn)({
              name: dispatch.event,
              data: {
                email_label_id: labelInsertResult.id,
                email_id: emailRow.id,
                automation_run_id,
                customer_account_id: result.customer_account_id as string,
                customer_name: result.customer_name,
                source_mailbox,
                icontroller_mailbox_id: ICONTROLLER_MAILBOXES[source_mailbox],
                icontroller_company: settingsRow?.icontroller_company ?? null,
                icontroller_message_url: mailboxListUrl,
                entity: settingsRow?.entity ?? null,
                sender_email: emailRow.sender_email ?? "",
                subject: emailRow.subject ?? "",
                received_at: new Date().toISOString(),
              },
            }),
          );
        }
      }
    }

    return {
      ok: true,
      method: result.method,
      confidence: result.confidence,
      customer_account_id: result.customer_account_id,
      status: finalStatus,
      category_key,
    };
  },
);

/**
 * No-NXT fallback. Mirrors layer 1 of resolveDebtor inline so we don't
 * touch NXT-Zap when context is absent. Same shape as the helper in
 * /api/automations/debtor/label-email/route.ts (kept duplicated rather
 * than extracted because both call sites are simple and the route is
 * still alive in parallel).
 */
async function runThreadInheritanceOnly(args: {
  admin: ReturnType<typeof createAdminClient>;
  conversation_id: string | null;
}): Promise<ResolveResult> {
  if (!args.conversation_id) {
    return {
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
    };
  }
  const { data: prior } = await args.admin
    .schema("debtor")
    .from("email_labels")
    .select("customer_account_id, debtor_id, debtor_name")
    .eq("conversation_id", args.conversation_id)
    .or("customer_account_id.not.is.null,debtor_id.not.is.null")
    .in("status", ["labeled", "dry_run"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const accountId =
    (prior as { customer_account_id?: string | null; debtor_id?: string | null } | null)
      ?.customer_account_id ?? (prior as { debtor_id?: string | null } | null)?.debtor_id ?? null;
  if (accountId) {
    return {
      method: "thread_inheritance",
      customer_account_id: accountId,
      customer_name:
        (prior as { debtor_name?: string | null } | null)?.debtor_name ?? null,
      confidence: "high",
    };
  }
  return {
    method: "unresolved",
    customer_account_id: null,
    customer_name: null,
    confidence: "none",
  };
}

function buildReason(
  result: ResolveResult,
  ctx: { nxtDatabaseSet: boolean; brandIdSet: boolean; resolverError: string | null },
): string {
  if (ctx.resolverError) return `resolver error: ${ctx.resolverError}`;
  if (!ctx.nxtDatabaseSet)
    return "labeling_settings.nxt_database not configured for this mailbox";
  switch (result.method) {
    case "thread_inheritance":
      return "inherited from prior label in same conversation";
    case "sender_match":
      return "matched via sender → contact_person → top-level customer";
    case "identifier_match":
      return "matched via invoice number(s)";
    case "llm_tiebreaker":
      return result.reason
        ? `LLM tiebreaker (${result.candidates_considered ?? 0} candidates): ${result.reason}`
        : `LLM tiebreaker (${result.candidates_considered ?? 0} candidates)`;
    case "unresolved":
      if (!ctx.brandIdSet)
        return "no thread inheritance and brand_id not configured (NXT lookups skipped)";
      return "no deterministic signal";
  }
}
