import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseHourCalculationExcel } from "@/lib/automations/uren-controle/excel-parser";
import { runAllRules, isSuppressed } from "@/lib/automations/uren-controle/rules";
import { loadKnownExceptions } from "@/lib/automations/uren-controle/known-exceptions";

const AUTOMATION_NAME = "uren-controle";
const STORAGE_BUCKET = "automation-files";

/**
 * Inngest function: Process Hour Calculation Excel uploaded via Zapier.
 * Decodes base64 content, uploads to Supabase Storage, parses and runs rules.
 *
 * Flow: Zapier → webhook (base64 file) → Inngest → decode → upload → parse → flag → log
 * No SharePoint auth needed — Zapier delivers file content directly.
 */
export const processUrenControle = inngest.createFunction(
  {
    id: "process-uren-controle",
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
  { event: "automation/uren-controle.triggered" },
  async ({ event, step }) => {
    const environment = event.data.environment ?? "acceptance";

    // Step 1: Fetch/decode file and upload to Supabase Storage
    // Supports two delivery modes:
    //   - downloadUrl: SharePoint signed URL (simpler Zapier setup, no base64 encoding step)
    //   - contentBase64: raw base64 (fallback for other trigger sources)
    const fileRef = await step.run("decode-upload", async () => {
      let buffer: Buffer;
      if (event.data.downloadUrl) {
        const res = await fetch(event.data.downloadUrl);
        if (!res.ok)
          throw new Error(
            `File download failed: ${res.status} ${res.statusText}`,
          );
        buffer = Buffer.from(await res.arrayBuffer());
      } else {
        buffer = Buffer.from(event.data.contentBase64!, "base64");
      }
      const runId = crypto.randomUUID();
      const storagePath = `uren-controle/${runId}/${event.data.filename}`;

      const admin = createAdminClient();
      const { error } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });

      if (error) throw new Error(`Storage upload failed: ${error.message}`);

      return { storagePath, filename: event.data.filename, runId };
    });

    // Step 2: Create run record in database
    const runId = await step.run("create-run-record", async () => {
      const admin = createAdminClient();

      // Extract period from filename (e.g., "Hour_Calculation_2025-08.xlsx" → "2025-08")
      const periodMatch = event.data.filename.match(/(\d{4})-?(\d{2})/);
      const period = periodMatch
        ? `${periodMatch[1]}-${periodMatch[2]}`
        : null;

      const { data, error } = await admin
        .from("uren_controle_runs")
        .insert({
          id: fileRef.runId,
          filename: event.data.filename,
          period,
          source_url: event.data.sourceUrl ?? null,
          storage_path: fileRef.storagePath,
          status: "parsing",
          environment,
          triggered_by: event.data.triggeredBy,
        })
        .select("id")
        .single();

      if (error) throw new Error(`Run record insert failed: ${error.message}`);
      return data.id as string;
    });

    // Step 3: Parse Excel and run detection rules
    const { flaggedCount } = await step.run("parse-and-flag", async () => {
      const admin = createAdminClient();

      // Download from Storage (file was already uploaded in decode-upload step)
      const { data: fileData, error: dlError } = await admin.storage
        .from(STORAGE_BUCKET)
        .download(fileRef.storagePath);

      if (dlError || !fileData) {
        throw new Error(`Storage download failed: ${dlError?.message}`);
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());

      // Parse Excel
      const parsed = await parseHourCalculationExcel(buffer);
      await admin
        .from("uren_controle_runs")
        .update({
          parsed_employee_count: parsed.employees.length,
          status: "rules_running",
        })
        .eq("id", runId);

      // Load known exceptions
      const exceptions = await loadKnownExceptions();

      // Run detection rules
      const flags = runAllRules(parsed, exceptions);

      // Insert flagged rows (include suppressed_by_exception boolean)
      const rows = flags.map((f) => ({
        run_id: runId,
        employee_name: f.employeeName,
        employee_category: f.employeeCategory,
        rule_type: f.ruleType,
        severity: f.severity,
        day_date: f.dayDate,
        week_number: f.weekNumber,
        raw_values: f.rawValues,
        description: f.description,
        suppressed_by_exception: isSuppressed(f, exceptions),
      }));

      if (rows.length) {
        const { error: insertError } = await admin
          .from("uren_controle_flagged_rows")
          .insert(rows);
        if (insertError) {
          throw new Error(`Flagged rows insert failed: ${insertError.message}`);
        }
      }

      await admin
        .from("uren_controle_runs")
        .update({ flagged_count: rows.length })
        .eq("id", runId);

      return { flaggedCount: rows.length };
    });

    // Step 4: Log success
    await step.run("log-success", async () => {
      const admin = createAdminClient();

      await admin
        .from("uren_controle_runs")
        .update({
          flagged_count: flaggedCount,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      await admin.from("automation_runs").insert({
        automation: AUTOMATION_NAME,
        status: "completed",
        result: {
          filename: fileRef.filename,
          storagePath: fileRef.storagePath,
          flaggedCount,
          environment,
          triggeredBy: event.data.triggeredBy,
        },
        triggered_by: event.data.triggeredBy,
        completed_at: new Date().toISOString(),
      });
    });

    return { success: true, filename: fileRef.filename, flaggedCount };
  },
);
