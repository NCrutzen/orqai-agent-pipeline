// Phase 65 (D-06). Cross-swarm canonical handler OUTPUT shape.
// Phase 69 will canonicalise the INPUT shape — keep this file output-only.

export type HandlerContentKind = "draft_body" | "action_confirmation" | "data_payload";
export type HandlerLanguage = "nl" | "fr" | "en" | "de";
export type HandlerTone = "neutral" | "de-escalation";
export type HandlerConfidence = "low" | "medium" | "high";

export interface HandlerOutput {
  handler_key: string;
  intent: string;
  content_kind: HandlerContentKind;
  content: string;
  language: HandlerLanguage;
  tone: HandlerTone;
  references: string[];
  confidence: HandlerConfidence;
}
