import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function TicketDetailLoading() {
  return (
    <div>
      <Link
        href="/app/tickets"
        className="inline-flex items-center gap-1 text-sm text-[var(--v7-muted)] hover:text-[var(--v7-brand-primary)] mb-6 transition-colors"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Terug naar tickets
      </Link>

      <div className="rounded-lg border border-[var(--v7-line)] bg-[var(--v7-panel)] px-4 py-4">
        {/* Title */}
        <Skeleton className="h-5 w-3/4 mb-4" />

        {/* Status + date row */}
        <div className="flex items-center gap-2 mb-4">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>

        {/* Description lines */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      </div>
    </div>
  );
}
