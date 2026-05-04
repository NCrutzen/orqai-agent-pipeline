import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { waitForFetchRequest } from "@/lib/automations/debtor-email/fetch-document";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

// Registry note: this route is cataloged in `public.zapier_tools` as
// `nxt.invoice_fetch` (pattern=async_callback). Phase 56 ships the registry
// for documentation + URL resolution by the new generic-lookup callers; this
// existing route still reads URL/secret from env. Phase 56.5 will migrate
// this route onto the generic /api/zapier-tools/[tool_id] bridge so the
// registry becomes the single source of truth.
const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET;
const ZAP_URL = process.env.DEBTOR_FETCH_WEBHOOK_URL_INVOICE;
const ZAP_SHARED_SECRET = process.env.DEBTOR_FETCH_WEBHOOK_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

// Vercel Pro max. Stay under with the internal wait ceiling (50s).
export const maxDuration = 60;

const WAIT_TIMEOUT_MS = 50_000;

type FetchDocumentBody = {
  docType?: string;
  reference?: string;
  entity?: string;
};

/**
 * POST /api/automations/debtor/fetch-document
 *
 * Async-callback proxy to the Zapier "MR · Debtor · Fetch Invoice" Zap:
 *  1) Insert pending row in automation.fetch_requests.
 *  2) POST to the Zap with {requestId, callback_url, secret}.
 *  3) Wait (via Supabase Realtime) for the callback handler to UPDATE the row.
 *  4) Download the hydrated Zapier CDN pdf_url, return base64 + metadata.
 *
 * Auth: Authorization: Bearer <AUTOMATION_WEBHOOK_SECRET> (also accepts legacy
 * x-automation-secret, matching the sibling create-draft route).
 *
 * ENVIRONMENT: PRODUCTION — the underlying S3 bucket is nxt-benelux-prod-*.
 * There is no acceptance equivalent; do not add a flag to switch.
 */
