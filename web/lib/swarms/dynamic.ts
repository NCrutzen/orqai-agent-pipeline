// Phase 68 (D-15). Dynamic stage-1/stage-2 module loading from the registry.
//
// The swarms.stage1_regex_module and swarms.stage2_entity_resolver columns
// hold module-path strings (`@/...` aliases resolved by tsconfig paths). At
// runtime we `import()` those paths and validate the module exports the
// expected symbol. Module instances are cached by path string so repeated
// loads are cheap (process-lifetime cache; rotating module paths is a
// deploy-time op, not a hot-path op).
//
// Threat model (T-68-02): module-path strings come from a service-role-only
// DB column. No user input flows into `import()`. The contract validation
// (`typeof mod.<symbol> !== "function"`) is a defense-in-depth check, not
// the primary security boundary.

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSwarm } from "./registry";

const MODULE_CACHE = new Map<string, unknown>();

async function importByPath<T>(path: string): Promise<T> {
  const hit = MODULE_CACHE.get(path);
  if (hit) return hit as T;
  const mod = (await import(/* @vite-ignore */ path)) as T;
  MODULE_CACHE.set(path, mod);
  return mod;
}

// Stage 1 contract: module exports `classify(email): RegexClassifyResult`.
export type ClassifyFn = (email: {
  subject: string;
  body_text: string;
  sender_email: string;
}) => unknown;

export async function loadStage1Classifier(
  admin: SupabaseClient,
  swarmType: string,
): Promise<ClassifyFn> {
  const swarm = await loadSwarm(admin, swarmType);
  const path = swarm?.stage1_regex_module;
  if (!path) {
    throw new Error(`swarm "${swarmType}" missing stage1_regex_module`);
  }
  const mod = await importByPath<{ classify?: ClassifyFn }>(path);
  if (typeof mod.classify !== "function") {
    throw new Error(`module "${path}" does not export classify()`);
  }
  return mod.classify;
}

// Stage 2 contract: module exports `resolveEntity(args): EntityResolveResult`.
export type ResolveEntityFn = (...args: unknown[]) => Promise<unknown>;

export async function loadStage2Resolver(
  admin: SupabaseClient,
  swarmType: string,
): Promise<ResolveEntityFn> {
  const swarm = await loadSwarm(admin, swarmType);
  const path = swarm?.stage2_entity_resolver;
  if (!path) {
    throw new Error(`swarm "${swarmType}" missing stage2_entity_resolver`);
  }
  const mod = await importByPath<{ resolveEntity?: ResolveEntityFn }>(path);
  if (typeof mod.resolveEntity !== "function") {
    throw new Error(`module "${path}" does not export resolveEntity()`);
  }
  return mod.resolveEntity;
}

// Test helper. Production callers MUST NOT use this.
export function __resetModuleCacheForTests(): void {
  MODULE_CACHE.clear();
}
