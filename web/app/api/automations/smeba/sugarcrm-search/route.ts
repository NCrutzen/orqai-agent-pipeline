import { NextRequest, NextResponse } from "next/server";
import { createZapierSdk } from "@zapier/zapier-sdk";

export const maxDuration = 25;

const INTERNAL_API_KEY = process.env.SMEBA_INTERNAL_API_KEY!;
// Connection ID for "Sugar CRM // NCrutzen" in Zapier
const SUGARCRM_CONNECTION_ID = 58816663;
const ZAPIER_CALL_TIMEOUT_MS = 18_000;
// Max items fetched per lookup to keep latency under ~12s
const MAX_CASES = 5;
const MAX_QUOTES = 5;
const MAX_EMAILS = 10;

// Handles both plain "user@domain.com" and "Name <user@domain.com>" formats
function extractDomain(email: string): string | null {
  const match = email.match(/@([\w.-]+)/);
  return match ? match[1].toLowerCase() : null;
}

// Extracts just the email address from "Name <email@domain.com>" or plain "email@domain.com"
function extractEmail(raw: string): string {
  const angleMatch = raw.match(/<([^>]+)>/);
  if (angleMatch) return angleMatch[1].trim();
  return raw.trim();
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

  // Verify Zapier credentials are configured before attempting SDK calls.
  // createZapierSdk() reads ZAPIER_CREDENTIALS_CLIENT_ID + ZAPIER_CREDENTIALS_CLIENT_SECRET
  // (or ZAPIER_CREDENTIALS token) from env vars automatically.
  const hasCredentials =
    process.env.ZAPIER_CREDENTIALS ||
    (process.env.ZAPIER_CREDENTIALS_CLIENT_ID &&
      process.env.ZAPIER_CREDENTIALS_CLIENT_SECRET);

  if (!hasCredentials) {
    console.error(
      "[smeba/sugarcrm-search] Zapier credentials not configured. " +
        "Set ZAPIER_CREDENTIALS_CLIENT_ID + ZAPIER_CREDENTIALS_CLIENT_SECRET " +
        "(or ZAPIER_CREDENTIALS) in Vercel env vars."
    );
    return NextResponse.json(
      {
        crm_match: false,
        crm_error: true,
        crm_error_message:
          "Zapier credentials not configured — contact Nick Crutzen for ZAPIER_CREDENTIALS_CLIENT_ID + ZAPIER_CREDENTIALS_CLIENT_SECRET",
      },
      { status: 503 }
    );
  }

  const { sender_email } = body as { sender_email: string };
  const domain = extractDomain(sender_email);

  if (!domain) {
    return NextResponse.json(
      { error: "Could not extract domain from sender_email" },
      { status: 400 }
    );
  }

  const zapier = createZapierSdk();

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Zapier call timed out after ${ms}ms`)), ms)
      ),
    ]);
  }

  try {
    // Step 1: Search Accounts by sender domain.
    // SugarCRM Accounts have an email domain field — search by domain to find the customer.
    // Field name confirmed by Sam Cody: search_field_1 = 'email_address_used_for_sending'
    // Fallback: 'name' match if domain search returns nothing.
    let accountData: Record<string, unknown> | null = null;

    // Step 1a: Search Contacts by exact sender email → derive account_id
    const cleanEmail = extractEmail(sender_email);
    const { data: contactResults } = await withTimeout(
      zapier.runAction({
        app: "SugarCRMCLIAPI",
        actionType: "search",
        action: "record",
        connectionId: SUGARCRM_CONNECTION_ID,
        inputs: {
          module: "Contacts",
          search_field_1: "email1",
          value_for_search_field_1: cleanEmail,
        },
        maxItems: 1,
      }),
      ZAPIER_CALL_TIMEOUT_MS
    );

    let accountId: string | null = null;

    if (contactResults && contactResults.length > 0) {
      const contact = contactResults[0] as Record<string, unknown>;
      const acc = contact["account"] as Record<string, unknown> | undefined;
      accountId = (contact["account_id"] ?? acc?.["id"] ?? null) as string | null;
    }

    // Step 1b: Fallback — search Accounts by name derived from domain (e.g. "abbott" from "abbott.com")
    if (!accountId) {
      const companyHint = domain.split(".")[0]; // "abbott" from "abbott.com"
      const { data: accountResults } = await withTimeout(
        zapier.runAction({
          app: "SugarCRMCLIAPI",
          actionType: "search",
          action: "record",
          connectionId: SUGARCRM_CONNECTION_ID,
          inputs: {
            module: "Accounts",
            search_field_1: "name",
            value_for_search_field_1: companyHint,
          },
          maxItems: 1,
        }),
        ZAPIER_CALL_TIMEOUT_MS
      );

      if (accountResults && accountResults.length > 0) {
        accountData = accountResults[0] as Record<string, unknown>;
        accountId = accountData["id"] as string;
      }
    }

    if (!accountId) {
      return NextResponse.json({
        crm_match: false,
        crm_account: null,
        crm_cases: [],
        crm_quotes: [],
        crm_emails: [],
        crm_error: false,
      });
    }

    // Step 1c: Fetch full account record if we only have accountId from contact lookup
    // get_records (plural) is the correct action name in SugarCRM CLI API
    if (!accountData) {
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

    if (!accountData) {
      return NextResponse.json({
        crm_match: false,
        crm_account: null,
        crm_cases: [],
        crm_quotes: [],
        crm_emails: [],
        crm_error: false,
      });
    }

    // Step 2: Fetch Cases + Quotes + recent Emails linked to this account in parallel.
    const [casesResult, quotesResult, emailsResult] = await Promise.allSettled([
      withTimeout(
        zapier.runAction({
          app: "SugarCRMCLIAPI",
          actionType: "read",
          action: "get_records",
          connectionId: SUGARCRM_CONNECTION_ID,
          inputs: { module: "Cases", account_id: accountId },
          maxItems: MAX_CASES,
        }).then((r) => r.data),
        ZAPIER_CALL_TIMEOUT_MS
      ),
      withTimeout(
        zapier.runAction({
          app: "SugarCRMCLIAPI",
          actionType: "read",
          action: "get_records",
          connectionId: SUGARCRM_CONNECTION_ID,
          inputs: { module: "Quotes", account_id: accountId },
          maxItems: MAX_QUOTES,
        }).then((r) => r.data),
        ZAPIER_CALL_TIMEOUT_MS
      ),
      withTimeout(
        zapier.runAction({
          app: "SugarCRMCLIAPI",
          actionType: "read",
          action: "get_records",
          connectionId: SUGARCRM_CONNECTION_ID,
          inputs: { module: "Emails", parent_id: accountId },
          maxItems: MAX_EMAILS,
        }).then((r) => r.data),
        ZAPIER_CALL_TIMEOUT_MS
      ),
    ]);

    return NextResponse.json({
      crm_match: true,
      crm_account: accountData,
      crm_cases:
        casesResult.status === "fulfilled" ? (casesResult.value ?? []) : [],
      crm_quotes:
        quotesResult.status === "fulfilled" ? (quotesResult.value ?? []) : [],
      crm_emails:
        emailsResult.status === "fulfilled" ? (emailsResult.value ?? []) : [],
      crm_error: false,
    });
  } catch (err) {
    console.error("[smeba/sugarcrm-search] Zapier SDK error:", err);
    return NextResponse.json({
      crm_match: false,
      crm_account: null,
      crm_cases: [],
      crm_quotes: [],
      crm_emails: [],
      crm_error: true,
      crm_error_message: String(err).slice(0, 300),
    });
  }
}
