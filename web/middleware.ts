import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Phase 3 Plan 01 Task 0b (2026-05-24) — REMOVED: Phase 76 Plan 08 (D-05.6)
// `/automations/<swarm>/review → /stage-1` backwards-compat redirect.
//
// Removed because Plan 01 Task 0b mounts a real BulkReviewClientShell page at
// `/automations/[swarm]/review` per CONTEXT P3-D-12. With the redirect in
// place, the new page would be unreachable (middleware short-circuits before
// the route handler). The redirect was a transitional shim for operator
// bookmarks made before the URL rename; those bookmarks now resolve to the
// new Bulk Review surface as intended.
//
// Open-redirect threat T-76-08-01 (operator-supplied `?tab=` value crossing
// into the redirect target) is moot now that no redirect exists.

export default async function proxy(request: NextRequest) {
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
