// Phase 56-00 (D-04, D-05). Single sync client for the NXT-Zapier lookup
// webhook. One call site per resolver layer; the lookup_kind discriminator
// drives the Zap branching.
//
// Transport: Bearer-secret POST to NXT_ZAPIER_WEBHOOK_URL. Timeout 25s
// (under Zapier's 30s limit). Response shape Zod-validated at the boundary
// to fail loudly if the Zap mis-routes (Pitfall 5).

import { z } from "zod";

const NXT_ZAP_TIMEOUT_MS = 25_000; // < 30s Zapier limit

export type LookupKind =
  | "sender_to_account"
  | "identifier_to_account"
  | "candidate_details";

export interface NxtZapRequest {
  nxt_database: string;
  lookup_kind: LookupKind;
  payload: Record<string, unknown>;
}

const NxtMatchSchema = z.object({
  customer_account_id: z.string(),
  customer_name: z.string(),
  contactperson_name: z.string().optional(),
  invoice_numbers: z.array(z.string()).optional(),
  recent_invoices: z
    .array(
      z.object({
        id: z.string(),
        date: z.string(),
        amount: z.number(),
      }),
    )
    .optional(),
  last_interaction: z.string().optional(),
  confidence_signal: z.enum(["exact", "shared_mailbox", "fuzzy"]).optional(),
});

const NxtZapResponseSchema = z.object({
  matches: z.array(NxtMatchSchema),
});

export type NxtMatch = z.infer<typeof NxtMatchSchema>;
export type NxtZapResponse = z.infer<typeof NxtZapResponseSchema>;

export async function callNxtZap(req: NxtZapRequest): Promise<NxtZapResponse> {
  const url = process.env.NXT_ZAPIER_WEBHOOK_URL;
  const secret = process.env.NXT_ZAPIER_WEBHOOK_SECRET;
  if (!url || !secret) {
    throw new Error("NXT_ZAPIER_WEBHOOK_URL/SECRET not configured");
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), NXT_ZAP_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`NXT-Zap ${req.lookup_kind} failed: ${res.status}`);
    }
    const json = await res.json();
    return NxtZapResponseSchema.parse(json);
  } finally {
    clearTimeout(t);
  }
}
