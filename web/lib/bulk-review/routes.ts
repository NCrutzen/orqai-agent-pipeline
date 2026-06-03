// Phase 1 (milestone bulk-review-flow-ux) — P1-D-05.
// Cross-surface URL helpers. Bulk Review ↔ Kanban share the SAME
// email_labels.id as the join key (CON-bulk-review-vs-kanban-split). These
// helpers are pure functions — no Supabase, no Next.js router. The
// operator-side hop is implemented in Phase 3 (consolidated 4-axis capture).
//
// Why query params and not path segments: the existing per-swarm shell
// (`web/app/(dashboard)/automations/[swarm]/_shell/detail-pane.tsx`) hosts
// both surfaces inside the same route. The query param tells the shell which
// row to focus on AND which surface to dispatch to.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Matches actual swarm_type values: debtor-email, sales-email, agent-namer,
// uren-controle, info-routing. Lowercase, alphanumeric, dashes.
const SWARM_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type BulkReviewSurface = "bulk-review" | "kanban";

export interface SurfaceLocator {
  email_label_id: string;
  swarm_type: string;
}

export interface ParsedLocator extends SurfaceLocator {
  surface: BulkReviewSurface;
}

function assertValid(loc: SurfaceLocator): void {
  if (!loc.email_label_id || !UUID_RE.test(loc.email_label_id)) {
    throw new Error(
      `[bulk-review/routes] invalid email_label_id: ${loc.email_label_id}`,
    );
  }
  if (!loc.swarm_type || !SWARM_RE.test(loc.swarm_type)) {
    throw new Error(
      `[bulk-review/routes] invalid swarm_type: ${loc.swarm_type}`,
    );
  }
}

export function bulkReviewUrlFor(loc: SurfaceLocator): string {
  assertValid(loc);
  const params = new URLSearchParams({ bulk_review_focus: loc.email_label_id });
  return `/automations/${loc.swarm_type}?${params.toString()}`;
}

export function kanbanUrlFor(loc: SurfaceLocator): string {
  assertValid(loc);
  const params = new URLSearchParams({ kanban_focus: loc.email_label_id });
  return `/automations/${loc.swarm_type}?${params.toString()}`;
}

export function parseEmailLabelIdFromUrl(url: string): ParsedLocator | null {
  // Accept absolute or relative URLs. Strip protocol+host if present by
  // matching the `/automations/<swarm>?<query>` tail.
  const m = url.match(/\/automations\/([a-z0-9][a-z0-9-]{0,63})\?(.+)$/i);
  if (!m) return null;
  const swarm_type = m[1];
  const params = new URLSearchParams(m[2]);
  const bulk = params.get("bulk_review_focus");
  const kanban = params.get("kanban_focus");
  if (bulk && UUID_RE.test(bulk)) {
    return { email_label_id: bulk, swarm_type, surface: "bulk-review" };
  }
  if (kanban && UUID_RE.test(kanban)) {
    return { email_label_id: kanban, swarm_type, surface: "kanban" };
  }
  return null;
}
