/**
 * Pipeline stage definitions.
 *
 * Each stage maps to a markdown instruction file in the orq-agent repo.
 * Files are fetched at runtime from GitHub (not bundled) so prompt changes
 * take effect immediately without redeploying.
 */

export interface PipelineStage {
  /** Machine name used as Inngest step ID */
  name: string;
  /** Path to the .md file relative to repo root */
  mdFile: string;
  /** Human-readable status message shown in UI */
  displayName: string;
  /** Execution order (1-based) */
  stepOrder: number;
  /** Whether this stage requires human approval before its changes are applied */
  needsApproval?: boolean;
  /** Whether this stage pauses for user review/confirmation before continuing */
  needsReview?: boolean;
  /** Whether this stage gets a streaming narrator summary after completion */
  needsNarration?: boolean;
  /** Template chat message shown for silent stages (no API call) */
  templateMessage?: string;
}

const PIPELINE_REPO_RAW_URL =
  process.env.PIPELINE_REPO_RAW_URL ||
  "https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main";

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    name: "discussion",
    mdFile: "", // Not used -- discussion uses discussion-agent.ts directly
    displayName: "Discussing your use case",
    stepOrder: 0,
  },
  {
    name: "architect",
    mdFile: "orq-agent/agents/architect.md",
    displayName: "Designing agent swarm architecture",
    stepOrder: 1,
    needsReview: true,
    needsNarration: true,
  },
  {
    name: "tool-resolver",
    mdFile: "orq-agent/agents/tool-resolver.md",
    displayName: "Resolving available tools",
    stepOrder: 2,
    templateMessage: "Finding the right tools for your agents...",
  },
  {
    name: "researcher",
    mdFile: "orq-agent/agents/researcher.md",
    displayName: "Researching domain context",
    stepOrder: 3,
    templateMessage: "Researching your domain to make agents smarter...",
  },
  {
    name: "spec-generator",
    mdFile: "orq-agent/agents/spec-generator.md",
    displayName: "Generating agent specifications",
    stepOrder: 4,
    needsNarration: true,
  },
  {
    name: "orchestration-generator",
    mdFile: "orq-agent/agents/orchestration-generator.md",
    displayName: "Generating orchestration config",
    stepOrder: 5,
    templateMessage: "Setting up how your agents will work together...",
  },
  {
    name: "dataset-generator",
    mdFile: "orq-agent/agents/dataset-generator.md",
    displayName: "Generating test datasets",
    stepOrder: 6,
    templateMessage: "Creating test scenarios for your agents...",
  },
  {
    name: "readme-generator",
    mdFile: "orq-agent/agents/readme-generator.md",
    displayName: "Generating documentation",
    stepOrder: 7,
    templateMessage: "Writing documentation for your swarm...",
  },
];

/**
 * Get the full URL for a stage's markdown file.
 */
export function getStageUrl(stage: PipelineStage): string {
  return `${PIPELINE_REPO_RAW_URL}/${stage.mdFile}`;
}

/**
 * Look up a stage by its machine name.
 */
export function getStageByName(name: string): PipelineStage | undefined {
  return PIPELINE_STAGES.find((s) => s.name === name);
}

/**
 * Automation sub-pipeline stages.
 *
 * These are CONDITIONAL stages that only activate when the automation detector
 * finds browser-automation systems linked to the project. They render in the
 * terminal panel but are not part of the main PIPELINE_STAGES loop.
 * stepOrder starts at 100 to avoid collision with main pipeline stages.
 */
export const AUTOMATION_STAGES = [
  { name: "automation-detector", displayName: "Detecting automation needs", stepOrder: 100 },
  { name: "sop-upload", displayName: "Waiting for SOP upload", stepOrder: 101 },
  { name: "sop-analyzer", displayName: "Analyzing SOP and screenshots", stepOrder: 102 },
  { name: "annotation-review", displayName: "Reviewing automation steps", stepOrder: 103 },
] as const;

export type AutomationStageName = (typeof AUTOMATION_STAGES)[number]["name"];
