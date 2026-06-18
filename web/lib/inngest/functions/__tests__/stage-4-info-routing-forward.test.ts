// Phase 132 Plan 01 (Task 2, part d) — Wave-0 RED scaffold for the info-routing
// FORWARD worker that Plan 02 will implement at
// web/lib/inngest/functions/stage-4-info-routing-forward.ts.
//
// This file is the DELIBERATE failing target Plan 02 turns green. The worker
// does not exist yet, so the contract below is expressed as `describe.todo`
// placeholders — they are reported as "todo" (not "failed"), so this scaffold
// does NOT pollute the tdd-guard RED state for unrelated work, while still
// pinning the exact behavioural contract Plan 02 must satisfy.
//
// Plan 02, once the worker exists, replaces each `describe.todo` with a real
// `describe`/`it` and a static import of the worker:
//
//   import { stage4InfoRoutingForward } from "../stage-4-info-routing-forward";
//
// CONTRACT (assert ONLY the fire/skip/replay-no-op behaviour — NOT replyTo;
// per the 2026-06-18 send-scope smoke replyTo is stripped on send and the
// original sender is carried in the forward COMMENT instead, so there is NO
// replyTo behaviour to assert):
//
//   FWD-01/02  routable verdict (unrouted=false, target_mailbox set, bucket
//              released) → forwardMessage called exactly once with
//              {mailbox: source info@, toMailbox: verdict.target_mailbox,
//               originalSender: the inbound sender} and the routing category
//              stamped via mergeRoutingCategory("forwarded", bucket).
//   FWD-04     verdict.unrouted === true → NO Graph forward call (the unrouted
//              verdict never forces a bucket).
//   FWD-04     verdict.target_mailbox === null (algemeen / no resolved box) →
//              NO Graph forward call.
//   FWD-05     verdict.dedup.status === "already_addressed" → NO forward
//              (the recipient is already on the thread); category stamped
//              mergeRoutingCategory("dedup", bucket) for visibility.
//   per-bucket isForwardBucketReleased(swarm, bucket) === false (held) → NO
//              Graph forward call (D-04 default held / D-03 graduated release);
//              category stamped mergeRoutingCategory("held", bucket).
//   D-02       replay with forward_state === "sent" → NO 2nd forwardMessage
//              call (idempotent — the side effect fires at most once).

import { describe } from "vitest";

describe("stage-4-info-routing-forward worker (Plan 02 target — Wave-0 RED scaffold)", () => {
  describe.todo(
    "FWD-01/02: routable + released verdict → forwardMessage called once (source info@ mailbox, toMailbox=target, originalSender=inbound sender)",
  );
  describe.todo(
    "FWD-01/02: stamps mergeRoutingCategory('forwarded', bucket) on the source message after a successful forward",
  );
  describe.todo("FWD-04: verdict.unrouted === true → NO Graph forward call");
  describe.todo(
    "FWD-04: verdict.target_mailbox === null (algemeen) → NO Graph forward call",
  );
  describe.todo(
    "FWD-05: verdict.dedup.status === 'already_addressed' → NO forward, stamp mergeRoutingCategory('dedup', bucket)",
  );
  describe.todo(
    "per-bucket held: isForwardBucketReleased(swarm,bucket) === false → NO Graph forward call, stamp mergeRoutingCategory('held', bucket)",
  );
  describe.todo(
    "D-02 replay: forward_state === 'sent' → NO 2nd forwardMessage call (fires at most once)",
  );
});
