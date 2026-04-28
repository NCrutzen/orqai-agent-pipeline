"use server";

// Phase 60-04 (D-20). Server actions for the classifier-rules dashboard.
// Block sets status -> manual_block; Unblock returns rule to candidate so the
// cron re-evaluates per Wilson CI gates. Both bump last_evaluated for the UI
// sort order. Auth is inherited from the (dashboard) route group.

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export async function blockRule(ruleId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("classifier_rules")
    .update({
      status: "manual_block",
      last_evaluated: new Date().toISOString(),
    })
    .eq("id", ruleId);
  if (error) throw new Error(error.message);
  revalidatePath("/automations/classifier-rules");
}

export async function unblockRule(ruleId: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("classifier_rules")
    .update({
      status: "candidate",
      last_evaluated: new Date().toISOString(),
    })
    .eq("id", ruleId);
  if (error) throw new Error(error.message);
  revalidatePath("/automations/classifier-rules");
}
