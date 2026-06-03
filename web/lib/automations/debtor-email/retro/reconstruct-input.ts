/**
 * Phase 87 Plan 02 Task 2 — reconstructInput.
 *
 * Builds the exact `InvokeIntentInput` the live Stage 3 coordinator would
 * have built for a persisted email. The `assembled_input` field MUST be
 * byte-identical to a direct `assembleInput()` call with the same primitives
 * — that's the comparison-validity invariant for retro re-classification.
 *
 * Entity derivation: the live coordinator gets `entity` from the upstream
 * Stage 2 event payload (label-resolver). For retro we have only persisted
 * rows; entity is derived from `email.mailbox` via a small static map of the
 * debtor-email mailboxes seen in the 90d corpus (verified against
 * email_pipeline.emails on 2026-05-21). Unknown mailboxes default to "smeba"
 * (the dominant brand) per the same convention as the live coordinator's
 * `email.entity ?? "smeba"` fallback in debtor-email-coordinator.ts.
 *
 * Pure (no Date.now, no random) — safe under Inngest replay.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { assembleInput } from "../coordinator/assemble-input";
import { TENANT_DOMAINS_BY_SWARM } from "../coordinator/tenant-domains.generated";
import type { InvokeIntentInput } from "../coordinator/invoke-intent";

export const STAGE_3_INPUT_CAP_CHARS = 8000;

const TENANT_DOMAINS: string[] = [
  ...TENANT_DOMAINS_BY_SWARM["debtor-email"],
];

/**
 * Static mailbox→entity map for the debtor-email retro pass. Mailbox values
 * sourced from `SELECT DISTINCT mailbox FROM email_pipeline.emails` on the
 * 90d window. Unknown mailboxes fall back to "smeba" (matches the live
 * coordinator's `email.entity ?? "smeba"` baseline at
 * debtor-email-coordinator.ts:89).
 */
const MAILBOX_ENTITY_MAP: Record<string, string> = {
  "debiteuren@smeba.nl": "smeba",
  "debiteuren@smeba-fire.be": "smeba-fire",
  "debiteuren@berki.nl": "berki",
  "administratie@fire-control.nl": "fire-control",
};

type EmailRow = {
  id: string;
  subject: string | null;
  body_text: string | null;
  body_full_text: string | null;
  sender_email: string | null;
  mailbox: string | null;
  received_at: string;
};

type ConversationContextRow = {
  email_id: string;
  position: number;
  sender_email: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string | null;
};

function senderDomain(email: string | null): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  if (at < 0) return "";
  return email.slice(at + 1);
}

function mailboxToEntity(mailbox: string | null): string {
  if (!mailbox) return "smeba";
  return MAILBOX_ENTITY_MAP[mailbox] ?? "smeba";
}

export async function reconstructInput(
  admin: Pick<SupabaseClient, "schema">,
  email_id: string,
  retro_run_id: string,
): Promise<InvokeIntentInput> {
  // `emails` and `conversation_context` live in the `email_pipeline` schema,
  // not `public` — scope the client like the live readers do (e.g.
  // stage-2-customer-resolver.ts). Without this the per-email classify step
  // throws "Could not find the table 'public.emails' in the schema cache".
  const { data: emailData, error: emailErr } = (await admin
    .schema("email_pipeline")
    .from("emails")
    .select(
      "id, subject, body_text, body_full_text, sender_email, mailbox, received_at",
    )
    .eq("id", email_id)
    .maybeSingle()) as { data: EmailRow | null; error: unknown };

  if (emailErr) throw emailErr as Error;
  if (!emailData) {
    throw new Error(`reconstructInput: email ${email_id} not found`);
  }

  const { data: ctxData, error: ctxErr } = (await admin
    .schema("email_pipeline")
    .from("conversation_context")
    .select("email_id, position, sender_email, subject, body_text, received_at")
    .eq("email_id", email_id)
    .order("position", { ascending: true })) as {
    data: ConversationContextRow[] | null;
    error: unknown;
  };

  if (ctxErr) throw ctxErr as Error;
  const priors = (ctxData ?? []).map((r) => ({
    position: r.position,
    senderEmail: r.sender_email,
    subject: r.subject,
    receivedAt: r.received_at,
    bodyText: r.body_text,
  }));

  const bodyFull = emailData.body_full_text ?? emailData.body_text ?? "";
  const subject = emailData.subject ?? "";

  const assembled = assembleInput({
    subject,
    bodyFull,
    priors,
    tenantDomains: TENANT_DOMAINS,
    capChars: STAGE_3_INPUT_CAP_CHARS,
  });

  return {
    email_id,
    inngest_run_id: retro_run_id,
    subject,
    body_text: bodyFull,
    assembled_input: assembled.text,
    sender_email: emailData.sender_email ?? "",
    sender_domain: senderDomain(emailData.sender_email),
    mailbox: emailData.mailbox ?? "",
    entity: mailboxToEntity(emailData.mailbox),
    received_at: emailData.received_at,
  };
}
