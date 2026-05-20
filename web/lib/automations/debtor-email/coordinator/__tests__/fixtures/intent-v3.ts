/**
 * Phase 85 Wave 0 — V3 intent-agent fixtures (RED-test scaffolding).
 *
 * These fixtures intentionally reference V3 schema shape (intent_proposal +
 * proposal_reason) BEFORE Wave 1 lands the V3 zod schema in types.ts.
 * Tests using these fixtures are RED until Plan 02 turns them GREEN.
 */

import { INTENT_VERSION_V2 } from "../../types";

/** The literal that Plan 02 (Wave 1) will export from `../types`. */
export const INTENT_VERSION_V3_LITERAL = "2026-05-19.v3" as const;

/** A well-formed V2 row (back-compat fixture — must continue to parse on V2 schema). */
export const V2_FIXTURE = {
  ranked: [
    {
      intent: "copy_document_request",
      confidence: "high",
      document_reference: "INV-12345",
      sub_type: "invoice",
      reasoning: "operator asks for copy",
    },
  ],
  language: "nl",
  urgency: "normal",
  intent_version: INTENT_VERSION_V2,
} as const;

/** V3, closed-list path — intent_proposal=null, proposal_reason=null. */
export const V3_FIXTURE_CLOSED = {
  ranked: [
    {
      intent: "copy_document_request",
      confidence: "high",
      document_reference: "INV-12345",
      sub_type: "invoice",
      reasoning: "operator asks for copy",
    },
  ],
  language: "nl",
  urgency: "normal",
  intent_version: INTENT_VERSION_V3_LITERAL,
  intent_proposal: null,
  proposal_reason: null,
} as const;

/** V3, open-set path — intent_proposal=`wka_data_request`, proposal_reason populated. */
export const V3_FIXTURE_OPEN = {
  ranked: [
    {
      intent: "general_inquiry",
      confidence: "low",
      document_reference: null,
      sub_type: null,
      reasoning: "Sender requests WKA-gegevens; closest closed-list intent is general_inquiry but fit is weak",
    },
  ],
  language: "nl",
  urgency: "normal",
  intent_version: INTENT_VERSION_V3_LITERAL,
  intent_proposal: "wka_data_request",
  proposal_reason: "Sender explicitly requests Wet Ketenaansprakelijkheid documentation; no closed-list intent captures chain-liability data requests",
} as const;

/** V3 with snake_case violation in intent_proposal — must be rejected. */
export const V3_FIXTURE_BAD_SNAKE_CASE = {
  ...V3_FIXTURE_OPEN,
  intent_proposal: "WKA Data Request",
} as const;

export const V3_FIXTURE_BAD_HYPHEN = {
  ...V3_FIXTURE_OPEN,
  intent_proposal: "wka-data-request",
} as const;

export const V3_FIXTURE_BAD_LEADING_DIGIT = {
  ...V3_FIXTURE_OPEN,
  intent_proposal: "1_invalid",
} as const;

/** V3 with intent_proposal length > 64 — must be rejected. */
export const V3_FIXTURE_PROPOSAL_TOO_LONG = {
  ...V3_FIXTURE_OPEN,
  intent_proposal: "a".repeat(65),
} as const;

/** V3 with proposal_reason length > 280 — must be rejected. */
export const V3_FIXTURE_REASON_TOO_LONG = {
  ...V3_FIXTURE_OPEN,
  proposal_reason: "x".repeat(281),
} as const;

/** Fixture stripped of V3 keys — V3 schema must REJECT this (missing keys). */
export const V3_FIXTURE_MISSING_PROPOSAL_KEYS = {
  ranked: V3_FIXTURE_CLOSED.ranked,
  language: V3_FIXTURE_CLOSED.language,
  urgency: V3_FIXTURE_CLOSED.urgency,
  intent_version: INTENT_VERSION_V3_LITERAL,
  // intent_proposal + proposal_reason intentionally absent
} as const;
