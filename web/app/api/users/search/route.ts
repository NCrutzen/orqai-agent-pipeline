import { Client } from "@microsoft/microsoft-graph-client";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Only SSO users have a provider_token for Graph API access
  if (!session?.provider_token) {
    return NextResponse.json({
      users: [],
      note: "Directory search is only available for Microsoft SSO users.",
    });
  }

  try {
    const graphClient = Client.init({
      authProvider: (done) => done(null, session.provider_token ?? null),
    });

    const result = await graphClient
      .api("/users")
      .header("ConsistencyLevel", "eventual")
      .search(`"displayName:${query}" OR "mail:${query}"`)
      .select("id,displayName,mail,jobTitle")
      .top(10)
      .get();

    return NextResponse.json({ users: result.value ?? [] });
  } catch (err: unknown) {
    // Handle Graph API permission errors gracefully
    const status =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : 500;

    if (status === 403) {
      return NextResponse.json({
        users: [],
        note: "Directory search permissions not configured. Contact your admin.",
      });
    }

    console.error("Graph API search error:", err);
    return NextResponse.json(
      { error: "Failed to search directory" },
      { status: 500 }
    );
  }
}
