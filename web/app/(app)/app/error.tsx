"use client";

export default function AppError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <p className="text-sm text-[var(--v7-muted)] mb-4">
        Tickets konden niet worden geladen. Probeer de pagina te vernieuwen.
      </p>
      <button
        onClick={reset}
        className="text-sm font-semibold text-[var(--v7-brand-primary)] underline underline-offset-2 hover:opacity-80 transition-opacity"
      >
        Vernieuwen
      </button>
    </div>
  );
}
