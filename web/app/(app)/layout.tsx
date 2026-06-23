import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SerwistProvider } from "@serwist/next/react";
import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/app/app-nav";
import { getI18n } from "@/lib/i18n/server";
import { resolveUserIdentity } from "@/lib/automations/support-tickets/email-aliases";
import { getUnreadTaskIds } from "@/lib/automations/support-tickets/notification-preferences";

// The PWA manifest is served as a static file (public/manifest.webmanifest) and
// linked here, rather than via app/manifest.ts. Next 16.1.6 + Turbopack mis-wraps
// the manifest metadata route ("No response is returned from route handler"):
// static prerender is ~30% flaky, force-dynamic 500s at runtime. A static file
// bypasses the metadata-route codegen entirely and is reliable. (Deviation from
// plan D-05, forced by the framework bug.)
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Default the UI language to the user's AD preferredLanguage (their explicit
  // cookie choice still wins); see email-aliases.ts + i18n/server.ts.
  const { emails, preferredLocale } = await resolveUserIdentity(user.email ?? "");
  const { locale, dict } = await getI18n(preferredLocale);

  // Compute nav presence dot: any ticket with unread notifications.
  // Fail-safe: getUnreadTaskIds returns empty Set on any error.
  const unreadIds = await getUnreadTaskIds(emails);
  const hasAnyUnread = unreadIds.size > 0;

  return (
    // SerwistProvider registers the PWA service worker (static public/sw.js,
    // built by `serwist build`) for the end-user (app) shell only — not the
    // admin dashboard. Disabled in dev so it never interferes with HMR.
    <SerwistProvider
      swUrl="/sw.js"
      disable={process.env.NODE_ENV !== "production"}
    >
      <div className="flex min-h-screen flex-col">
        {/* Skip-to-main link — accessibility requirement (UI-SPEC Accessibility Contract) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-[var(--v7-panel)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--v7-text)]"
        >
          {dict.nav.skipToMain}
        </a>
        <AppNav user={user} locale={locale} dict={dict} hasAnyUnread={hasAnyUnread} />
        <main
          id="main-content"
          className="flex-1 bg-[var(--v7-bg)] text-[var(--v7-text)]"
        >
          <div className="max-w-3xl w-full mx-auto px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </SerwistProvider>
  );
}
