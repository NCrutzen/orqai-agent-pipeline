// Phase 113 Plan 02 — sales Stage 3 input adapter.
//
// The sales conversation shape is IDENTICAL to debtor (subject + body + priors
// + tenantDomains + capChars → { text, inputChars, truncated }), so the proven
// 8k-cap assembler is RE-EXPORTED, not copied — avoids drift between the two
// swarms' truncation logic (the quoted-thread-first D-08 policy is swarm-
// agnostic). The only per-swarm difference is the tenantDomains argument, which
// the CALLER sources from TENANT_DOMAINS_BY_SWARM["sales-email"]; the assembly
// function itself names no swarm.
//
// If a sales-specific tweak is ever needed (e.g. a different cap or a sales-
// only thread heuristic), fork the implementation here — this re-export is the
// single seam where that fork would land.

export {
  assembleInput,
  type AssembleInputArgs,
  type AssembleInputPrior,
  type AssembledInput,
} from "../../debtor-email/coordinator/assemble-input";

// Phase 83 D-09 hard cap on the Stage 3 assembled input (mirrors the debtor
// coordinator constant). Sales uses the SAME 8000-char budget.
export const STAGE_3_INPUT_CAP_CHARS = 8000;
