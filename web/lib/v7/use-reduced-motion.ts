"use client";

/**
 * SSR-safe `prefers-reduced-motion` media query hook.
 *
 * Returns `false` on the first render (so SSR markup never assumes
 * reduced motion) and updates after `useEffect` based on the actual
 * matchMedia query result. Listens for changes so a user toggling their
 * OS preference mid-session updates the UI without a reload.
 */

import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReduced(query.matches);
    handler();
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  return reduced;
}
