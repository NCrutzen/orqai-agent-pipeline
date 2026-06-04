// Phase 114-04 Task 1 — sales Stage 2 entity-resolution adapter (RESL-03 reuse).
//
// This is the cross-swarm generality proof in action (STAGE2-01): sales onboards
// its Stage 2 resolver via per-swarm config + a sales-specific lookup adapter,
// with ZERO changes to the resolution engine (engine.ts / config.ts / steps/*).
//
// Shape (PATTERNS Pattern 3 option (b)): the adapter wires the NEW sales lookups
// (offerte/order/Sites via nxtRequest, D-10) + reuses the debtor sender/factuur
// lookups (D-11), runs them in `config.precedence` order, short-circuits on the
// first customer_account_id, and falls through to the engine's canonical
// `unresolved` ResolveResult (STAGE2-02 fall-through). It satisfies
// Stage2ResolverModule (exports resolveEntity) so loadStage2Resolver can dispatch
// to this module path from the registry.
//
// Why the adapter sources its own candidates rather than reusing the engine's
// built-in steps: the engine's runSenderMatch/runIdentifierMatch are bound to the
// DEBTOR Zapier-SQL lookups + invoice regex. Sales has different identifier kinds
// (offerte/order/postcode-Site) that the engine intentionally does NOT know about
// (it silently skips unknown precedence names — forward-compat). So the sales glue
// lives HERE; the engine stays untouched. The `unresolved` fall-through is taken
// verbatim from the engine's ResolveResult contract (the LOCKED public surface).
//
// Iteration 1 = PRECEDENCE-ONLY (no corroboration). The engine is precedence +
// single-hit short-circuit; multi-match corroboration (D-06) is the fast-follow
// surfaced at the Plan 04 Task 3 checkpoint — NOT added here (Pitfall 3: a
// `corroborate` config field would be silently ignored by the engine).
//
// Replay-safety (CLAUDE.md): this adapter runs INSIDE the worker's
// step.run("resolve…"). It performs NO nested step.run and generates no
// non-deterministic DB keys.
//
// D-07 (internal forwards, 23%): when the sender is an own-tenant domain, the
// REAL customer sender is in the quoted body. We extract it and feed THAT to
// sender_match — never filter internal forwards (locked principle).

import {
  type ResolveArgs,
  type ResolveResult,
  type EngineConfig,
} from "@/lib/agentic-pipeline/resolve/engine";
import { lookupSenderToAccount } from "@/lib/automations/debtor-email/nxt-zap-client";
import { extractInvoiceCandidates } from "@/lib/automations/debtor-email/extract-invoices";
import { lookupIdentifierToAccount } from "@/lib/automations/debtor-email/nxt-zap-client";
import { lookupOfferteToAccount } from "./lookups/offerte";
import { lookupOrderToAccount } from "./lookups/order";
import { lookupPostcodeToAccount } from "./lookups/sites";

// Sales tenant domains (source of truth: public.swarms.tenant_domains for
// sales-email = ["smeba.nl"]). Sales-specific glue, NOT an engine concern. When
// the sender is one of these, D-07 quoted-sender extraction kicks in.
const SALES_TENANT_DOMAINS = ["smeba.nl"] as const;

