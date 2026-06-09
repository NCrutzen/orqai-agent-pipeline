// Phase 90 (P0 resolver substrate) — RESL-03 dispatch seam: loadStage2Resolver.
//
// The architecture doc (debtor-email-pipeline-architecture.md) describes this
// helper as a Phase 68 deliverable, but it was NEVER built — the Stage 2 worker
// statically imported resolveDebtor. This module BUILDS it from scratch,
// mirroring the loadSwarm cache discipline in registry.ts (60s TTL Map,
// last-known-good on error, __reset…ForTests).
//
// Dispatch is data-driven off swarms.stage2_entity_resolver:
//   - NULL          → return null ("Router shape: skip Stage 2"; info-routing
//                     precedent, 20260521 migration seeds NULL).
//   - module-path   → resolve to a { resolveEntity } module; a module missing
//                     resolveEntity throws a structured error (fails LOUD).
//
// swarms.stage2_entity_resolver is BOTH the dispatch pointer AND the D-07
// kill-switch: cut over = UPDATE the column to the engine path; revert = UPDATE
// it back to the adapter path. Data-only, no deploy.
//
// IMPORTANT — bundler constraint (classifier-screen-worker.ts:57-65 precedent):
// a fully-dynamic `await import(modulePath)` throws "Cannot find module as
// expression is too dynamic" on Vercel (Webpack/Turbopack). Only Vite resolves
// that pattern, and Vercel is not Vite. So the registry path is mapped through
// a STATIC dispatch table (the modules below are statically imported, so the
// bundler includes them in the build). Onboarding a new resolver = add an
// INSERT to swarms.stage2_entity_resolver AND a line to STAGE2_RESOLVER_MODULES.

import type {
  ResolveArgs,
  ResolveResult,
  EngineConfig,
} from "@/lib/agentic-pipeline/resolve/engine";

/** The contract every Stage 2 resolver module must expose (Phase 68 note). */
export interface Stage2ResolverModule {
  resolveEntity: (
    args: ResolveArgs,
    config: EngineConfig,
  ) => Promise<ResolveResult>;
}

// Static dispatch map: registry module-path string → a loader that returns the
// statically-imported module. Static `import()` here lets the bundler include
// the target in the build (unlike a fully-dynamic import of the DB string).
// Both P0 paths point at the same engine logic: the debtor adapter delegates to
// resolveEntity, so the equality dry-run (Plan 06) is byte-identical either way.
const STAGE2_RESOLVER_MODULES: Record<
  string,
  () => Promise<Stage2ResolverModule>
> = {
  "@/lib/automations/debtor-email/resolve-debtor": () =>
    import("@/lib/automations/debtor-email/resolve-debtor"),
  "@/lib/agentic-pipeline/resolve/engine": () =>
    import("@/lib/agentic-pipeline/resolve/engine"),
  // Phase 114-04: the SOLE bundler-mandated dispatch-map line for sales (STAGE2-01
  // Pitfall 2 — not a resolution-logic change; the engine is untouched).
  "@/lib/automations/sales-email/resolve-customer": () =>
    import("@/lib/automations/sales-email/resolve-customer"),
};

const TTL_MS = 60_000;
const RESOLVER_CACHE = new Map<
  string,
  { value: Stage2ResolverModule; expires: number }
>();

/** Structured throw so a wrong/absent export fails loud, not silently. */
export class Stage2ResolverLoadError extends Error {
  constructor(
    public modulePath: string,
    reason: string,
  ) {
    super(`loadStage2Resolver("${modulePath}"): ${reason}`);
    this.name = "Stage2ResolverLoadError";
  }
}

/**
 * Resolve the Stage 2 resolver module named by swarms.stage2_entity_resolver.
 *
 *   - `null`        → `null` (Router shape: caller skips Stage 2).
 *   - module-path   → a `{ resolveEntity }` module (cached 60s, last-known-good
 *                     on transient error).
 *
 * Throws Stage2ResolverLoadError when the path is unknown (not in the static
 * dispatch map) or the loaded module does not expose `resolveEntity`.
 */
export async function loadStage2Resolver(
  modulePath: string | null,
): Promise<Stage2ResolverModule | null> {
  // Router shape: no Stage 2 resolver configured for this swarm.
  if (modulePath === null) return null;

  const now = Date.now();
  const hit = RESOLVER_CACHE.get(modulePath);
  if (hit && hit.expires > now) return hit.value;

  const loader = STAGE2_RESOLVER_MODULES[modulePath];
  if (!loader) {
    throw new Stage2ResolverLoadError(
      modulePath,
      "no module registered for this path (add it to STAGE2_RESOLVER_MODULES)",
    );
  }

  let mod: Stage2ResolverModule;
  try {
    mod = await loader();
  } catch (err) {
    // Transient import failure → last-known-good if cached, else rethrow.
    if (hit) return hit.value;
    throw new Stage2ResolverLoadError(
      modulePath,
      `dynamic import failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof mod?.resolveEntity !== "function") {
    throw new Stage2ResolverLoadError(
      modulePath,
      "loaded module does not export a resolveEntity function",
    );
  }

  RESOLVER_CACHE.set(modulePath, { value: mod, expires: now + TTL_MS });
  return mod;
}

/** Test helper. Production callers MUST NOT use this. */
export function __resetResolverCacheForTests(): void {
  RESOLVER_CACHE.clear();
}
