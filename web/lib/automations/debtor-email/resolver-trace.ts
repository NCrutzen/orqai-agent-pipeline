// Phase 04.1 — Plan 02 (P4.1-D-01 / P4.1-D-02 / P4.1-D-03).
//
// Pure side-channel trace builder. Resolves the 4-step resolver chain trace
// from the Phase 82.9 ResolveResult discriminated union WITHOUT touching
// resolve-debtor.ts logic. Called from classifier-label-resolver.ts inside
// the existing step.run("resolve-debtor") boundary — replay-safe by
// construction (deterministic given input). No DB, no side effects.

import type { ResolveResult } from "./resolve-debtor";

// Step shape used both by this side-channel trace and by the Plan-04 hydrator
// (web/lib/bulk-review/types.ts). Both modules declare the same literal shape
// in lockstep — Plan 04 owns the canonical type; this module declares it
// locally so the emit-side and read-side stay coupled by structural equality
// rather than by import (avoids a load-order cycle).
export interface ResolverStep {
  step: "thread" | "sender_map" | "identifier" | "llm_tiebreaker";
  idx: 1 | 2 | 3 | 4;
  status: "miss" | "matched" | "conflict" | "picked" | "not_run";
  confidence: number | null;
  detail: Record<string, unknown> | null;
}

export interface ResolverTrace {
  steps: ResolverStep[];
  winner: 1 | 2 | 3 | 4 | null;
}

function numericConf(c: ResolveResult["confidence"]): number | null {
  if (c === "high") return 0.9;
  if (c === "medium") return 0.6;
  if (c === "low") return 0.3;
  return null;
}

function emptyStep(
  step: ResolverStep["step"],
  idx: 1 | 2 | 3 | 4,
  status: ResolverStep["status"],
): ResolverStep {
  return { step, idx, status, confidence: null, detail: null };
}

export function buildResolverTrace(result: ResolveResult): ResolverTrace {
  // Defensive: legacy ResolveResult shapes (and test fixtures) may omit
  // `inputs`. Treat missing inputs as a degenerate "all not_run" trace so the
  // emit path stays non-throwing — the renderer falls back to empty state
  // via the hydrator null gate (P4.1-D-02 forward-only emit).
  if (!result.inputs) {
    return {
      steps: [
        emptyStep("thread", 1, "not_run"),
        emptyStep("sender_map", 2, "not_run"),
        emptyStep("identifier", 3, "not_run"),
        emptyStep("llm_tiebreaker", 4, "not_run"),
      ],
      winner: null,
    };
  }
  switch (result.method) {
    case "thread_inheritance": {
      const priorId =
        result.inputs.kind === "thread_inheritance"
          ? result.inputs.prior_email_label_id
          : null;
      const conversationId =
        result.inputs.kind === "thread_inheritance"
          ? result.inputs.conversation_id
          : null;
      return {
        steps: [
          {
            step: "thread",
            idx: 1,
            status: "picked",
            confidence: numericConf(result.confidence),
            detail: {
              prior_email_label_id: priorId,
              conversation_id: conversationId,
            },
          },
          emptyStep("sender_map", 2, "not_run"),
          emptyStep("identifier", 3, "not_run"),
          emptyStep("llm_tiebreaker", 4, "not_run"),
        ],
        winner: 1,
      };
    }

    case "sender_match": {
      const senderEmail =
        result.inputs.kind === "sender_match"
          ? result.inputs.sender_email
          : null;
      return {
        steps: [
          emptyStep("thread", 1, "miss"),
          {
            step: "sender_map",
            idx: 2,
            status: "matched",
            confidence: numericConf(result.confidence),
            detail: {
              sender_email: senderEmail,
              candidates_considered: result.candidates_considered ?? null,
            },
          },
          emptyStep("identifier", 3, "not_run"),
          emptyStep("llm_tiebreaker", 4, "not_run"),
        ],
        winner: 2,
      };
    }

    case "identifier_match": {
      const matched =
        result.inputs.kind === "identifier_match"
          ? result.inputs.matched_identifiers
          : [];
      return {
        steps: [
          emptyStep("thread", 1, "miss"),
          emptyStep("sender_map", 2, "miss"),
          {
            step: "identifier",
            idx: 3,
            status: "matched",
            confidence: numericConf(result.confidence),
            detail: {
              matched_identifiers: matched,
              candidates_considered: result.candidates_considered ?? null,
            },
          },
          emptyStep("llm_tiebreaker", 4, "not_run"),
        ],
        winner: 3,
      };
    }

    case "llm_tiebreaker": {
      const isIdDriven =
        result.inputs.kind === "llm_tiebreaker" &&
        result.inputs.matched_identifiers.length > 0;
      const senderEmail =
        result.inputs.kind === "llm_tiebreaker"
          ? result.inputs.sender_email
          : null;
      const matched =
        result.inputs.kind === "llm_tiebreaker"
          ? result.inputs.matched_identifiers
          : [];
      const llmReason =
        result.inputs.kind === "llm_tiebreaker"
          ? result.inputs.llm_reason
          : null;
      const candidatesCount =
        result.inputs.kind === "llm_tiebreaker"
          ? result.inputs.candidates.length
          : 0;

      const step4: ResolverStep = {
        step: "llm_tiebreaker",
        idx: 4,
        status: "picked",
        confidence: numericConf(result.confidence),
        detail: {
          sender_email: senderEmail,
          matched_identifiers: matched,
          llm_reason: llmReason,
        },
      };

      if (isIdDriven) {
        return {
          steps: [
            emptyStep("thread", 1, "miss"),
            emptyStep("sender_map", 2, "miss"),
            {
              step: "identifier",
              idx: 3,
              status: "conflict",
              confidence: null,
              detail: { matched_identifiers: matched },
            },
            step4,
          ],
          winner: 4,
        };
      }

      return {
        steps: [
          emptyStep("thread", 1, "miss"),
          {
            step: "sender_map",
            idx: 2,
            status: "conflict",
            confidence: null,
            detail: {
              sender_email: senderEmail,
              candidates_considered: candidatesCount,
            },
          },
          emptyStep("identifier", 3, "not_run"),
          step4,
        ],
        winner: 4,
      };
    }

    case "unresolved": {
      const senderEmail =
        result.inputs.kind === "unresolved"
          ? result.inputs.sender_email
          : null;
      const matched =
        result.inputs.kind === "unresolved"
          ? result.inputs.matched_identifiers
          : [];
      const someAttempt =
        (senderEmail !== null && senderEmail !== "") || matched.length > 0;
      const status: ResolverStep["status"] = someAttempt ? "miss" : "not_run";
      return {
        steps: [
          emptyStep("thread", 1, status),
          emptyStep("sender_map", 2, status),
          emptyStep("identifier", 3, status),
          emptyStep("llm_tiebreaker", 4, status),
        ],
        winner: null,
      };
    }
  }
}
