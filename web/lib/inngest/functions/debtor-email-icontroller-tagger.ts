// Phase 67 (D-01, D-03, D-06, D-10, R-01) — iController DOM tagging side-effect.
//
// Subscribes to debtor-email/icontroller-tag.requested (emitted by
// classifier-label-resolver after a matched-customer + live-mode + configured
// INSERT into email_labels). Owns the search-and-click navigation: lands on
// the mailbox-LIST URL, locates the row via findMessageRow (sender + subject
// + received_at match), clicks into the detail page, parses
// icontroller_msg_id from page.url(), then drives labelEmailInIcontroller
// (Plan 03, refactored in Plan 05 to accept an existing Page).
//
// Failure handling (D-06): catches every error inline; UPDATEs the row with
// status='failed' + error text; returns ok:true. Inngest run STAYS GREEN.
// The deferred-run signal lives entirely on the data row so Bulk Review
// (Plan 06) can surface it.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import {
  openIControllerSession,
  closeIControllerSession,
} from "@/lib/automations/icontroller/session";
import { findMessageRow } from "@/lib/automations/icontroller/find-message-row";
import {
  labelEmailInIcontroller,
  type LabelEmailResult,
  type LabelEmailStatus,
} from "@/lib/automations/debtor-email/label-email-in-icontroller";

type IcontrollerTagStatus =
  | "pending"
  | "tagged"
  | "skipped_dry_run"
  | "skipped_unconfigured"
  | "failed";

function mapLabelStatusToTagStatus(
  status: LabelEmailStatus,
): IcontrollerTagStatus {
  switch (status) {
    case "labeled":
    case "already_labeled":
      return "tagged";
    case "brand_mismatch":
    case "skipped_conflict":
    case "failed":
      return "failed";
  }
}

function buildErrorMessage(result: LabelEmailResult): string | null {
  switch (result.status) {
    case "labeled":
    case "already_labeled":
      return null;
    case "brand_mismatch":
      return `brand_mismatch: ${result.reason ?? "unknown"}`;
    case "skipped_conflict":
      return `skipped_conflict: ${result.reason ?? "unknown"}`;
    case "failed":
      return result.reason ?? "unknown failure";
  }
}

function parseMsgIdFromUrl(url: string): number | null {
  const m = url.match(/[?&]msg=(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// Production-only by design: the acceptance iController host
// (test-walkerfire-testing.icontroller.billtrust.com) was retired by
// Billtrust; the live-mode gate in classifier-label-resolver
// (dry_run=false) already implies production traffic. Mirrors the
// hard-coded "production" arg in debtor-email-icontroller-cleanup-worker.
const ENV = "production" as const;

export const debtorEmailIcontrollerTagger = inngest.createFunction(
  {
    id: "automations/debtor-email-icontroller-tagger",
    // D-03: retries=1. Browserless flakiness is real; stuck-on-page run
    // amplifies cost. 1-row blast radius ⇒ 1 retry safe.
    retries: 1,
    // D-03: cap parallel runs per mailbox at 2 — prevents thundering-herd
    // on iController for any single inbox while allowing cross-mailbox parallelism.
    concurrency: [{ key: "event.data.source_mailbox", limit: 2 }],
  },
  { event: "debtor-email/icontroller-tag.requested" },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const {
      email_label_id,
      email_id,
      customer_account_id,
      customer_name,
      source_mailbox,
      icontroller_message_url, // mailbox-LIST URL (Option A from RESEARCH § URL Construction)
      entity,
      sender_email,
      subject,
      received_at,
    } = event.data;

    let icontrollerMsgId: number | null = null;
    const session = await openIControllerSession(ENV);
    const { page } = session;

    try {
      // Step 2: navigate to mailbox-LIST page (NOT 'networkidle' on SPA — D-18).
      await page.goto(icontroller_message_url, {
        waitUntil: "domcontentloaded",
      });

      // Step 3: search-and-click. On miss → bail out with explicit reason so
      // Bulk Review can surface "row not found" distinctly from DOM failures.
      const found = await step.run("find-and-click", async () =>
        findMessageRow(page, { sender_email, subject, received_at }),
      );

      if (!found.found || !found.detail_url) {
        await step.run("update-email-label-not-found", async () => {
          await admin
            .schema("debtor")
            .from("email_labels")
            .update({
              icontroller_tag_status: "failed",
              error: `message_not_found${found.debug ? ` ${found.debug}` : ""}`,
            })
            .eq("id", email_label_id);
          await emitAutomationRunStale(admin, "debtor-email-review");
        });
        return {
          ok: true,
          status: "failed" as IcontrollerTagStatus,
          email_label_id,
          email_id,
        };
      }

      // Step 4: parse msg_id from the detail URL the click navigated us to.
      icontrollerMsgId =
        found.icontroller_msg_id ?? parseMsgIdFromUrl(found.detail_url);

      // Step 5: invoke label module on the existing detail-page state.
      const tagResult = await step.run("invoke-tagger", async () => {
        return labelEmailInIcontroller({
          page,
          customer_account_id,
          customer_name: customer_name ?? undefined,
          source_mailbox,
          entity: entity ?? null,
        });
      });

      const tagStatus = mapLabelStatusToTagStatus(tagResult.status);
      const errorText = buildErrorMessage(tagResult);

      await step.run("update-email-label", async () => {
        const updatePayload: Record<string, unknown> = {
          icontroller_tag_status: tagStatus,
          icontroller_msg_id: icontrollerMsgId,
          error: errorText,
        };
        if (tagResult.screenshot_before_url) {
          updatePayload.screenshot_before_url = tagResult.screenshot_before_url;
        }
        if (tagResult.screenshot_after_url) {
          updatePayload.screenshot_after_url = tagResult.screenshot_after_url;
        }
        if (tagResult.screenshot_before_path) {
          updatePayload.screenshot_before_path = tagResult.screenshot_before_path;
        }
        if (tagResult.screenshot_after_path) {
          updatePayload.screenshot_after_path = tagResult.screenshot_after_path;
        }
        if (tagStatus === "tagged") {
          updatePayload.labeled_at = new Date().toISOString();
        }
        const { error } = await admin
          .schema("debtor")
          .from("email_labels")
          .update(updatePayload)
          .eq("id", email_label_id);
        if (error) {
          throw new Error(`email_labels update failed: ${error.message}`);
        }
      });

      await step.run("emit-stale", async () => {
        await emitAutomationRunStale(admin, "debtor-email-review");
      });

      return {
        ok: true,
        status: tagStatus,
        email_label_id,
        email_id,
        icontroller_msg_id: icontrollerMsgId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await step.run("update-email-label-error", async () => {
        await admin
          .schema("debtor")
          .from("email_labels")
          .update({
            icontroller_tag_status: "failed",
            // icontrollerMsgId may be set if the throw happened post-search-and-click;
            // include it so a partial-success row stays diagnosable.
            ...(icontrollerMsgId !== null
              ? { icontroller_msg_id: icontrollerMsgId }
              : {}),
            error: `tagger error: ${message}`,
          })
          .eq("id", email_label_id);
        await emitAutomationRunStale(admin, "debtor-email-review");
      });
      return {
        ok: true,
        status: "failed" as IcontrollerTagStatus,
        email_label_id,
        email_id,
        error: message,
      };
    } finally {
      await closeIControllerSession(session).catch(() => null);
    }
  },
);
