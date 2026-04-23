/**
 * Domain types for automation runs. Mirrors the `automation_runs` table
 * from supabase/migrations/20260326_automation_runs.sql.
 *
 * JSONB columns are typed `unknown` so consumers cast deliberately.
 */

export type AutomationRunStatus =
  | "pending"
  | "feedback"
  | "completed"
  | "failed"
  | "skipped_idempotent";

export interface AutomationRun {
  id: string;
  automation: string;
  status: AutomationRunStatus;
  result: unknown;
  error_message: string | null;
  triggered_by: string;
  created_at: string;
  completed_at: string | null;
}

/**
 * Agent-state mapping — automation runs rendered as "agent runs" with
 * the same visual language as the V7 swarm page.
 */
export type AgentRunStage =
  | "analyzing" // pending → agent is thinking/classifying
  | "review" // feedback → waiting for human approval
  | "completed" // completed
  | "failed" // failed
  | "skipped"; // skipped_idempotent

export const STAGE_ORDER: AgentRunStage[] = [
  "analyzing",
  "review",
  "completed",
  "failed",
];

export function stageFromStatus(status: AutomationRunStatus): AgentRunStage {
  switch (status) {
    case "pending":
      return "analyzing";
    case "feedback":
      return "review";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "skipped_idempotent":
      return "skipped";
  }
}

export interface StageMeta {
  label: string;
  dutchLabel: string;
  tone: "blue" | "amber" | "teal" | "red" | "neutral";
  /** Pulsing dot for live/in-flight states. */
  pulse: boolean;
}

export const STAGE_META: Record<AgentRunStage, StageMeta> = {
  analyzing: {
    label: "Analyzing",
    dutchLabel: "Analyseert",
    tone: "blue",
    pulse: true,
  },
  review: {
    label: "Review",
    dutchLabel: "Review nodig",
    tone: "amber",
    pulse: true,
  },
  completed: {
    label: "Done",
    dutchLabel: "Afgerond",
    tone: "teal",
    pulse: false,
  },
  failed: {
    label: "Failed",
    dutchLabel: "Fout",
    tone: "red",
    pulse: false,
  },
  skipped: {
    label: "Skipped",
    dutchLabel: "Overgeslagen",
    tone: "neutral",
    pulse: false,
  },
};

/**
 * Common screenshot shape in `result.screenshots`. Paths live in the
 * `automation-screenshots` bucket. Newer automations (e.g.
 * `debtor-email-cleanup`) write the richer `{ url, path }` shape where
 * `url` is a signed URL with ~1h TTL and `path` is the stable bucket
 * path we can re-sign via `getScreenshotUrl(path)` when the URL expires.
 *
 * Legacy writers stored a plain string path. Both shapes are normalised
 * here so consumers only ever see `{ url, path } | null`.
 */
export interface ScreenshotRef {
  /** Signed URL, may be expired. `null` means "only path available — re-sign on demand". */
  url: string | null;
  /** Stable bucket path, used to re-sign when `url` is null/expired. */
  path: string;
}

export interface ResultScreenshots {
  before: ScreenshotRef | null;
  after: ScreenshotRef | null;
}

function normalizeScreenshot(value: unknown): ScreenshotRef | null {
  if (!value) return null;
  if (typeof value === "string") {
    return value.length > 0 ? { url: null, path: value } : null;
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const path = typeof rec.path === "string" ? rec.path : null;
    const url = typeof rec.url === "string" ? rec.url : null;
    if (!path && !url) return null;
    // If we only have a URL without a path, keep the URL but record path as ""
    // so callers know there's nothing to re-sign.
    return { url, path: path ?? "" };
  }
  return null;
}

export function extractScreenshots(result: unknown): ResultScreenshots | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const shots = r.screenshots;
  if (!shots || typeof shots !== "object") return null;
  const s = shots as Record<string, unknown>;
  const before = normalizeScreenshot(s.before);
  const after = normalizeScreenshot(s.after);
  if (!before && !after) return null;
  return { before, after };
}

export function hasScreenshots(run: AutomationRun): boolean {
  return extractScreenshots(run.result) !== null;
}

/**
 * Best-effort short title for a run. Automation-specific extractors can be
 * added; falls back to the automation name + stage hint.
 */
export function runTitle(run: AutomationRun): string {
  const r = run.result as Record<string, unknown> | null;
  if (r && typeof r === "object") {
    const candidates = ["subject", "title", "label", "email_subject"];
    for (const key of candidates) {
      const v = r[key];
      if (typeof v === "string" && v.length > 0) return v;
    }
    const stage = r.stage;
    if (typeof stage === "string") return stage;
  }
  return run.automation;
}

export function runCategory(run: AutomationRun): string | null {
  const r = run.result as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const candidates = [
    "category",
    "target_category",
    "predicted_category",
    "override_category",
  ];
  for (const key of candidates) {
    const v = r[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  const pred = r.prediction as Record<string, unknown> | undefined;
  if (pred && typeof pred === "object") {
    const v = pred.category;
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

export interface AutomationRunsBundle {
  runs: AutomationRun[];
  status: "CONNECTING" | "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";
  loading: boolean;
}

export const EMPTY_RUNS_BUNDLE: AutomationRunsBundle = {
  runs: [],
  status: "CONNECTING",
  loading: true,
};
