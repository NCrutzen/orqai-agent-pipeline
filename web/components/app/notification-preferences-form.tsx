"use client";

// Client toggle form for the Notificaties section in /app/settings.
//
// Three-tier layout (Surface A):
//  Tier 1: In-app — always-on, locked (checked + disabled)
//  Tier 2: E-mail group — five FUNCTIONAL toggles (master + 4 per-type)
//            master off → per-type rows dim opacity-50 pointer-events-none
//  Tier 3: Web-push + Teams — disabled "binnenkort" rows (deferred D-05/D-11)
//
// D-07 defaults (no prefs row): email_enabled=true, email_on_resolved=true,
//   email_on_rejected=true, email_on_other_status=false, email_on_reactions=false

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateNotificationPreferences } from "@/app/(app)/app/settings/actions";
import type { NotifPrefs, PrefsUpdate } from "@/lib/automations/support-tickets/notification-preferences";
import type { Dictionary } from "@/lib/i18n";

interface NotificationPreferencesFormProps {
  /** Null = new user — apply D-07 defaults */
  prefs: NotifPrefs | null;
  dict: Dictionary["settings"];
}

/** D-07 defaults — what a new user gets before saving any preferences. */
const D07_DEFAULTS: PrefsUpdate = {
  email_enabled: true,
  email_on_resolved: true,
  email_on_rejected: true,
  email_on_other_status: false,
  email_on_reactions: false,
};

