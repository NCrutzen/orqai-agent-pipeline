"use client";

// Phase 56.7-03 (D-08, D-15). Generic detail pane.
// Was originally debtor-email-review/detail-pane.tsx (Phase 61-02).
//
// Genericization:
//   - Override dropdown options come from `categories` prop (loadSwarmCategories
//     output). Categories with action='reject' are filtered out — those are
//     the skip path, not real overrides.
//   - recordVerdict is threaded with `swarm_type` (Pitfall 5).
//   - Mailbox-id labels: kept gated on swarm_type==='debtor-email'.
//     Q2 (Phase 56.7+1): move to ui_config.label_maps.mailbox_id.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Check, MailOpen, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchReviewEmailBody, recordVerdict } from "./actions";
import type { PredictedRow, PipelineTimelineEvent } from "./page";
import type { SwarmCategoryRow, SwarmIntentRow } from "@/lib/swarms/types";
import { useSelection } from "./selection-context";
import { SafetyDetailPane } from "./components/safety-detail-pane";
import { CostOutlierAxisCard } from "./components/cost-outlier-axis-card";
// Phase 71-05 — 4-axis override flow components (Plan 71-04 outputs).
import {
  PipelineFlow,
  type StageData,
  type StageState,
} from "./components/pipeline-flow";
import { Stage1Widget } from "./components/stage-1-widget";
import {
  Stage2Widget,
  type CustomerSelection,
} from "./components/stage-2-widget";
import { Stage3Widget } from "./components/stage-3-widget";
import {
  Stage4Widget,
  type Stage4Quality,
} from "./components/stage-4-widget";
import { EvalTypeRadio, type EvalType } from "./components/eval-type-radio";
import {
  OverrideConfirmDialog,
  type OverrideConfirmTrigger,
} from "./components/override-confirm-dialog";
import { IControllerInfoBanner } from "./components/icontroller-info-banner";
import type { OverrideAxis } from "@/lib/pipeline-events/types";

// ---- Body cache (module-level so prefetch survives detail-pane remounts) -

interface CachedBody {
  bodyText: string;
  bodyHtml: string | null;
}
const bodyCache = new Map<string, CachedBody>();
const inFlight = new Map<string, Promise<CachedBody | null>>();

export function prefetchReviewEmailBody(id: string): void {
  if (!id || bodyCache.has(id) || inFlight.has(id)) return;
  const p = fetchReviewEmailBody(id)
    .then((res) => {
      inFlight.delete(id);
      if (res.ok) {
        const cached = { bodyText: res.bodyText, bodyHtml: res.bodyHtml };
        bodyCache.set(id, cached);
        return cached;
      }
      return null;
    })
    .catch(() => {
      inFlight.delete(id);
      return null;
    });
  inFlight.set(id, p);
}

// ---- Result-payload helpers ----------------------------------------------

interface ResultPayload {
  message_id?: string;
  source_mailbox?: string;
  subject?: string;
  from?: string;
  fromName?: string;
  predicted?: { rule?: string; category?: string };
}

function readResult(row: PredictedRow): ResultPayload {
  const r = row.result as ResultPayload | null;
  return r ?? {};
}

// Q2 (Phase 56.7+1): move to ui_config.label_maps.mailbox_id; gated on
// swarm_type for now so non-debtor swarms don't get debtor-specific labels.
const MAILBOX_LABELS: Record<number, string> = {
  1: "Sicli Noord",
  2: "Sicli Sud",
  3: "Berki",
  4: "Smeba",
  5: "Smeba Fire",
  6: "FireControl",
};

function mailboxLabel(id: number | null, swarmType: string): string {
  if (id === null) return "(no mailbox)";
  if (swarmType === "debtor-email") {
    return MAILBOX_LABELS[id] ?? `mailbox ${id}`;
  }
  return `mailbox ${id}`;
}

// Status pill copy/colour
type RowStatus = "predicted" | "approving" | "rejecting" | "failed";

function statusPillCopy(s: RowStatus): string {
  switch (s) {
    case "predicted":
      return "Predicted";
    case "approving":
      return "Approving…";
    case "rejecting":
      return "Rejecting…";
    case "failed":
      return "Action failed";
  }
}

function statusPillColor(s: RowStatus): { bg: string; fg: string } {
  if (s === "failed") return { bg: "rgba(181,69,78,0.13)", fg: "var(--v7-red)" };
  if (s === "approving" || s === "rejecting") {
    return { bg: "var(--v7-amber-soft)", fg: "var(--v7-amber)" };
  }
  return { bg: "var(--v7-panel-2)", fg: "var(--v7-muted)" };
}

// ---- Component -----------------------------------------------------------