export async function POST(request: NextRequest) {
  console.log("[fetch-document] ENVIRONMENT: PRODUCTION -- NXT prod S3 (nxt-benelux-prod-*)");

  if (!WEBHOOK_SECRET || !ZAP_URL || !ZAP_SHARED_SECRET || !APP_URL) {
    return NextResponse.json(
      {
        found: false,
        reason: "upstream_error",
        details:
          "Missing env: AUTOMATION_WEBHOOK_SECRET, DEBTOR_FETCH_WEBHOOK_URL_INVOICE, DEBTOR_FETCH_WEBHOOK_SECRET, NEXT_PUBLIC_APP_URL",
      },
      { status: 500 },
    );
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const legacy = request.headers.get("x-automation-secret");
  if (bearer !== WEBHOOK_SECRET && legacy !== WEBHOOK_SECRET) {
    return NextResponse.json(
      { found: false, reason: "upstream_error", details: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as FetchDocumentBody | null;
  if (!body) {
    return NextResponse.json(
      { found: false, reason: "upstream_error", details: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // MVP: invoice-only.
  if (body.docType !== "invoice") {
    return NextResponse.json({ error: "unsupported_doc_type" }, { status: 400 });
  }

  const reference = String(body.reference ?? "");
  if (!/^\d+$/.test(reference)) {
    return NextResponse.json(
      { found: false, reason: "invalid_reference_format", details: "reference must be digits only" },
      { status: 400 },
    );
  }

  const entity = typeof body.entity === "string" && body.entity.length > 0 ? body.entity : "unknown";

  const requestId = randomUUID();
  const admin = createAdminClient();

  // 1. Insert pending row.
  const insertErr = await admin
    .schema("debtor")
    .from("fetch_requests")
    .insert({
      id: requestId,
      status: "pending",
      payload: { docType: "invoice", reference, entity },
    })
    .then(
      ({ error }) => error,
      (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
    );

  if (insertErr) {
    return NextResponse.json(
      {
        found: false,
        reason: "upstream_error",
        details: `fetch_requests insert failed: ${insertErr.message}`,
        request_id: requestId,
      },
      { status: 500 },
    );
  }

  const callbackUrl = `${APP_URL.replace(/\/$/, "")}/api/automations/debtor/fetch-document/callback`;

  // 2. POST to Zap (kick off async chain). No retries on 5xx — bubble up.
  let zapResponse: Response;
  try {
    zapResponse = await fetch(ZAP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        docType: "invoice",
        reference,
        entity,
        requestId,
        callback_url: callbackUrl,
        secret: ZAP_SHARED_SECRET,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logRun(admin, "failed", { requestId, reference, entity, reason: "upstream_error", details: message });
    return NextResponse.json(
      { found: false, reason: "upstream_error", details: `Zap POST failed: ${message}`, request_id: requestId },
      { status: 502 },
    );
  }

  if (!zapResponse.ok) {
    const text = await zapResponse.text().catch(() => "");
    await logRun(admin, "failed", {
      requestId,
      reference,
      entity,
      reason: "upstream_error",
      details: `Zap ${zapResponse.status}: ${text.slice(0, 500)}`,
    });
    return NextResponse.json(
      {
        found: false,
        reason: "upstream_error",
        details: `Zap returned ${zapResponse.status}`,
        request_id: requestId,
      },
      { status: 502 },
    );
  }

  // 3. Wait for callback via Realtime.
  let result: Awaited<ReturnType<typeof waitForFetchRequest>>;
  try {
    result = await waitForFetchRequest(requestId, WAIT_TIMEOUT_MS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logRun(admin, "failed", { requestId, reference, entity, reason: "upstream_error", details: message });
    return NextResponse.json(
      { found: false, reason: "upstream_error", details: message, request_id: requestId },
      { status: 502 },
    );
  }

  if (result === null) {
    // Timeout — caller can retry-poll by requestId.
    await logRun(admin, "failed", { requestId, reference, entity, reason: "timeout" });
    return NextResponse.json(
      { found: false, reason: "timeout", request_id: requestId },
      { status: 504 },
    );
  }

  const pdfUrl = typeof result.pdf_url === "string" ? result.pdf_url : null;
  if (!pdfUrl) {
    await logRun(admin, "failed", { requestId, reference, entity, reason: "not_found", details: "callback missing pdf_url" });
    return NextResponse.json(
      {
        found: false,
        reason: "not_found",
        details: "Callback payload had no pdf_url",
        request_id: requestId,
      },
      { status: 404 },
    );
  }

  // 4. Download hydrated PDF from the Zapier CDN URL.
  let pdfResponse: Response;
  try {
    pdfResponse = await fetch(pdfUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logRun(admin, "failed", { requestId, reference, entity, reason: "fetch_failed", details: message });
    return NextResponse.json(
      { found: false, reason: "fetch_failed", details: message, request_id: requestId },
      { status: 502 },
    );
  }

  if (!pdfResponse.ok) {
    await logRun(admin, "failed", {
      requestId,
      reference,
      entity,
      reason: "fetch_failed",
      details: `pdf_url ${pdfResponse.status}`,
    });
    return NextResponse.json(
      {
        found: false,
        reason: "fetch_failed",
        details: `pdf_url returned ${pdfResponse.status}`,
        request_id: requestId,
      },
      { status: 502 },
    );
  }

  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
  const pdfBase64 = pdfBuffer.toString("base64");

  const filename = typeof result.filename === "string" ? result.filename : `invoice-${reference}.pdf`;

  const metadata = {
    invoice_id: result.invoice_id ?? null,
    customer_id: result.customer_id ?? null,
    document_type: result.document_type ?? null,
    bucket: result.bucket ?? null,
    key: result.key ?? null,
    created_on: result.created_on ?? null,
  };

  await logRun(admin, "completed", {
    requestId,
    reference,
    entity,
    filename,
    metadata,
    pdfBytes: pdfBuffer.length,
  });

  return NextResponse.json(
    {
      found: true,
      pdf: { base64: pdfBase64, filename },
      metadata,
      request_id: requestId,
    },
    { status: 200 },
  );
}

async function logRun(
  admin: ReturnType<typeof createAdminClient>,
  status: "completed" | "failed",
  result: Record<string, unknown>,
) {
  await admin
    .from("automation_runs")
    .insert({
      automation: "debtor-email-fetch-document",
      status,
      result,
      error_message: status === "failed" ? String(result.details ?? result.reason ?? null) : null,
      triggered_by: "debtor-swarm:fetch-document",
      completed_at: new Date().toISOString(),
    })
    .then(
      () => null,
      (err: unknown) => console.warn(`[fetch-document] automation_runs log failed (non-fatal): ${err}`),
    );
  await emitAutomationRunStale(admin, "debtor-email-fetch-document");
}
