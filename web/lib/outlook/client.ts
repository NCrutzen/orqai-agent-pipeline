import { createZapierSdk } from "@zapier/zapier-sdk";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// Moyne Roberts Outlook connection (zapier@moyneroberts.com)
const OUTLOOK_CONNECTION_ID = "56014785";

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
 */
async function graphFetch(
  path: string,
  options: { method: string; body?: unknown } = { method: "GET" },
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

  // Retry socket-level failures (UND_ERR_SOCKET, ECONNRESET, fetch failed).
  // Sequential Graph calls over a warm undici pool occasionally get a dropped
  // connection mid-pagination; Graph itself is fine on retry.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await zapier.fetch(url, fetchOptions);
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      const retriable =
        /UND_ERR_SOCKET|ECONNRESET|fetch failed|socket hang up|ETIMEDOUT/i.test(msg);
      if (!retriable || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

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
  let url: string | null = `${GRAPH_BASE}/users/${mailbox}/mailFolders/inbox/messages?$top=${pageSize}&$orderby=receivedDateTime desc&$select=${fields}${filter}`;

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
 * Fetch the full body of a single message. Returns plain text (stripped) and
 * raw HTML — UI decides which to render. `bodyType` reports Graph's original
 * content type so the caller can fall back to html when text is empty.
 */
export async function fetchMessageBody(
  mailbox: string,
  messageId: string,
): Promise<{ bodyText: string; bodyHtml: string; bodyType: "text" | "html" }> {
  const res = await graphFetch(
    `/users/${mailbox}/messages/${messageId}?$select=body,uniqueBody`,
  );
  if (!res.ok) {
    throw new Error(`fetchMessageBody ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    body?: { contentType?: "text" | "html"; content?: string };
    uniqueBody?: { contentType?: "text" | "html"; content?: string };
  };
  // Prefer uniqueBody (the part the sender wrote, quoted replies stripped).
  const b = data.uniqueBody?.content ? data.uniqueBody : data.body;
  const contentType = (b?.contentType ?? "text") as "text" | "html";
  const content = b?.content ?? "";
  if (contentType === "html") {
    return { bodyText: stripHtml(content), bodyHtml: content, bodyType: "html" };
  }
  return { bodyText: content, bodyHtml: "", bodyType: "text" };
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
    `/users/${mailbox}/messages/${messageId}?$select=categories`,
  );

  if (!getRes.ok) {
    return { success: false, error: `Failed to get message: ${getRes.status}` };
  }

  const msg = await getRes.json() as { categories: string[] };
  const categories = [...new Set([...(msg.categories || []), category])];

  // Update with the new category added
  const res = await graphFetch(`/users/${mailbox}/messages/${messageId}`, {
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

  const res = await graphFetch(`/users/${mailbox}/messages/${messageId}/move`, {
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
 * Find a mail folder by display name. Returns the folder ID or null.
 */
async function findFolder(
  mailbox: string,
  displayName: string,
): Promise<string | null> {
  // Try well-known name first
  const wellKnown = displayName.toLowerCase().replace(/\s+/g, "");
  const tryRes = await graphFetch(
    `/users/${mailbox}/mailFolders/${wellKnown}?$select=id`,
  );

  if (tryRes.ok) {
    const data = await tryRes.json() as { id: string };
    return data.id;
  }

  // Fall back to searching by display name
  const searchRes = await graphFetch(
    `/users/${mailbox}/mailFolders?$filter=displayName eq '${displayName}'&$select=id,displayName`,
  );

  if (searchRes.ok) {
    const data = await searchRes.json() as { value: Array<{ id: string }> };
    if (data.value?.length > 0) return data.value[0].id;
  }

  return null;
}
