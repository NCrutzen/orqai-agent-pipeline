// Phase 76 Plan 06 Task 2 — Per-swarm page header (server component).
//
// Renders display name + mailbox subtitle. Spacing tokens locked per UI-SPEC
// §Spacing Scale; typography per UI-SPEC §Typography. Cross-swarm reuse:
// no literal swarm-name branches — props.swarm flows top-down from the RSC.

import type { SwarmRow } from "@/lib/swarms/types";

export function PageHeader({ swarm }: { swarm: SwarmRow }) {
  return (
    <header
      className="page-header"
      style={{
        padding: "var(--space-4) var(--space-5)",
        background: "var(--v7-bg-2)",
        borderBottom: "1px solid var(--v7-border)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "22px",
          fontWeight: 500,
          lineHeight: 1.2,
          margin: 0,
          color: "var(--v7-text)",
        }}
      >
        {swarm.display_name ?? swarm.swarm_type}
      </h2>
    </header>
  );
}
