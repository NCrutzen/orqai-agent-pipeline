/**
 * Vision adapter: Orq.ai vision API wrapper for screenshot analysis.
 *
 * Sends SOP text + screenshot images as multimodal content to Orq.ai's
 * OpenAI-compatible chat completions endpoint. Returns structured analysis
 * mapping SOP steps to screenshot UI elements.
 *
 * Uses image_url content blocks with base64 data URIs and detail: "high"
 * for full-resolution analysis (Claude's internal max is 1568px).
 */

import type { AnalysisResult } from "@/lib/systems/types";

const ORQ_ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";

const VISION_ANALYSIS_SYSTEM_PROMPT = `You are a UI automation analyst. You receive a Standard Operating Procedure (SOP) document and screenshots of the target application.

Your task:
1. Parse the SOP into numbered steps
2. For each step, identify:
   - The UI action (click, type, select, navigate, scroll, hover)
   - The target element (description + approximate visual location as percentage bounding box)
   - The expected result after the action
3. Map each step to the relevant screenshot
4. Identify any SOP steps that don't have a matching screenshot

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "steps": [
    {
      "stepNumber": 1,
      "action": "click | type | select | navigate | scroll | hover",
      "targetElement": "Human-readable description of the UI element",
      "expectedResult": "What should happen after this action",
      "screenshotRef": "filename or label of the matching screenshot",
      "boundingBox": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "confidence": 0.95
    }
  ],
  "missingScreenshots": ["Description of SOP step without matching screenshot"],
  "warnings": ["Any unclear steps or ambiguous elements"]
}

Bounding box coordinates are percentages (0-100) relative to the screenshot dimensions.
Confidence is 0.0-1.0 indicating how certain you are about the element identification.
If a step spans multiple screenshots, reference the primary one and note others in warnings.`;

/**
 * Analyze screenshots against an SOP using Orq.ai vision.
 *
 * Builds a multimodal user content array with SOP text and screenshot
 * image_url content blocks. Parses the structured JSON response into
 * an AnalysisResult.
 */
export async function analyzeScreenshots(
  sopText: string,
  screenshots: Array<{ base64: string; label: string; mediaType: string }>
): Promise<AnalysisResult> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) {
    throw new Error("ORQ_API_KEY environment variable is not set");
  }

  // Build multimodal user content array
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    {
      type: "text",
      text: `<sop>\n${sopText}\n</sop>\n\nAnalyze the following ${screenshots.length} screenshot(s) and map each SOP step to the corresponding UI elements. Screenshots are labeled in order.`,
    },
    ...screenshots.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mediaType};base64,${img.base64}`,
        detail: "high" as const,
      },
    })),
  ];

  const response = await fetch(ORQ_ROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [
        { role: "system", content: VISION_ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Orq.ai vision error: ${response.status} ${response.statusText} -- ${body}`
    );
  }

  const json = await response.json();
  const text: string = json.choices?.[0]?.message?.content ?? "";

  return parseAnalysisResult(text);
}

/**
 * Quick completeness check: count distinct screens mentioned in SOP
 * and compare against uploaded screenshot count.
 *
 * This is a lighter alternative to full vision analysis -- used to
 * warn users before they submit if screenshots seem incomplete.
 */
export async function validateScreenshotCompleteness(
  sopText: string,
  screenshotCount: number
): Promise<{ complete: boolean; missingHints: string[] }> {
  // Parse SOP for screen/page references
  const screenIndicators = [
    /(?:navigate|go) to (?:the )?(.+?)(?:\.|$)/gim,
    /(?:on|in) the (.+?) (?:page|screen|view|tab|dialog|modal|form)/gim,
    /(?:open|visit|load) (?:the )?(.+?)(?:\.|$)/gim,
    /(.+?) (?:page|screen|view|tab|dialog|modal|form)/gim,
  ];

  const mentionedScreens = new Set<string>();
  for (const pattern of screenIndicators) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sopText)) !== null) {
      const screen = match[1].trim().toLowerCase();
      if (screen.length > 2 && screen.length < 80) {
        mentionedScreens.add(screen);
      }
    }
  }

  const distinctScreens = mentionedScreens.size;

  if (screenshotCount >= distinctScreens || distinctScreens === 0) {
    return { complete: true, missingHints: [] };
  }

  return {
    complete: false,
    missingHints: Array.from(mentionedScreens).slice(0, 5),
  };
}

/**
 * Parse the AI response text into a typed AnalysisResult.
 * Handles both raw JSON and JSON wrapped in markdown code blocks.
 */
function parseAnalysisResult(text: string): AnalysisResult {
  // Try to extract JSON from markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  try {
    const parsed = JSON.parse(jsonText);
    return {
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
      missingScreenshots: Array.isArray(parsed.missingScreenshots)
        ? parsed.missingScreenshots
        : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch {
    // If parsing fails, return empty result with a warning
    return {
      steps: [],
      missingScreenshots: [],
      warnings: [
        "Failed to parse AI analysis response. Please try again.",
        `Raw response length: ${text.length} characters`,
      ],
    };
  }
}
