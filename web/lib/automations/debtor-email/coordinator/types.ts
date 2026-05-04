import { z } from "zod";
import type { Entity } from "./entity.generated";

// ---------------------------------------------------------------------------
// Shared enum constants (mirror supabase/migrations/20260423_debtor_agent_runs.sql
// and the agent JSON schemas). Exported so downstream code can reference a
// single source of truth.
// ---------------------------------------------------------------------------

// Phase 69 D-03 / CANO-02 — Entity literal-union sourced from registry-driven
// codegen. DO NOT add brands here; INSERT into swarms.entity_brand + run
// `npm run codegen` (writes ./entity.generated.ts).
export { ENTITY_BRANDS as ENTITY, type Entity } from "./entity.generated";

export const INTENT = [
  "copy_document_request",
  "payment_dispute",
  "address_change",
  "peppol_request",
  "credit_request",
  "contract_inquiry",
  "general_inquiry",
  "other",
] as const;

export const SUB_TYPE = [
  "invoice",
  "credit_note",
  "werkbon",
  "contract",
  "quote",
] as const;

export const LANGUAGE = ["nl", "en", "de", "fr"] as const;
export const CONFIDENCE = ["low", "medium", "high"] as const;
export const URGENCY = ["low", "normal", "high"] as const;
export const DETECTED_TONE = ["neutral", "de-escalation"] as const;

export const STATUS = [
  "classifying",
  "routed_human_queue",
  "fetching_document",
  "generating_body",
  "creating_draft",
  "copy_document_drafted",
  "copy_document_needs_review",
  "copy_document_failed_not_found",
  "copy_document_failed_transient",
  "login_failed_blocked",
  "done",
] as const;

export const HUMAN_VERDICT = [
  "approved",
  "edited_minor",
  "edited_major",
  "rejected_wrong_intent",
  "rejected_wrong_reference",
  "rejected_wrong_attachment",
  "rejected_wrong_language",
  "rejected_wrong_tone",
  "rejected_other",
] as const;

// Phase 69 — `Entity` is now re-exported from ./entity.generated above.
export type Intent = (typeof INTENT)[number];
export type SubType = (typeof SUB_TYPE)[number];
export type Language = (typeof LANGUAGE)[number];
export type Confidence = (typeof CONFIDENCE)[number];
export type Urgency = (typeof URGENCY)[number];
export type DetectedTone = (typeof DETECTED_TONE)[number];
export type Status = (typeof STATUS)[number];
export type HumanVerdict = (typeof HUMAN_VERDICT)[number];

export const INTENT_VERSION = "2026-04-23.v1" as const;
// Phase 69 D-Discretion — bumped to distinguish pre/post brand_register
// input shape on agent_runs rows (audit trail).
export const BODY_VERSION = "2026-05-04.v2" as const;

// ---------------------------------------------------------------------------
// Intent agent output schema (matches agents/debtor-intent-agent.md §Response Format)
// ---------------------------------------------------------------------------

export const intentAgentOutputSchema = z.object({
  intent: z.enum(INTENT),
  sub_type: z.enum(SUB_TYPE).nullable(),
  document_reference: z.string().max(64).nullable(),
  urgency: z.enum(URGENCY),
  language: z.enum(LANGUAGE),
  confidence: z.enum(CONFIDENCE),
  reasoning: z.string().max(500),
  intent_version: z.literal(INTENT_VERSION),
});

export type IntentAgentOutput = z.infer<typeof intentAgentOutputSchema>;

// ---------------------------------------------------------------------------
// Phase 65 (D-12) — ranked-intent V2 schema. v1 kept above for backfill
// comparator (Plan 65-05). Phase 66 deletes v1.
// ---------------------------------------------------------------------------

export const INTENT_VERSION_V2 = "2026-05-01.v2" as const;

export const rankedIntentEntrySchema = z.object({
  intent: z.enum(INTENT),
  confidence: z.enum(CONFIDENCE),
  document_reference: z.string().max(64).nullable(),
  sub_type: z.enum(SUB_TYPE).nullable(),
  reasoning: z.string().max(200),
});

export const intentAgentOutputSchemaV2 = z.object({
  ranked: z.array(rankedIntentEntrySchema).min(1).max(5), // OQ6 — bound prompt blow-up
  language: z.enum(LANGUAGE),
  urgency: z.enum(URGENCY),
  intent_version: z.literal(INTENT_VERSION_V2),
});

export type RankedIntentEntry = z.infer<typeof rankedIntentEntrySchema>;
export type IntentAgentOutputV2 = z.infer<typeof intentAgentOutputSchemaV2>;

// ---------------------------------------------------------------------------
// Body agent output schema (matches agents/debtor-copy-document-body-agent.md)
// ---------------------------------------------------------------------------

export const bodyAgentOutputSchema = z.object({
  body_html: z.string().min(40).max(4000),
  detected_tone: z.enum(DETECTED_TONE),
  body_version: z.literal(BODY_VERSION),
});

export type BodyAgentOutput = z.infer<typeof bodyAgentOutputSchema>;

// ---------------------------------------------------------------------------
// Tool HTTP response shapes (TOOLS.md)
// ---------------------------------------------------------------------------

export type FetchDocumentSuccess = {
  found: true;
  pdf: { base64: string; filename: string };
  metadata: {
    invoice_id: string;
    customer_id?: string;
    document_type: string;
    bucket?: string;
    key?: string;
    created_on: string;
  };
  request_id: string;
  ambiguous?: boolean;
  match_count?: number;
};

export type FetchDocumentFailure = {
  found: false;
  reason:
    | "invalid_reference_format"
    | "unsupported_doc_type"
    | "timeout"
    | "not_found"
    | "fetch_failed"
    | "upstream_error";
  request_id?: string;
};

export type FetchDocumentResponse = FetchDocumentSuccess | FetchDocumentFailure;

export type CreateDraftSuccess = {
  success: true;
  draftUrl: string;
  screenshots: { beforeSave?: string; afterSave?: string };
  bodyInjectionPath?: string;
};

export type CreateDraftFailure = {
  success: false;
  reason: "login_failed" | "message_not_found" | "attach_failed" | "save_failed";
  screenshot?: string;
  details?: unknown;
};

export type CreateDraftResponse = CreateDraftSuccess | CreateDraftFailure;

// ---------------------------------------------------------------------------
// Inngest event payload (exported so the function handler can import types)
// ---------------------------------------------------------------------------

export type DebtorEmailReceivedPayload = {
  email_id: string;
  subject: string;
  body_text: string;
  sender_email: string;
  sender_domain: string;
  sender_first_name?: string | null;
  mailbox: string;
  entity: Entity;
  received_at: string;
};
