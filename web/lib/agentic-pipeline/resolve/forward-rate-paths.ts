// Phase 90 RESL-05 — forward-rate guard registry for email_labels writers.
//
// RESL-05 has two halves: (1) a one-shot Supabase backfill of ~377 historical
// debtor.email_labels rows (20260601d_*.sql), and (2) a FORWARD-RATE guard that
// every code path which INSERTs an email_labels row stamps `conversation_id`
// when the source email carries one. Without (2) the backfill re-rots as new
// labels are written without the field.
//
// This module is the single source of truth for the audited write-path SET.
// `conversation-id-forward-rate.test.ts` (Plan 01 RED) reads this registry +
// statically asserts each listed file's `from("email_labels")` INSERT carries a
// `conversation_id` key — so a future 4th writer that forgets the stamp (or is
// added without registering here) fails the guard rather than silently dropping
// thread_inheritance for new rows.
//
// 90-RESEARCH §RESL-05 lines 356-361; 90-PATTERNS § conversation_id backfill.

/**
 * One entry per code path that may INSERT a debtor.email_labels row. Paths are
 * web/-relative. The forward-rate test asserts each file's email_labels INSERT
 * stamps conversation_id when the source email carries one.
 */
export interface LabelWritePath {
  /** Human-readable name for failure messages. */
  readonly name: string;
  /** web/-relative path to the file containing the email_labels INSERT. */
  readonly file: string;
  /**
   * How the path obtains the conversation_id it stamps:
   *  - 'email_row'   : reads it from the loaded email row (email_pipeline.emails)
   *  - 'request'     : accepts it on the inbound request / falls back to the email row
   *  - 'resolver'    : carried through the resolver result (thread_inheritance fallback)
   */
  readonly conversationIdSource: "email_row" | "request" | "resolver";
}

export const STAGE2_LABEL_WRITE_PATHS: readonly LabelWritePath[] = [
  {
    name: "Stage 2 Inngest worker label INSERT",
    file: "lib/inngest/functions/stage-2-customer-resolver.ts",
    conversationIdSource: "email_row",
  },
  {
    name: "legacy /api/automations/debtor/label-email route INSERT",
    file: "app/api/automations/debtor/label-email/route.ts",
    conversationIdSource: "request",
  },
] as const;
