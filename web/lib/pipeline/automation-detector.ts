/**
 * Automation detector: cross-references the systems registry with the architect
 * blueprint and agent specs to identify systems needing browser automation.
 *
 * Called as an Inngest step after the main pipeline stages complete.
 * When browser-automation systems are found, the pipeline enters the
 * automation sub-pipeline (SOP upload -> vision analysis -> annotation review).
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface DetectedAutomationTask {
  agentName: string;
  systemName: string;
  systemId: string;
  reason: string;
}

/**
 * Detect which project-linked systems require browser automation.
 *
 * 1. Queries system_project_links for the project
 * 2. Filters to browser-automation integration method
 * 3. Cross-references system names with architect blueprint and agent specs
 *
 * Returns an empty array when no browser-automation systems are linked,
 * causing the pipeline to skip the automation sub-pipeline entirely.
 */
export async function detectAutomationNeeds(
  projectId: string,
  blueprint: string,
  agentSpecs: string
): Promise<DetectedAutomationTask[]> {
  const admin = createAdminClient();

  // Get project-linked systems with their details
  const { data: links } = await admin
    .from("system_project_links")
    .select("systems(id, name, integration_method, url)")
    .eq("project_id", projectId);

  if (!links?.length) return [];

  // Filter to browser-automation systems only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const browserSystems = (links as any[])
    .map((l) => l.systems)
    .filter(
      (s: { id: string; name: string; integration_method: string; url: string | null } | null) =>
        s && s.integration_method === "browser-automation"
    );

  if (!browserSystems.length) return [];

  // Cross-reference with blueprint and specs
  // Look for system name mentions in the architect blueprint and agent specs
  const tasks: DetectedAutomationTask[] = [];
  for (const system of browserSystems) {
    const sys = system as { id: string; name: string; integration_method: string; url: string | null };
    const systemNameLower = sys.name.toLowerCase();
    const blueprintLower = blueprint.toLowerCase();
    const specsLower = agentSpecs.toLowerCase();

    if (
      blueprintLower.includes(systemNameLower) ||
      specsLower.includes(systemNameLower)
    ) {
      // Find the agent that mentions this system
      const agentNameMatch = agentSpecs.match(
        new RegExp(
          `(?:agent|name):\\s*([^\\n]+)(?:[\\s\\S]*?${systemNameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
          "i"
        )
      );
      tasks.push({
        agentName: agentNameMatch?.[1]?.trim() || "Unknown Agent",
        systemName: sys.name,
        systemId: sys.id,
        reason: `Agent references ${sys.name} which is configured as browser-automation`,
      });
    }
  }

  return tasks;
}
