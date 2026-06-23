import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";

export default async function TicketNotFound() {
  const { dict } = await getI18n();
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <FileQuestion
        className="size-12 text-[var(--v7-faint)] mb-6"
        aria-hidden="true"
      />
      <h2 className="font-display text-base font-semibold text-[var(--v7-text)] mb-2">
        {dict.detail.notFound.title}
      </h2>
      <p className="text-sm text-[var(--v7-muted)] max-w-xs leading-relaxed">
        {dict.detail.notFound.body}
      </p>
      <div className="mt-6">
        <Button asChild variant="ghost">
          <Link href="/app/tickets">{dict.detail.notFound.back}</Link>
        </Button>
      </div>
    </div>
  );
}
