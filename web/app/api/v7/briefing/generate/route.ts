import { NextRequest, NextResponse } from "next/server";
import { generateBriefing } from "@/lib/v7/briefing/generate";

/**
 * On-demand trigger for swarm briefing generation. Mirrors the
 * regenerateBriefingAction server action; exposed as an HTTP endpoint so
 * briefings can be kicked off externally (backfill, cron, Zapier etc.).
 *
 * POST /api/v7/briefing/generate { swarm_id: "..." }
 */
export async function POST(request: NextRequest) {
  let body: { swarm_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body allowed for GET-style trigger; reject below if no swarm_id
  }

  const swarmId = body.swarm_id ?? request.nextUrl.searchParams.get("swarm_id");
  if (!swarmId) {
    return NextResponse.json(
      { ok: false, error: "swarm_id required" },
      { status: 400 },
    );
  }

  try {
    const result = await generateBriefing(swarmId, { force: true });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
