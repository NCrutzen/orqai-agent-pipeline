import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptCredential } from "@/lib/credentials/crypto";

const replaceCredentialSchema = z.object({
  values: z.record(z.string()),
});

/**
 * PATCH /api/credentials/[id] -- Replace credential values.
 * Re-encrypts values, resets status to "not_tested", clears failed_at.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user owns the credential (SELECT via authenticated client, RLS scoped)
  const { data: existing, error: fetchError } = await supabase
    .from("credentials")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json(
      { error: "Credential not found" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const parsed = replaceCredentialSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const encryptedValues = encryptCredential(JSON.stringify(parsed.data.values));

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("credentials")
    .update({
      encrypted_values: encryptedValues,
      status: "not_tested",
      failed_at: null,
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/credentials/[id] -- Delete a credential.
 * CASCADE handles credential_project_links cleanup.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user owns the credential
  const { data: existing, error: fetchError } = await supabase
    .from("credentials")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json(
      { error: "Credential not found" },
      { status: 404 }
    );
  }

  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("credentials")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
