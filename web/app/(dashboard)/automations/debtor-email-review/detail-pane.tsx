"use client";

// Phase 61-02 (D-DETAIL-PANE / D-DETAIL-BODY-LAZY / D-DETAIL-OVERRIDE /
// D-DETAIL-NOTES / D-DETAIL-ACTIONS / D-AUTO-ADVANCE / D-PREFETCH-NEXT).
//
// Right-column detail UI for the bulk-review screen. Receives the selected
// row from page.tsx (server fetch via ?selected=<id>) plus the visible
// rows array for next-row computation in the auto-advance path.
//
// Layout (top -> bottom):
//   1. Status pill (predicted / approving / rejecting / failed)
//   2. Wrapped subject (Cabinet 20px)
//   3. Meta grid — From, Sent, Mailbox, Topic/Entity, Rule fired, Predicted action
//   4. Body section — collapsed default, "Show full email" lazy-fetches via
//      fetchReviewEmailBody and caches in a module-level Map so re-opens are
//      instant. Hover on a row strip primes the same Map via the exported
//      prefetchReviewEmailBody helper (D-PREFETCH-NEXT).
//   5. Override category dropdown — 5 options (D-DETAIL-OVERRIDE)
//   6. Notes textarea — 3 rows, ≤2000 chars (D-DETAIL-NOTES)
//   7. Action bar — Approve(⏎) / Reject(Space) / Skip(n) (D-DETAIL-ACTIONS)
//
// Submit handler routes the verdict through recordVerdict, then auto-
// advances the URL to the next row in `rows` within 200ms of the response.
// Skip submits override_category='unknown' which the server-action routes
// to decision='reject' (the prior `labelOnly` semantic).
//
// Keyboard CustomEvents from KeyboardShortcuts wire to the same handlers
// here so `e`/`r`/`/`/⏎/Space/n keep parity with mouse interactions.

import {
  useCallback,
  useEffect,
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
import type { OverrideCategory } from "./categories";
import type { PredictedRow } from "./page";
import { useSelection } from "./selection-context";

// ---- Body cache (module-level so prefetch survives detail-pane remounts) -

interface CachedBody {
  bodyText: string;
  bodyHtml: string | null;
}
const bodyCache = new Map<string, CachedBody>();
const inFlight = new Map<string, Promise<CachedBody | null>>();

/** Prime the body cache without rendering anything. Called from row-strip
 *  on hover (D-PREFETCH-NEXT). Safe to call repeatedly — no-ops on cache hit
 *  or in-flight fetch. Errors are swallowed silently; the user-triggered
 *  open will surface a real error in-pane. */
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

// Human-readable labels for the override dropdown + "Apply <Cat>" button.
// Order = display order in the dropdown.
const CATEGORY_LABELS: Record<Exclude<OverrideCategory, "unknown">, string> = {
  payment: "Payment",
  auto_reply: "Auto-reply",
  ooo_temporary: "OOO (temporary)",
  ooo_permanent: "OOO (permanent)",
};

const MAILBOX_LABELS: Record<number, string> = {
  1: "Sicli Noord",
  2: "Sicli Sud",
  3: "Berki",
  4: "Smeba",
  5: "Smeba Fire",
  6: "FireControl",
};

function mailboxLabel(id: number | null): string {
  if (id === null) return "(no mailbox)";
  return MAILBOX_LABELS[id] ?? `mailbox ${id}`;
}

// Status pill copy/colour — moved verbatim from the old row-strip (60-05).
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
  // Server-fetched fallback when the URL had ?selected=<id> on initial load
  // and that id is not in the visible rows[] window (e.g., older than the
  // 100-row page). Once user selects something else, this falls out of use.
  initialSelectedRow: PredictedRow | null;
}

