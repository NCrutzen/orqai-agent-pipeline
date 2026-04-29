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
import type { PredictedRow } from "./page";
import type { SwarmCategoryRow } from "@/lib/swarms/types";
import { useSelection } from "./selection-context";

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
}

export function DetailPane({
  rows,
  initialSelectedRow,
  swarmType,
  categories,
  // drawerFields reserved for future config-driven meta-grid; the existing
  // 6-field grid matches debtor-email's drawer_fields seed verbatim.
  drawerFields: _drawerFields,
}: DetailPaneProps) {
  const { selectedId, setSelected, pendingRemovalIds, markPendingRemoval } =
    useSelection();
  const router = useRouter();

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

  const [bodyOpen, setBodyOpen] = useState(false);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState<string | null>(null);

  const overrideTriggerRef = useRef<HTMLButtonElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setStatus("predicted");
    setOverride(undefined);
    setNotes("");
    setBodyOpen(false);
    setBodyLoading(false);
    setBodyError(null);
    setBodyText(row && bodyCache.has(row.id) ? bodyCache.get(row.id)!.bodyText : null);
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
      const ruleKey = result.predicted?.rule ?? "no_match";
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

      setStatus(kind === "approve" ? "approving" : "rejecting");
      try {
        await recordVerdict({
          swarm_type: swarmType,
          automation_run_id: row.id,
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
    ],
  );

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
    window.addEventListener("bulk-review:approve", onApprove);
    window.addEventListener("bulk-review:reject", onReject);
    window.addEventListener("bulk-review:skip", onSkip);
    window.addEventListener("bulk-review:toggle-body", onToggleBody);
    window.addEventListener("bulk-review:focus-override", onFocusOverride);
    window.addEventListener("bulk-review:focus-notes", onFocusNotes);
    return () => {
      window.removeEventListener("bulk-review:approve", onApprove);
      window.removeEventListener("bulk-review:reject", onReject);
      window.removeEventListener("bulk-review:skip", onSkip);
      window.removeEventListener("bulk-review:toggle-body", onToggleBody);
      window.removeEventListener("bulk-review:focus-override", onFocusOverride);
      window.removeEventListener("bulk-review:focus-notes", onFocusNotes);
    };
  }, [submit, toggleBody, row, override]);

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

  const result = readResult(row);
  const subject = result.subject ?? "(no subject)";
  const sender = result.fromName
    ? `${result.fromName} <${result.from ?? "unknown"}>`
    : (result.from ?? "unknown sender");
  const ruleKey = result.predicted?.rule ?? "no_match";
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
        <dd>{mailboxLabel(row.mailbox_id, swarmType)}</dd>
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

      {/* 5. Override dropdown — driven by registry. */}
      <div>
        <label className="block text-[12px] text-[var(--v7-muted)] mb-1">
          {isUnknownBucket ? "Set rule (category)" : "Override category"}
        </label>
        <Select
          value={override ?? ""}
          onValueChange={(v) => setOverride(v)}
        >
          <SelectTrigger ref={overrideTriggerRef} className="w-full">
            <SelectValue
              placeholder={
                isUnknownBucket
                  ? "Pick a category for this email"
                  : "Use predicted category"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {overrideOptions.map((c) => (
              <SelectItem key={c.category_key} value={c.category_key}>
                {c.display_label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 6. Notes textarea */}
      <div>
        <label className="block text-[12px] text-[var(--v7-muted)] mb-1">
          {isUnknownBucket
            ? hasOverride
              ? `Why is this ${overrideLabel}?`
              : "Briefly describe this email — helps us build a rule"
            : "Notes"}
          {notesRequired && <span className="text-[var(--v7-red)]"> *</span>}
        </label>
        <Textarea
          ref={notesRef}
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            isUnknownBucket
              ? hasOverride
                ? "e.g. Sender always sends remittance advice for invoices"
                : "Who sent this? What is it about? What action is expected?"
              : "Notes (optional)"
          }
          aria-required={notesRequired}
          aria-invalid={notesRequired && !notesValid}
          className="text-[13px]"
        />
      </div>

      {/* 7. Action bar */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {hasOverride ? (
          <Button
            onClick={() => submit("approve")}
            disabled={busy || (notesRequired && !notesValid)}
            style={{ background: "var(--v7-brand-primary)", color: "#fff" }}
          >
            <Check size={16} className="mr-1.5" />
            {`Apply ${overrideLabel}`}
            <kbd className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70">
              ⏎
            </kbd>
          </Button>
        ) : isUnknownBucket ? (
          <Button
            onClick={() => submit("skip")}
            disabled={busy || (notesRequired && !notesValid)}
            style={{ background: "var(--v7-brand-primary)", color: "#fff" }}
          >
            <SkipForward size={16} className="mr-1.5" />
            Save & Skip
            <kbd className="ml-2 px-1.5 py-0.5 rounded-[4px] bg-black/30 text-[11px] font-mono opacity-70">
              ⏎
            </kbd>
          </Button>
        ) : (
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
