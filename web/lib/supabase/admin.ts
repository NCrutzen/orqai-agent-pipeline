import { createClient } from "@supabase/supabase-js";

/**
 * Admin client using service_role key -- bypasses RLS.
 * Only use in server-side API routes for admin operations (e.g., inviting users).
 * NEVER import this in client components.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
