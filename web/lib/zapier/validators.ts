import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ValidationResult } from "@/lib/analytics/types";

export const ZapierMetricsSchema = z.object({
  activeZaps: z.number().int().nonnegative().nullable(),
  tasksUsed: z.number().int().nonnegative().nullable(),
  tasksLimit: z.number().int().nonnegative().nullable(),
  errorCount: z.number().int().nonnegative().nullable(),
  successRatePct: z.number().min(0).max(100).nullable(),
  topZaps: z
    .array(
      z.object({
        name: z.string(),
        taskCount: z.number(),
        errorCount: z.number().optional(),
      })
    )
    .nullable(),
});

export async function validateZapierData(
  rawMetrics: Record<string, unknown>
): Promise<ValidationResult> {
  const warnings: string[] = [];

  // 1. Schema validation
  const parsed = ZapierMetricsSchema.safeParse(rawMetrics);
  if (!parsed.success) {
    return {
      status: "failed",
      warnings: [`Schema validation failed: ${parsed.error.message}`],
      metrics: rawMetrics as any,
    };
  }

  // 2. All-null check: if every value is null, selectors are likely broken
  const allNull = Object.values(parsed.data).every((v) => v === null);
  if (allNull) {
    return {
      status: "failed",
      warnings: ["All extracted values are null -- selectors likely broken"],
      metrics: parsed.data,
    };
  }

  // 3. Staleness check: compare against most recent valid snapshot
  const admin = createAdminClient();
  const { data: previous } = await admin
    .from("zapier_snapshots")
    .select("tasks_used, active_zaps, validation_status")
    .eq("validation_status", "valid")
    .order("scraped_at", { ascending: false })
    .limit(1)
    .single();

  if (previous && parsed.data.tasksUsed !== null) {
    const prevTasks = previous.tasks_used ?? 0;
    // Sudden drop to zero from non-zero = likely scraper failure
    if (prevTasks > 0 && parsed.data.tasksUsed === 0) {
      warnings.push(
        `Tasks dropped from ${prevTasks} to 0 -- likely scraper failure`
      );
    }
    // >90% drop = suspicious
    const dropPct =
      prevTasks > 0
        ? ((prevTasks - parsed.data.tasksUsed) / prevTasks) * 100
        : 0;
    if (dropPct > 90) {
      warnings.push(
        `Tasks dropped ${dropPct.toFixed(0)}% (${prevTasks} -> ${parsed.data.tasksUsed})`
      );
    }
  }

  if (previous && parsed.data.activeZaps !== null) {
    const prevZaps = previous.active_zaps ?? 0;
    if (prevZaps > 0 && parsed.data.activeZaps === 0) {
      warnings.push(
        `Active zaps dropped from ${prevZaps} to 0 -- likely scraper failure`
      );
    }
  }

  return {
    status: warnings.length > 0 ? "suspicious" : "valid",
    warnings,
    metrics: parsed.data,
  };
}
