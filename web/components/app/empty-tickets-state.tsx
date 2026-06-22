import { Inbox, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function EmptyTicketsState({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <Inbox
        className="size-12 text-[var(--v7-faint)] mb-6"
        aria-hidden="true"
      />
      <h2 className="font-display text-base font-semibold text-[var(--v7-text)] mb-2">
        {title}
      </h2>
      <p className="text-sm font-normal text-[var(--v7-muted)] max-w-xs leading-relaxed mb-6">
        {body}
      </p>
      <Button
        asChild
        size="default"
        className="bg-[var(--v7-brand-primary)] text-[var(--v7-inverse)] hover:bg-[var(--v7-brand-primary)]/90"
      >
        <Link href="/app/submit">
          {cta}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
