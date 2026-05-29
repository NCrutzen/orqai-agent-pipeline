"use server";

// Phase 04.1 — Plan 05 (P4.1-D-07). Lazy thread fetch for the body-toolbar
// "View full thread" modal. Auth via (dashboard) route gate; service-role
// read under that gate (mirrors searchCustomers / recordVerdict pattern).
//
// Hard separation (RFC stage-1-regex.md + stage-3-coordinator.md): this
// action returns raw email bodies, NOT classification vocab — safe. A row's
// classification still lives in EXACTLY ONE of swarm_noise_categories
// (Stage 1) or swarm_intents (Stage 3); this action does not touch either.
//
// TODO(R7): no swarm_type discriminator on email_pipeline.emails today.
// Cross-swarm conversation_id collision is theoretical (none observed).
// Add a swarm_type join when a future phase introduces the column. The
// `swarm_type` parameter is accepted (and UUID-validated for shape) so the
// call site does not need to change when that future filter lands.

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ThreadMessage {
  id: string;
  sender_name: string | null;
  sender_email: string | null;
  received_at: string | null;
  subject: string | null;
  body_text: string | null;
  is_current: boolean;
}

export type GetThreadMessagesResult =
  | { ok: true; messages: ThreadMessage[] }
  | { ok: false; reason: string };

const inputSchema = z.object({
  conversation_id: z.string().uuid(),
  current_email_id: z.string().uuid(),
  swarm_type: z.string().min(1),
});

export async function getThreadMessages(
  conversation_id: string,
  current_email_id: string,
  swarm_type: string,
): Promise<GetThreadMessagesResult> {
  // T-04.1-01: validate both UUIDs at entry; never trust the client.
  const parsed = inputSchema.safeParse({
    conversation_id,
    current_email_id,
    swarm_type,
  });
  if (!parsed.success) return { ok: false, reason: "invalid_uuid" };

  // T-04.1-02: createAdminClient under the (dashboard) route auth gate.
  // No operator attribution — read-only action; route boundary enforces auth.
  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("email_pipeline")
    .from("emails")
    .select("id, sender_name, sender_email, received_at, subject, body_text")
    .eq("conversation_id", parsed.data.conversation_id)
    .order("received_at", { ascending: true });

  if (error) return { ok: false, reason: error.message };

  const messages: ThreadMessage[] = (data ?? []).map((r: {
    id: string;
    sender_name: string | null;
    sender_email: string | null;
    received_at: string | null;
    subject: string | null;
    body_text: string | null;
  }) => ({
    id: r.id,
    sender_name: r.sender_name,
    sender_email: r.sender_email,
    received_at: r.received_at,
    subject: r.subject,
    body_text: r.body_text,
    is_current: r.id === parsed.data.current_email_id,
  }));

  return { ok: true, messages };
}
