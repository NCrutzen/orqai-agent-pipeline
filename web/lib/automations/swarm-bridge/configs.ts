/**
 * Registry of SwarmBridgeConfig entries. Adding a new automation-backed
 * swarm = adding one object here — no new cron, no new sync module.
 *
 * The Inngest cron (`syncSwarmBridgesCron`) iterates this list every
 * minute and calls `syncSwarmBridge(config)` for each entry.
 */

import type {
  AutomationRun,
  SwarmBridgeConfig,
} from "@/lib/automations/swarm-bridge/types";

const DEBTOR_EMAIL_SWARM_ID = "60c730a3-be04-4b59-87e8-d9698b468fc9";

const DEBTOR_EMAIL_RULE_AGENTS: Record<string, string> = {
  auto_reply: "Rule · auto_reply",
  ooo_temporary: "Rule · ooo_temporary",
  ooo_permanent: "Rule · ooo_permanent",
  payment_admittance: "Rule · payment_admittance",
  unknown: "Rule · unknown",
};

function extractDebtorEmailCategory(run: AutomationRun): string | null {
  const r = run.result;
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  const applied = rec.applied_category;
  if (typeof applied === "string") return normalizeDebtorCategory(applied);
  const predicted = rec.predicted as Record<string, unknown> | undefined;
  const override = rec.override_category;
  if (typeof override === "string" && override.length > 0) return override;
  if (predicted && typeof predicted.category === "string") {
    return predicted.category as string;
  }
  const prediction = rec.prediction as Record<string, unknown> | undefined;
  if (prediction && typeof prediction.category === "string") {
    return prediction.category as string;
  }
  if (typeof rec.target_category === "string") return rec.target_category;
  return null;
}

function normalizeDebtorCategory(raw: string): string {
  const slug = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (slug.startsWith("auto_reply") || slug.startsWith("auto-reply")) {
    return "auto_reply";
  }
  if (slug.includes("ooo_temp") || slug === "ooo_temporary") {
    return "ooo_temporary";
  }
  if (slug.includes("ooo_perm") || slug === "ooo_permanent") {
    return "ooo_permanent";
  }
  if (slug.includes("payment")) return "payment_admittance";
  if (slug.includes("unknown")) return "unknown";
  return slug;
}

const debtorEmailConfig: SwarmBridgeConfig = {
  swarmId: DEBTOR_EMAIL_SWARM_ID,
  prefix: "debtor-email",
  entity: { key: "message_id", titleKey: "subject", label: "Email" },
  resolveAgent: (run) => {
    if (run.automation === "debtor-email-cleanup") return "AutoReplyHandler";
    if (run.automation === "debtor-email-review") {
      const category = extractDebtorEmailCategory(run);
      if (category && DEBTOR_EMAIL_RULE_AGENTS[category]) {
        return DEBTOR_EMAIL_RULE_AGENTS[category];
      }
      return "Classifier Orchestrator";
    }
    return "Classifier Orchestrator";
  },
  deriveTags: (runs) => {
    const cat = runs
      .map((r) => extractDebtorEmailCategory(r))
      .find((c): c is string => !!c);
    return cat ? [cat] : [];
  },
  triageSource: {
    schema: "public",
    table: "agent_runs",
    swarmType: "debtor-email",
    seedAgents: [
      { name: "Intent Agent", role: "Classifies unknown-bucket emails" },
      {
        name: "Copy-Document Agent",
        role: "Drafts copy-document replies with fetched PDF",
      },
    ],
  },
};

export const SWARM_BRIDGE_CONFIGS: SwarmBridgeConfig[] = [debtorEmailConfig];

export function getSwarmBridgeConfig(
  swarmId: string,
): SwarmBridgeConfig | null {
  return SWARM_BRIDGE_CONFIGS.find((c) => c.swarmId === swarmId) ?? null;
}
