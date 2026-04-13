import { createAdminClient } from "@/lib/supabase/admin";
import type { KnownException, RuleType } from "./types";

/**
 * Load active known_exceptions rows for the uren-controle automation from Supabase.
 * Called once per Inngest run; result is passed to the rules engine.
 */
export async function loadKnownExceptions(): Promise<KnownException[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("known_exceptions")
    .select("employee_name, rule_type, reason")
    .eq("automation", "uren-controle")
    .eq("active", true);

  if (error) throw new Error(`known_exceptions load: ${error.message}`);

  return (data ?? []).map((r) => ({
    employeeName: r.employee_name,
    ruleType: r.rule_type as RuleType,
    reason: r.reason,
  }));
}

/**
 * Pure predicate: should a flag for (employeeName, ruleType) be suppressed?
 * Matching is case-insensitive on the employee name to tolerate casing drift
 * between the Excel input and the Supabase seed.
 */
export function shouldSuppress(
  exceptions: KnownException[],
  employeeName: string,
  ruleType: RuleType,
): boolean {
  const target = employeeName.toLowerCase();
  return exceptions.some(
    (e) => e.employeeName.toLowerCase() === target && e.ruleType === ruleType,
  );
}
