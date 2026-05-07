import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Phase 76 Plan 08 (D-05.6) — Backwards-compat redirects for the URL rename
// from /automations/[swarm]/review → stage-keyed equivalents.
//
//   /automations/<swarm>/review                → /automations/<swarm>/stage-1
//   /automations/<swarm>/review?tab=safety     → /automations/<swarm>/stage-0
//   /automations/<swarm>/review?tab=pending    → /automations/<swarm>/stage-1?sub=pending
//
// Status code 308 (Permanent Redirect) — preserves request method and signals
// long-term aliasing so operator bookmarks keep working without semantic drift.
//
// Threat T-76-08-01 (open redirect): the redirect target is constructed from
// validated path segments only (regex-matched `swarm` capture) and from a
// closed enum of `tab` values. No operator-supplied URL fragment is ever
// interpolated into NextResponse.redirect's target URL.
const REVIEW_REDIRECT_RE = /^\/automations\/([^\/]+)\/review\/?$/;

/**
 * Pure helper for the D-05.6 backwards-compat redirect. Returns the
 * target path+query for legacy `/automations/<swarm>/review` URLs, or
 * `null` when the request is not a /review URL (caller should pass
 * through to normal middleware logic).
 *
 * Exported for unit testing — Next.js middleware itself runs in an Edge
 * runtime that's awkward to instantiate from vitest.
 */
export function resolveReviewRedirect(
  pathname: string,
  searchParams: URLSearchParams,
): string | null {
  const m = pathname.match(REVIEW_REDIRECT_RE);
  if (!m) return null;
  const swarm = m[1];
  const tab = searchParams.get("tab");
  if (tab === "safety") return `/automations/${swarm}/stage-0`;
  if (tab === "pending") return `/automations/${swarm}/stage-1?sub=pending`;
  return `/automations/${swarm}/stage-1`;
}

export default async function proxy(request: NextRequest) {
  // Backwards-compat redirect runs BEFORE the Supabase session check —
  // redirects are public-cacheable and have no auth dependency. The
  // redirected target itself goes back through middleware on the next
  // request and gets gated by the session check below.
  const redirectTarget = resolveReviewRedirect(
    request.nextUrl.pathname,
    request.nextUrl.searchParams,
  );
  if (redirectTarget) {
    return NextResponse.redirect(
      new URL(redirectTarget, request.nextUrl.origin),
      308,
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session -- IMPORTANT: must call getUser() not getSession()
  // getUser() validates with the Supabase Auth server; getSession() only reads the local token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to /login (except auth and API routes)
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api/inngest") &&
    !request.nextUrl.pathname.startsWith("/api/automations") &&
    !request.nextUrl.pathname.startsWith("/api/klachten") &&
    !request.nextUrl.pathname.startsWith("/rijtijden")
  ) {
    const originalPath = request.nextUrl.pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (originalPath !== "/" && !originalPath.startsWith("/login")) {
      url.searchParams.set("next", originalPath);
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
