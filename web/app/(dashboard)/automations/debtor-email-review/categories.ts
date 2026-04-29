// Phase 61 hotfix. All non-function exports for the bulk-review server
// actions live here, NOT in actions.ts. Next 15 / Turbopack's "use server"
// codegen treats every export name from a "use server" file as a runtime
// reference, even type-only exports — emitting them as
// `module.exports.X = X` and producing a ReferenceError at module
// evaluation when X doesn't exist at runtime. Keep actions.ts pure
// (only async function exports).

export const OVERRIDE_CATEGORIES = [
  "payment",
  "auto_reply",
  "ooo_temporary",
  "ooo_permanent",
  "unknown",
] as const;

export type OverrideCategory = (typeof OVERRIDE_CATEGORIES)[number];

export interface VerdictInput {
  automation_run_id: string;
  rule_key: string;
  decision: "approve" | "reject";
  message_id: string;
  source_mailbox: string;
  entity: string;
  predicted_category: string;
  override_category?: OverrideCategory;
  notes?: string;
}

export type ReviewEmailBodyResult =
  | { ok: true; bodyText: string; bodyHtml: string | null }
  | { ok: false; error: string };