// NXT env: prod by default (Stage 2 is a read; the proxy enforces read-only
// prod). Kept a constant here rather than threaded through ResolveArgs so the
// LOCKED ResolveArgs contract stays untouched.
const NXT_ENV = "production" as const;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** True when an address belongs to one of the sales tenant domains. */
function isOwnTenant(email: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return SALES_TENANT_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

/**
 * D-07 — pull the FIRST non-tenant email address out of the (quoted) body. On an
 * internal forward the originating customer address appears in the quoted header
 * ("Van: klant@bv.nl"). We pick the first address that is NOT an own-tenant
 * domain so a forwarded thread resolves to the real customer, not the forwarder.
 */
function extractQuotedSender(body: string): string | null {
  EMAIL_RE.lastIndex = 0;
  for (const m of body.matchAll(EMAIL_RE)) {
    if (!isOwnTenant(m[0])) return m[0].toLowerCase();
  }
  return null;
}

/** Build the canonical engine `unresolved` ResolveResult (STAGE2-02). */
function unresolved(
  senderEmail: string | null,
  matchedIdentifiers: string[],
): ResolveResult {
  return {
    method: "unresolved",
    customer_account_id: null,
    customer_name: null,
    confidence: "none",
    inputs: {
      kind: "unresolved",
      sender_email: senderEmail,
      matched_identifiers: matchedIdentifiers,
    },
  };
}

/**
 * Sales Stage 2 resolver. Satisfies Stage2ResolverModule.
 *
 * Runs the sales candidate sources in `config.precedence` order, short-circuits
 * on the first customer_account_id, else returns `unresolved` (prospect →
 * Stage 3, STAGE2-02). `auto_safe_kinds` is honored as a NO-OP for sales (it is
 * [] in the seed — no self-auth tier; STAGE2-02 part 1).
 */
export async function resolveEntity(
  args: ResolveArgs,
  config: EngineConfig,
): Promise<ResolveResult> {
  // STAGE2-02 self-auth no-op: an empty/absent auto_safe_kinds synthesizes no
  // self-auth candidate (mirrors the engine's `void` consume — never crash).
  void (config.auto_safe_kinds ?? []);

  const subject = args.subject ?? "";
  const body = args.body_text ?? "";

  // D-07 — resolve the effective sender. On an own-tenant forward, swap in the
  // quoted original sender; otherwise use the envelope sender as-is.
  const effectiveSender = isOwnTenant(args.from_email)
    ? extractQuotedSender(body)
    : (args.from_email ?? null);

  // Track identifiers seen across attempted steps so the unresolved fall-through
  // mirrors the engine contract (matched_identifiers populated).
  const seenIdentifiers: string[] = [];

  for (const step of config.precedence) {
    switch (step) {
      case "sender_match": {
        if (effectiveSender && args.brand_id) {
          const sender = await lookupSenderToAccount(
            {
              nxt_database: args.nxt_database,
              brand_id: args.brand_id,
              sender_email: effectiveSender,
            },
            "unknown",
          ).catch((err) => {
            console.warn(
              `[sales-resolve] sender_match failed, falling through: ${err instanceof Error ? err.message : err}`,
            );
            return { matches: [] as Array<{ top_level_customer_id: string; top_level_customer_name: string }> };
          });
          const uniqueIds = Array.from(
            new Set(sender.matches.map((m) => m.top_level_customer_id)),
          );
          // Iteration 1 precedence-only: accept a single-hit; ambiguous (≥2)
          // falls through (no LLM tiebreaker for sales in iteration 1 — the
          // config seeds llm_tiebreaker:false; corroboration is the D-06
          // fast-follow).
          if (uniqueIds.length === 1 && sender.matches.length >= 1) {
            const m = sender.matches[0];
            return {
              method: "sender_match",
              customer_account_id: m.top_level_customer_id,
              customer_name: m.top_level_customer_name,
              confidence: "high",
              candidates_considered: 1,
              inputs: {
                kind: "sender_match",
                sender_email: effectiveSender,
                candidates: [
                  {
                    id: m.top_level_customer_id,
                    name: m.top_level_customer_name,
                    contact_person: null,
                    recent_invoices: [],
                  },
                ],
              },
            };
          }
        }
        break;
      }

      case "offerte_match": {
        const hit = await lookupOfferteToAccount(NXT_ENV, subject, body);
        if (hit) {
          seenIdentifiers.push(hit.matched_identifier);
          return identifierResult(hit, seenIdentifiers);
        }
        break;
      }

      case "postcode_site_match": {
        const hit = await lookupPostcodeToAccount(NXT_ENV, subject, body);
        if (hit) {
          seenIdentifiers.push(hit.matched_identifier);
          return identifierResult(hit, seenIdentifiers);
        }
        break;
      }

      case "order_match": {
        const hit = await lookupOrderToAccount(NXT_ENV, subject, body);
        if (hit) {
          seenIdentifiers.push(hit.matched_identifier);
          return identifierResult(hit, seenIdentifiers);
        }
        break;
      }

      case "factuur_match": {
        // D-11 — reuse the debtor invoice lookup (Zapier-SQL) as-is.
        const extract = extractInvoiceCandidates(subject, body);
        if (extract.candidates.length > 0 && args.brand_id) {
          seenIdentifiers.push(...extract.candidates);
          const inv = await lookupIdentifierToAccount(
            {
              nxt_database: args.nxt_database,
              brand_id: args.brand_id,
              invoice_numbers: extract.candidates,
            },
            "unknown",
          ).catch((err) => {
            console.warn(
              `[sales-resolve] factuur_match failed, falling through: ${err instanceof Error ? err.message : err}`,
            );
            return { matches: [] as Array<{ top_level_customer_id: string }> };
          });
          const ids = Array.from(
            new Set(inv.matches.map((m) => m.top_level_customer_id)),
          );
          if (ids.length === 1) {
            return {
              method: "identifier_match",
              customer_account_id: ids[0],
              customer_name: null,
              confidence: "high",
              candidates_considered: 1,
              inputs: {
                kind: "identifier_match",
                matched_identifiers: extract.candidates,
                candidates: [
                  {
                    id: ids[0],
                    name: "",
                    contact_person: null,
                    recent_invoices: extract.candidates,
                  },
                ],
              },
            };
          }
        }
        break;
      }

      // Unknown precedence names are silently skipped (forward-compat, mirrors
      // the engine). The engine's debtor-only step kinds (thread_inheritance)
      // are not wired for sales in iteration 1.
      default:
        break;
    }
  }

  // STAGE2-02 fall-through: prospect / no resolvable signal → unresolved.
  return unresolved(effectiveSender, seenIdentifiers);
}

/** Map a SalesCustomerMatch-style hit to the LOCKED identifier_match result. */
function identifierResult(
  hit: {
    customer_account_id: string;
    customer_name: string | null;
    matched_identifier: string;
    // WR-02 (Phase 114-07): per-lookup confidence. Absent ⇒ "high"
    // (offerte/order are strong identifiers). postcode→Site self-downgrades to
    // "medium" (corroborating-strength; D-06 fast-follow raises it later).
    confidence?: "high" | "medium" | "low";
  },
  matchedIdentifiers: string[],
): ResolveResult {
  return {
    method: "identifier_match",
    customer_account_id: hit.customer_account_id,
    customer_name: hit.customer_name,
    confidence: hit.confidence ?? "high",
    candidates_considered: 1,
    inputs: {
      kind: "identifier_match",
      matched_identifiers: matchedIdentifiers,
      candidates: [
        {
          id: hit.customer_account_id,
          name: hit.customer_name ?? "",
          contact_person: null,
          recent_invoices: [],
        },
      ],
    },
  };
}
