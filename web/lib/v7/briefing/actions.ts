"use server";

/**
 * Server action wrapper around `generateBriefing`. Invoked from the
 * BriefingPanel's "Regenerate" button as a `<form action={...}>` submission.
 */

import { revalidatePath } from "next/cache";
import { generateBriefing } from "./generate";

export async function regenerateBriefingAction(
  swarmId: string
): Promise<void> {
  await generateBriefing(swarmId, { force: true });
  // Revalidate the swarm view so any SSR data re-reads. The Realtime
  // subscription will also pick up the INSERT, but this covers tabs that
  // rejoin mid-generation.
  revalidatePath(`/swarm/${swarmId}`);
}
