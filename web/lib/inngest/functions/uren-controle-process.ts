import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseHourCalculationExcel } from "@/lib/automations/uren-controle/excel-parser";
import {
  loadKnownExceptions,
  shouldSuppress,
} from "@/lib/automations/uren-controle/known-exceptions";
import { runAllRules } from "@/lib/automations/uren-controle/rules";
import type { Environment } from "@/lib/automations/uren-controle/types";

const AUTOMATION_NAME = "uren-controle";
const STORAGE_BUCKET = "automation-files";

/**
 * Inngest function: process a Hour Calculation Excel uploaded via Zapier.
 *
 * Pipeline:
 *   1. decode-upload     -- base64 → buffer → Supabase Storage
 *   2. create-run-record -- INSERT uren_controle_runs (environment-aware)
 *   3. parse-and-flag    -- parse Excel, run rules, insert flagged rows
 *   4. log-success       -- update run status, log automation_runs
 *
 * Environment default is 'acceptance' per CLAUDE.md test-first pattern.
 */
export const processUrenControle = inngest.createFunction(
  {
    id: "process-uren-controle",
    retries: 2,
    onFailure: async ({ error, event }) => {
      const admin = createAdminClient();
      const triggeredBy =
        (event.data?.event as { data?: { triggeredBy?: string } } | undefined)
          ?.data?.triggeredBy ?? "unknown";
      await admin.from("automation_runs").insert({
        automation: AUTOMATION_NAME,
        status: "failed",
        error_message: error.message,
        triggered_by: triggeredBy,
        completed_at: new Date().toISOString(),
      });
    },
  },
  { event: "automation/uren-controle.triggered" },
  async ({ event, step }) => {
    const environment: Environment = event.data.environment ?? "acceptance";

    // Step 1: decode base64 → upload to Supabase Storage
    const fileRef = await step.run("decode-upload", async () => {
      const buffer = Buffer.from(event.data.contentBase64, "base64");
      if (buffer.length < 100) {
        throw new Error(
          `Decoded file too small (${buffer.length} bytes) — likely invalid base64`,
        );
      }

      // We don't know runId yet at this point; use a timestamp-scoped path.
      // The run record (created next) will store this storage_path.
      const scope = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const storagePath = `uren-controle/${scope}/${event.data.filename}`;

      const admin = createAdminClient();
      const { error } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);

      return { storagePath, filename: event.data.filename };
    });

    // Step 2: insert the uren_controle_runs row
    const runId = await step.run("create-run-record", async () => {
      const admin = createAdminClient();
      // Extract period YYYY-MM from the filename if present
      const periodMatch = event.data.filename.match(/(\d{4})[-_](\d{2})/);
      const period = periodMatch
        ? `${periodMatch[1]}-${periodMatch[2]}`
        : null;

      const { data, error } = await admin
        .from("uren_controle_runs")
        .insert({
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
      if (error || !data)
        throw new Error(`uren_controle_runs insert: ${error?.message}`);
      return data.id as string;
    });

    // Step 3: parse Excel, run rules, insert flagged rows
    const { flaggedCount } = await step.run("parse-and-flag", async () => {
      const admin = createAdminClient();

      const { data: fileData, error: dlErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .download(fileRef.storagePath);
      if (dlErr || !fileData)
        throw new Error(`Storage download failed: ${dlErr?.message}`);

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const parsed = await parseHourCalculationExcel(buffer);

      await admin
        .from("uren_controle_runs")
        .update({
          parsed_employee_count: parsed.employees.length,
          status: "rules_running",
          period: parsed.period,
        })
        .eq("id", runId);

      const exceptions = await loadKnownExceptions();
      const flags = runAllRules(parsed, exceptions);

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
        suppressed_by_exception: shouldSuppress(
          exceptions,
          f.employeeName,
          f.ruleType,
        ),
      }));

      if (rows.length) {
        const { error } = await admin
          .from("uren_controle_flagged_rows")
          .insert(rows);
        if (error)
          throw new Error(`flagged_rows insert: ${error.message}`);
      }

      await admin
        .from("uren_controle_runs")
        .update({ flagged_count: rows.length })
        .eq("id", runId);

      return { flaggedCount: rows.length };
    });

    // Step 4: log success
    await step.run("log-success", async () => {
      const admin = createAdminClient();
      const completedAt = new Date().toISOString();

      await admin
        .from("uren_controle_runs")
        .update({ status: "completed", completed_at: completedAt })
        .eq("id", runId);

      await admin.from("automation_runs").insert({
        automation: AUTOMATION_NAME,
        status: "completed",
        result: {
          runId,
          filename: fileRef.filename,
          storagePath: fileRef.storagePath,
          flaggedCount,
          environment,
          triggeredAt: event.data.triggeredAt,
          sourceUrl: event.data.sourceUrl ?? null,
        },
        triggered_by: event.data.triggeredBy,
        completed_at: completedAt,
      });
    });

    return { success: true, runId, flaggedCount, environment };
  },
);
