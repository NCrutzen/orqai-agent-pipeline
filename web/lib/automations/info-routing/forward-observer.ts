// Forward observer — reads the actual manual forwards out of an info@ shared
// mailbox's Sent Items (the one-shot backfill matches each back to its inbound
// original via conversationId, so the forward DESTINATION can be graded against
// the AI's held verdict — see ./forward-wilson.ts and
// web/scripts/forward-wilson-backfill.ts). Operator ground-truth idea, memory
// `forward-match-as-wilson-ground-truth`.
//
// ASSUMPTION (documented): staff forward FROM the shared info@ mailbox, so the
// sent copy lands in info@/SentItems with the same conversationId as the inbound
// original and toRecipients = the department mailbox. Forwards made from a
// staffer's PERSONAL mailbox are invisible here — a known coverage gap; the
// Wilson gate's small-sample conservatism keeps that from green-lighting a
// bucket prematurely.
//
// Graph access goes through the single hardcoded Zapier connection (memory
// `outlook-connection-id-hardcoded-ingest-spof`) — a disconnect silently halts
// this reader too. The Graph IO is isolated to fetchForwardsByConversation; the
// subject/recipient helpers are pure + unit-tested. No persistence — this just
// returns matches.

import { graphFetch } from "@/lib/outlook/client";

/** Forward subject prefixes across the locales info@ sees (NL/EN/DE/FR). */
const FORWARD_PREFIXES = ["fw:", "fwd:", "doorst:", "wg:", "tr:", "rv:"];

/** PURE — does this sent-item subject look like a forward (not a fresh compose
 *  or a reply)? Case/whitespace-insensitive prefix check. */
export function isForwardSubject(subject: string | null | undefined): boolean {
  if (!subject) return false;
  const s = subject.trim().toLowerCase();
  return FORWARD_PREFIXES.some((p) => s.startsWith(p));
}

/** PURE — the destination address of a forward: the first To recipient. info@
 *  forwards go to exactly one department mailbox in practice; if several, the
 *  first is taken (and a multi-recipient forward that hits no routing mailbox
 *  simply grades ungraded). */
export function pickForwardRecipient(
  toRecipients: Array<{ emailAddress?: { address?: string } }> | undefined,
): string | null {
  const first = (toRecipients ?? [])[0]?.emailAddress?.address;
  return first ? first.trim().toLowerCase() : null;
}

export interface ForwardRecord {
  toAddress: string;
  sentAt: string | null;
}

interface GraphSentMessage {
  subject?: string;
  conversationId?: string;
  sentDateTime?: string;
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
}

/**
 * IO — read the mailbox's Sent Items since `sinceIso`, keep only forwards, and
 * build conversationId → {toAddress, sentAt}. Latest forward per conversation
 * wins (a thread re-forwarded to a corrected box supersedes the earlier one).
 * Paginates via @odata.nextLink. One Graph page = 100 messages.
 */
export async function fetchForwardsByConversation(
  mailbox: string,
  sinceIso: string,
): Promise<Map<string, ForwardRecord>> {
  const out = new Map<string, ForwardRecord>();
  const select = "subject,conversationId,sentDateTime,toRecipients";
  const filter = encodeURIComponent(`sentDateTime ge ${sinceIso}`);
  let url: string | null =
    `/users/${encodeURIComponent(mailbox)}/mailFolders/sentitems/messages` +
    `?$filter=${filter}&$select=${select}&$top=100&$orderby=sentDateTime asc`;

  while (url) {
    const res = await graphFetch(url, { method: "GET" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `forward-observer sentitems read failed for ${mailbox}: HTTP ${res.status} ${text.slice(0, 160)}`,
      );
    }
    const json = (await res.json()) as {
      value?: GraphSentMessage[];
      "@odata.nextLink"?: string;
    };
    for (const m of json.value ?? []) {
      if (!m.conversationId || !isForwardSubject(m.subject)) continue;
      const toAddress = pickForwardRecipient(m.toRecipients);
      if (!toAddress) continue;
      // ascending order → last write (most recent forward) wins.
      out.set(m.conversationId, {
        toAddress,
        sentAt: m.sentDateTime ?? null,
      });
    }
    url = json["@odata.nextLink"] ?? null;
  }
  return out;
}
