// Phase 4 Plan 01 — server-side plain-English signature renderer (P4-D-10).
//
// Runs at cron time; output stored in
// promotion_candidates.proposed_change.display_signature (text within JSONB).
// UI reads verbatim — no client-side rendering of regex/sender/intent keys.
//
// Forbidden-jargon list per P4-D-04 (operator terminology lock): the output
// MUST NOT contain any of these (case-insensitive):
//   regex, eval_type, Wilson, LLM tiebreaker, coordinator_runs,
//   swarm_intents, swarm_noise_categories, confirm_rate, pipeline_events.
//
// signature.test.ts Test #4 asserts this on a representative payload set.

import type { RefinementPayload } from "./types";

export function renderDisplaySignature(payload: RefinementPayload): string {
  switch (payload.kind) {
    case "regex_rule": {
      const subject = payload.subject_pattern.trim();
      const inSubject =
        subject.length > 0
          ? `${capitalize(subject)} in subject`
          : "Repeating subject phrase";
      if (payload.sender_filter && payload.sender_filter.length > 0) {
        const senders = payload.sender_filter.join(", ");
        return `${inSubject} (from ${senders})`;
      }
      return inSubject;
    }
    case "sender_mapping": {
      return `Always route emails from ${payload.sender_pattern} to Customer ${payload.customer_account_id}`;
    }
    case "prompt_tune_stage_3": {
      const where = payload.sender_domain
        ? ` for emails from ${payload.sender_domain}`
        : "";
      const topic = payload.intent_key
        ? ` (topic: ${humanizeKey(payload.intent_key)})`
        : "";
      return `Improve topic routing${where}${topic}`;
    }
    case "new_intent": {
      return `New topic candidate: ${humanizeKey(payload.intent_key_candidate)}`;
    }
    case "prompt_tune_stage_4": {
      const where = payload.sender_domain
        ? ` for emails from ${payload.sender_domain}`
        : "";
      const what = payload.verdict_category
        ? ` (feedback: ${humanizeKey(payload.verdict_category)})`
        : "";
      return `Tune draft style${where}${what}`;
    }
  }
}

// Phase 4 follow-up (2026-05-27 sketch-compare audit) — the "why this matters"
// 2nd descriptive line per cluster card (sketch 006 sig-sub lock). Same
// operator-vocabulary contract as renderDisplaySignature: no jargon, no
// raw regex / sender / intent keys.
export function renderDisplaySignatureSub(payload: RefinementPayload): string {
  switch (payload.kind) {
    case "regex_rule":
      return "The AI already auto-archives these every time. A filter rule could handle them without AI cost.";
    case "sender_mapping":
      return "These emails repeatedly need the same customer correction. Locking the sender in skips the AI lookup.";
    case "prompt_tune_stage_3":
      return "Operators keep retopicking these — the AI's first guess is off for this slice. Tuning the topic prompt would lift the hit rate.";
    case "new_intent":
      return "This topic isn't in your topic list yet. Promoting it would let the system route it instead of escalating.";
    case "prompt_tune_stage_4":
      return "Operators keep editing the AI's draft tone for these. Recording examples teaches the next draft to match.";
  }
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function humanizeKey(key: string): string {
  return key.replace(/[_\-.]+/g, " ").trim();
}

// Phase 4 follow-up (2026-05-27 sketch-compare audit) — Before/After step
// flow stored on proposed_change.before_after_payload at cron time. Sketch
// 007's centerpiece. Two numbered step lists + cost per email; UI computes
// the "saves" delta from before/after.
//
// For non-deterministic kinds (prompt_tune_stage_3 / new_intent /
// prompt_tune_stage_4) we still emit a payload — operator gets a description
// of what an engineer would do, not a no-op fallback.
export interface BeforeAfterPayload {
  before_steps: string[];
  after_steps: string[];
  before_cost_cents: number;
  after_cost_cents: number;
}

export function renderBeforeAfterPayload(args: {
  payload: RefinementPayload;
  avg_replaced_cost_cents: number;
  avg_promoted_cost_cents: number;
}): BeforeAfterPayload {
  const { payload, avg_replaced_cost_cents, avg_promoted_cost_cents } = args;
  const before_cost = round1(avg_replaced_cost_cents);
  const after_cost = round1(avg_promoted_cost_cents);

  switch (payload.kind) {
    case "regex_rule":
      return {
        before_steps: [
          "Inbound email arrives",
          "Stage 1 regex tries — no match",
          "Stage 1 AI 2nd pass runs",
          "AI decides: archive as noise",
          "Email is auto-archived",
        ],
        after_steps: [
          "Inbound email arrives",
          "New filter rule matches the subject",
          "Email is auto-archived",
          "— no AI call needed —",
        ],
        before_cost_cents: before_cost,
        after_cost_cents: after_cost,
      };
    case "sender_mapping":
      return {
        before_steps: [
          "Inbound email arrives",
          "Stage 2 sender-map miss",
          "Stage 2 identifier lookup uncertain",
          `Stage 2 AI tiebreaker picks Customer ${payload.customer_account_id}`,
          "Downstream stages continue",
        ],
        after_steps: [
          "Inbound email arrives",
          `Stage 2 sender-map hit → Customer ${payload.customer_account_id}`,
          "Downstream stages continue",
          "— no AI tiebreaker needed —",
        ],
        before_cost_cents: before_cost,
        after_cost_cents: after_cost,
      };
    case "prompt_tune_stage_3":
      return {
        before_steps: [
          "Inbound email reaches Stage 3",
          "Coordinator picks a topic with low confidence",
          "Operator re-tops the topic repeatedly",
        ],
        after_steps: [
          "Inbound email reaches Stage 3",
          "Tuned coordinator picks the right topic the first time",
          "Operator confirms — no re-top",
        ],
        before_cost_cents: before_cost,
        after_cost_cents: after_cost,
      };
    case "new_intent":
      return {
        before_steps: [
          "Inbound email reaches Stage 3",
          "Coordinator can't match a known topic",
          "Email escalates to the human queue",
        ],
        after_steps: [
          "Inbound email reaches Stage 3",
          `New topic "${humanizeKey(payload.intent_key_candidate)}" matches`,
          payload.handler_status === "registered"
            ? "Handler dispatches the email automatically"
            : "Email routes to its registered handler (engineer wires it after Apply)",
        ],
        before_cost_cents: before_cost,
        after_cost_cents: after_cost,
      };
    case "prompt_tune_stage_4":
      return {
        before_steps: [
          "Stage 4 drafts a reply",
          "Operator edits the tone before sending",
          "Edit pattern repeats across similar emails",
        ],
        after_steps: [
          "Stage 4 drafts a reply with tuned tone",
          "Operator confirms — no edits",
        ],
        before_cost_cents: before_cost,
        after_cost_cents: after_cost,
      };
  }
}

function round1(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents * 10) / 10;
}
