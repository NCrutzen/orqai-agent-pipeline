import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { SubmitForm } from "./_components/submit-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Indienen — MR Support",
};

export default async function SubmitPage() {
  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("support_ticket_categories")
    .select("type_key, soort, label_nl")
    .eq("enabled", true)
    .order("label_nl");

  const softwareCategories = (categories ?? [])
    .filter((c) => c.soort === "software")
    .map((c) => ({ type_key: c.type_key, label_nl: c.label_nl }));
  const hardwareCategories = (categories ?? [])
    .filter((c) => c.soort === "hardware")
    .map((c) => ({ type_key: c.type_key, label_nl: c.label_nl }));

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-[var(--v7-text)] tracking-[-0.02em] mb-8">
        Ticket indienen
      </h1>
      <SubmitForm softwareCategories={softwareCategories} hardwareCategories={hardwareCategories} />
    </div>
  );
}
