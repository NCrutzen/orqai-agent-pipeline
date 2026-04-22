/**
 * Swarms that are backed by the `automation_runs` table.
 *
 * When `/swarm/[swarmId]` matches one of these IDs, the page renders the
 * reusable V7 shell. The prefix is matched against automation_runs.automation
 * via LIKE so all sub-agents of a swarm show up together.
 *
 * `entity` turns the kanban from "1 card per run" into "1 card per business
 * object" (e.g. email, invoice line, timesheet row). Multiple runs against
 * the same entity id become a timeline on a single card. Swarms without an
 * entity config keep the 1-run-per-card fallback.
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
  /**
   * Per-entity grouping. When provided, runs are grouped into a single
   * kanban card per unique `result[entity.key]` value. The card title is
   * taken from `result[entity.titleKey]` (fallback: first non-empty run
   * subject/title).
   */
  entity?: {
    /** JSON key in automation_runs.result used as the grouping id. */
    key: string;
    /** JSON key in automation_runs.result used as the card title. */
    titleKey?: string;
    /** Human label for the entity ("Email", "Uren-rapportage"). */
    label: string;
  };
}

export const AUTOMATION_BACKED_SWARMS: Record<string, AutomationBackedSwarm> = {
  "60c730a3-be04-4b59-87e8-d9698b468fc9": {
    prefix: "debtor-email",
    hint: "Live overzicht van alle mails die door de Classifier Orchestrator stromen. Elke kaart = één mail, met alle regels + acties als log.",
    entity: {
      key: "message_id",
      titleKey: "subject",
      label: "Email",
    },
  },
};

export function getAutomationBackingForSwarm(
  swarmId: string,
): AutomationBackedSwarm | null {
  return AUTOMATION_BACKED_SWARMS[swarmId] ?? null;
}

/**
 * Lookup for the bridge: given a prefix (e.g. "debtor-email"), return the
 * entity config if any. Used server-side by sync logic.
 */
export function getEntityConfigForPrefix(
  prefix: string,
): AutomationBackedSwarm["entity"] | null {
  for (const cfg of Object.values(AUTOMATION_BACKED_SWARMS)) {
    if (cfg.prefix === prefix) return cfg.entity ?? null;
  }
  return null;
}
