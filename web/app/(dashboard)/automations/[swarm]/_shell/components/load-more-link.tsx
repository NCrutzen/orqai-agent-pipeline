// Phase 06 Plan 02 Task 1 — LoadMoreLink (reusable server-rendered "Load more").
//
// The /review (Queue) and /history pages render this below the list. It links
// to ?before=<nextBefore> — the proven page-level cursor primitive from the
// per-stage pages (stage-1/page.tsx). SSR-only: there is no client-side
// load-more / re-hydration; clicking the link navigates to the next page, which
// the server renders with the new cursor.
//
// Cursor semantics (Plan 06-01): `nextBefore` is the freshest page's last
// email_labels.created_at — opaque to this component; it just round-trips it
// through the URL. When `nextBefore` is null the population is exhausted and
// nothing renders (no dead "Load more"). Each page REPLACES the cursor (this
// link never carries forward a stale `before`).
//
// Operator-language lock (operator-language.md): visible label is "Load more"
// — no pipeline jargon. V7 tokens only — no raw hex.

import Link from "next/link";

export function LoadMoreLink({
  nextBefore,
  basePath,
  currentParams,
}: {
  /** Cursor for the next page (opaque "${created_at}|${id}"). Null → render nothing. */
  nextBefore: string | null;
  /** Route path the caller owns, e.g. `/automations/${swarmType}/review`. */
  basePath: string;
  /** IN-04: the page's CURRENT query params. Any existing params (e.g. filters)
   *  are PRESERVED — only `before` is set/overridden — so paging never resets
   *  URL-driven state. Accepts the Next searchParams object or URLSearchParams. */
  currentParams?: Record<string, string | string[] | undefined> | URLSearchParams;
}) {
  if (nextBefore === null) return null;

  // Seed from the existing params, then set/override only `before`.
  const params = new URLSearchParams();
  if (currentParams instanceof URLSearchParams) {
    currentParams.forEach((v, k) => params.set(k, v));
  } else if (currentParams) {
    for (const [k, v] of Object.entries(currentParams)) {
      if (v === undefined) continue;
      params.set(k, Array.isArray(v) ? (v[v.length - 1] ?? "") : v);
    }
  }
  params.set("before", nextBefore);
  const href = `${basePath}?${params.toString()}`;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "var(--space-4) 0",
      }}
    >
      <Link
        href={href}
        data-testid="load-more-link"
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "var(--space-2) var(--space-4)",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--v7-brand-primary)",
          background: "var(--v7-bg-2)",
          border: "1px solid var(--v7-border)",
          borderRadius: "var(--v7-radius-pill)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Load more
      </Link>
    </div>
  );
}
