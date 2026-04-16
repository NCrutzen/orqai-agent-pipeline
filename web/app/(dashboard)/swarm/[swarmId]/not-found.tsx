import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";

/**
 * V7-styled 404 that replaces the default Next.js page when a swarm is
 * inaccessible or nonexistent. Uses Phase 48 GlassCard for the panel.
 */
export default function SwarmNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <GlassCard className="p-8 max-w-md w-full flex flex-col gap-4 text-center">
        <h1 className="font-[var(--font-cabinet)] text-[24px] leading-[1.2] font-bold text-[var(--v7-text)]">
          Swarm not found
        </h1>
        <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)]">
          You may not have access to this swarm, or it no longer exists.
        </p>
        <div className="flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center px-4 py-2 rounded-[var(--v7-radius-pill)] bg-[var(--v7-teal-soft)] text-[var(--v7-teal)] text-[14px] font-medium transition-colors hover:bg-[var(--v7-teal)] hover:text-[var(--v7-inverse)]"
          >
            Return to dashboard
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
