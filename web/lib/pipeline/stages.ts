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
}

const PIPELINE_REPO_RAW_URL =
  process.env.PIPELINE_REPO_RAW_URL ||
  "https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main";

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    name: "architect",
    mdFile: "orq-agent/agents/architect.md",
    displayName: "Designing agent swarm architecture",
    stepOrder: 1,
  },
  {
    name: "tool-resolver",
    mdFile: "orq-agent/agents/tool-resolver.md",
    displayName: "Resolving available tools",
    stepOrder: 2,
  },
  {
    name: "researcher",
    mdFile: "orq-agent/agents/researcher.md",
    displayName: "Researching domain context",
    stepOrder: 3,
  },
  {
    name: "spec-generator",
    mdFile: "orq-agent/agents/spec-generator.md",
    displayName: "Generating agent specifications",
    stepOrder: 4,
  },
  {
    name: "orchestration-generator",
    mdFile: "orq-agent/agents/orchestration-generator.md",
    displayName: "Generating orchestration config",
    stepOrder: 5,
  },
  {
    name: "dataset-generator",
    mdFile: "orq-agent/agents/dataset-generator.md",
    displayName: "Generating test datasets",
    stepOrder: 6,
  },
  {
    name: "readme-generator",
    mdFile: "orq-agent/agents/readme-generator.md",
    displayName: "Generating documentation",
    stepOrder: 7,
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
