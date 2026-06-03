// Phase 5 Plan 04 — support-tickets registries page (ADMIN-02 + ADMIN-03).
//
// RSC page. SSO gate is (dashboard)/layout.tsx — no local re-check.
// Fetches swarm_intents (ADMIN-02) + support_software_systems (ADMIN-03)
// via loadRegistries and passes both to RegistriesClientShell.

import { createAdminClient } from "@/lib/supabase/admin";
import { loadRegistries } from "../_lib/load-registries";
import { RegistriesClientShell } from "./client-shell";

export const dynamic = "force-dynamic";

export default async function SupportTicketsRegistriesPage() {
  const admin = createAdminClient();
  const { intents, systems } = await loadRegistries(admin);

  return <RegistriesClientShell intents={intents} systems={systems} />;
}
