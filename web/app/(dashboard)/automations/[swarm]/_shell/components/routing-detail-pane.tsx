"use client";

// Phase 132 Plan 03 Task 2 (FWD-08, D-07/D-08) — the info-routing routing detail
// pane: 6-field verdict + forward-status badge + the three D-08 operator controls
// (re-route / forward-now / don't-forward). Rendered from the swarm-generic
// Stage4Decide shell on row.routing !== null (D-07: reuse, no new view).
//
// Hard-separation note: this pane reads row.routing ONLY (the info-routing routing
// verdict) — never stage_1 noise categories or stage_3 intents.
//
// Re-route options are sourced from the codegen DESTINATION_KEYS_BY_SWARM registry
// (NOT hardcoded) so a new bucket auto-appears after `npm run codegen`.

import { useState, useTransition } from "react";

import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { DESTINATION_KEYS_BY_SWARM } from "@/lib/swarms/routing-destinations.generated";

import styles from "./routing-detail-pane.module.css";
import { useSelection } from "../selection-context";
import {
  rerouteBucket,
  forwardNow,
  dontForward,
} from "../actions/routing-actions";

// The cross-swarm triage sentinel — never an operator re-route target.
const UNROUTED_SENTINEL = "unrouted";

function bucketsForSwarm(swarmType: string): readonly string[] {
  const keys =
    (DESTINATION_KEYS_BY_SWARM as Record<string, readonly string[]>)[swarmType] ??
    [];
  return keys.filter((k) => k !== UNROUTED_SENTINEL);
}

export interface RoutingDetailPaneProps {
  row: BulkReviewRow;
  onSubmitted?: () => void;
}

// Operator-facing label per forward status. The text CONTAINS the raw status
// token so the badge is both human-readable and test-assertable.
const FORWARD_STATUS_LABEL: Record<string, string> = {
  held: "held — awaiting release (held)",
  forwarded: "forwarded to department (forwarded)",
  unrouted: "no destination — for human handling (unrouted)",
  "dedup-skipped": "already addressed — not forwarded (dedup-skipped)",
  stays: "stays in info@ (stays)",
};

export function RoutingDetailPane({ row, onSubmitted }: RoutingDetailPaneProps) {
  const slot = row.routing ?? null;
  const buckets = bucketsForSwarm(row.swarm_type);
  const [pickedBucket, setPickedBucket] = useState<string>(buckets[0] ?? "");
  const [auditNote, setAuditNote] = useState("");
  const [, startTransition] = useTransition();
  const { markPendingRemoval } = useSelection();

  if (slot === null) {
    return (
      <p data-testid="routing-detail-placeholder" className={styles.placeholder}>
        No routing decision for this message yet.
      </p>
    );
  }

  function handleForwardNow() {
    startTransition(async () => {
      const res = await forwardNow({
        email_id: row.email_id ?? "",
        swarm_type: row.swarm_type,
        run_id: slot!.run_id ?? "",
      });
      if (res.ok) {
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
      }
    });
  }

  function handleReroute() {
    startTransition(async () => {
      const res = await rerouteBucket({
        email_id: row.email_id ?? "",
        swarm_type: row.swarm_type,
        run_id: slot!.run_id ?? "",
        new_bucket: pickedBucket,
        brand: slot!.brand,
        audit_note: auditNote,
      });
      if (res.ok) {
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
      }
    });
  }

  function handleDontForward() {
    startTransition(async () => {
      const res = await dontForward({
        email_id: row.email_id ?? "",
        swarm_type: row.swarm_type,
        audit_note: auditNote,
      });
      if (res.ok) {
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
      }
    });
  }

  return (
    <div data-testid="routing-detail-pane" className={styles.pane}>
      <span
        data-testid="routing-forward-status"
        data-status={slot.forward_status}
        className={styles.badge}
      >
        {FORWARD_STATUS_LABEL[slot.forward_status]}
      </span>
      <select
        data-testid="routing-reroute-select"
        className={styles.rerouteSelect}
        value={pickedBucket}
        onChange={(e) => setPickedBucket(e.target.value)}
      >
        {buckets.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <textarea
        data-testid="routing-audit-note"
        className={styles.auditNote}
        value={auditNote}
        onChange={(e) => setAuditNote(e.target.value)}
        placeholder="Why this change? (required to re-route or suppress)"
      />
      <div className={styles.controls}>
        <button
          type="button"
          data-testid="routing-reroute-submit"
          className={styles.actionBtn}
          onClick={handleReroute}
        >
          Re-route
        </button>
        <button
          type="button"
          data-testid="routing-dont-forward"
          className={styles.actionBtn}
          onClick={handleDontForward}
        >
          Don&apos;t forward
        </button>
      </div>
      <dl className={styles.fields}>
        <div className={styles.field}>
          <dt>Bucket</dt>
          <dd>{slot.bucket}</dd>
        </div>
        <div className={styles.field}>
          <dt>Brand</dt>
          <dd>{slot.brand ?? "—"}</dd>
        </div>
        <div className={styles.field}>
          <dt>Department mailbox</dt>
          <dd>{slot.target_mailbox ?? "stays in info@"}</dd>
        </div>
        <div className={styles.field}>
          <dt>Confidence</dt>
          <dd>{slot.confidence}</dd>
        </div>
        <div className={styles.field}>
          <dt>Duplicate check</dt>
          <dd>
            {slot.dedup_status}
            {slot.dedup_layer ? ` (${slot.dedup_layer})` : ""}
          </dd>
        </div>
        <div className={styles.field}>
          <dt>Unrouted</dt>
          <dd>{slot.unrouted ? "yes" : "no"}</dd>
        </div>
      </dl>
      {/* algemeen/unrouted rows surface for HUMAN handling — no active Forward-now. */}
      {slot.target_mailbox !== null &&
      !slot.unrouted &&
      slot.forward_status !== "forwarded" &&
      slot.run_id !== null ? (
        <button
          type="button"
          data-testid="routing-forward-now"
          className={styles.actionBtn}
          onClick={handleForwardNow}
        >
          Forward now
        </button>
      ) : null}
    </div>
  );
}
