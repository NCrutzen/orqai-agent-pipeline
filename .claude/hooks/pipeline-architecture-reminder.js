#!/usr/bin/env node

/**
 * Pipeline Architecture Reminder Hook — PreToolUse on Read
 *
 * When Claude reads a file involved in agentic-pipeline runtime
 * behavior (Stage 0..4 workers, debtor-email automations, swarm
 * registry code), inject a system reminder pointing at the locked
 * architecture docs.
 *
 * Exists because: past sessions reasoned about the runtime by
 * skimming Inngest worker code and reached architectural conclusions
 * that contradicted the locked Phase 63 RFC. The RFC + per-stage docs
 * are the source of truth; nudge Claude to read them BEFORE drawing
 * conclusions.
 *
 * Output protocol (Claude Code hooks): print JSON to stdout with
 *   { "hookSpecificOutput": { "hookEventName": "PreToolUse",
 *     "additionalContext": "..." } }
 * The string becomes a system-reminder in Claude's next turn.
 *
 * Silent fail policy: hooks must never break the session.
 */

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    processHook(JSON.parse(input));
  } catch {
    // Silent fail — hooks must not break the session.
  }
});

// Patterns that indicate the user/Claude is poking at runtime pipeline
// internals. Listed broadly so the reminder fires reliably; better to
// over-remind than under-remind, since the cost of silence is drift.
const PIPELINE_PATH_PATTERNS = [
  /web\/lib\/inngest\/functions\/(classifier|coordinator|stage|debtor-email|sales-email)/,
  /web\/lib\/automations\/(debtor-email|sales-email)\//,
  /web\/lib\/debtor-email\//,
  /web\/lib\/swarms\//,
  /web\/lib\/pipeline-events\//,
  /web\/app\/api\/automations\/debtor/,
  /web\/app\/api\/automations\/sales/,
  /web\/app\/\(dashboard\)\/automations\/\[swarm\]/,
];

function shouldRemind(filePath) {
  if (typeof filePath !== "string") return false;
  return PIPELINE_PATH_PATTERNS.some((re) => re.test(filePath));
}

function processHook(payload) {
  // PreToolUse hook envelope:
  //   { tool_name: "Read", tool_input: { file_path: "..." }, ... }
  if (payload?.tool_name !== "Read") return;
  const filePath = payload?.tool_input?.file_path;
  if (!shouldRemind(filePath)) return;

  const reminder = [
    "PIPELINE FILE READ — architecture reminder.",
    "",
    "You're about to read a file involved in agentic-pipeline runtime behavior.",
    "Before drawing architectural conclusions from this code, consult the",
    "locked RFC docs (they win over code-inferred conclusions):",
    "",
    "  • docs/agentic-pipeline/README.md — 5-stage funnel + tenancy",
    "  • docs/agentic-pipeline/stage-1-regex.md — noise filter (regex + LLM 2nd-pass)",
    "  • docs/agentic-pipeline/stage-3-coordinator.md — ranked-intent classifier",
    "",
    "Hard separation rule: a row exists in EXACTLY ONE of",
    "swarm_noise_categories (Stage 1) or swarm_intents (Stage 3) — never both.",
    "Stage 1 = noise filter only; Stage 3 = intent classifier.",
    "",
    "If your reasoning ends up contradicting these docs, either the docs",
    "are stale (propose a doc update) or your reasoning is wrong (re-read).",
  ].join("\n");

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: reminder,
      },
    }),
  );
}