interface DetailPaneProps {
  rows: PredictedRow[];
  initialSelectedRow: PredictedRow | null;
  swarmType: string;
  categories: SwarmCategoryRow[];
  drawerFields: string[];
  /** Phase 71-05. Full pipeline_events timeline for the selected email.
   *  Server-side fallback for the initial selection. Prefer `timelineMap`
   *  for everything else — selection-context updates the URL via
   *  history.replaceState and does NOT re-render the server component, so
   *  this static prop is empty for any row other than the initial ?selected=. */
  selectedTimeline?: PipelineTimelineEvent[];
  /** Pre-fetched per-stage timelines for all visible rows, keyed by email_id.
   *  Looked up by the current client-side selectedId so every row's stage
   *  cards reflect their own pipeline_events, not just the initial selection. */
  timelineMap?: Record<string, PipelineTimelineEvent[]>;
  /** Phase 71-05. Stage 3 widget consumes this. */
  intents?: SwarmIntentRow[];
  /** Phase 71-08. Pre-fetched body for the initial selected row. Skips the
   *  Server Action round-trip when the page already loaded the body. */
  initialSelectedBody?: { bodyText: string; bodyHtml: string | null } | null;
  /** Phase 71-08. Pre-fetched bodies for all visible rows. Seeds the
   *  module-level bodyCache so client-side row selection paints
   *  synchronously without a Server Action. */
  initialBodyMap?: Record<string, { bodyText: string; bodyHtml: string | null }>;
}

// ---- Phase 71-05. 4-axis dirty-state shape ------------------------------

interface DirtyState {
  stage_1?: { categoryKey: string };
  stage_2?: { customer: CustomerSelection; reRun: boolean };
  stage_3?: { intentKey: string };
  stage_4?: { quality: Stage4Quality; reason: string };
}

const STAGE_TITLES: Record<number, string> = {
  1: "Category",
  2: "Customer",
  3: "Intent",
  4: "Handler output",
};

const STAGE_AXES: Record<number, OverrideAxis | null> = {
  0: null,
  1: "stage_1_category",
  2: "stage_2_customer",
  3: "stage_3_intent",
  4: "stage_4_handler_output",
};

