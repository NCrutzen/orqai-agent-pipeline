import { NextResponse } from "next/server";

// Directory search is disabled — requires Azure AD SSO (not yet configured).
// When M365 SSO is added, restore Microsoft Graph integration here.
export async function GET() {
  return NextResponse.json({
    users: [],
    note: "Directory search requires Microsoft SSO (coming soon).",
  });
}