export function DetailPane({ rows, initialSelectedRow }: DetailPaneProps) {
  const { selectedId, setSelected } = useSelection();
  const router = useRouter();

  const row =
    rows.find((r) => r.id === selectedId) ??
    (initialSelectedRow && initialSelectedRow.id === selectedId
      ? initialSelectedRow
      : null);

  const [status, setStatus] = useState<RowStatus>("predicted");
  const [override, setOverride] = useState<OverrideCategory | undefined>(
    undefined,
  );
  const [notes, setNotes] = useState("");

  // Body expander state — cached per row.id
  const [bodyOpen, setBodyOpen] = useState(false);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState<string | null>(null);

  const overrideTriggerRef = useRef<HTMLButtonElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Reset per-row state when the selected row changes.
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
              // Should be unreachable now that the action returns a result,
              // but keep a defensive net for runtime/network failures.
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

      // Unknown-bucket gate: reviewer must explain the email so we can mine
      // it for new rules. Block submit + focus the notes field.
      const isUnknown =
        predictedCategory === "unknown" || ruleKey === "no_match";
      if (isUnknown && notes.trim().length < 10) {
        notesRef.current?.focus();
        toast.error(
          override
            ? `Briefly explain why this is ${CATEGORY_LABELS[override as Exclude<OverrideCategory, "unknown">] ?? override}`
            : "Briefly describe this email so we can build a rule for it",
        );
        return;
      }

      setStatus(kind === "approve" ? "approving" : "rejecting");
      try {
        await recordVerdict({
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
        // Auto-advance — pick the next row id from props.rows. We need
        // BOTH instant client feedback (the next row appears immediately
        // in the detail pane) AND a server re-fetch so the verdict-flipped
        // row drops out of rows[].
        //
        // Implementation note: router.refresh() re-fetches against Next's
        // internally-tracked URL — history.replaceState (from setSelected)
        // only updates the address bar, NOT Next's router state. So a
        // refresh after replaceState comes back with the stale ?selected=
        // (the just-approved row), the row is gone from rows[], and
        // DetailPane shows the empty placeholder. Using router.replace
        // updates Next's state AND triggers the re-fetch in one go.
        const idx = rows.findIndex((r) => r.id === row.id);
        const nextRow = rows[idx + 1] ?? rows[idx - 1] ?? null;
        const advance = () => {
          // Instant client-side feedback while the server roundtrip flies.
          setSelected(nextRow?.id ?? null);
          // Sync Next's router state and trigger the RSC re-fetch.
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
    [row, rows, override, notes, setSelected, router],
  );

  // Wire CustomEvents from KeyboardShortcuts. The handlers respect the
  // adaptive action bar so keyboard shortcuts match what's visible:
  //   - Enter (approve) → primary action (Approve / Apply / Save & Skip)
  //   - Space (reject)  → no-op when Reject is hidden (override set OR unknown bucket)
  //   - n     (skip)    → no-op when Skip is hidden (unknown + no override)
  useEffect(() => {
    // Recompute bucket/override state at event time so the latest UI state
    // is used (these locals are also computed below the early-return for
    // !row, so we re-derive here to keep the listener self-contained).
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
      // Primary action: in unknown bucket without an override, the primary
      // is "Save & Skip"; everywhere else the primary is the approve path
      // (which the action.ts override-routing turns into Apply when an
      // override differs from predicted).
      if (s.unknown && !s.hasOverride) void submit("skip");
      else void submit("approve");
    };
    const onReject = () => {
      const s = computeState();
      // Reject is only visible when there is no override AND we are not in
      // the unknown bucket — match the UI to avoid invisible side effects.
      if (s.hasOverride || s.unknown) return;
      void submit("reject");
    };
    const onSkip = () => {
      const s = computeState();
      // Skip is hidden in unknown+no-override (the primary IS Save & Skip
      // there). The Enter handler covers that case; n in that state no-ops.
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

  // Unknown bucket = AI couldn't classify (rule=no_match or predicted=unknown).
  // Reviewer always provides a context note here so we can mine for new rules.
  const isUnknownBucket =
    predictedCategory === "unknown" || ruleKey === "no_match";
  const hasOverride = !!override;
  const notesRequired = isUnknownBucket;
  const notesValid = !notesRequired || notes.trim().length >= 10;

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
        <dd>{mailboxLabel(row.mailbox_id)}</dd>
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

      {/* 5. Override dropdown — "Unknown (skip)" removed; the dedicated
          Skip button covers that semantic without polluting the category
          choices. Reviewer either picks a real category or hits Skip. */}
      <div>
        <label className="block text-[12px] text-[var(--v7-muted)] mb-1">
          {isUnknownBucket ? "Set rule (category)" : "Override category"}
        </label>
        <Select
          value={override ?? ""}
          onValueChange={(v) => setOverride(v as OverrideCategory)}
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
            <SelectItem value="payment">{CATEGORY_LABELS.payment}</SelectItem>
            <SelectItem value="auto_reply">{CATEGORY_LABELS.auto_reply}</SelectItem>
            <SelectItem value="ooo_temporary">{CATEGORY_LABELS.ooo_temporary}</SelectItem>
            <SelectItem value="ooo_permanent">{CATEGORY_LABELS.ooo_permanent}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 6. Notes textarea — required in unknown bucket so we can mine the
          reviewer's reasoning for new rules / automations. Label adapts to
          whether the reviewer has set a category yet. */}
      <div>
        <label className="block text-[12px] text-[var(--v7-muted)] mb-1">
          {isUnknownBucket
            ? hasOverride
              ? `Why is this ${CATEGORY_LABELS[override as Exclude<OverrideCategory, "unknown">] ?? override}?`
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

      {/* 7. Action bar — adapts to bucket + override state.
          - Unknown + override:   [Apply <Cat>]
          - Unknown + no override: [Save & Skip]      (records notes for rule mining)
          - Known   + override:   [Apply <Cat>] [Skip]
          - Known   + no override: [Approve] [Reject] [Skip]                 */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {hasOverride ? (
          <Button
            onClick={() => submit("approve")}
            disabled={busy || (notesRequired && !notesValid)}
            style={{ background: "var(--v7-brand-primary)", color: "#fff" }}
          >
            <Check size={16} className="mr-1.5" />
            {`Apply ${CATEGORY_LABELS[override as Exclude<OverrideCategory, "unknown">] ?? override}`}
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

        {/* Skip stays available except in unknown+no-override (where the
            primary "Save & Skip" already IS the skip path). */}
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
