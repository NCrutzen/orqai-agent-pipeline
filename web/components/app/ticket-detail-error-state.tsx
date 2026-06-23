import { AlertTriangle } from "lucide-react";

export function TicketDetailErrorState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <AlertTriangle
        className="size-12 text-[var(--v7-faint)] mb-6"
        aria-hidden="true"
      />
      <h2 className="font-display text-base font-semibold text-[var(--v7-text)] mb-2">
        {title}
      </h2>
      <p className="text-sm font-normal text-[var(--v7-muted)] max-w-xs leading-relaxed">
        {body}
      </p>
    </div>
  );
}
