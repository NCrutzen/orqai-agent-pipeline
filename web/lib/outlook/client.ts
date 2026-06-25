import { createZapierSdk } from "@zapier/zapier-sdk";
import { z } from "zod";
import { buildRoutingCategory } from "./routing-category";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Moyne Roberts Outlook connection (zapier@moyneroberts.com)
const OUTLOOK_CONNECTION_ID = process.env.OUTLOOK_CONNECTION_ID ?? "0299d86c-13e5-8091-804c-2e66aeb4b0e6";

/**
 * Create Zapier SDK instance.
 * Locally: uses keychain auth (via `npx zapier-sdk login`)
 * Server (Vercel): auto-detects ZAPIER_CREDENTIALS_CLIENT_ID and
 * ZAPIER_CREDENTIALS_CLIENT_SECRET env vars.
 * Generate with: npx zapier-sdk create-client-credentials "agent-workforce-vercel"
 */
function getZapierClient() {
  // SDK auto-detects env vars: ZAPIER_CREDENTIALS_CLIENT_ID, ZAPIER_CREDENTIALS_CLIENT_SECRET
  // Falls back to keychain auth when env vars are not set
  return createZapierSdk();
}

/**
 * Make an authenticated Microsoft Graph API call via Zapier SDK.
 *
 * Exported (Phase 112.5) so read-only report/delta workers can issue their own
 * Graph GETs through the single credential boundary (connection 56014785) +
 * the built-in socket/504/ReadTimeout retry, instead of hand-rolling a second
 * Graph client. Callers that need an immutable-id or pagesize hint pass it via
 * the optional `prefer` option (additive, non-breaking).
 */
