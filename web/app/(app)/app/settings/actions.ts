"use server";

// Server action for updating notification preferences.
//
// SECURITY (T-06-05, T-06-06):
// - Reads the logged-in user via createClient().auth.getUser() — server-side session.
// - Upserts ONLY with user_email = that user's email (client cannot pass an arbitrary email).
// - Uses createAdminClient() for the write (bypasses RLS for the INSERT/UPDATE path).
//   RLS has no authenticated INSERT/UPDATE policy — writes go through service_role only.
// - NEVER uses createClient() for the write.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PrefsUpdate } from "@/lib/automations/support-tickets/notification-preferences";

/**
 * Upserts notification preferences for the currently logged-in user.
 * Validates session ownership before writing — client cannot supply an arbitrary email.
 *
 * @throws Error("Unauthorized") if no authenticated user session.
 */
export async function updateNotificationPreferences(
  updates: Partial<PrefsUpdate>,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) throw new Error("Unauthorized");

  const admin = createAdminClient();
  await admin.from("support_notification_preferences").upsert(
    {
      user_email: user.email.toLowerCase(),
      ...updates,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" },
  );
}
