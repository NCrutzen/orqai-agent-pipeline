/**
 * Prompt adapter: translates pipeline .md files into Claude API calls.
 *
 * 1. Fetches the .md file from GitHub (runtime, not bundled)
 * 2. Strips YAML frontmatter using gray-matter
 * 3. Builds a user message with context formatted as XML tags
 * 4. Calls Claude messages.create() with the .md content as system prompt
 * 5. Returns the text response
 */

import Anthropic from "@anthropic-ai/sdk";
import matter from "gray-matter";
import { getStageByName, getStageUrl } from "./stages";

const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Run the prompt adapter for a given pipeline stage.
 *
 * @param stage - The stage machine name (e.g., "architect", "researcher")
 * @param context - Key-value pairs of context data (useCase, blueprint, etc.)
 * @returns The text response from Claude
 */
export async function runPromptAdapter(
  stage: string,
  context: Record<string, string>
): Promise<string> {
  const stageConfig = getStageByName(stage);
  if (!stageConfig) {
    const err = new Error(`Unknown pipeline stage: ${stage}`);
    (err as unknown as Record<string, unknown>).code = "GITHUB_NOT_FOUND";
    throw err;
  }

  // Fetch .md file content from GitHub
  const url = getStageUrl(stageConfig);
  const response = await fetch(url);

  if (!response.ok) {
    const err = new Error(
      `Failed to fetch pipeline template: ${response.status} ${response.statusText}`
    );
    (err as unknown as Record<string, unknown>).code =
      response.status === 404 ? "GITHUB_NOT_FOUND" : "GITHUB_FETCH_FAILED";
    throw err;
  }

  const raw = await response.text();

  // Strip YAML frontmatter
  const { content: systemPrompt } = matter(raw);

  // Build user message with XML-tagged context
  const userMessage = buildUserMessage(context);

  // Call Claude API
  const result = await claude.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: systemPrompt.trim(),
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract text response
  const textBlock = result.content.find((block) => block.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}

/**
 * Format context key-value pairs as XML tags for the user message.
 *
 * Example output:
 * <use_case>Process incoming invoices...</use_case>
 * <blueprint>Architecture blueprint here...</blueprint>
 */
function buildUserMessage(context: Record<string, string>): string {
  return Object.entries(context)
    .map(([key, value]) => {
      // Convert camelCase to snake_case for XML tag names
      const tagName = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      return `<${tagName}>${value}</${tagName}>`;
    })
    .join("\n");
}
