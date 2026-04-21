import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--v7-bg)] text-[var(--v7-text)]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[var(--v7-teal)] opacity-20 blur-[120px]" />
        <div className="absolute top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-[var(--v7-blue)] opacity-20 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/4 h-[460px] w-[460px] rounded-full bg-[var(--v7-pink)] opacity-15 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(var(--v7-line) 1px, transparent 1px), linear-gradient(90deg, var(--v7-line) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
        {children}
      </div>
    </div>
  );
}
