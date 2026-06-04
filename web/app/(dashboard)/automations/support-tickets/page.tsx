// Phase 5 Plan 04 — support-tickets admin submissions page (ADMIN-01).
//
// RSC page. SSO gate is the parent (dashboard)/layout.tsx — this page does
// NOT re-check auth (T-05-04-01 mitigated by the layout redirect).
//
// Pattern: mirrors [swarm]/intent-proposals/page.tsx (force-dynamic, admin
// client, awaited searchParams, throw on query error).

import { createAdminClient } from "@/lib/supabase/admin";
import { loadSubmissions } from "./_lib/load-submissions";
import { SupportTicketsClientShell } from "./client-shell";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    system?: string;
    intent?: string;
    status?: string;
  }>;
}

export default async function SupportTicketsAdminPage({
  searchParams,
}: PageProps) {
  const sp = await searchParams;

  const admin = createAdminClient();
  const rows = await loadSubmissions(admin, {
    system: sp.system,
    intent: sp.intent,
    status: sp.status,
  });

  return (
    <SupportTicketsClientShell
      rows={rows}
      activeSystem={sp.system ?? ""}
      activeIntent={sp.intent ?? ""}
      activeStatus={sp.status ?? ""}
    />
  );
}
