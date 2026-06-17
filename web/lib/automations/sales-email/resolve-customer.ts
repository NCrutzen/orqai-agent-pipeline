// Phase 114-04 / 120-02 — sales Stage 2 entity-resolution adapter (RESL-03 reuse).
//
// This is the cross-swarm generality proof in action (STAGE2-01 / SWARM-02): sales
// onboards its Stage 2 resolver via per-swarm config + a sales-specific lookup
// adapter, with ZERO changes to the resolution engine (engine.ts / config.ts /
// steps/*) AND — Phase 120 — reuses the SAME pure scoreCorroboration helper as the
// debtor engine, gated on config DATA (config.corroboration), never on swarm name.
//
// Shape (PATTERNS Pattern 3 option (b)): the adapter wires the sales lookups
// (offerte/order via the resolver_index SQL back-search — D-09; postcode→Site
// paused until resolver_index indexes postcodes) + reuses the debtor sender/factuur
// lookups (D-11), runs them in `config.precedence` order, and EITHER short-circuits
// on the first hit (no corroboration) OR collects every step's signal and scores
// them through scoreCorroboration (config.corroboration present). It satisfies
// Stage2ResolverModule (exports resolveEntity).
//
// SWARM-AGNOSTIC (CORR-04 / SWARM-02): there is NO per-swarm-name branch anywhere
// (no swarm_type check, no hardcoded brand gate). The corroboration path is
// selected by the presence of the `config.corroboration` field — exactly the same
// gate the generic engine uses. The per-swarm parts are the LOOKUP files
// (offerte/order/sites) and this adapter's candidate sourcing; the scoring logic
// is the shared pure helper.
//
// Replay-safety (CLAUDE.md): this adapter runs INSIDE the worker's
// step.run("resolve…"). It performs NO nested step.run and generates no
// non-deterministic DB keys.
//
// D-07 (internal forwards, 23%): when the sender is an own-tenant domain, the REAL
// customer sender is in the quoted body. We extract it and feed THAT to
// sender_match — never filter internal forwards (locked principle).

import {
  type ResolveArgs,
  type ResolveResult,
  type EngineConfig,
} from "@/lib/agentic-pipeline/resolve/engine";
import {
  scoreCorroboration,
  type CorroborationSignal,
} from "@/lib/agentic-pipeline/resolve/corroborate";
// IN-01 (Phase 114-07): the two nxt-zap-client imports merged into one statement.
import {
  lookupSenderToAccount,
  lookupIdentifierToAccount,
} from "@/lib/automations/debtor-email/nxt-zap-client";
import { extractInvoiceCandidates } from "@/lib/automations/debtor-email/extract-invoices";
import {
  lookupOfferteToAccount,
  extractOfferteCandidates,
  type SalesResolveCtx,
} from "./lookups/offerte";
import {
  lookupOrderToAccount,
  extractOrderCandidates,
} from "./lookups/order";
import {
  lookupPostcodeToAccount,
  extractPostcodeCandidates,
} from "./lookups/sites";

// Sales tenant domains (source of truth: public.swarms.tenant_domains for
// sales-email = ["smeba.nl"]). Sales-specific glue, NOT an engine concern. When
// the sender is one of these, D-07 quoted-sender extraction kicks in.
const SALES_TENANT_DOMAINS = ["smeba.nl"] as const;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** True when an address belongs to one of the sales tenant domains. */
function isOwnTenant(email: string | null): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return SALES_TENANT_DOMAINS.some((d) => lower.endsWith(`@${d}`));
}

// WR-05 (Phase 114-07): a quoted-header line that introduces the original sender
// on an internal forward. We ONLY trust an address that appears in (or just after)
// such a header — a bare address in a signature, cc list, or disclaimer must NOT be
// treated as the sender (it would resolve a wrong external party at "high").
const QUOTED_HEADER_RE = /^\s*(van:|from:|verzonden namens\b|on\b.*\bwrote:)/i;

/**
 * D-07 + WR-05 — pull the originating customer address out of the quoted-header
 * CONTEXT, not from anywhere in the body. If NO quoted-header block is present we
 * return null — we do NOT fall back to a positional first-match guess (WR-05).
 */
function extractQuotedSender(body: string): string | null {
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!QUOTED_HEADER_RE.test(lines[i])) continue;
    const window = lines.slice(i, i + 5).join("\n");
    EMAIL_RE.lastIndex = 0;
    for (const m of window.matchAll(EMAIL_RE)) {
      if (!isOwnTenant(m[0])) return m[0].toLowerCase();
    }
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
 * One precedence step's outcome: the short-circuit ResolveResult AND the
 * CorroborationSignal mapped from the same hit. Both paths (no-corr short-circuit /
 * corroboration collect) consume this single source so they cannot diverge.
 */
interface StepHit {
  result: ResolveResult;
  signal: CorroborationSignal;
}

