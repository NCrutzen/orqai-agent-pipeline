# Swarm Bridge Contract

How to make a new automation render in the V7 Agent OS shell at
`/swarm/[swarmId]` (live kanban, delegation graph, terminal, briefing).

The generic bridge lives at
`web/lib/automations/swarm-bridge/sync.ts` and reads `automation_runs`
→ writes `swarm_jobs` + `agent_events`. It runs every minute via the
`automations/debtor-email-bridge` Inngest cron (misnamed for history —
it syncs every registered swarm).

You do **not** write a new bridge module per automation. You register a
`SwarmBridgeConfig` and honour the logging contract below.

---

## 1. Logging contract — `automation_runs`

Every run your automation performs MUST produce one row in
`automation_runs`. The bridge reads the following columns:

| column          | required | shape                                                        |
| --------------- | -------- | ------------------------------------------------------------ |
| `automation`    | ✓        | kebab-case, e.g. `debtor-email-review`. Must start with the swarm prefix. |
| `status`        | ✓        | `pending` · `deferred` · `feedback` · `completed` · `skipped_idempotent` · `failed` |
| `result`        | ✓        | JSON object — see keys below                                 |
| `error_message` | on fail  | string — surfaced verbatim on the card                       |
| `triggered_by`  | ✓        | short label (`cron`, `bulk-review:ui`, `zapier`, …)          |
| `created_at`    | auto     | set by DB                                                    |
| `completed_at`  | on end   | set when the run finishes (success OR failed)                |

### `result` JSON — recognised keys

```jsonc
{
  // REQUIRED when the swarm uses entity grouping. Identifies the
  // business object the run acted on. Example: message_id, invoice_id,
  // timesheet_row_id. Multiple runs with the same value collapse into
  // ONE kanban card with a timeline.
  "message_id": "AAMkAGU…",

  // RECOMMENDED. Human-readable label for the entity. Used as the
  // kanban card title. Fallback = first non-empty subject/title found.
  "subject": "Betaalspecificatie - Brocacef",

  // RECOMMENDED. Short machine-readable stage label for the run.
  // Rendered as the headline in the expanded timeline row. Example
  // values from debtor-email: "classify", "categorize",
  // "categorize+archive", "archive", "icontroller_delete".
  "stage": "categorize+archive"

  // Any other fields are preserved but ignored by the bridge — feel
  // free to include diagnostics (predicted.category, confidence, etc.).
}
```

### Status semantics — how it maps to the kanban

| status                | kanban stage | notes                                                           |
| --------------------- | ------------ | --------------------------------------------------------------- |
| `pending`             | progress     | I own this right now, actively processing                       |
| `deferred`            | ready        | I've handed off; another worker/cron will pick this up          |
| `feedback`            | review       | human review needed — audit-only after resolution\*             |
| `completed`           | done         | terminal success                                                |
| `skipped_idempotent`  | done         | terminal — detected work was already done (no-op, NOT "retry")  |
| `failed`              | done + error | tagged `error`, priority = high                                 |

\* When a later `completed`/`skipped_idempotent` run lands on the same
entity id, earlier `feedback` rows are auto-demoted to done. This means
you can keep inserting `feedback` rows for audit without pinning the
card at "review" forever.

### `pending` vs `deferred` — when to use which

Both sit in non-terminal states but mean different things:

- **`pending`** — *you* are processing it right now. A synchronous run
  that hasn't written `completed` / `failed` yet. Ownership = current
  worker. Example: classifier mid-run, browser session still open.
- **`deferred`** — you've written the row and handed off. A *different*
  worker (cron, catch-up job, manual trigger) will pick it up later.
  Ownership = future worker. Example: bulk-review queues an iController
  delete for the 5-min catch-up cron.

The downstream worker's flow:

1. Read `deferred` rows matching its filter.
2. (Optional) flip to `pending` while actively working, so a second cron
   tick doesn't double-pick.
3. Update to `completed` / `failed` when done.

A swarm with no hand-offs simply never emits `deferred` — the `ready`
kanban lane stays empty (same as `backlog`).

---

## 2. Registering the swarm

Add one `SwarmBridgeConfig` entry to
`web/lib/automations/swarm-bridge/configs.ts`:

```ts
const myAutomationConfig: SwarmBridgeConfig = {
  swarmId: "<projects.id>",       // UUID of the row in `projects`
  prefix: "my-automation",         // must match all your automation values
  entity: {
    key: "invoice_id",             // JSON key in automation_runs.result
    titleKey: "invoice_number",    // used for card title
    label: "Invoice",
  },
  // Optional — override the default (Title-cased automation name).
  resolveAgent: (run) => {
    if (run.automation === "my-automation-validate") return "Validator";
    if (run.automation === "my-automation-send") return "Sender";
    return null; // fall back to default
  },
  // Optional — how many days of runs to ingest. Defaults to 7. Older
  // runs stay in automation_runs for audit but drop off the kanban.
  windowDays: 14,
  // Optional — extra tags rendered as pills on the card.
  deriveTags: (runs) => {
    const vendor = runs.find(
      (r) => typeof r.result?.vendor === "string",
    )?.result?.vendor as string | undefined;
    return vendor ? [`vendor:${vendor}`] : [];
  },
};

export const SWARM_BRIDGE_CONFIGS: SwarmBridgeConfig[] = [
  debtorEmailConfig,
  myAutomationConfig, // ← add here
];
```

The Inngest cron picks it up on the next minute. No new cron, no new
API route, no new sync module.

---

## 3. What you get in the UI

- **Kanban card per entity** (when `entity` is set) or per run (when not).
- **Timeline** in the expanded modal row: every run with status pill,
  stage label, agent, start→complete timestamps, and error message.
- **Delegation graph**: each distinct `resolveAgent(run)` value becomes
  a node; edges come from `agent_events` with `parent_span_id`.
- **Terminal live stream**: one event per run start + one per completion
  or failure.
- **Auto-supersede**: stale `feedback` runs clear from the Review column
  once the human's action run lands.

---

## 4. Things to avoid

- **Don't write directly to `swarm_jobs` or `agent_events`.** The bridge
  owns those tables per swarm — it does a replace-all every minute.
- **Don't omit `result.stage`** for multi-step automations. Without it
  every run in the timeline shows the same label (the automation name).
- **Don't change the entity id mid-run.** The card id is a stable UUID
  derived from `(swarm_id, entity_id)` — changing it creates an orphan.
- **Don't include PII in `result`** beyond what you'd log elsewhere.
  The full JSON is rendered in the UI for any user with swarm access.

---

## 5. Registering the swarm_agents

The delegation graph and KPI pills read `swarm_agents` for the swarm.
Seed them once (migration or one-shot SQL) with the agent names your
`resolveAgent` returns. The bridge updates `metrics` + `status` on each
sync but will NOT insert new agent rows.
