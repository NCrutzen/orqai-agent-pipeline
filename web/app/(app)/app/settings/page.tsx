import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { LanguageSelector } from "@/components/app/language-selector";
import { NotificationPreferencesForm } from "@/components/app/notification-preferences-form";
import { createClient } from "@/lib/supabase/server";
import { resolveUserIdentity } from "@/lib/automations/support-tickets/email-aliases";
import { getNotificationPreferences } from "@/lib/automations/support-tickets/notification-preferences";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Instellingen — MR Support",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { preferredLocale } = await resolveUserIdentity(user?.email ?? "");
  const { locale, dict } = await getI18n(preferredLocale);

  // Fetch notification preferences for the Notificaties section (D-04, D-06).
  // Returns null for new users — form applies D-07 defaults client-side.
  const notifPrefs = user?.email
    ? await getNotificationPreferences(user.email)
    : null;

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-[var(--v7-text)] tracking-[-0.02em] mb-6">
        {dict.settings.title}
      </h1>

      {/* Language / default language */}
      <section className="rounded-lg border border-[var(--v7-line)] bg-[var(--v7-panel)] px-4 py-4 mb-6">
        <h2 className="text-sm font-semibold text-[var(--v7-text)] mb-1">
          {dict.settings.languageSection}
        </h2>
        <p className="text-sm text-[var(--v7-muted)] mb-3 leading-relaxed">
          {dict.settings.languageHelp}
        </p>
        <LanguageSelector locale={locale} label={dict.nav.languageLabel} />
      </section>

      {/* Notificaties — below the language selector (D-04), no separate route */}
      <section className="rounded-lg border border-[var(--v7-line)] bg-[var(--v7-panel)] px-4 py-4 mb-6">
        <h2 className="text-sm font-semibold text-[var(--v7-text)] mb-1">
          {dict.settings.notificationsSection}
        </h2>
        <p className="text-sm text-[var(--v7-muted)] mb-3 leading-relaxed">
          {dict.settings.notificationsHelp}
        </p>
        <NotificationPreferencesForm prefs={notifPrefs} dict={dict.settings} />
      </section>
    </div>
  );
}
