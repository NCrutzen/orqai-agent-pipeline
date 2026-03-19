import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod/v4";

const inviteSchema = z.object({
  email: z.email("Invalid email address"),
  projectId: z.uuid("Invalid project ID"),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { email, projectId } = parsed.data;

    // Authenticate the calling user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the calling user is a member of the project (PROJ-04: any member can invite)
    const { data: membership } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "You must be a member of this project to invite others." },
        { status: 403 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // Invite user via email
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ""}/auth/confirm`,
      });

    if (inviteError) {
      // If user already exists, that's OK -- just add to project
      if (
        inviteError.message?.includes("already been registered") ||
        inviteError.message?.includes("already exists")
      ) {
        // Look up the existing user by email
        const { data: existingUsers } =
          await supabaseAdmin.auth.admin.listUsers();

        const existingUser = existingUsers?.users?.find(
          (u) => u.email === email
        );

        if (existingUser) {
          const { error: memberError } = await supabaseAdmin
            .from("project_members")
            .upsert(
              { project_id: projectId, user_id: existingUser.id },
              { onConflict: "project_id,user_id" }
            );

          if (memberError) {
            console.error("Failed to add existing member:", memberError);
            return NextResponse.json(
              { error: "Failed to add member to project." },
              { status: 500 }
            );
          }

          return NextResponse.json({ success: true });
        }
      }

      console.error("Invite error:", inviteError);
      return NextResponse.json(
        { error: inviteError.message },
        { status: 400 }
      );
    }

    // Add invited user to project_members immediately (user ID exists pre-confirmation)
    if (inviteData?.user) {
      const { error: memberError } = await supabaseAdmin
        .from("project_members")
        .upsert(
          { project_id: projectId, user_id: inviteData.user.id },
          { onConflict: "project_id,user_id" }
        );

      if (memberError) {
        console.error("Failed to add invited member:", memberError);
        // Non-fatal: user will still get the invite email
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Invite route error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
