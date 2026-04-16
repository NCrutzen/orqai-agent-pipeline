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

  return zapier.fetch(url, fetchOptions);
}

export interface OutlookActionResult {
  success: boolean;
  error?: string;
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
