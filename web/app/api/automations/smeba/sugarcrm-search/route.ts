import { NextRequest, NextResponse } from "next/server";
import { createZapierSdk } from "@zapier/zapier-sdk";

export const maxDuration = 25;

const INTERNAL_API_KEY = process.env.SMEBA_INTERNAL_API_KEY!;
const SUGARCRM_CONNECTION_ID = 58816663;
const ZAPIER_CALL_TIMEOUT_MS = 18_000;
const MAX_CASES = 5;
const MAX_QUOTES = 5;
const MAX_EMAILS = 5;

function extractDomain(email: string): string | null {
  const match = email.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : null;
}

function extractEmail(raw: string): string {
  const angleMatch = raw.match(/<([^>]+)>/);
  if (angleMatch) return angleMatch[1].trim();
  return raw.trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Zapier call timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey !== INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.sender_email || typeof body.sender_email !== "string") {
    return NextResponse.json(
      { error: "Missing required field: sender_email (string)" },
      { status: 400 }
    );
  }

  const hasCredentials =
    process.env.ZAPIER_CREDENTIALS ||
    (process.env.ZAPIER_CREDENTIALS_CLIENT_ID &&
      process.env.ZAPIER_CREDENTIALS_CLIENT_SECRET);

  if (!hasCredentials) {
    return NextResponse.json(
      { crm_match: false, crm_error: true, crm_error_message: "Zapier credentials not configured" },
      { status: 503 }
    );
  }

  const { sender_email } = body as { sender_email: string };
  const domain = extractDomain(sender_email);
  const cleanEmail = extractEmail(sender_email);

  if (!domain) {
    return NextResponse.json(
      { error: "Could not extract domain from sender_email" },
      { status: 400 }
    );
  }

  const zapier = createZapierSdk();

  try {
    // Step 1: Find contact by exact email address
    const { data: contactResults } = await withTimeout(
      zapier.runAction({
        app: "SugarCRMCLIAPI",
        actionType: "search",
        action: "record",
        connectionId: SUGARCRM_CONNECTION_ID,
        inputs: { module: "Contacts", search_field_1: "email1", value_for_search_field_1: cleanEmail },
        maxItems: 1,
      }),
      ZAPIER_CALL_TIMEOUT_MS
    );

    const contact = (contactResults?.[0] ?? null) as Record<string, unknown> | null;
    const contactId = contact?.["id"] as string | null ?? null;
    const accountId = (contact?.["account_id"] as string) || null;
    // pr_site_id is a custom field linking contact to a physical site in NXT
    const siteId = (contact?.["pr_site_id"] as string) || null;

    // Step 2a: If contact has account_id, fetch the account record
    let accountData: Record<string, unknown> | null = null;
    if (accountId) {
      const { data: accResults } = await withTimeout(
        zapier.runAction({
          app: "SugarCRMCLIAPI",
          actionType: "search",
          action: "record",
          connectionId: SUGARCRM_CONNECTION_ID,
          inputs: { module: "Accounts", search_field_1: "id", value_for_search_field_1: accountId },
          maxItems: 1,
        }),
        ZAPIER_CALL_TIMEOUT_MS
      );
      accountData = (accResults?.[0] ?? null) as Record<string, unknown> | null;
    }

    // Step 2b: No contact found → try to find account by domain name prefix
    if (!contact) {
      const companyHint = domain.split(".")[0];
      const { data: accountResults } = await withTimeout(
        zapier.runAction({
          app: "SugarCRMCLIAPI",
          actionType: "search",
          action: "record",
          connectionId: SUGARCRM_CONNECTION_ID,
          inputs: { module: "Accounts", search_field_1: "name", value_for_search_field_1: companyHint },
          maxItems: 1,
        }),
        ZAPIER_CALL_TIMEOUT_MS
      );
      if (accountResults && accountResults.length > 0) {
        accountData = accountResults[0] as Record<string, unknown>;
      }
    }

    // No match at all
    if (!contact && !accountData) {
      return NextResponse.json({
        crm_match: false, crm_contact: null, crm_account: null,
        crm_cases: [], crm_quotes: [], crm_emails: [], crm_error: false,
      });
    }

    // Step 3: Fetch cases, quotes, emails in parallel
    // Cases: by contact_id (all linked cases) + by pr_site_id (named cases for the site)
    // Emails: by contact_id
    // Quotes: by account_id if available
    const lookupId = accountId || (accountData?.["id"] as string) || null;

    const [casesByContact, casesBySite, quotesResult, emailsResult] = await Promise.allSettled([
      contactId
        ? withTimeout(
            zapier.runAction({
              app: "SugarCRMCLIAPI", actionType: "read", action: "get_records",
              connectionId: SUGARCRM_CONNECTION_ID,
              inputs: { module: "Cases", contact_id: contactId },
              maxItems: MAX_CASES,
            }).then((r) => r.data),
            ZAPIER_CALL_TIMEOUT_MS
          )
        : Promise.resolve([]),
      siteId
        ? withTimeout(
            zapier.runAction({
              app: "SugarCRMCLIAPI", actionType: "search", action: "record",
              connectionId: SUGARCRM_CONNECTION_ID,
              inputs: { module: "Cases", search_field_1: "pr_site_id", value_for_search_field_1: siteId },
              maxItems: MAX_CASES,
            }),
            ZAPIER_CALL_TIMEOUT_MS
          ).then((r) => (r as { data?: unknown[] }).data ?? [])
        : Promise.resolve([]),
      lookupId
        ? withTimeout(
            zapier.runAction({
              app: "SugarCRMCLIAPI", actionType: "read", action: "get_records",
              connectionId: SUGARCRM_CONNECTION_ID,
              inputs: { module: "Quotes", account_id: lookupId },
              maxItems: MAX_QUOTES,
            }).then((r) => r.data),
            ZAPIER_CALL_TIMEOUT_MS
          )
        : Promise.resolve([]),
      contactId
        ? withTimeout(
            zapier.runAction({
              app: "SugarCRMCLIAPI", actionType: "read", action: "get_records",
              connectionId: SUGARCRM_CONNECTION_ID,
              inputs: { module: "Emails", contact_id: contactId },
              maxItems: MAX_EMAILS,
            }).then((r) => r.data),
            ZAPIER_CALL_TIMEOUT_MS
          )
        : Promise.resolve([]),
    ]);

    // Merge cases from both sources, deduplicate by id
    const casesFromContact = (casesByContact.status === "fulfilled" ? casesByContact.value : []) as Record<string, unknown>[];
    const casesFromSite = (casesBySite.status === "fulfilled" ? casesBySite.value : []) as Record<string, unknown>[];
    const seenIds = new Set<string>();
    const mergedCases = [...casesFromSite, ...casesFromContact].filter((c) => {
      const id = c["id"] as string;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    return NextResponse.json({
      crm_match: true,
      crm_contact: contact
        ? {
            id: contact["id"],
            name: contact["full_name"] ?? contact["name"],
            phone: contact["phone_mobile"] ?? contact["phone_work"],
            pr_site_id: contact["pr_site_id"],
            pr_nxt_id: contact["pr_nxt_id"],
            account_id: accountId,
          }
        : null,
      crm_account: accountData
        ? { id: accountData["id"], name: accountData["name"], email1: accountData["email1"] }
        : null,
      crm_cases: mergedCases.map((c) => ({
        id: c["id"],
        case_number: c["case_number"],
        name: c["name"],
        status: c["status"],
        description: (c["description"] as string)?.slice(0, 500) ?? null,
        assigned_user_name: c["assigned_user_name"],
        date_entered: c["date_entered"],
      })),
      crm_quotes: quotesResult.status === "fulfilled" ? (quotesResult.value ?? []) : [],
      crm_emails: (emailsResult.status === "fulfilled" ? (emailsResult.value ?? []) : []) as Record<string, unknown>[],
      crm_error: false,
    });
  } catch (err) {
    console.error("[smeba/sugarcrm-search] Zapier SDK error:", err);
    return NextResponse.json({
      crm_match: false, crm_contact: null, crm_account: null,
      crm_cases: [], crm_quotes: [], crm_emails: [],
      crm_error: true,
      crm_error_message: String(err).slice(0, 300),
    });
  }
}
