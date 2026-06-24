// ROUTE-FIX — the Stage-3 routing classifier was fed the event payload's
// subject/body_text, which arrive EMPTY for info-routing → the agent saw no
// content and returned `unrouted` for 100% of mail (confirmed live 2026-06-24:
// routing_debug raw reasoning = "body and subject are empty"). The canonical
// content lives on email_pipeline.emails (keyed by email_id). This pure helper
// picks the content the agent should classify: prefer the DB row (body_full_text
// wider, body_text fallback), fall back to the event payload so debtor/sales
// stay byte-neutral. IO (the DB read) lives in the caller; this stays pure +
// testable — mirrors the intent path's body re-fetch in debtor-email-coordinator.

export interface RoutingContentRow {
  subject?: string | null;
  body_text?: string | null;
  body_full_text?: string | null;
}

export interface RoutingContentFallback {
  subject?: string | null;
  body_text?: string | null;
}

export function selectRoutingContent(
  row: RoutingContentRow | null | undefined,
  fallback: RoutingContentFallback,
): { subject: string; body_text: string } {
  return {
    subject: row?.subject ?? fallback.subject ?? "",
    body_text:
      row?.body_full_text ?? row?.body_text ?? fallback.body_text ?? "",
  };
}
