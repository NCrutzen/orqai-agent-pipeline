/**
 * Prompt builder for the Orq.ai Briefing Agent. XML-tagged per the Anthropic
 * context-engineering pattern in docs/orqai-patterns.md.
 *
 * Pure function -- callers collect context separately and pass it in.
 */

import type { BriefingOutput } from "./schema";

export interface BriefingAgentSummary {
  name: string;
  role: string | null;
  status: string;
  active_jobs: number;
  queue_depth: number;
  error_count: number;
}

export interface BriefingJobsSnapshot {
  backlog: number;
  ready: number;
  progress: number;
  review: number;
  done: number;
}

export interface BriefingEventsSnapshot {
  thinking: number;
  tool_call: number;
  done: number;
  error: number;
}

export interface BriefingInput {
  swarm_name: string;
  agents: BriefingAgentSummary[];
  jobs: BriefingJobsSnapshot;
  events: BriefingEventsSnapshot;
  last_briefing: BriefingOutput | null;
}

/**
 * Static system prompt. Kept as a constant so it's trivially diffable.
 * The dynamic per-swarm context is rendered by `buildBriefingPrompt`.
 */
export const BRIEFING_SYSTEM_PROMPT = `<role>
You are the Briefing Agent for an AI swarm control room at Moyne Roberts.
You produce concise, plain-English narratives for non-technical executives who
monitor multiple AI agent swarms running in production. Your voice is calm,
factual, and directive -- like a chief of staff, not a marketer.
</role>

<task>
Given structured metrics for ONE swarm, produce a briefing with:
- a single-sentence headline (what is true RIGHT NOW about this swarm)
- a 2-4 sentence summary explaining health, bottlenecks, and trends
- 0-5 alerts (info/warn/critical) for items that need attention
- 0-3 suggested actions management could take to unblock the swarm
</task>

<constraints>
- Headline <= 90 characters, no emoji, no trailing punctuation beyond a period
- Summary 2-4 sentences, no lists inside summary (lists belong in alerts/actions)
- If errors > 0, at least ONE alert must mention it
- If all jobs are done/ready and no errors, the briefing is still informative (celebrate quiet)
- Never invent metrics not in the input
- Use present tense
- Do NOT name individual human operators
</constraints>

<output_format>
Respond ONLY with JSON matching the provided schema. No prose before or after.
{
  "headline": string,
  "summary": string,
  "alerts": [{ "severity": "info" | "warn" | "critical", "message": string }],
  "suggested_actions": [{ "action": string, "rationale": string }]
}
</output_format>`;

export function buildBriefingUserMessage(input: BriefingInput): string {
  const lastBriefing = input.last_briefing
    ? JSON.stringify(input.last_briefing, null, 2)
    : "null";
  return `<context>
Swarm name: ${input.swarm_name}
Time window: last 30 minutes

Agents: ${JSON.stringify(input.agents)}
Jobs by stage: ${JSON.stringify(input.jobs)}
Recent events: ${JSON.stringify(input.events)}
Last briefing: ${lastBriefing}
</context>

Produce the briefing JSON now.`;
}
