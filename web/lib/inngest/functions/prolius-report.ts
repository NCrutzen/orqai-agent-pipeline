import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadProliusReport } from "@/lib/automations/prolius-report/browser";
import { uploadToCouchDrop } from "@/lib/automations/prolius-report/sftp";

const AUTOMATION_NAME = "prolius-report";
const STORAGE_BUCKET = "automation-files";

/**
 * Inngest function: Download Prolius report via browser automation,
 * upload to CouchDrop SFTP, and log the result.
 */
export const processProliusReport = inngest.createFunction(
  {
    id: "process-prolius-report",
    retries: 2,
    onFailure: async ({ error, event }) => {
      const admin = createAdminClient();
      await admin.from("automation_runs").insert({
        automation: AUTOMATION_NAME,
        status: "failed",
        error_message: error.message,
        triggered_by: event.data.event.data.triggeredBy,
        completed_at: new Date().toISOString(),
      });
    },
  },
  { event: "automation/prolius-report.triggered" },
  async ({ event, step }) => {
    // Step 1: Download report from Prolius via Browserless.io
    // Store in Supabase Storage (too large for step return value)
    const fileRef = await step.run("download-prolius-report", async () => {
      const { buffer, filename } = await downloadProliusReport();

      const admin = createAdminClient();
      const storagePath = `prolius-reports/${filename}`;

      const { error } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });

      if (error) throw new Error(`Storage upload failed: ${error.message}`);

      return { storagePath, filename };
    });

    // Step 2: Download from Storage and upload to CouchDrop via SFTP
    await step.run("upload-to-couchdrop", async () => {
      const admin = createAdminClient();

      const { data, error } = await admin.storage
        .from(STORAGE_BUCKET)
        .download(fileRef.storagePath);

      if (error || !data) {
        throw new Error(`Storage download failed: ${error?.message}`);
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      await uploadToCouchDrop(buffer, fileRef.filename);
    });

    // Step 3: Log success
    await step.run("log-success", async () => {
      const admin = createAdminClient();
      await admin.from("automation_runs").insert({
        automation: AUTOMATION_NAME,
        status: "completed",
        result: {
          filename: fileRef.filename,
          storagePath: fileRef.storagePath,
          triggeredBy: event.data.triggeredBy,
          emailSubject: event.data.emailSubject,
        },
        triggered_by: event.data.triggeredBy,
        completed_at: new Date().toISOString(),
      });
    });

    return { success: true, filename: fileRef.filename };
  },
);
