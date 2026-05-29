"use client";

// Phase 3 Plan 02 Task 1 — Re-run subscription hook + RerunContext.
//
// One per-view Supabase real-time subscription on `public.agent_runs` INSERT
// events, filtered by the visible Bulk Review email_id set (P3-D-08 +
// Phase 71/82 precedent). When a new agent_runs row lands for an email_id
// that's currently in the "in-flight" set (added by markInFlight() at submit
// time), the row is dropped from the set → the pulse badge disappears and
// the Stage 3/4 tabs become interactive again.
//
// Hard-separation lock: this hook only reads agent_runs.email_id from the
// real-time event payload. It does NOT inspect Stage 1 (swarm_noise_categories)
// or Stage 3 (swarm_intents) data — the subscription is vocabulary-agnostic.
//
// Replay/dedupe: markInFlight is idempotent; subscription handler short-
// circuits if the email_id is not in the in-flight set.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";

export interface UseRerunSubscriptionReturn {
  inFlightIds: ReadonlySet<string>;
  markInFlight: (email_id: string) => void;
}

const EMPTY_SET: ReadonlySet<string> = new Set<string>();

export function useRerunSubscription(
  emailIds: readonly string[],
): UseRerunSubscriptionReturn {
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  // Hold the current set in a ref so the subscription handler reads fresh
  // values without re-subscribing on every state change. Updated via effect
  // to avoid the react-hooks/refs "Cannot update ref during render" rule.
  const inFlightRef = useRef<Set<string>>(inFlightIds);
  useEffect(() => {
    inFlightRef.current = inFlightIds;
  }, [inFlightIds]);

  const markInFlight = useCallback((email_id: string) => {
    setInFlightIds((prev) => {
      if (prev.has(email_id)) return prev;
      const next = new Set(prev);
      next.add(email_id);
      return next;
    });
  }, []);

  // Stable dep key — re-subscribe only when the visible email_id set changes.
  const idsKey = emailIds.join(",");

  useEffect(() => {
    if (idsKey.length === 0) return;
    const supa = createBrowserSupabaseClient();
    const channelName = `rerun-watch:${idsKey.slice(0, 64)}`;
    // supabase-js postgres_changes typing is narrow; cast through unknown so
    // the dynamic-filter overload typechecks across versions.
    const channel = (supa.channel(channelName) as unknown as {
      on: (
        event: string,
        opts: Record<string, unknown>,
        handler: (p: { new: { email_id?: string } }) => void,
      ) => { subscribe: () => unknown };
    })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_runs",
          filter: `email_id=in.(${idsKey})`,
        },
        (payload: { new: { email_id?: string } }) => {
          const incoming = payload?.new?.email_id;
          if (!incoming) return;
          // Only update if we were tracking this email_id.
          if (!inFlightRef.current.has(incoming)) return;
          setInFlightIds((prev) => {
            if (!prev.has(incoming)) return prev;
            const next = new Set(prev);
            next.delete(incoming);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      // removeChannel accepts the channel handle opaquely.
      (supa as unknown as { removeChannel: (c: unknown) => void }).removeChannel(
        channel,
      );
    };
  }, [idsKey]);

  return { inFlightIds, markInFlight };
}

// ---- RerunContext ---------------------------------------------------------

export const RerunContext = createContext<UseRerunSubscriptionReturn | null>(
  null,
);

export function useRerunContext(): UseRerunSubscriptionReturn {
  const ctx = useContext(RerunContext);
  if (!ctx) {
    throw new Error(
      "useRerunContext must be used inside a <RerunContext.Provider>",
    );
  }
  return ctx;
}

/** Safe variant — returns an empty/no-op shape when no provider is mounted.
 *  Useful for components rendered outside the Bulk Review shell (legacy
 *  per-stage routes) so they don't blow up. */
export function useRerunContextOptional(): UseRerunSubscriptionReturn {
  const ctx = useContext(RerunContext);
  if (ctx) return ctx;
  return {
    inFlightIds: EMPTY_SET,
    markInFlight: () => {
      /* no-op */
    },
  };
}