export function NotificationPreferencesForm({
  prefs,
  dict,
}: NotificationPreferencesFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Initialise from prefs row or D-07 defaults
  const initial: PrefsUpdate = {
    email_enabled: prefs?.email_enabled ?? D07_DEFAULTS.email_enabled,
    email_on_resolved: prefs?.email_on_resolved ?? D07_DEFAULTS.email_on_resolved,
    email_on_rejected: prefs?.email_on_rejected ?? D07_DEFAULTS.email_on_rejected,
    email_on_other_status: prefs?.email_on_other_status ?? D07_DEFAULTS.email_on_other_status,
    email_on_reactions: prefs?.email_on_reactions ?? D07_DEFAULTS.email_on_reactions,
  };

  const [state, setState] = useState<PrefsUpdate>(initial);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleToggle(field: keyof PrefsUpdate, value: boolean) {
    const previous = state[field];
    // Optimistic update
    setState((prev) => ({ ...prev, [field]: value }));
    setSaveError(null);

    startTransition(async () => {
      try {
        await updateNotificationPreferences({ [field]: value });
        router.refresh();
      } catch {
        // Revert optimistic state + show inline error
        setState((prev) => ({ ...prev, [field]: previous }));
        setSaveError(dict.notifSaveError);
      }
    });
  }

  const emailEnabled = state.email_enabled;
  // Per-type rows dim when master is off
  const perTypeClass = emailEnabled ? "" : "opacity-50 pointer-events-none";

  return (
    <div aria-busy={isPending}>
      {/* Tier 1: In-app — always on, locked */}
      <div className="mb-4">
        <label className="flex items-start gap-3 py-2 min-h-[44px]">
          <input
            type="checkbox"
            checked
            disabled
            aria-disabled="true"
            className="mt-0.5 opacity-60 cursor-not-allowed"
            readOnly
          />
          <span>
            <span className="text-sm text-[var(--v7-muted)]">{dict.notifInApp}</span>
            <span className="block text-sm text-[var(--v7-faint)] leading-relaxed">
              {dict.notifInAppHelp}
            </span>
          </span>
        </label>
      </div>

      {/* Tier 2: E-mail group */}
      <div className="border-t border-[var(--v7-line)] pt-3 mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--v7-muted)] mb-2">
          {dict.notifEmailSection}
        </p>

        {/* E-mail master toggle */}
        <label className="flex items-start gap-3 py-2 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            className="mt-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v7-brand-primary)]"
            checked={state.email_enabled}
            onChange={(e) => handleToggle("email_enabled", e.target.checked)}
            disabled={isPending}
          />
          <span>
            <span className="text-sm text-[var(--v7-text)]">{dict.notifEmailMaster}</span>
            <span className="block text-sm text-[var(--v7-muted)] leading-relaxed">
              {dict.notifEmailMasterHelp}
            </span>
          </span>
        </label>

        {/* Per-type rows — indent + dim when master off */}
        <div className={`ml-6 ${perTypeClass}`}>
          {/* Opgelost */}
          <label className="flex items-start gap-3 py-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              className="mt-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v7-brand-primary)]"
              checked={state.email_on_resolved}
              onChange={(e) => handleToggle("email_on_resolved", e.target.checked)}
              disabled={isPending || !emailEnabled}
            />
            <span>
              <span className="text-sm text-[var(--v7-text)]">{dict.notifEmailResolved}</span>
              <span className="block text-sm text-[var(--v7-muted)] leading-relaxed">
                {dict.notifEmailResolvedHelp}
              </span>
            </span>
          </label>

          {/* Afgewezen — functional toggle (D-06), email SEND deferred Plan 05 */}
          <label className="flex items-start gap-3 py-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              className="mt-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v7-brand-primary)]"
              checked={state.email_on_rejected}
              onChange={(e) => handleToggle("email_on_rejected", e.target.checked)}
              disabled={isPending || !emailEnabled}
            />
            <span>
              <span className="text-sm text-[var(--v7-text)]">{dict.notifEmailRejected}</span>
              <span className="block text-sm text-[var(--v7-muted)] leading-relaxed">
                {dict.notifEmailRejectedHelp}
              </span>
            </span>
          </label>

          {/* Andere statuswijzigingen */}
          <label className="flex items-start gap-3 py-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              className="mt-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v7-brand-primary)]"
              checked={state.email_on_other_status}
              onChange={(e) => handleToggle("email_on_other_status", e.target.checked)}
              disabled={isPending || !emailEnabled}
            />
            <span>
              <span className="text-sm text-[var(--v7-text)]">{dict.notifEmailOtherStatus}</span>
              <span className="block text-sm text-[var(--v7-muted)] leading-relaxed">
                {dict.notifEmailOtherStatusHelp}
              </span>
            </span>
          </label>

          {/* Reacties / updates — functional toggle (D-06), email SEND deferred Plan 05 */}
          <label className="flex items-start gap-3 py-2 cursor-pointer min-h-[44px]">
            <input
              type="checkbox"
              className="mt-0.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v7-brand-primary)]"
              checked={state.email_on_reactions}
              onChange={(e) => handleToggle("email_on_reactions", e.target.checked)}
              disabled={isPending || !emailEnabled}
            />
            <span>
              <span className="text-sm text-[var(--v7-text)]">{dict.notifEmailReactions}</span>
              <span className="block text-sm text-[var(--v7-muted)] leading-relaxed">
                {dict.notifEmailReactionsHelp}
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Tier 3: Web-push + Teams — disabled binnenkort rows */}
      <div className="border-t border-[var(--v7-line)] my-3 pt-3">
        {/* Web-push */}
        <label className="flex items-start gap-3 py-2 min-h-[44px]">
          <input
            type="checkbox"
            disabled
            aria-disabled="true"
            className="mt-0.5 opacity-40 cursor-not-allowed"
            readOnly
          />
          <span>
            <span className="text-sm text-[var(--v7-muted)]">{dict.notifWebPush}</span>
            <span className="block text-sm text-[var(--v7-faint)] leading-relaxed italic">
              {dict.notifComingSoon}
            </span>
          </span>
        </label>

        {/* Microsoft Teams */}
        <label className="flex items-start gap-3 py-2 min-h-[44px]">
          <input
            type="checkbox"
            disabled
            aria-disabled="true"
            className="mt-0.5 opacity-40 cursor-not-allowed"
            readOnly
          />
          <span>
            <span className="text-sm text-[var(--v7-muted)]">{dict.notifTeams}</span>
            <span className="block text-sm text-[var(--v7-faint)] leading-relaxed italic">
              {dict.notifComingSoon}
            </span>
          </span>
        </label>
      </div>

      {/* Inline save error */}
      {saveError && (
        <p className="text-sm text-red-500 mt-1" role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}
