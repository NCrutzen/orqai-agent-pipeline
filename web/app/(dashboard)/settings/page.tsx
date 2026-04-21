import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlassCard } from "@/components/ui/glass-card";
import { KeyRound, Shield, Activity, Globe } from "lucide-react";
import { CredentialList } from "@/components/credentials/credential-list";
import { CreateCredentialModal } from "@/components/credentials/create-credential-modal";
import { HealthDashboard } from "@/components/health/health-dashboard";
import { SystemList } from "@/components/systems/system-list";
import { CreateSystemModal } from "@/components/systems/create-system-modal";
import type { CredentialWithLinks, HealthCheckResult } from "@/lib/credentials/types";
import type { SystemWithLinks } from "@/lib/systems/types";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;

  // Authenticate
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch credentials (RLS-scoped to created_by)
  const { data: credentials } = await supabase
    .from("credentials")
    .select(
      "id, name, auth_type, status, failed_at, key_version, created_by, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  // Fetch all credential_project_links for link counts
  const { data: links } = await supabase
    .from("credential_project_links")
    .select("credential_id, project_id");

  // Count links per credential
  const linkCounts = new Map<string, number>();
  (links ?? []).forEach((l: { credential_id: string }) =>
    linkCounts.set(l.credential_id, (linkCounts.get(l.credential_id) || 0) + 1)
  );

  // Build CredentialWithLinks[]
  const credentialsWithLinks: CredentialWithLinks[] = (credentials ?? []).map(
    (c) =>
      ({
        ...c,
        linked_project_count: linkCounts.get(c.id) || 0,
      }) as CredentialWithLinks
  );

  // Fetch auth profile types
  const admin = createAdminClient();
  const { data: authProfileTypes } = await admin
    .from("auth_profile_types")
    .select("*")
    .order("id");

  // Fetch projects
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name");

  // Fetch latest health check
  const { data: healthResult } = await admin
    .from("health_checks")
    .select("*")
    .eq("id", "latest")
    .maybeSingle();

  // Fetch systems (RLS-scoped to created_by)
  const { data: systemsData } = await supabase
    .from("systems")
    .select(
      "id, name, integration_method, url, auth_notes, notes, created_by, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  // Fetch system_project_links for link counts
  const { data: systemLinks } = await supabase
    .from("system_project_links")
    .select("system_id, project_id");

  // Build SystemWithLinks[]
  const systemLinkCounts = new Map<string, number>();
  (systemLinks ?? []).forEach((l: { system_id: string }) =>
    systemLinkCounts.set(
      l.system_id,
      (systemLinkCounts.get(l.system_id) || 0) + 1
    )
  );
  const systemsWithLinks: SystemWithLinks[] = (systemsData ?? []).map(
    (s) =>
      ({
        ...s,
        linked_project_count: systemLinkCounts.get(s.id) || 0,
      }) as SystemWithLinks
  );

  return (
    <div className="p-5">
      <h1 className="text-[32px] leading-[1.1] tracking-[-0.03em] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
        Settings
      </h1>
      <p className="mt-2 text-[14px] text-[var(--v7-muted)]">
        Manage credentials, authentication profiles, system health, and target systems
      </p>

      <Tabs defaultValue={tab || "credentials"} className="mt-6">
        <TabsList>
          <TabsTrigger value="credentials">
            <KeyRound className="mr-1.5 size-3.5" />
            Credentials
          </TabsTrigger>
          <TabsTrigger value="auth-profiles">
            <Shield className="mr-1.5 size-3.5" />
            Auth Profiles
          </TabsTrigger>
          <TabsTrigger value="health">
            <Activity className="mr-1.5 size-3.5" />
            Health
          </TabsTrigger>
          <TabsTrigger value="systems">
            <Globe className="mr-1.5 size-3.5" />
            Systems
          </TabsTrigger>
        </TabsList>

        <TabsContent value="credentials">
          <div className="flex items-center justify-between mt-4">
            <div>
              <h2 className="text-[20px] leading-[1.2] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
                Credentials
              </h2>
              <p className="text-[14px] text-[var(--v7-muted)]">
                Manage encrypted credentials for target system automations
              </p>
            </div>
            <CreateCredentialModal
              authProfileTypes={authProfileTypes ?? []}
              projects={projects ?? []}
            />
          </div>
          <div className="mt-4">
            <CredentialList
              credentials={credentialsWithLinks}
              authProfileTypes={authProfileTypes ?? []}
              projects={projects ?? []}
            />
          </div>
        </TabsContent>

        <TabsContent value="auth-profiles">
          <div className="mt-4">
            <h2 className="text-[20px] leading-[1.2] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
              Authentication Profiles
            </h2>
            <p className="text-[14px] text-[var(--v7-muted)]">
              Templates defining how automations log into different systems
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {(authProfileTypes ?? []).map(
                (profile: {
                  id: string;
                  name: string;
                  description: string;
                  field_schema: { fields: unknown[] };
                }) => (
                  <GlassCard key={profile.id} className="p-5">
                    <div className="pb-2">
                      <h3 className="text-[14px] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
                        {profile.name}
                      </h3>
                    </div>
                    <div>
                      <p className="text-[12px] text-[var(--v7-muted)]">
                        {profile.description}
                      </p>
                      <p className="text-[12px] text-[var(--v7-faint)] mt-2">
                        {profile.field_schema.fields.length} field(s)
                      </p>
                    </div>
                  </GlassCard>
                )
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="health">
          <HealthDashboard
            initialResult={healthResult as HealthCheckResult | null}
          />
        </TabsContent>

        <TabsContent value="systems">
          <div className="flex items-center justify-between mt-4">
            <div>
              <h2 className="text-[20px] leading-[1.2] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
                Systems
              </h2>
              <p className="text-[14px] text-[var(--v7-muted)]">
                Manage target systems and their integration methods
              </p>
            </div>
            <CreateSystemModal projects={projects ?? []} />
          </div>
          <div className="mt-4">
            <SystemList
              systems={systemsWithLinks}
              projects={projects ?? []}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