export function DetailPane({
  rows,
  initialSelectedRow,
  swarmType,
  categories,
  // drawerFields reserved for future config-driven meta-grid; the existing
  // 6-field grid matches debtor-email's drawer_fields seed verbatim.
  drawerFields: _drawerFields,
  selectedTimeline,
  timelineMap,
  intents,
  initialSelectedBody,
  initialBodyMap,
}: DetailPaneProps) {
  // Phase 71-08: seed module-level cache from server-rendered bodies so
  // every row paints synchronously with no Server Action round-trip.
  if (initialBodyMap) {
    for (const [emailId, body] of Object.entries(initialBodyMap)) {
      if (!bodyCache.has(emailId)) {
        bodyCache.set(emailId, body);
      }
    }
  }
  if (initialSelectedRow && initialSelectedBody && !bodyCache.has(initialSelectedRow.id)) {
    bodyCache.set(initialSelectedRow.id, initialSelectedBody);
  }
  const { selectedId, setSelected, pendingRemovalIds, markPendingRemoval } =
    useSelection();
  const router = useRouter();

  // Resolve the timeline for the currently-selected row. Prefer the
  // preloaded map (covers every visible row) over the static prop (only
  // populated for the initial ?selected= server render).
  const effectiveTimeline: PipelineTimelineEvent[] =
    (selectedId && timelineMap?.[selectedId]) ||
    selectedTimeline ||
    [];

  // Override candidates: registry rows whose action is NOT 'reject'.
  // Reject-action rows (e.g. 'unknown' for debtor-email) are the skip path,
  // not real category overrides — Skip button covers them.
  const overrideOptions = useMemo(
    () =>
      categories
        .filter((c) => c.enabled !== false && c.action !== "reject")
        .sort((a, b) => a.display_order - b.display_order),
    [categories],
  );
  const categoryLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.category_key, c.display_label);
    return m;
  }, [categories]);

  const visibleRows = pendingRemovalIds.size === 0
    ? rows
    : rows.filter((r) => !pendingRemovalIds.has(r.id));

  const row =
    visibleRows.find((r) => r.id === selectedId) ??
    (initialSelectedRow &&
    initialSelectedRow.id === selectedId &&
    !pendingRemovalIds.has(initialSelectedRow.id)
      ? initialSelectedRow
      : null);

  const [status, setStatus] = useState<RowStatus>("predicted");
  const [override, setOverride] = useState<string | undefined>(undefined);
  const [notes, setNotes] = useState("");

  // Phase 71-07: email body defaults open — operators were always toggling
  // it manually as the first action.
  const [bodyOpen, setBodyOpen] = useState(true);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState<string | null>(null);

  // Phase 71-05. 4-axis override state.
  const [dirty, setDirty] = useState<DirtyState>({});
  const [evalType, setEvalType] = useState<EvalType>("regression");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTrigger, setConfirmTrigger] =
    useState<OverrideConfirmTrigger>("multi_axis");
  const [showICBanner, setShowICBanner] = useState(false);

  const overrideTriggerRef = useRef<HTMLButtonElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setStatus("predicted");
    setOverride(undefined);
    setNotes("");
    // Phase 71-07: keep email body open across row changes; auto-fetch.
    setBodyOpen(true);
    setBodyLoading(false);
    setBodyError(null);
    const cached = row && bodyCache.has(row.id) ? bodyCache.get(row.id)!.bodyText : null;
    setBodyText(cached);
    if (row && cached === null) {
      setBodyLoading(true);
      fetchReviewEmailBody(row.id)
        .then((res) => {
          if (res.ok) {
            bodyCache.set(row.id, { bodyText: res.bodyText, bodyHtml: res.bodyHtml });
            setBodyText(res.bodyText);
          } else {
            setBodyError(res.error);
          }
        })
        .finally(() => setBodyLoading(false));
    }
    // Phase 71-05 — reset 4-axis state when selection changes.
    setDirty({});
    setEvalType("regression");
    setSubmitting(false);
    setConfirmOpen(false);
    setShowICBanner(false);
  }, [row?.id]);

  const toggleBody = useCallback(async () => {
    if (!row) return;
    setBodyOpen((prev) => {
      const next = !prev;
      if (next && bodyText === null) {
        const cached = bodyCache.get(row.id);
        if (cached) {
          setBodyText(cached.bodyText);
        } else {
          setBodyLoading(true);
          setBodyError(null);
          fetchReviewEmailBody(row.id)
            .then((res) => {
              if (res.ok) {
                bodyCache.set(row.id, {
                  bodyText: res.bodyText,
                  bodyHtml: res.bodyHtml,
                });
                setBodyText(res.bodyText);
              } else {
                setBodyError(res.error);
              }
            })
            .catch((e: Error) => {
              setBodyError(e.message);
            })
            .finally(() => setBodyLoading(false));
        }
      }
      return next;
    });
  }, [row, bodyText]);

  const submit = useCallback(
    async (kind: "approve" | "reject" | "skip") => {
      if (!row) return;
      const result = readResult(row);
      // Mirror the render-time logic: prefer the Stage 1 event's
      // decision_details.regex_rule_id when the timeline carries it.
      const stage1Event = effectiveTimeline.find((e) => e.stage === 1);
      const stage1RuleId =
        (stage1Event?.decision_details as { regex_rule_id?: string } | null | undefined)
          ?.regex_rule_id ?? null;
      const ruleKey = stage1RuleId ?? result.predicted?.rule ?? "no_match";
      const predictedCategory =
        result.predicted?.category ?? row.topic ?? "unknown";

      const isUnknown =
        predictedCategory === "unknown" || ruleKey === "no_match";
      if (isUnknown && notes.trim().length < 10) {
        notesRef.current?.focus();
        toast.error(
          override
            ? `Briefly explain why this is ${categoryLabelByKey.get(override) ?? override}`
            : "Briefly describe this email so we can build a rule for it",
        );
        return;
      }

      // Phase 71-08: row.id is the email_id (stable client-side key);
      // recordVerdict needs the real automation_runs.id for the UPDATE +
      // agent_runs FK. The page loader threads it on as automation_run_id.
      const automationRunId = row.automation_run_id ?? row.id;
      setStatus(kind === "approve" ? "approving" : "rejecting");
      try {
        await recordVerdict({
          swarm_type: swarmType,
          automation_run_id: automationRunId,
          rule_key: ruleKey,
          decision: kind === "skip" ? "reject" : kind,
          message_id: result.message_id ?? "",
          source_mailbox: result.source_mailbox ?? "",
          entity: row.entity ?? "",
          predicted_category: predictedCategory,
          override_category: kind === "skip" ? "unknown" : override,
          notes: notes || undefined,
        });
        markPendingRemoval(row.id);

        const idx = rows.findIndex((r) => r.id === row.id);
        const isAvailable = (r: PredictedRow) =>
          r.id !== row.id && !pendingRemovalIds.has(r.id);
        let nextRow: PredictedRow | null = null;
        for (let i = idx + 1; i < rows.length; i++) {
          if (isAvailable(rows[i])) { nextRow = rows[i]; break; }
        }
        if (!nextRow) {
          for (let i = idx - 1; i >= 0; i--) {
            if (isAvailable(rows[i])) { nextRow = rows[i]; break; }
          }
        }

        const advance = () => {
          setSelected(nextRow?.id ?? null);
          const qs = new URLSearchParams(window.location.search);
          if (nextRow) qs.set("selected", nextRow.id);
          else qs.delete("selected");
          router.replace(`${window.location.pathname}?${qs.toString()}`, {
            scroll: false,
          });
        };
        const reduceMotion =
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotion) advance();
        else setTimeout(advance, 200);
      } catch {
        setStatus("failed");
        toast.error("Couldn't record verdict — try again");
      }
    },
    [
      row,
      rows,
      override,
      notes,
      setSelected,
      router,
      pendingRemovalIds,
      markPendingRemoval,
      swarmType,
      categoryLabelByKey,
      effectiveTimeline,
    ],
  );

  // ---- Phase 71-05. 4-axis override flow ---------------------------------

  // Build per-axis StageData for PipelineFlow from the timeline + dirty state.
  const stagesData: StageData[] = useMemo(() => {
    if (!row) return [];
    // Latest event per stage (timeline is ordered by stage asc, created_at asc).
    const byStage = new Map<number, PipelineTimelineEvent>();
    for (const ev of effectiveTimeline) {
      byStage.set(ev.stage, ev);
    }
    const out: StageData[] = [];
    for (const n of [1, 2, 3, 4] as const) {
      const ev = byStage.get(n);
      const dirtyKey = (`stage_${n}` as keyof DirtyState);
      const isDirty = dirty[dirtyKey] !== undefined;
      let state: StageState;
      if (isDirty) state = "dirty";
      else if (!ev) state = "skipped";
      else state = "ok";
      const currentValue = ev?.decision ?? undefined;

      let widget: React.ReactNode = null;
      if (isDirty) {
        if (n === 1) {
          widget = (
            <Stage1Widget
              categories={categories}
              value={dirty.stage_1?.categoryKey ?? null}
              onChange={(categoryKey) =>
                setDirty((d) => ({ ...d, stage_1: { categoryKey } }))
              }
            />
          );
        } else if (n === 2) {
          widget = (
            <Stage2Widget
              value={dirty.stage_2?.customer ?? null}
              onChange={(customer) =>
                setDirty((d) => ({
                  ...d,
                  stage_2: { customer, reRun: d.stage_2?.reRun ?? false },
                }))
              }
              reRun={dirty.stage_2?.reRun ?? false}
              onReRunChange={(reRun) =>
                setDirty((d) => ({
                  ...d,
                  stage_2: d.stage_2
                    ? { ...d.stage_2, reRun }
                    : {
                        customer: {
                          customer_account_id: "",
                          customer_name: "",
                        },
                        reRun,
                      },
                }))
              }
            />
          );
        } else if (n === 3) {
          widget = (
            <Stage3Widget
              intents={intents ?? []}
              value={dirty.stage_3?.intentKey ?? null}
              onChange={(intentKey) =>
                setDirty((d) => ({ ...d, stage_3: { intentKey } }))
              }
            />
          );
        } else if (n === 4) {
          widget = (
            <Stage4Widget
              quality={dirty.stage_4?.quality ?? null}
              onQualityChange={(quality) =>
                setDirty((d) => ({
                  ...d,
                  stage_4: { quality, reason: d.stage_4?.reason ?? "" },
                }))
              }
              reason={dirty.stage_4?.reason ?? ""}
              onReasonChange={(reason) =>
                setDirty((d) => ({
                  ...d,
                  stage_4: d.stage_4
                    ? { ...d.stage_4, reason }
                    : { quality: 3, reason },
                }))
              }
            />
          );
        }
      }

      out.push({
        n,
        title: STAGE_TITLES[n],
        axis: STAGE_AXES[n],
        state,
        currentValue,
        widget,
      });
    }
    return out;
  }, [row, effectiveTimeline, dirty, categories, intents]);

  const dirtyAxes = useMemo<OverrideAxis[]>(() => {
    const axes: OverrideAxis[] = [];
    if (dirty.stage_1) axes.push("stage_1_category");
    if (dirty.stage_2) axes.push("stage_2_customer");
    if (dirty.stage_3) axes.push("stage_3_intent");
    if (dirty.stage_4) axes.push("stage_4_handler_output");
    return axes;
  }, [dirty]);

  const dirtyCount = dirtyAxes.length;

  const onMarkDirty = useCallback((stageN: number) => {
    setDirty((d) => {
      const next: DirtyState = { ...d };
      if (stageN === 1 && !next.stage_1)
        next.stage_1 = { categoryKey: "" };
      if (stageN === 2 && !next.stage_2)
        next.stage_2 = {
          customer: { customer_account_id: "", customer_name: "" },
          reRun: false,
        };
      if (stageN === 3 && !next.stage_3) next.stage_3 = { intentKey: "" };
      if (stageN === 4 && !next.stage_4)
        next.stage_4 = { quality: 3, reason: "" };
      return next;
    });
  }, []);

  const discardOverride = useCallback(() => {
    setDirty({});
    setEvalType("regression");
    setConfirmOpen(false);
  }, []);

  // Build per-axis payload + POST /api/automations/debtor-email/override.
  const submitOverride = useCallback(async () => {
    if (!row) return;
    if (dirtyCount === 0) return;
    if (submitting) return;
    const emailId =
      (row.result as { email_id?: string } | null)?.email_id ?? null;
    if (!emailId) {
      toast.error("Missing email_id — cannot submit override");
      return;
    }
    setSubmitting(true);
    try {
      const timeline = effectiveTimeline;
      // Last event per stage gives us original_event_id + original_decision.
      const byStage = new Map<number, PipelineTimelineEvent>();
      for (const ev of timeline) byStage.set(ev.stage, ev);

      const payloads: Array<Record<string, unknown>> = [];

      if (dirty.stage_1) {
        const ev = byStage.get(1);
        payloads.push({
          axis: "stage_1_category",
          email_id: emailId,
          original_event_id: ev?.id ?? "00000000-0000-0000-0000-000000000000",
          original_decision: ev?.decision ?? "",
          decision: dirty.stage_1.categoryKey,
          decision_details: { category_key: dirty.stage_1.categoryKey },
          eval_type: evalType,
        });
      }
      if (dirty.stage_2) {
        const ev = byStage.get(2);
        payloads.push({
          axis: "stage_2_customer",
          email_id: emailId,
          original_event_id: ev?.id ?? "00000000-0000-0000-0000-000000000000",
          original_decision: ev?.decision ?? "",
          decision: dirty.stage_2.customer.customer_account_id,
          decision_details: {
            customer_account_id: dirty.stage_2.customer.customer_account_id,
            customer_name: dirty.stage_2.customer.customer_name,
          },
          eval_type: evalType,
          re_run_downstream: dirty.stage_2.reRun,
        });
      }
      if (dirty.stage_3) {
        const ev = byStage.get(3);
        payloads.push({
          axis: "stage_3_intent",
          email_id: emailId,
          original_event_id: ev?.id ?? "00000000-0000-0000-0000-000000000000",
          original_decision: ev?.decision ?? "",
          decision: dirty.stage_3.intentKey,
          decision_details: { intent_key: dirty.stage_3.intentKey },
          eval_type: evalType,
        });
      }
      if (dirty.stage_4) {
        const ev = byStage.get(4);
        payloads.push({
          axis: "stage_4_handler_output",
          email_id: emailId,
          original_event_id: ev?.id ?? "00000000-0000-0000-0000-000000000000",
          original_decision: ev?.decision ?? "",
          decision: "draft_quality_rated",
          decision_details: {
            draft_quality: dirty.stage_4.quality,
            reason: dirty.stage_4.reason,
          },
          eval_type: evalType,
          reason: dirty.stage_4.reason || undefined,
        });
      }

      // POST each axis sequentially. Plan 02's route handles one axis per call.
      for (const body of payloads) {
        const res = await fetch("/api/automations/debtor-email/override", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => "(no body)");
          throw new Error(`Override POST failed (${res.status}): ${errText}`);
        }
      }

      const subj =
        (row.result as ResultPayload | null)?.subject ?? "(no subject)";
      toast.success(`Override recorded for ${subj}`);
      // iController info banner — Stage 3 or Stage 4 override AND draft exists
      // (we infer "draft exists" from coordinator presence; stricter signal
      // would require a draft check API).
      const fired34 = dirty.stage_3 || dirty.stage_4;
      const draftExists = !!row.coordinator;
      if (fired34 && draftExists) {
        setShowICBanner(true);
      }
      // Reset dirty + optimistic remove + advance.
      setDirty({});
      setConfirmOpen(false);
      markPendingRemoval(row.id);
      const idx = rows.findIndex((r) => r.id === row.id);
      const isAvailable = (r: PredictedRow) =>
        r.id !== row.id && !pendingRemovalIds.has(r.id);
      let nextRow: PredictedRow | null = null;
      for (let i = idx + 1; i < rows.length; i++) {
        if (isAvailable(rows[i])) { nextRow = rows[i]; break; }
      }
      if (!nextRow) {
        for (let i = idx - 1; i >= 0; i--) {
          if (isAvailable(rows[i])) { nextRow = rows[i]; break; }
        }
      }
      const advance = () => {
        setSelected(nextRow?.id ?? null);
        const qs = new URLSearchParams(window.location.search);
        if (nextRow) qs.set("selected", nextRow.id);
        else qs.delete("selected");
        router.replace(`${window.location.pathname}?${qs.toString()}`, {
          scroll: false,
        });
      };
      // Defer advance briefly so banner registers if it should.
      setTimeout(advance, 400);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      toast.error(`Override failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  }, [
    row,
    rows,
    pendingRemovalIds,
    markPendingRemoval,
    setSelected,
    router,
    effectiveTimeline,
    dirty,
    evalType,
    dirtyCount,
    submitting,
  ]);

  // Click-Submit handler — fires confirm dialog when triggers apply, else
  // submits directly.
  const onClickSubmit = useCallback(() => {
    if (dirtyCount === 0 || submitting) return;
    // Trigger conditions per UI-SPEC §Confirmation modal:
    //   1. Stage 2 override with re_run_downstream=true.
    //   2. Stage 3 override (always).
    //   3. ≥2 axes dirty in same submission.
    if (dirtyCount >= 2) {
      setConfirmTrigger("multi_axis");
      setConfirmOpen(true);
      return;
    }
    if (dirty.stage_3) {
      setConfirmTrigger("stage_3");
      setConfirmOpen(true);
      return;
    }
    if (dirty.stage_2 && dirty.stage_2.reRun) {
      setConfirmTrigger("stage_2_rerun");
      setConfirmOpen(true);
      return;
    }
    void submitOverride();
  }, [dirty, dirtyCount, submitting, submitOverride]);

  useEffect(() => {
    const computeState = () => {
      if (!row) {
        return { unknown: false, hasOverride: false };
      }
      const r = (row.result as ResultPayload | null) ?? {};
      const rk = r.predicted?.rule ?? "no_match";
      const pc = r.predicted?.category ?? row.topic ?? "unknown";
      return {
        unknown: pc === "unknown" || rk === "no_match",
        hasOverride: !!override,
      };
    };

    const onApprove = () => {
      const s = computeState();
      if (s.unknown && !s.hasOverride) void submit("skip");
      else void submit("approve");
    };
    const onReject = () => {
      const s = computeState();
      if (s.hasOverride || s.unknown) return;
      void submit("reject");
    };
    const onSkip = () => {
      const s = computeState();
      if (s.unknown && !s.hasOverride) return;
      void submit("skip");
    };
    const onToggleBody = () => void toggleBody();
    const onFocusOverride = () => overrideTriggerRef.current?.focus();
    const onFocusNotes = () => notesRef.current?.focus();
    // Phase 71-05 — new keyboard hooks.
    const onStageFocus = (n: number) => () => onMarkDirty(n);
    const onStage1 = onStageFocus(1);
    const onStage2 = onStageFocus(2);
    const onStage3 = onStageFocus(3);
    const onStage4 = onStageFocus(4);
    const onEvalCap = () => setEvalType("capability");
    const onEvalReg = () => setEvalType("regression");
    const onOverrideSubmit = () => onClickSubmit();
    const onOverrideDiscard = () => discardOverride();
    window.addEventListener("bulk-review:approve", onApprove);
    window.addEventListener("bulk-review:reject", onReject);
    window.addEventListener("bulk-review:skip", onSkip);
    window.addEventListener("bulk-review:toggle-body", onToggleBody);
    window.addEventListener("bulk-review:focus-override", onFocusOverride);
    window.addEventListener("bulk-review:focus-notes", onFocusNotes);
    window.addEventListener("bulk-review:stage-1-focus", onStage1);
    window.addEventListener("bulk-review:stage-2-focus", onStage2);
    window.addEventListener("bulk-review:stage-3-focus", onStage3);
    window.addEventListener("bulk-review:stage-4-focus", onStage4);
    window.addEventListener("bulk-review:eval-type-capability", onEvalCap);
    window.addEventListener("bulk-review:eval-type-regression", onEvalReg);
    window.addEventListener("bulk-review:override-submit", onOverrideSubmit);
    window.addEventListener("bulk-review:override-discard", onOverrideDiscard);
    return () => {
      window.removeEventListener("bulk-review:approve", onApprove);
      window.removeEventListener("bulk-review:reject", onReject);
      window.removeEventListener("bulk-review:skip", onSkip);
      window.removeEventListener("bulk-review:toggle-body", onToggleBody);
      window.removeEventListener("bulk-review:focus-override", onFocusOverride);
      window.removeEventListener("bulk-review:focus-notes", onFocusNotes);
      window.removeEventListener("bulk-review:stage-1-focus", onStage1);
      window.removeEventListener("bulk-review:stage-2-focus", onStage2);
      window.removeEventListener("bulk-review:stage-3-focus", onStage3);
      window.removeEventListener("bulk-review:stage-4-focus", onStage4);
      window.removeEventListener("bulk-review:eval-type-capability", onEvalCap);
      window.removeEventListener("bulk-review:eval-type-regression", onEvalReg);
      window.removeEventListener("bulk-review:override-submit", onOverrideSubmit);
      window.removeEventListener("bulk-review:override-discard", onOverrideDiscard);
    };
  }, [submit, toggleBody, row, override, onMarkDirty, onClickSubmit, discardOverride]);

  if (!row) {
    return (
      <aside
        className="min-w-0 rounded-[var(--v7-radius-card)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] p-8 flex items-center justify-center"
        aria-label="Detail pane (no selection)"
      >
        <p className="text-[14px] text-[var(--v7-muted)] text-center">
          Select a row from the list to review it.
        </p>
      </aside>
    );
  }

  // Phase 64-05 (SAFE-02 / SAFE-04 / BUDG-03). Stage 0 safety_review rows
  // get a dedicated detail pane variant. Body cache reuse: the safety pane
  // can highlight matched_span against the live email body when available.
  if (row.topic === "safety_review") {
    const cachedBody = bodyCache.get(row.id)?.bodyText ?? bodyText ?? null;
    return (
      <aside
        className="min-w-0 rounded-[var(--v7-radius-card)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] p-5 flex flex-col gap-4"
        aria-label="Safety review detail pane"
      >
        <h2 className="text-[20px] font-semibold leading-[1.3] font-[family-name:var(--font-cabinet)] break-words">
          Stage 0 safety review
        </h2>
        <SafetyDetailPane row={row} bodyText={cachedBody} />
        {row.median_cost_cents !== undefined &&
          row.sample_count !== undefined && (
            <CostOutlierAxisCard
              cost_cents={row.cost_cents ?? 0}
              median_cost_cents={row.median_cost_cents}
              sample_count={row.sample_count}
            />
          )}
      </aside>
    );
  }

  const result = readResult(row);
  const subject = result.subject ?? "(no subject)";
  const sender = result.fromName
    ? `${result.fromName} <${result.from ?? "unknown"}>`
    : (result.from ?? "unknown sender");
  // Stage 1 (regex routing) emits decision_details.regex_rule_id when a
  // rule fires. The view-driven row mapper doesn't expose that field, so
  // read it from the preloaded timeline first; fall back to legacy
  // result.predicted.rule for callers that still pass automation_runs
  // shapes through.
  const stage1Event = effectiveTimeline.find((e) => e.stage === 1);
  const stage1RuleId =
    (stage1Event?.decision_details as { regex_rule_id?: string } | null | undefined)
      ?.regex_rule_id ?? null;
  const ruleKey = stage1RuleId ?? result.predicted?.rule ?? "no_match";
  const predictedCategory =
    result.predicted?.category ?? row.topic ?? "unknown";
  const sentTime = new Date(row.created_at).toLocaleString("en-GB");
  const pill = statusPillColor(status);
  const busy = status === "approving" || status === "rejecting";

  const isUnknownBucket =
    predictedCategory === "unknown" || ruleKey === "no_match";
  const hasOverride = !!override;
  const notesRequired = isUnknownBucket;
  const notesValid = !notesRequired || notes.trim().length >= 10;
  const overrideLabel = override
    ? categoryLabelByKey.get(override) ?? override
    : "";

  return (
    <aside
      className="min-w-0 rounded-[var(--v7-radius-card)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] p-5 flex flex-col gap-4"
      aria-label="Detail pane"
    >
      {/* 1. Status pill */}
      <div>
        <span
          className="px-[9px] py-[6px] rounded-[var(--v7-radius-pill)] text-[11.8px] leading-[1.2] border border-[var(--v7-line)]"
          style={{ background: pill.bg, color: pill.fg }}
        >
          {statusPillCopy(status)}
        </span>
      </div>

      {/* 2. Wrapped subject */}
      <h2 className="text-[20px] font-semibold leading-[1.3] font-[family-name:var(--font-cabinet)] break-words">
        {subject}
      </h2>

      {/* 3. Meta grid */}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-[13px] min-w-0">
        <dt className="text-[var(--v7-muted)]">From</dt>
        <dd className="truncate min-w-0">{sender}</dd>
        <dt className="text-[var(--v7-muted)]">Sent</dt>
        <dd style={{ fontVariantNumeric: "tabular-nums" }}>{sentTime}</dd>
        <dt className="text-[var(--v7-muted)]">Mailbox</dt>
        <dd>{result.source_mailbox || mailboxLabel(row.mailbox_id, swarmType)}</dd>
        <dt className="text-[var(--v7-muted)]">Topic/Entity</dt>
        <dd className="truncate min-w-0">
          {row.topic ?? "(no topic)"} · {row.entity ?? "(no entity)"}
        </dd>
        <dt className="text-[var(--v7-muted)]">Rule fired</dt>
        <dd>
          <code className="font-mono text-[12px]">{ruleKey}</code>
        </dd>
        <dt className="text-[var(--v7-muted)]">Predicted action</dt>
        <dd>{predictedCategory}</dd>
      </dl>

      {/* 4. Body expander */}
      <div>
        <button
          type="button"
          onClick={toggleBody}
          className="inline-flex items-center gap-2 text-[13px] underline text-[var(--v7-text)]"
        >
          <MailOpen size={16} />
          {bodyOpen ? "Hide email" : "Show full email"}
        </button>
        {bodyOpen && (
          <div
            className="mt-2 bg-black/20 border border-[var(--v7-line)] rounded-[var(--v7-radius-sm)] max-h-[40vh] overflow-auto p-3 text-[13px]"
            style={{ whiteSpace: "pre-wrap" }}
          >
            {bodyLoading
              ? "Loading…"
              : bodyError
                ? <span className="text-[var(--v7-red)]">{bodyError}</span>
                : (bodyText ?? "")}
          </div>
        )}
      </div>

      {/* 4a. Phase 67-06 (D-08, R-03, TAG-03 surface). Tagging artifacts
              section — rendered only when the row's iController tagging
              side-effect failed. Surfaces error text + before/after
              screenshot links so operators can audit the failure inline.
              Phase 71 will add a retry-tagging action. */}
      {row.tagging && (
        <section className="mt-2" data-testid="tagging-artifacts">
          <h3 className="text-[13px] font-semibold leading-[1.4] mb-1">
            Tagging artifacts
          </h3>
          <p className="text-[12px] leading-[1.4] text-[var(--v7-muted)] mb-2">
            Status:{" "}
            <code className="font-mono">
              {row.tagging.icontroller_tag_status}
            </code>
          </p>
          {row.tagging.error && (
            <pre
              className="text-[11px] leading-[1.4] whitespace-pre-wrap p-2 rounded-[var(--v7-radius-sm)] mb-2 border border-[var(--v7-line)]"
              style={{
                background: "rgba(239, 68, 68, 0.10)",
                color: "var(--v7-text)",
              }}
            >
              {row.tagging.error}
            </pre>
          )}
          <div className="flex gap-3 flex-wrap">
            {row.tagging.screenshot_before_url && (
              <a
                href={row.tagging.screenshot_before_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] underline text-[var(--v7-text)]"
              >
                before screenshot
              </a>
            )}
            {row.tagging.screenshot_after_url && (
              <a
                href={row.tagging.screenshot_after_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] underline text-[var(--v7-text)]"
              >
                after screenshot
              </a>
            )}
          </div>
        </section>
      )}

      {/* Phase 71-05. 4-axis pipeline override flow.
          Renders above the legacy single-stage Override dropdown so the
          existing approve/reject keyboard semantics keep working while
          operators learn the new flow. The legacy Select is preserved for
          back-compat per Plan 71-05 §preserve existing behavior. */}
      {stagesData.length > 0 && (
        <section
          className="mt-2 flex flex-col gap-3"
          aria-label="Pipeline overrides"
          data-testid="pipeline-overrides"
        >
          <h3 className="text-[14px] font-semibold leading-[1.3]">
            Pipeline overrides
          </h3>
          <PipelineFlow stages={stagesData} onMarkDirty={onMarkDirty} />

          {dirtyCount > 0 && (
            <>
              <EvalTypeRadio value={evalType} onChange={setEvalType} />
              <div className="flex items-center justify-end gap-2 mt-2">
                <Button
                  variant="ghost"
                  onClick={discardOverride}
                  disabled={submitting}
                >
                  Discard changes
                  <kbd className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70">
                    Esc
                  </kbd>
                </Button>
                <Button
                  variant="default"
                  onClick={onClickSubmit}
                  disabled={submitting || dirtyCount === 0}
                  style={{
                    background: "var(--v7-brand-primary)",
                    color: "#fff",
                  }}
                >
                  {submitting
                    ? "Submitting override…"
                    : dirtyCount === 1
                      ? "Submit override (1 stage dirty)"
                      : `Submit override (${dirtyCount} stages dirty)`}
                  <kbd className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70">
                    ⌘⏎
                  </kbd>
                </Button>
              </div>
            </>
          )}

          {showICBanner && (
            <IControllerInfoBanner
              iControllerDraftId={
                row.tagging?.icontroller_tag_status ?? "unknown"
              }
              onDismiss={() => setShowICBanner(false)}
            />
          )}
        </section>
      )}

      <OverrideConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        trigger={confirmTrigger}
        extra={{
          handler_key: dirty.stage_3?.intentKey,
          axis_count: dirtyCount,
          axis_list: dirtyAxes,
        }}
        onConfirm={() => {
          setConfirmOpen(false);
          void submitOverride();
        }}
        onDismiss={() => setConfirmOpen(false)}
      />

      {/* Phase 71-07: legacy "Set rule (category) + describe + Save & Skip"
          chrome removed. The 4-axis Pipeline overrides flow above is the
          canonical surface. Approve/Reject for non-override rows is reachable
          via keyboard (Enter / Space / n) handled in keyboard-shortcuts.tsx. */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {!hasOverride && !isUnknownBucket && (
          <>
            <Button
              onClick={() => submit("approve")}
              disabled={busy}
              style={{ background: "var(--v7-brand-primary)", color: "#fff" }}
            >
              <Check size={16} className="mr-1.5" />
              Approve
              <kbd className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70">
                ⏎
              </kbd>
            </Button>
            <Button
              variant="outline"
              onClick={() => submit("reject")}
              disabled={busy}
              style={{ borderColor: "var(--v7-red)", color: "var(--v7-red)" }}
            >
              <X size={16} className="mr-1.5" />
              Reject
              <kbd className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70">
                Space
              </kbd>
            </Button>
          </>
        )}

        {!(isUnknownBucket && !hasOverride) && (
          <Button variant="ghost" onClick={() => submit("skip")} disabled={busy}>
            <SkipForward size={16} className="mr-1.5" />
            Skip
            <kbd className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70">
              n
            </kbd>
          </Button>
        )}
      </div>
    </aside>
  );
}
