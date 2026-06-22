"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function LogoutButton({
  label,
  failedMessage,
}: {
  label: string;
  failedMessage: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(failedMessage, { duration: 4000 });
      setLoading(false);
      return;
    }
    // Return to /login with next=/app/tickets so re-login lands back in the
    // end-user PWA (the app's start_url), not the admin homepage. Without next,
    // /auth/callback defaults to "/" (#re-login-destination).
    router.push("/login?next=/app/tickets");
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={loading}
      aria-label={label}
    >
      {loading ? (
        <Loader2
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <LogOut className="size-4" aria-hidden="true" />
      )}
      <span className="hidden md:inline">{label}</span>
    </Button>
  );
}
