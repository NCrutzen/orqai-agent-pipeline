// Phase 76 Plan 01 — RED scaffold.
// Server Action `reclassifyAsNoise` does not exist yet (Plan 05 creates it
// under ../reclassify-noise.ts). Tests are `it.todo` until that plan lands.

import { describe, it } from "vitest";

describe("Phase 76: reclassifyAsNoise Server Action", () => {
  it.todo(
    "emits debtor-email/override.submitted with axis='stage_1_category' and target noise_key",
  );
  it.todo(
    "rejects when noise_key is not in swarm_noise_categories registry",
  );
});