/**
 * Sales Stage 2 resolver. Satisfies Stage2ResolverModule.
 *
 * No-corroboration config: runs the sales candidate sources in `config.precedence`
 * order, short-circuits on the first customer_account_id, else `unresolved`
 * (prospect → Stage 3, STAGE2-02). With `config.corroboration` present: collects a
 * signal from EVERY step (no short-circuit) and returns scoreCorroboration's
 * verdict. The branch is on config DATA — SWARM-02: no swarm-name check.
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

  // Resolution context for the resolver_index back-search lookups (offerte/order/
  // sites). brand_id is required by the substrate; when absent those steps no-op.
  const salesCtx: SalesResolveCtx | null = args.brand_id
    ? { nxt_database: args.nxt_database, brand_id: args.brand_id }
    : null;

  // Track identifiers seen across attempted steps so the unresolved fall-through
  // (and the corroboration matchedIdentifiers) mirror the engine contract.
  const seenIdentifiers: string[] = [];

  /** Run a single precedence step, returning its hit (result + signal) or null. */
  const runStep = async (
    step: string,
    precedenceIndex: number,
  ): Promise<StepHit | null> => {
    switch (step) {
      case "sender_match": {
        if (!effectiveSender || !args.brand_id) return null;
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
          return {
            matches: [] as Array<{
              top_level_customer_id: string;
              top_level_customer_name: string;
              status?: string | null;
            }>,
          };
        });
        const uniqueIds = Array.from(
          new Set(sender.matches.map((m) => m.top_level_customer_id)),
        );
        // Precedence-only single-hit accept; ambiguous (≥2) → no signal (no LLM
        // tiebreaker for sales — corroboration is the multi-signal path).
        if (uniqueIds.length !== 1 || sender.matches.length < 1) return null;
        const m = sender.matches[0];
        return {
          result: {
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
          },
          signal: {
            customer_account_id: m.top_level_customer_id,
            identifier_kind: "sender_domain",
            confidence: "high",
            method: "sender_match",
            precedence_index: precedenceIndex,
            status: m.status ?? null,
            customer_name: m.top_level_customer_name,
          },
        };
      }

      case "offerte_match": {
        // WR-04: record attempted identifiers at EXTRACTION time so the unresolved
        // trail carries what was tried, not only what matched.
        seenIdentifiers.push(...extractOfferteCandidates(subject, body));
        if (!salesCtx) return null;
        const hit = await lookupOfferteToAccount(salesCtx, subject, body);
        return hit ? identifierHit(hit, dedupe(seenIdentifiers), precedenceIndex) : null;
      }

      case "postcode_site_match": {
        seenIdentifiers.push(...extractPostcodeCandidates(subject, body));
        if (!salesCtx) return null;
        const hit = await lookupPostcodeToAccount(salesCtx, subject, body);
        return hit ? identifierHit(hit, dedupe(seenIdentifiers), precedenceIndex) : null;
      }

      case "order_match": {
        seenIdentifiers.push(...extractOrderCandidates(subject, body));
        if (!salesCtx) return null;
        const hit = await lookupOrderToAccount(salesCtx, subject, body);
        return hit ? identifierHit(hit, dedupe(seenIdentifiers), precedenceIndex) : null;
      }

      case "factuur_match": {
        // D-11 — reuse the debtor invoice lookup (Zapier-SQL) as-is.
        const extract = extractInvoiceCandidates(subject, body);
        if (extract.candidates.length === 0 || !args.brand_id) return null;
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
          return {
            matches: [] as Array<{
              top_level_customer_id: string;
              status?: string | null;
            }>,
          };
        });
        const ids = Array.from(
          new Set(inv.matches.map((m) => m.top_level_customer_id)),
        );
        if (ids.length !== 1) return null;
        return {
          result: {
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
          },
          signal: {
            customer_account_id: ids[0],
            identifier_kind: "invoice_no",
            confidence: "high",
            method: "identifier_match",
            precedence_index: precedenceIndex,
            status: inv.matches[0]?.status ?? null,
            customer_name: null,
          },
        };
      }

      // Unknown precedence names are silently skipped (forward-compat, mirrors the
      // engine). The engine's debtor-only step kinds (thread_inheritance) are not
      // wired for sales.
      default:
        return null;
    }
  };

  // No-corroboration path (config.corroboration ABSENT): behaviorally unchanged —
  // first-hit short-circuit, else unresolved fall-through.
  if (!config.corroboration) {
    for (let i = 0; i < config.precedence.length; i++) {
      const hit = await runStep(config.precedence[i], i);
      if (hit) return hit.result;
    }
    return unresolved(effectiveSender, dedupe(seenIdentifiers));
  }

  // Corroboration path (config.corroboration PRESENT): collect a signal from EVERY
  // step (no short-circuit), then score via the SHARED pure helper (SWARM-02).
  const collected: CorroborationSignal[] = [];
  for (let i = 0; i < config.precedence.length; i++) {
    const hit = await runStep(config.precedence[i], i);
    if (hit) collected.push(hit.signal);
  }
  return scoreCorroboration(
    collected,
    args,
    config.corroboration,
    dedupe(seenIdentifiers),
  );
}

/** Order-preserving de-duplication for the attempted-identifier trail. */
function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

/** Map a SalesCustomerMatch-style hit to a StepHit (result + corroboration signal). */
function identifierHit(
  hit: {
    customer_account_id: string;
    customer_name: string | null;
    matched_identifier: string;
    identifier_kind?: string;
    status?: string | null;
    confidence?: "high" | "medium" | "low";
  },
  matchedIdentifiers: string[],
  precedenceIndex: number,
): StepHit {
  const confidence = hit.confidence ?? "high";
  return {
    result: {
      method: "identifier_match",
      customer_account_id: hit.customer_account_id,
      customer_name: hit.customer_name,
      confidence,
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
    },
    signal: {
      customer_account_id: hit.customer_account_id,
      // The independence axis (D-05): the resolver_index kind the hit matched on.
      identifier_kind: hit.identifier_kind ?? "identifier",
      confidence,
      method: "identifier_match",
      precedence_index: precedenceIndex,
      status: hit.status ?? null,
      customer_name: hit.customer_name,
    },
  };
}
