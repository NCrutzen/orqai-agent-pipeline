/**
 * Swarms that are backed by the `automation_runs` table.
 *
 * When `/swarm/[swarmId]` matches one of these IDs, the page renders the
 * reusable <AgentRunBoard prefix="..."/> instead of the generic V7
 * placeholder shell. The prefix is matched against automation_runs.automation
 * via LIKE so all sub-agents of a swarm (e.g. debtor-email-review,
 * debtor-email-cleanup) show up together.
 *
 * Add a new swarm here when:
 *   1. A `projects` row has been created for it
 *   2. Automations write to automation_runs with a consistent kebab-case prefix
 *
 * Later, when we have ~3+ automation-backed swarms, formalize this as a
 * `projects.live_automation_prefix` column so ops can manage it without
 * a code deploy.
 */

export interface AutomationBackedSwarm {
  prefix: string;
  /** Optional helper copy rendered under the swarm header. */
  hint?: string;
}

export const AUTOMATION_BACKED_SWARMS: Record<string, AutomationBackedSwarm> = {
  "60c730a3-be04-4b59-87e8-d9698b468fc9": {
    prefix: "debtor-email",
    hint: "Live overzicht van alle runs die binnenkomende debiteurenmail classificeren en afhandelen. Klik een kaart voor details en screenshots.",
  },
};

export function getAutomationBackingForSwarm(
  swarmId: string,
): AutomationBackedSwarm | null {
  return AUTOMATION_BACKED_SWARMS[swarmId] ?? null;
}
