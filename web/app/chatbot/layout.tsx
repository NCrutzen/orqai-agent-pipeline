import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ChatbotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/chatbot");
  }

  return (
    <div className="min-h-screen bg-[var(--v7-bg)] text-[var(--v7-text)]">
      {children}
    </div>
  );
}
