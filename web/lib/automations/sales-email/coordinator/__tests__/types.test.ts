import { describe, it, expect } from "vitest";
import {
  ENTITY_RELATIONSHIP,
  entityRelationshipField,
} from "../../../debtor-email/coordinator/intent-output-shared";

describe("entity_relationship shared axis (Task 1)", () => {
  it("ENTITY_RELATIONSHIP exports the expected tuple", () => {
    expect(ENTITY_RELATIONSHIP).toEqual([
      "resolved_entity",
      "unresolved_known_pattern",
      "unknown_third_party",
    ]);
  });

  it("entityRelationshipField accepts each enum value", () => {
    for (const v of ENTITY_RELATIONSHIP) {
      expect(entityRelationshipField.safeParse(v).success).toBe(true);
    }
  });

  it("entityRelationshipField accepts null", () => {
    expect(entityRelationshipField.safeParse(null).success).toBe(true);
  });

  it("entityRelationshipField rejects an unknown string", () => {
    expect(entityRelationshipField.safeParse("customer").success).toBe(false);
  });
});
