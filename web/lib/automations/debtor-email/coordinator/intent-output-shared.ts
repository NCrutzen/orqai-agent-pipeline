import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared, swarm-agnostic Stage 3 output axis: entity_relationship (D-05).
//
// Phase 113 (sales-email greenfield). Placed under the debtor coordinator path
// because that is where the ONE shared coordinator generated file
// (`intent.generated.ts`) already lives — there is NO sales-specific generated
// path (Pitfall 3). Both debtor and sales coordinators import from here.
//
// WHY NULLABLE IS MANDATORY:
//   The axis is additive. Making it nullable lets the existing debtor V3 schema
//   and the shared read path (Bulk Review, Stage 3 dispatcher) ignore it on
//   rows that omit it — they never see a missing-field validation failure. The
//   debtor V3 schema is NOT extended with this axis in Phase 113 (debtor
//   adoption is deferred — see 113-CONTEXT Deferred Ideas); only sales consumes
//   it today, but the field itself is swarm-agnostic and lives here once.
//
// JSON-SCHEMA MIRROR NOTE:
//   When this axis is mirrored into an Orq strict json_schema, the nullable form
//   MUST use `anyOf` — { "anyOf": [{"type":"string"}, {"type":"null"}] } — and
//   NEVER the array shorthand { "type": ["string","null"] }. The shorthand is
//   valid JSON Schema 2020-12 but Orq's json_schema validator + OpenAI strict
//   mode reject it ("Invalid JSON detected"). (CLAUDE.md learning 3970bad9.)
// ---------------------------------------------------------------------------

/**
 * The customer/prospect/third-party axis fed by Stage 2 NXT resolution:
 *  - resolved_entity          → Stage 2 matched a known NXT customer.
 *  - unresolved_known_pattern → sender/domain looks like a recognised buyer
 *                               pattern but Stage 2 did not resolve a record.
 *  - unknown_third_party      → no resolution and no recognised pattern.
 */
export const ENTITY_RELATIONSHIP = [
  "resolved_entity",
  "unresolved_known_pattern",
  "unknown_third_party",
] as const;

export type EntityRelationship = (typeof ENTITY_RELATIONSHIP)[number];

/**
 * Swarm-agnostic, NULLABLE zod field for the entity_relationship axis. Null is
 * a first-class value (Stage 2 dry-run / no resolution attempted).
 */
export const entityRelationshipField = z.enum(ENTITY_RELATIONSHIP).nullable();
