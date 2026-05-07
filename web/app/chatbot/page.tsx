import { createClient } from "@/lib/supabase/server";
import { ChatUI } from "./chat-ui";

export const dynamic = "force-dynamic";

export default async function ChatbotPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "collega";

  return <ChatUI displayName={displayName} />;
}