export async function graphFetch(
  path: string,
  options: {
    method: string;
    body?: unknown;
    prefer?: string;
    headers?: Record<string, string>;
  } = {
    method: "GET",
  },
): Promise<Response> {
  const zapier = getZapierClient();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

  const fetchOptions: Record<string, unknown> = {
    method: options.method,
    connectionId: OUTLOOK_CONNECTION_ID,
  };

  if (options.body) {
    fetchOptions.headers = { "Content-Type": "application/json" };
    fetchOptions.body = JSON.stringify(options.body);
  }

  // Optional Prefer header (e.g. 'IdType="ImmutableId"', 'odata.maxpagesize=100').
  // Merge into any existing headers so a body + prefer can coexist.
  if (options.prefer) {
    fetchOptions.headers = {
      ...((fetchOptions.headers as Record<string, string>) ?? {}),
      Prefer: options.prefer,
    };
  }

  // Optional extra headers (e.g. ConsistencyLevel: eventual for advanced
  // $filter/$count queries). Merged last so callers can set anything they need.
  if (options.headers) {
    fetchOptions.headers = {
      ...((fetchOptions.headers as Record<string, string>) ?? {}),
      ...options.headers,
    };
  }

  // Retry transient transport failures: socket drops over the undici pool
  // mid-pagination, plus Zapier-relay 504 ReadTimeouts (Vercel→Zapier→Graph
  // hop occasionally exceeds the relay's read timeout even when Graph is
  // healthy). Graph itself is fine on retry in both cases.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await zapier.fetch(url, fetchOptions);
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      const e = err as { code?: string; statusCode?: number; name?: string };
      const retriable =
        /UND_ERR_SOCKET|ECONNRESET|fetch failed|socket hang up|ETIMEDOUT|ReadTimeout/i.test(msg) ||
        e.code === "ZAPIER_RELAY_ERROR" ||
        e.statusCode === 504 ||
        e.statusCode === 502 ||
        e.statusCode === 503;
      if (!retriable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const enc = encodeURIComponent;

export interface OutlookActionResult {
  success: boolean;
  error?: string;
}

export interface OutlookMessage {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  receivedAt: string;
  bodyPreview: string;
  isRead: boolean;
  internetMessageId: string | null;
  categories: string[];
}

/**
 * List messages from the Inbox folder of a mailbox, newest first.
 * Uses Graph API pagination — pulls up to `max` messages.
 *
 * When `before` is supplied (ISO timestamp), only returns messages received
 * strictly before that moment — useful for "load older" pagination after
 * the reviewer has processed the newest window.
 */
export async function listInboxMessages(
  mailbox: string,
  max: number = 200,
  options: { before?: string } = {},
): Promise<OutlookMessage[]> {
  const fields = [
    "id",
    "subject",
    "from",
    "receivedDateTime",
    "bodyPreview",
    "isRead",
    "internetMessageId",
    "categories",
  ].join(",");
  // Graph allows $top up to 999 for /messages. Bigger pages = fewer sequential
  // round-trips → fewer socket drops over the Zapier→Graph chain.
  const pageSize = Math.min(500, max);
  const filter = options.before
    ? `&$filter=${encodeURIComponent(`receivedDateTime lt ${options.before}`)}`
    : "";
  let url: string | null = `${GRAPH_BASE}/users/${enc(mailbox)}/mailFolders/inbox/messages?$top=${pageSize}&$orderby=receivedDateTime desc&$select=${fields}${filter}`;

  const out: OutlookMessage[] = [];
  while (url && out.length < max) {
    const res = await graphFetch(url);
    if (!res.ok) {
      throw new Error(`listInboxMessages ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      value: Array<{
        id: string;
        subject?: string;
        from?: { emailAddress: { address: string; name?: string } };
        receivedDateTime?: string;
        bodyPreview?: string;
        isRead?: boolean;
        internetMessageId?: string;
        categories?: string[];
      }>;
      "@odata.nextLink"?: string;
    };
    for (const m of data.value) {
      if (out.length >= max) break;
      out.push({
        id: m.id,
        subject: m.subject ?? "",
        from: m.from?.emailAddress.address ?? "",
        fromName: m.from?.emailAddress.name ?? "",
        receivedAt: m.receivedDateTime ?? "",
        bodyPreview: m.bodyPreview ?? "",
        isRead: m.isRead ?? false,
        internetMessageId: m.internetMessageId ?? null,
        categories: m.categories ?? [],
      });
    }
    url = data["@odata.nextLink"] ?? null;
  }

  return out;
}

/**
 * Fetch lightweight metadata for a single message — used by the Zapier
 * ingest webhook to classify a new mail without pulling the full inbox.
 * Throws when Graph returns non-2xx (typically 404 when the message has
 * been deleted between Zapier trigger and our POST).
 */
export async function getMessageMeta(
  mailbox: string,
  messageId: string,
): Promise<{ subject: string; from: string; fromName: string; receivedAt: string; categories: string[]; hasAttachments: boolean }> {
  // Phase 114-03 (D-14): add `sender` (fallback for empty `from`) +
  // `hasAttachments`. Graph omits `from` on some message classes (drafts,
  // certain delegated/shared-mailbox sends); `sender` is the verified
  // submitting account and recovers the address in those cases.
  const fields = "id,subject,from,sender,receivedDateTime,categories,hasAttachments";
  const res = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}?$select=${fields}`,
  );
  if (!res.ok) {
    throw new Error(`getMessageMeta ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    subject?: string;
    from?: { emailAddress: { address?: string; name?: string } };
    sender?: { emailAddress: { address?: string; name?: string } };
    receivedDateTime?: string;
    categories?: string[];
    hasAttachments?: boolean;
  };
  // Prefer `from`; fall back to `sender` when `from` is empty/absent.
  const fromAddr = data.from?.emailAddress?.address ?? "";
  const senderAddr = data.sender?.emailAddress?.address ?? "";
  const fromName = data.from?.emailAddress?.name ?? "";
  const senderName = data.sender?.emailAddress?.name ?? "";
  return {
    subject: data.subject ?? "",
    from: fromAddr || senderAddr,
    fromName: fromName || senderName,
    receivedAt: data.receivedDateTime ?? "",
    categories: data.categories ?? [],
    hasAttachments: data.hasAttachments ?? false,
  };
}

/**
 * Phase 83-02 (D-01 + D-02): canonical return shape for a fetched message.
 *
 * `bodyText` is derived from Graph's `body.content` — the FULL THREAD
 * (original + every quoted reply). `bodyUniqueText` is the new-part-only
 * rendering from `uniqueBody.content`, kept as a sibling so downstream
 * consumers (Stage 3 / training pipelines) can still see what the sender
 * actually typed without re-fetching.
 *
 * `bodyHtml` and `rawJson` provide an escape hatch: if a future consumer
 * wants to defer stripping or recover lost context, the full HTML and the
 * verbatim Graph envelope are right here.
 */
export interface FetchedMessageBody {
  /** Plain-text rendering of Graph body.content — full thread incl. quoted history. */
  bodyText: string;
  /** Plain-text rendering of Graph uniqueBody.content — new part only. "" if Graph omitted uniqueBody. */
  bodyUniqueText: string;
  /** Raw HTML of body.content when contentType === "html". "" otherwise. */
  bodyHtml: string;
  /** Graph's reported contentType for body. */
  bodyType: "text" | "html";
  /**
   * Phase 114-03 (D-14): sender address with `from`→`sender` fallback.
   * Empty string only when Graph omits both `from` and `sender`.
   */
  from: string;
  /** Display name paired with `from` (sender-name fallback). */
  fromName: string;
  /** Phase 114-03 (D-14): Graph `hasAttachments` — attachment presence signal. */
  hasAttachments: boolean;
  /** Verbatim Graph message envelope JSON. Recovery path for retro-extraction (D-02). */
  rawJson: Record<string, unknown>;
}

/**
 * Fetch the full body of a single message.
 *
 * D-01 FLIP (Phase 83): we now prefer Graph's `body` (the full thread) over
 * `uniqueBody` for `bodyText`. The new-part-only rendering is still
 * available via `bodyUniqueText`.
 *
 * D-02: the wider `$select` lets a single Graph call hand back enough
 * envelope data (`conversationId`, `internetMessageId`, recipients, raw
 * body) for the writer in Plan 83-03 to persist `raw_json` without a
 * second round-trip.
 */
export async function fetchMessageBody(
  mailbox: string,
  messageId: string,
): Promise<FetchedMessageBody> {
  // Phase 114-03 (D-14): add `sender` (fallback for empty `from`) +
  // `hasAttachments` so a single Graph call surfaces a robust sender + the
  // attachment-presence signal alongside the body.
  const fields =
    "body,uniqueBody,internetMessageId,conversationId,from,sender,hasAttachments,toRecipients,ccRecipients";
  const res = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}?$select=${fields}`,
  );
  if (!res.ok) {
    throw new Error(`fetchMessageBody ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    body?: { contentType?: "text" | "html"; content?: string };
    uniqueBody?: { contentType?: "text" | "html"; content?: string };
    from?: { emailAddress: { address?: string; name?: string } };
    sender?: { emailAddress: { address?: string; name?: string } };
    hasAttachments?: boolean;
    [k: string]: unknown;
  };

  // D-01: ALWAYS prefer body (full thread). uniqueBody surfaces separately.
  const fullBody = data.body ?? {};
  const uniqBody = data.uniqueBody ?? {};
  const bodyType = (fullBody.contentType ?? "text") as "text" | "html";
  const bodyContent = fullBody.content ?? "";
  const uniqContent = uniqBody.content ?? "";
  const uniqType = (uniqBody.contentType ?? "text") as "text" | "html";

  const bodyText = bodyType === "html" ? stripHtml(bodyContent) : bodyContent;
  const bodyUniqueText = uniqContent
    ? uniqType === "html"
      ? stripHtml(uniqContent)
      : uniqContent
    : "";
  const bodyHtml = bodyType === "html" ? bodyContent : "";

  // Phase 114-03 (D-14): prefer `from`, fall back to `sender`.
  const fromAddr = data.from?.emailAddress?.address ?? "";
  const senderAddr = data.sender?.emailAddress?.address ?? "";
  const fromName = data.from?.emailAddress?.name ?? "";
  const senderName = data.sender?.emailAddress?.name ?? "";

  return {
    bodyText,
    bodyUniqueText,
    bodyHtml,
    bodyType,
    from: fromAddr || senderAddr,
    fromName: fromName || senderName,
    hasAttachments: data.hasAttachments ?? false,
    rawJson: data as Record<string, unknown>,
  };
}

export interface PriorMessage {
  sourceMessageId: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  bodyText: string;
}

/**
 * Phase 83 D-04: fetch the most-recent prior messages in the same Graph
 * conversation. Excludes the message id `excludeId` (typically the current
 * inbound message). Returns up to `topN` messages, newest-first.
 *
 * Cost: 1 Graph call per inbound email (Graph returns current + priors in
 * a single $filter=conversationId query, $top=topN+1).
 */
export async function fetchConversationMessages(
  mailbox: string,
  conversationId: string,
  excludeId: string,
  topN: number = 2,
): Promise<PriorMessage[]> {
  if (!conversationId) {
    throw new TypeError("fetchConversationMessages: conversationId is required");
  }
  // Phase 83 hot-fix: Graph rejects $filter=conversationId combined with
  // $orderby=receivedDateTime as 400 InefficientFilter on most mailboxes.
  // Drop $orderby and sort client-side. Bump $top to give us enough rows to
  // pick the newest topN after sorting.
  const fields = "id,subject,from,receivedDateTime,body";
  const filter = encodeURIComponent(`conversationId eq '${conversationId}'`);
  const url = `/users/${enc(mailbox)}/messages?$filter=${filter}&$top=${topN + 5}&$select=${fields}`;
  const res = await graphFetch(url);
  if (!res.ok) {
    throw new Error(`fetchConversationMessages ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    value: Array<{
      id: string;
      subject?: string;
      from?: { emailAddress: { address: string } };
      receivedDateTime?: string;
      body?: { contentType?: "text" | "html"; content?: string };
    }>;
  };
  const sorted = [...data.value].sort((a, b) => {
    const at = a.receivedDateTime ?? "";
    const bt = b.receivedDateTime ?? "";
    return bt.localeCompare(at);
  });
  const priors: PriorMessage[] = [];
  for (const m of sorted) {
    if (priors.length >= topN) break;
    if (m.id === excludeId) continue;
    const ct = m.body?.contentType ?? "text";
    const content = m.body?.content ?? "";
    const bodyText = ct === "html" ? stripHtml(content) : content;
    priors.push({
      sourceMessageId: m.id,
      senderEmail: m.from?.emailAddress.address ?? "",
      subject: m.subject ?? "",
      receivedAt: m.receivedDateTime ?? "",
      bodyText,
    });
  }
  return priors;
}

/**
 * Phase 116-02 (Task 1): attachment metadata + raw-bytes Graph helpers.
 *
 * Both route through the single `graphFetch` credential boundary (connection
 * 56014785) + its built-in 504/socket retry — NEVER a second Graph client.
 *
 * `listAttachments` pulls metadata ONLY (`$select`, no `contentBytes`); the
 * worker (Plan 04) decides which attachments to download. `@odata.type` lets
 * the caller type-guard fileAttachment vs reference/itemAttachment (Pitfall 5
 * / A4) — non-fileAttachment kinds carry no bytes and become `unsupported`.
 */
const attachmentMetaSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  contentType: z.string().optional(),
  size: z.number().optional(),
  isInline: z.boolean().optional(),
  "@odata.type": z.string().optional(),
});

export type OutlookAttachmentMeta = z.infer<typeof attachmentMetaSchema>;

const listAttachmentsSchema = z.object({
  value: z.array(attachmentMetaSchema),
});

/**
 * List attachment metadata for a message. Metadata only — does NOT request
 * `contentBytes` (the worker downloads raw bytes on demand via
 * `downloadAttachmentValue`). Validates the Graph payload with zod at the
 * function boundary before returning (V5 input validation).
 */
export async function listAttachments(
  mailbox: string,
  messageId: string,
): Promise<OutlookAttachmentMeta[]> {
  // Graph REJECTS `@odata.type` inside `$select` (400 "Term '@odata.type' is not
  // valid in a $select or $expand expression") — and it is returned by default
  // on every polymorphic attachment entry regardless, so the caller can still
  // type-guard fileAttachment vs reference/itemAttachment (Pitfall 5 / A4)
  // without selecting it. Selecting it threw for EVERY message, which the
  // fail-soft capture catch turned into a silent captured:0 (email_attachments
  // stayed empty). Never request contentBytes here.
  const fields = "id,name,contentType,size,isInline";
  const res = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}/attachments?$select=${fields}`,
  );
  if (!res.ok) {
    throw new Error(`listAttachments ${res.status}: ${await res.text()}`);
  }
  const data = listAttachmentsSchema.parse(await res.json());
  return data.value;
}

/**
 * Download the raw bytes of a single attachment via Graph `/$value`. Returns
 * an ArrayBuffer. Use `/$value` for raw bytes consistently (Pitfall 5 — do
 * not mix with base64 `contentBytes`).
 */
export async function downloadAttachmentValue(
  mailbox: string,
  messageId: string,
  attachmentId: string,
): Promise<ArrayBuffer> {
  const res = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}/attachments/${enc(attachmentId)}/$value`,
  );
  if (!res.ok) {
    throw new Error(`downloadAttachmentValue ${res.status}: ${await res.text()}`);
  }
  return res.arrayBuffer();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Phase 132.1 Plan 02 (D-03) — the ONE non-grey Outlook preset colour shared by
 * EVERY routing master category.
 *
 * Outlook category swatches are named `preset0`..`preset24`. `preset0` is the
 * grey "no colour" default that the `AI:` INTENT labels keep (they are left
 * untouched here). Routing labels get this single distinct non-grey swatch so
 * operators tell routing decisions apart from intent labels at a glance.
 * `preset5` is a distinct non-grey swatch — NOT per-bucket, NOT per-brand (D-03).
 */
export const ROUTING_CATEGORY_PRESET_COLOR = "preset5";

const masterCategoriesSchema = z.object({
  value: z.array(
    z.object({
      id: z.string().optional(),
      displayName: z.string(),
      color: z.string().optional(),
    }),
  ),
});

/**
 * Phase 132.1 Plan 02 (D-03) — idempotently provision the routing master
 * categories for a mailbox with ONE non-grey preset colour.
 *
 * Colour is a mailbox-level master-category property; it cannot be set at
 * message-stamp time — it must be provisioned once per mailbox via Graph
 * `masterCategories`. The held-path stamp (Plan 01) and the forward stamp
 * (Phase 132) write category DISPLAY NAMES; this call makes those names render
 * in `ROUTING_CATEGORY_PRESET_COLOR`.
 *
 * Behaviour:
 *  - GET existing `/users/{mailbox}/outlook/masterCategories`; build a Set of
 *    present `displayName`s.
 *  - The DESIRED routing display-name set is sourced from `buildRoutingCategory`
 *    (single vocabulary source — NEVER duplicated literals): the static
 *    `triage`/`algemeen` labels plus the per-bucket `held`/`forwarded`/`dedup`
 *    variants for each active routing bucket.
 *  - POST ONLY the desired names that are MISSING, each with the one chosen
 *    non-grey preset. Idempotent: a second call POSTs nothing.
 *  - It NEVER touches the grey `AI:` intent labels — it only ever POSTs missing
 *    routing labels, and never PATCHes/deletes existing categories (additive,
 *    low-risk per threat T-132.1-06).
 *
 * Routes through the single `graphFetch` credential boundary (connection
 * 56014785) + its built-in 504/socket retry — never a hand-rolled client.
 */
export async function ensureRoutingMasterCategories(
  mailbox: string,
  buckets: string[],
): Promise<{ created: string[]; existing: number }> {
  const getRes = await graphFetch(
    `/users/${enc(mailbox)}/outlook/masterCategories`,
  );
  if (!getRes.ok) {
    throw new Error(
      `ensureRoutingMasterCategories GET ${getRes.status}: ${await getRes.text()}`,
    );
  }
  const parsed = masterCategoriesSchema.parse(await getRes.json());
  const present = new Set(parsed.value.map((c) => c.displayName));

  // Desired routing display names — sourced from the vocabulary module
  // (buildRoutingCategory), never duplicated literals. Static labels first,
  // then per-bucket held/forwarded/dedup variants. De-dupe defensively in case
  // the same bucket is passed twice.
  const desired: string[] = [
    buildRoutingCategory("triage"),
    buildRoutingCategory("algemeen"),
  ];
  for (const bucket of buckets) {
    desired.push(buildRoutingCategory("held", bucket));
    desired.push(buildRoutingCategory("forwarded", bucket));
    desired.push(buildRoutingCategory("dedup", bucket));
  }
  const uniqueDesired = [...new Set(desired)];

  const created: string[] = [];
  for (const displayName of uniqueDesired) {
    if (present.has(displayName)) continue;
    const postRes = await graphFetch(
      `/users/${enc(mailbox)}/outlook/masterCategories`,
      {
        method: "POST",
        body: { displayName, color: ROUTING_CATEGORY_PRESET_COLOR },
      },
    );
    if (!postRes.ok) {
      throw new Error(
        `ensureRoutingMasterCategories POST "${displayName}" ${postRes.status}: ${await postRes.text()}`,
      );
    }
    created.push(displayName);
  }

  return { created, existing: present.size };
}

/**
 * Categorize an email by adding a category label.
 * Categories must exist in the mailbox — Graph API creates them on first use.
 */
export async function categorizeEmail(
  mailbox: string,
  messageId: string,
  category: string,
): Promise<OutlookActionResult> {
  // First get existing categories on the message
  const getRes = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}?$select=categories`,
  );

  if (!getRes.ok) {
    return { success: false, error: `Failed to get message: ${getRes.status}` };
  }

  const msg = await getRes.json() as { categories: string[] };
  const categories = [...new Set([...(msg.categories || []), category])];

  // Update with the new category added
  const res = await graphFetch(`/users/${enc(mailbox)}/messages/${enc(messageId)}`, {
    method: "PATCH",
    body: { categories },
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `Failed to categorize: ${res.status} ${err}` };
  }

  return { success: true };
}

/**
 * Archive an email by moving it to the Archive folder.
 * First tries the well-known "archive" folder, falls back to folder lookup.
 */
export async function archiveEmail(
  mailbox: string,
  messageId: string,
): Promise<OutlookActionResult> {
  // Find the Archive folder
  const folderId = await findFolder(mailbox, "Archive");
  if (!folderId) {
    return { success: false, error: "Archive folder not found in mailbox" };
  }

  const res = await graphFetch(`/users/${enc(mailbox)}/messages/${enc(messageId)}/move`, {
    method: "POST",
    body: { destinationId: folderId },
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: `Failed to archive: ${res.status} ${err}` };
  }

  return { success: true };
}

/**
 * Phase 132 Plan 01 (Task 2, D-01) — forward a message to a department mailbox.
 *
 * 2-CALL DRAFT FLOW (createForward → send), routed through the single
 * `graphFetch` credential boundary (connection 56014785) + its built-in
 * 504/socket retry. NEVER a hand-rolled client and NEVER a connection literal.
 *
 * WHY 2 calls and NOT 3 (no replyTo PATCH): the 2026-06-18 live send-scope smoke
 * proved Exchange STRIPS `replyTo` on send for the shared info@ mailbox, so the
 * replyTo PATCH is a silent no-op and is OMITTED. Instead the original sender is
 * conveyed in the forward COMMENT (D-01 sender-in-comment fallback).
 *
 * `mailbox` is the info@ SOURCE box (Pitfall 3). `toMailbox` is ONLY the
 * toRecipients value. Pass ONLY `message.toRecipients` + `comment` — NEVER also
 * `message.body` (Pitfall 1). NEVER throws — mirrors categorizeEmail.
 */
export async function forwardMessage(args: {
  mailbox: string;
  messageId: string;
  toMailbox: string;
  originalSender: string;
  comment?: string;
}): Promise<OutlookActionResult> {
  const { mailbox, messageId, toMailbox, originalSender, comment } = args;

  const fwdComment = `Doorgestuurd via info-routing — oorspronkelijke afzender: ${originalSender}.${
    comment ? " " + comment : ""
  }`;

  const createRes = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}/createForward`,
    {
      method: "POST",
      body: {
        message: {
          toRecipients: [{ emailAddress: { address: toMailbox } }],
        },
        comment: fwdComment,
      },
    },
  );

  if (!createRes.ok) {
    return {
      success: false,
      error: `createForward ${createRes.status}: ${await createRes.text()}`,
    };
  }

  const draft = (await createRes.json()) as { id?: string };
  if (!draft.id) {
    return {
      success: false,
      error: `createForward 200 but draft id missing: ${JSON.stringify(draft)}`,
    };
  }

  const sendRes = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(draft.id)}/send`,
    { method: "POST" },
  );

  if (!sendRes.ok) {
    return {
      success: false,
      error: `send ${sendRes.status}: ${await sendRes.text()}`,
    };
  }

  return { success: true };
}

/**
 * Quick task 260625-9ll (Task 1) — best-effort move of a message into a named
 * destination folder under the SOURCE mailbox.
 *
 * Used by the Stage-4 info-routing forward worker to file a successfully
 * forwarded mail into an "AI handled" folder AFTER the forward + state +
 * category stamp. It is purely additive/cosmetic housekeeping: it NEVER throws
 * (mirrors forwardMessage / categorizeEmail → returns OutlookActionResult so a
 * caller can swallow a failure without affecting the irreversible forward).
 *
 * Resolution + provisioning:
 *  - Resolve the destination folder id by DISPLAY NAME under the mailbox's
 *    `/users/{mailbox}/mailFolders` (paged, $filter on displayName).
 *  - If absent, CREATE it (POST /users/{mailbox}/mailFolders { displayName }).
 *  - Cache the resolved (mailbox, folderName) → folderId in a module-level Map
 *    so repeated moves (every forwarded mail) don't re-resolve. Keyed on the
 *    lowercased mailbox + the exact display name.
 *
 * Routes through the single `graphFetch` credential boundary (connection
 * 56014785) + its built-in 504/socket retry — never a hand-rolled client.
 */
const folderIdCache = new Map<string, string>();

function folderCacheKey(mailbox: string, folderName: string): string {
  return `${mailbox.toLowerCase()}::${folderName}`;
}

/**
 * Resolve (and provision if missing) the folder id for a display name under a
 * mailbox, memoised in `folderIdCache`. Exported for the unit test of the pure
 * resolve/cache seam. Returns null when Graph could not resolve or create the
 * folder (the move caller treats null as a soft failure).
 */
export async function resolveFolderId(
  mailbox: string,
  folderName: string,
): Promise<string | null> {
  const key = folderCacheKey(mailbox, folderName);
  const cached = folderIdCache.get(key);
  if (cached) return cached;

  // Look up by display name (top-level mailFolders).
  const searchRes = await graphFetch(
    `/users/${enc(mailbox)}/mailFolders?$filter=${enc(`displayName eq '${folderName.replace(/'/g, "''")}'`)}&$select=id,displayName&$top=10`,
  );
  if (searchRes.ok) {
    const data = (await searchRes.json()) as {
      value?: Array<{ id?: string }>;
    };
    const found = data.value?.find((f) => typeof f.id === "string")?.id;
    if (found) {
      folderIdCache.set(key, found);
      return found;
    }
  }

  // Absent → create it.
  const createRes = await graphFetch(`/users/${enc(mailbox)}/mailFolders`, {
    method: "POST",
    body: { displayName: folderName },
  });
  if (createRes.ok) {
    const created = (await createRes.json()) as { id?: string };
    if (created.id) {
      folderIdCache.set(key, created.id);
      return created.id;
    }
  }

  return null;
}

/**
 * Move a message into a named destination folder under the source mailbox.
 * Best-effort — NEVER throws; returns OutlookActionResult.
 */
export async function moveMessageToFolder(args: {
  mailbox: string;
  messageId: string;
  folderName: string;
}): Promise<OutlookActionResult> {
  const { mailbox, messageId, folderName } = args;

  let destinationId: string | null;
  try {
    destinationId = await resolveFolderId(mailbox, folderName);
  } catch (err) {
    return { success: false, error: `resolveFolderId threw: ${String(err)}` };
  }
  if (!destinationId) {
    return {
      success: false,
      error: `Could not resolve or create folder "${folderName}"`,
    };
  }

  try {
    const res = await graphFetch(
      `/users/${enc(mailbox)}/messages/${enc(messageId)}/move`,
      { method: "POST", body: { destinationId } },
    );
    if (!res.ok) {
      return {
        success: false,
        error: `move ${res.status}: ${await res.text()}`,
      };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: `move threw: ${String(err)}` };
  }
}

/**
 * Find a mail folder by display name. Returns the folder ID or null.
 */
async function findFolder(
  mailbox: string,
  displayName: string,
): Promise<string | null> {
  // Try well-known name first
  const wellKnown = displayName.toLowerCase().replace(/\s+/g, "");
  const tryRes = await graphFetch(
    `/users/${enc(mailbox)}/mailFolders/${enc(wellKnown)}?$select=id`,
  );

  if (tryRes.ok) {
    const data = await tryRes.json() as { id: string };
    return data.id;
  }

  // Fall back to searching by display name
  const searchRes = await graphFetch(
    `/users/${enc(mailbox)}/mailFolders?$filter=displayName eq '${displayName}'&$select=id,displayName`,
  );

  if (searchRes.ok) {
    const data = await searchRes.json() as { value: Array<{ id: string }> };
    if (data.value?.length > 0) return data.value[0].id;
  }

  return null;
}
