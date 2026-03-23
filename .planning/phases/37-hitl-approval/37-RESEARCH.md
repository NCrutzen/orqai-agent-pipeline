# Phase 37: HITL Approval - Research

**Researched:** 2026-03-23
**Domain:** Human-in-the-Loop approval workflow (Inngest waitForEvent, diff UI, email notifications, audit trail)
**Confidence:** HIGH

## Summary

Phase 37 adds a human-in-the-loop approval gate to the pipeline. When a pipeline stage proposes prompt changes, the pipeline must pause (using Inngest's `step.waitForEvent()`), the user must see the proposed changes in a diff view with plain-English explanation, and they can approve or reject with a comment. Upon decision, the pipeline resumes automatically. An email notification is sent when an approval is pending, and all decisions are logged for audit.

The existing codebase already has all the infrastructure needed: Inngest durable functions with step-per-stage execution, Supabase Broadcast for real-time updates, admin client for service-role DB writes, typed events, and a rich run detail page with graph + timeline. The primary new work is: (1) a new `approval_requests` table, (2) `step.waitForEvent()` integration in the pipeline function, (3) a diff viewer component and approval UI, (4) a server action + API route to send the approval event, and (5) Resend integration for email notifications.

**Primary recommendation:** Use Inngest `step.waitForEvent()` with a dual-write pattern (write approval to DB first, then send Inngest event) to avoid the known race condition (GitHub #1433). Use `react-diff-viewer-continued` v4.2.0 for the diff view. Use Resend for email notifications via a Next.js API route (not Supabase Edge Functions -- keep all logic in the Next.js app).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HITL-01 | Pipeline pauses and creates an approval request when prompt changes are proposed | Inngest `step.waitForEvent()` pauses the durable function; new `approval_requests` DB table stores pending approvals; pipeline step status gains "waiting" state |
| HITL-02 | User sees a diff view of proposed changes with plain-English explanation | `react-diff-viewer-continued` v4.2.0 provides split/unified diff views; pipeline stores `old_content` and `new_content` in approval request; Claude generates plain-English explanation |
| HITL-03 | User can approve or reject changes with optional comment | Server action updates `approval_requests` row and sends Inngest event `pipeline/approval.decided`; Broadcast notifies run detail page in real-time |
| HITL-04 | Pipeline resumes automatically after approval decision | `step.waitForEvent()` resolves when `pipeline/approval.decided` event is received; pipeline continues or marks step failed based on decision |
| HITL-05 | User receives email notification when approval is needed | Resend npm package v6.9.4 sends transactional email from Next.js API route called by Inngest pipeline function after creating approval request |
| HITL-06 | All approval decisions are logged with timestamp, user, and comment (audit trail) | `approval_requests` table stores `decided_by`, `decided_at`, `decision`, `comment`; immutable audit log via RLS (no UPDATE on decision fields after set) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| inngest | ^4.0.4 | Pipeline orchestration with `step.waitForEvent()` for HITL pause/resume | Already installed; durable functions with event-driven pause are the canonical HITL pattern |
| react-diff-viewer-continued | ^4.2.0 | Split/unified diff view for proposed prompt changes | React 19 compatible (v4.1+); actively maintained fork; beautiful out-of-box diff UI |
| resend | ^6.9.4 | Transactional email notifications for pending approvals | Modern TypeScript SDK, React Email native, 3K free emails/month, recommended by Supabase |
| @supabase/supabase-js | ^2.99.1 | DB operations + Broadcast for real-time approval updates | Already installed; admin client for service-role writes from Inngest |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 | Validate approval decision payloads | Already installed; validate server action inputs |
| lucide-react | ^0.577.0 | Icons for approval UI (CheckCircle, XCircle, Mail, etc.) | Already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-diff-viewer-continued | Custom diff with `diff` npm package | Hand-rolling UI is slow; react-diff-viewer-continued provides word-level highlighting, split/unified toggle, line numbers out of box |
| Resend | SendGrid, Postmark, Nodemailer | Resend has best TypeScript DX, React Email integration, and Supabase recommends it; others need more boilerplate |
| Inngest waitForEvent | Polling DB for approval status | Polling wastes resources and adds latency; waitForEvent is purpose-built for this exact use case |

**Installation:**
```bash
cd web && npm install react-diff-viewer-continued resend
```

**Version verification:**
- react-diff-viewer-continued: 4.2.0 (verified via `npm view`)
- resend: 6.9.4 (verified via `npm view`)
- inngest: 4.0.4 (already installed as ^3.52.6, check if update needed for waitForEvent improvements)

## Architecture Patterns

### Recommended Project Structure
```
web/
  lib/
    inngest/
      events.ts            # ADD: pipeline/approval.decided event type
      functions/
        pipeline.ts        # MODIFY: add waitForEvent for HITL stages
    pipeline/
      approval.ts          # NEW: approval helper functions (create, decide)
    email/
      approval-notification.ts  # NEW: Resend email sending helper
  components/
    approval/
      diff-viewer.tsx      # NEW: wrapper around react-diff-viewer-continued
      approval-panel.tsx   # NEW: approve/reject form with comment
      approval-badge.tsx   # NEW: status badge for waiting/approved/rejected
    step-status-badge.tsx  # MODIFY: add "waiting" status
    step-log-panel.tsx     # MODIFY: show approval UI inline when step is waiting
  app/
    (dashboard)/
      projects/[id]/runs/[runId]/
        run-detail-client.tsx  # MODIFY: handle "waiting" step status, show approval panel
    api/
      approval/
        route.ts           # NEW: API route to handle approval decisions (used by server action)
  supabase/
    schema-approval.sql    # NEW: approval_requests table + RLS
```

### Pattern 1: Dual-Write for waitForEvent Race Condition Avoidance
**What:** Write the approval request to the DB BEFORE calling `step.waitForEvent()`, so if the event arrives before the listener is registered, the pipeline can check DB state on resume.
**When to use:** Always -- this addresses the known Inngest race condition (GitHub #1433).
**Example:**
```typescript
// Source: Project decision in STATE.md + GitHub #1433 workaround
// Inside the Inngest pipeline function, within a HITL stage step:

// Step 1: Create approval request in DB (in its own step.run)
const approvalId = await step.run("create-approval-request", async () => {
  const admin = createAdminClient();
  const { data } = await admin
    .from("approval_requests")
    .insert({
      run_id: runId,
      step_name: stage.name,
      old_content: previousPrompt,
      new_content: proposedPrompt,
      explanation: plainEnglishExplanation,
      status: "pending",
    })
    .select("id")
    .single();

  // Send email notification
  await sendApprovalEmail(runId, data!.id, userEmail);

  // Broadcast "waiting" status to real-time subscribers
  await broadcastStepUpdate(runId, {
    stepName: stage.name,
    status: "waiting",
    displayName: stage.displayName,
    runStatus: "waiting",
  });

  return data!.id;
});

// Step 2: Wait for approval event (or check DB if event was already sent)
const approval = await step.waitForEvent("wait-for-approval", {
  event: "pipeline/approval.decided",
  timeout: "7d",
  if: `async.data.approvalId == "${approvalId}"`,
});

// Step 3: Handle result
if (!approval) {
  // Timeout -- mark as rejected
  throw new Error("Approval timed out after 7 days");
}

if (approval.data.decision === "rejected") {
  // Skip this change, continue pipeline
  return { skipped: true, reason: "rejected" };
}

// Approved -- apply the change and continue
```

### Pattern 2: Server Action for Approval Decision
**What:** A Next.js server action that writes the decision to DB and sends the Inngest event.
**When to use:** When user clicks Approve or Reject button.
**Example:**
```typescript
// Source: Existing pattern from actions.ts (new-run)
"use server";

export async function submitApprovalDecision(
  approvalId: string,
  decision: "approved" | "rejected",
  comment?: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();

  // Update approval request in DB
  await admin
    .from("approval_requests")
    .update({
      status: decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      comment: comment || null,
    })
    .eq("id", approvalId)
    .eq("status", "pending"); // Prevent double-submit

  // Send Inngest event to resume pipeline
  await inngest.send({
    name: "pipeline/approval.decided",
    data: {
      approvalId,
      runId: approval.run_id,
      decision,
      decidedBy: user.id,
      comment: comment || null,
    },
  });

  revalidatePath(`/projects/${projectId}/runs/${runId}`);
}
```

### Pattern 3: Broadcast "waiting" Status for Real-Time UI
**What:** Extend the existing Broadcast system to emit "waiting" status when HITL pause begins.
**When to use:** When pipeline enters waitForEvent, and when approval decision is made.
**Example:**
```typescript
// Extend StepUpdatePayload to include approvalId
export interface StepUpdatePayload {
  stepName: string;
  status: "pending" | "running" | "complete" | "failed" | "skipped" | "waiting";
  displayName: string;
  durationMs?: number;
  stepsCompleted?: number;
  runStatus?: string;
  log?: string;
  approvalId?: string; // NEW: links to approval_requests row
}
```

### Anti-Patterns to Avoid
- **Polling for approval status:** Do NOT poll the DB from the Inngest function to check if approval arrived. Use `step.waitForEvent()` -- it is purpose-built for this.
- **Sending both events at once:** Do NOT send the pipeline event and approval event in quick succession (race condition). The dual-write pattern ensures the DB is the source of truth.
- **Storing diff in Inngest state:** Diffs can be large. Store `old_content` and `new_content` in Supabase `approval_requests` table, NOT in Inngest event data.
- **Building custom diff logic:** Use `react-diff-viewer-continued` -- it handles word-level diffing, syntax highlighting, line numbers, and split/unified views.
- **Sending email from client:** Email must be sent server-side from the Inngest function (after creating approval request), never from the browser.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Text diffing | Custom line-by-line comparison | react-diff-viewer-continued | Word-level diff, syntax highlighting, split/unified views, line numbers |
| Pipeline pause/resume | Custom polling or webhook patterns | Inngest step.waitForEvent() | Durable, survives restarts, built-in timeout, event matching |
| Email sending | SMTP client, nodemailer setup | Resend SDK | 3 lines of code, TypeScript native, React Email templates, deliverability handled |
| Audit trail | Custom logging table with manual timestamps | approval_requests table with DB defaults | Supabase handles `created_at`, RLS prevents unauthorized access, immutable after decision |

**Key insight:** Every piece of this phase maps to an existing, well-maintained solution. The only novel code is the integration layer connecting these pieces to the existing pipeline.

## Common Pitfalls

### Pitfall 1: Inngest waitForEvent Race Condition (GitHub #1433)
**What goes wrong:** If the approval event is sent before `step.waitForEvent()` registers its listener, the event is missed and the pipeline hangs until timeout.
**Why it happens:** Inngest processes events asynchronously; there is a window between step execution and listener registration where events can be lost.
**How to avoid:** Dual-write pattern: always write approval to DB first (in a separate `step.run()`), then call `step.waitForEvent()`. If the event was already sent before the wait registers, the pipeline will get the event on retry. Also consider adding a fallback check: after `waitForEvent` resolves (even with null/timeout), check the DB for an existing decision.
**Warning signs:** Approvals that time out despite the user having clicked Approve.

### Pitfall 2: Double-Submit on Approval Button
**What goes wrong:** User clicks Approve twice, sending two Inngest events and potentially corrupting state.
**Why it happens:** No client-side or server-side idempotency protection.
**How to avoid:** (1) Client-side: disable button after first click, show loading state. (2) Server-side: use `.eq("status", "pending")` in the UPDATE query so only the first write succeeds. (3) Inngest event dedup is handled by the `if` match expression.
**Warning signs:** Duplicate entries in audit trail, pipeline receiving multiple resume signals.

### Pitfall 3: StepStatus Enum Mismatch
**What goes wrong:** Adding "waiting" to the TypeScript `StepStatus` type but forgetting the DB CHECK constraint, or vice versa.
**Why it happens:** Status is defined in three places: DB schema (CHECK constraint), TypeScript type, and UI component.
**How to avoid:** Update all three atomically: (1) ALTER TABLE pipeline_steps to add 'waiting' to CHECK constraint, (2) update `StepStatus` type in `step-status-badge.tsx`, (3) add "waiting" visual style to `statusConfig`.
**Warning signs:** DB insert fails with CHECK constraint violation; UI shows "Unknown" for waiting steps.

### Pitfall 4: Large Diff Content in Inngest Events
**What goes wrong:** Passing full prompt text (potentially tens of KB) in Inngest event data exceeds state size limits.
**Why it happens:** Same pitfall as Phase 35 (PIPE results stored in DB, not Inngest state).
**How to avoid:** Store `old_content` and `new_content` in the `approval_requests` table. The Inngest event only carries the `approvalId` reference. The UI fetches diff content from DB.
**Warning signs:** Inngest function failures with "state too large" errors.

### Pitfall 5: Email Notification Blocking Pipeline
**What goes wrong:** If Resend API is down, the email send fails and the entire pipeline step fails.
**Why it happens:** Email send is in the same step.run() as the approval creation.
**How to avoid:** Use `step.sendEvent()` to trigger a SEPARATE Inngest function for email sending, or wrap the Resend call in a try/catch that logs but doesn't throw. The approval request in DB is the critical path; email is best-effort.
**Warning signs:** Pipeline failures with Resend API errors in production.

### Pitfall 6: RLS Blocking Approval Writes
**What goes wrong:** User tries to approve but the RLS policy blocks the write because the approval table policies aren't set up correctly.
**Why it happens:** `approval_requests` mutations need to allow project members to update the `status`, `decided_by`, `decided_at`, and `comment` fields.
**How to avoid:** Create a proper RLS UPDATE policy on `approval_requests` for project members. Alternatively, use the admin client in the server action (simpler, same pattern as existing pipeline writes).
**Warning signs:** "Permission denied" errors when user clicks Approve/Reject.

## Code Examples

### Database Schema: approval_requests
```sql
-- Source: Extending existing schema-pipeline.sql pattern
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES pipeline_runs(id) ON DELETE CASCADE NOT NULL,
  step_name TEXT NOT NULL,
  old_content TEXT NOT NULL,
  new_content TEXT NOT NULL,
  explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_approval_requests_run_id ON approval_requests(run_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(status)
  WHERE status = 'pending';

-- RLS: Project members can see approvals for their runs
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members see approvals" ON approval_requests
  FOR SELECT USING (
    run_id IN (
      SELECT id FROM pipeline_runs
      WHERE project_id IN (
        SELECT project_id FROM project_members
        WHERE user_id = (SELECT auth.uid())
      )
    )
  );

-- No INSERT/UPDATE policies for client: all writes via admin client (server actions)
```

### Inngest Event Type Extension
```typescript
// Source: Extending existing events.ts
export type Events = {
  "pipeline/run.started": {
    data: {
      runId: string;
      projectId: string;
      useCase: string;
      userId: string;
      resumeFromStep?: string;
    };
  };
  "pipeline/approval.decided": {
    data: {
      approvalId: string;
      runId: string;
      decision: "approved" | "rejected";
      decidedBy: string;
      comment: string | null;
    };
  };
};
```

### Diff Viewer Component
```typescript
// Source: react-diff-viewer-continued docs
"use client";

import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

interface ApprovalDiffViewerProps {
  oldContent: string;
  newContent: string;
  splitView?: boolean;
}

export function ApprovalDiffViewer({
  oldContent,
  newContent,
  splitView = true,
}: ApprovalDiffViewerProps) {
  return (
    <ReactDiffViewer
      oldValue={oldContent}
      newValue={newContent}
      splitView={splitView}
      compareMethod={DiffMethod.WORDS}
      leftTitle="Current Prompt"
      rightTitle="Proposed Changes"
      useDarkTheme={false}
    />
  );
}
```

### Email Notification with Resend
```typescript
// Source: Resend docs for Next.js
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendApprovalEmail(
  runId: string,
  approvalId: string,
  recipientEmail: string,
  projectName: string,
  stepName: string
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const approvalUrl = `${appUrl}/projects/${projectId}/runs/${runId}?approval=${approvalId}`;

  await resend.emails.send({
    from: "Agent Workforce <notifications@yourdomainhere.com>",
    to: recipientEmail,
    subject: `Approval needed: ${stepName} in ${projectName}`,
    html: `
      <h2>Approval Required</h2>
      <p>A pipeline step is waiting for your approval.</p>
      <p><strong>Project:</strong> ${projectName}</p>
      <p><strong>Step:</strong> ${stepName}</p>
      <p><a href="${approvalUrl}">Review and Approve</a></p>
    `,
  });
}
```

### Adding "waiting" Status to StepStatusBadge
```typescript
// Source: Extending existing step-status-badge.tsx pattern
waiting: {
  label: "Waiting for Approval",
  variant: "default",
  icon: PauseCircle, // from lucide-react
  className: "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800 dark:text-amber-400 animate-pulse",
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom polling for approval | Inngest step.waitForEvent() | Inngest v3+ | Durable pause, no wasted compute, automatic timeout handling |
| react-diff-viewer (unmaintained) | react-diff-viewer-continued v4.2.0 | Feb 2026 | React 19 support, active maintenance, TypeScript types |
| Nodemailer / SES | Resend SDK | 2024-2025 | 3-line integration, TypeScript native, free tier, React Email |
| 5-second polling (Phase 35) | Supabase Broadcast (Phase 36) | Phase 36 | Already migrated; HITL uses same Broadcast pattern for real-time UI |

**Deprecated/outdated:**
- `react-diff-viewer` (original): Last published 6 years ago, no React 19 support. Use `react-diff-viewer-continued` instead.

## Open Questions

1. **Which pipeline stages trigger HITL approval?**
   - What we know: The iterate/prompt-edit loop proposes prompt changes. The current 7-stage pipeline (architect through readme-generator) does NOT propose changes -- it generates from scratch.
   - What's unclear: Does HITL apply to a future "iterate" stage added to the web pipeline, or to specific stages that produce diffs of existing content?
   - Recommendation: Design the approval system generically (any stage can trigger it), but implement the first HITL trigger at a stage that naturally produces diffs. The pipeline function should check a `needsApproval` flag on the stage config. For the initial implementation, add an "iterate" or "prompt-review" stage concept where the pipeline proposes changes to previously generated prompts.

2. **Email sender domain configuration**
   - What we know: Resend requires a verified domain to send from. The default `onboarding@resend.dev` works for testing.
   - What's unclear: Which domain will be used for production (moyneroberts.com or a subdomain)?
   - Recommendation: Use `onboarding@resend.dev` for development/testing. Make the sender configurable via environment variable (`RESEND_FROM_EMAIL`).

3. **Approval notification recipients**
   - What we know: All project members have equal access (PROJ-04). The `created_by` field on `pipeline_runs` identifies who started the run.
   - What's unclear: Should ALL project members get notified, or just the run creator?
   - Recommendation: Notify the run creator (simplest). Make it extensible to notify all project members later. The `created_by` user's email is available via Supabase auth.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 + jsdom |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run --reporter=verbose` |
| Full suite command | `cd web && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HITL-01 | Pipeline creates approval request and enters waiting state | unit | `cd web && npx vitest run lib/pipeline/__tests__/approval.test.ts -x` | Wave 0 |
| HITL-02 | Diff viewer renders old/new content with explanation | unit | `cd web && npx vitest run components/approval/__tests__/diff-viewer.test.ts -x` | Wave 0 |
| HITL-03 | Approval server action updates DB and sends Inngest event | unit | `cd web && npx vitest run lib/pipeline/__tests__/approval-action.test.ts -x` | Wave 0 |
| HITL-04 | Pipeline resumes after approval event received | unit | `cd web && npx vitest run lib/inngest/__tests__/pipeline-approval.test.ts -x` | Wave 0 |
| HITL-05 | Email notification sent when approval created | unit | `cd web && npx vitest run lib/email/__tests__/approval-notification.test.ts -x` | Wave 0 |
| HITL-06 | Approval decisions stored with timestamp, user, comment | unit | `cd web && npx vitest run lib/pipeline/__tests__/approval-audit.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd web && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/lib/pipeline/__tests__/approval.test.ts` -- covers HITL-01 (approval creation logic)
- [ ] `web/components/approval/__tests__/diff-viewer.test.ts` -- covers HITL-02 (diff viewer rendering)
- [ ] `web/lib/pipeline/__tests__/approval-action.test.ts` -- covers HITL-03 (server action logic)
- [ ] `web/lib/inngest/__tests__/pipeline-approval.test.ts` -- covers HITL-04 (pipeline resume logic)
- [ ] `web/lib/email/__tests__/approval-notification.test.ts` -- covers HITL-05 (email sending)
- [ ] `web/lib/pipeline/__tests__/approval-audit.test.ts` -- covers HITL-06 (audit trail)
- [ ] Framework install: `cd web && npm install react-diff-viewer-continued resend`

## Sources

### Primary (HIGH confidence)
- Inngest waitForEvent docs: https://www.inngest.com/docs/features/inngest-functions/steps-workflows/wait-for-event
- Inngest waitForEvent API reference: https://www.inngest.com/docs/reference/typescript/functions/step-wait-for-event
- Inngest GitHub #1433 (race condition): https://github.com/inngest/inngest/issues/1433
- react-diff-viewer-continued GitHub: https://github.com/Aeolun/react-diff-viewer-continued
- react-diff-viewer-continued React 19 support: https://github.com/Aeolun/react-diff-viewer-continued/issues/63
- Resend Next.js docs: https://resend.com/docs/send-with-nextjs
- Supabase email with Edge Functions: https://supabase.com/docs/guides/functions/examples/send-emails
- Existing codebase: `web/lib/inngest/functions/pipeline.ts`, `web/lib/supabase/broadcast.ts`, `web/lib/inngest/events.ts`

### Secondary (MEDIUM confidence)
- Inngest HITL pattern (AgentKit): https://agentkit.inngest.com/advanced-patterns/human-in-the-loop
- Resend npm package: https://www.npmjs.com/package/resend (v6.9.4 verified)
- react-diff-viewer-continued npm: https://www.npmjs.com/package/react-diff-viewer-continued (v4.2.0 verified)

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All packages verified against npm registry; Inngest already in use; react-diff-viewer-continued v4.2.0 confirmed React 19 compatible
- Architecture: HIGH - Dual-write pattern addresses known race condition; existing codebase patterns (step.run, admin client, Broadcast, server actions) directly map to HITL requirements
- Pitfalls: HIGH - Race condition documented in Inngest GitHub #1433; double-submit prevention is standard web pattern; large-state pitfall already addressed in Phase 35

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable domain; Inngest and Resend APIs are stable)
