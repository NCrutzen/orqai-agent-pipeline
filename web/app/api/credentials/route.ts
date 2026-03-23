import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptCredential } from "@/lib/credentials/crypto";
import type { CredentialWithLinks } from "@/lib/credentials/types";

const createCredentialSchema = z.object({
  name: z.string().min(1).max(200),
  authType: z.string(),
  values: z.record(z.string(), z.string()),
  projectIds: z.array(z.string().uuid()).optional(),
});

/**
 * POST /api/credentials -- Create a new credential.
 * Encrypts values with AES-256-GCM before storage.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createCredentialSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { name, authType, values, projectIds } = parsed.data;
  const encryptedValues = encryptCredential(JSON.stringify(values));

  const admin = createAdminClient();

  // Insert credential via admin client (bypasses RLS for encrypted_values storage)
  const { data: credential, error: insertError } = await admin
    .from("credentials")
    .insert({
      name,
      auth_type: authType,
      encrypted_values: encryptedValues,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !credential) {
    return NextResponse.json(
      { error: insertError?.message || "Failed to create credential" },
      { status: 500 }
    );
  }

  // Link to projects if projectIds provided
  if (projectIds && projectIds.length > 0) {
    const links = projectIds.map((projectId) => ({
      credential_id: credential.id,
      project_id: projectId,
    }));
    await admin.from("credential_project_links").insert(links);
  }

  return NextResponse.json({ id: credential.id }, { status: 201 });
}

/**
 * GET /api/credentials -- List credentials for the authenticated user.
 * Never returns encrypted_values.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Query via authenticated client (RLS scoped to created_by)
  const { data: credentials, error } = await supabase
    .from("credentials")
    .select(
      "id, name, auth_type, status, failed_at, key_version, created_by, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // For each credential, count linked projects
  const admin = createAdminClient();
  const credentialsWithLinks: CredentialWithLinks[] = await Promise.all(
    (credentials || []).map(async (cred) => {
      const { count } = await admin
        .from("credential_project_links")
        .select("*", { count: "exact", head: true })
        .eq("credential_id", cred.id);

      return {
        ...cred,
        linked_project_count: count || 0,
      } as CredentialWithLinks;
    })
  );

  return NextResponse.json(credentialsWithLinks);
}
