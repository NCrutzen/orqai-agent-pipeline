import { NextRequest, NextResponse } from "next/server";

// TODO (Task 3): implement review endpoint — accept/reject upserts into uren_controle_reviews.
// Leaving a 501 skeleton so Task 3 cannot forget to wire it AND so the route
// is reachable at the correct path (verifies the folder layout).
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: "Not implemented yet — see Task 3" },
    { status: 501 },
  );
}
