import { Badge } from "@/components/ui/badge";
import { ReviewActions } from "./review-actions";

type FlaggedRowData = {
  id: string;
  employee_name: string;
  employee_category: string | null;
  rule_type: string;
  severity: string;
  day_date: string | null;
  week_number: number | null;
  raw_values: Record<string, unknown>;
  description: string;
  suppressed_by_exception: boolean;
  uren_controle_reviews: Array<{
    decision: string;
    reason: string | null;
    reviewer_email: string | null;
    created_at: string;
  }> | null;
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function TinyPanel({
  tone,
  title,
  children,
}: {
  tone: "teal" | "amber" | "red" | "lime";
  title: string;
  children: React.ReactNode;
}) {
  const toneMap = {
    teal: {
      bg: "bg-[var(--v7-teal-soft)]",
      title: "text-[var(--v7-teal)]",
    },
    amber: {
      bg: "bg-[var(--v7-amber-soft)]",
      title: "text-[var(--v7-amber)]",
    },
    red: {
      bg: "bg-rose-500/15",
      title: "text-rose-700 dark:text-rose-300",
    },
    lime: {
      bg: "bg-emerald-500/15",
      title: "text-emerald-700 dark:text-emerald-300",
    },
  }[tone];
  return (
    <div className={`rounded-[var(--v7-radius-sm)] ${toneMap.bg} p-3 text-[13px] text-[var(--v7-text)]`}>
      <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] ${toneMap.title}`}>
        {title}
      </p>
      {children}
    </div>
  );
}

function ExplainerNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--v7-radius-sm)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] p-3 text-[12px] leading-[1.5] text-[var(--v7-muted)]">
      {children}
    </div>
  );
}

function TntMismatchDetail({ raw }: { raw: Record<string, unknown> }) {
  const diffs = raw.diffs as Record<string, number> | undefined;
  const biggestLabel = diffs
    ? Object.entries(diffs).sort((a, b) => b[1] - a[1])[0]
    : null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[var(--v7-text)]">
        T&amp;T en urenbriefje komen niet overeen
      </p>
      <div className="grid grid-cols-2 gap-2">
        <TinyPanel tone="teal" title="Track & Trace (automatisch)">
          <p>Aanvang rit: <strong>{String(raw.iar ?? "—")}</strong></p>
          <p>Aanvang werk: <strong>{String(raw.iaw ?? "—")}</strong></p>
          <p>Einde werk: <strong>{String(raw.iew ?? "—")}</strong></p>
          <p>Einde rit: <strong>{String(raw.ier ?? "—")}</strong></p>
        </TinyPanel>
        <TinyPanel tone="amber" title="Urenbriefje (handmatig)">
          <p>Aanvang rit: <strong>{String(raw.uar ?? "—")}</strong></p>
          <p>Aanvang werk: <strong>{String(raw.uaw ?? "—")}</strong></p>
          <p>Einde werk: <strong>{String(raw.uew ?? "—")}</strong></p>
          <p>Einde rit: <strong>{String(raw.uer ?? "—")}</strong></p>
        </TinyPanel>
      </div>
      {biggestLabel && (
        <p className="text-xs text-[var(--v7-muted)]">
          Grootste afwijking: <strong className="text-[var(--v7-text)]">{biggestLabel[0]}</strong> — {biggestLabel[1]} minuten verschil
        </p>
      )}
      <ExplainerNote>
        <strong>Accepteren</strong> = T&amp;T klopt, urenbriefje had een fout. T&amp;T-tijd wordt definitief. &nbsp;|&nbsp;
        <strong>Afwijzen</strong> = Urenbriefje klopt, T&amp;T moet worden gecorrigeerd.
      </ExplainerNote>
    </div>
  );
}

function VerschilDetail({ raw, date }: { raw: Record<string, unknown>; date: string | null }) {
  const verschil = raw.verschil as number | undefined;
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[var(--v7-text)]">
        Medewerker heeft op {formatDate(date)} <strong>+{verschil} uur</strong> meer gewerkt dan verwacht
      </p>
      <ExplainerNote>
        <strong>Accepteren</strong> = Overwerk klopt (bijv. spoedklus, noodgeval). Geen actie nodig. &nbsp;|&nbsp;
        <strong>Afwijzen</strong> = Registratiefout. Uren moeten worden gecorrigeerd.
      </ExplainerNote>
    </div>
  );
}

function WeekendFlipDetail({ raw }: { raw: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[var(--v7-text)]">
        Vrijdag staat leeg, maar zaterdag zijn uren ingevuld
      </p>
      <div className="grid grid-cols-2 gap-2">
        <TinyPanel tone="red" title={`Vrijdag ${String(raw.fridayDate ?? "")}`}>
          <p>Gewerkt: <strong>{String(raw.fridayGewerkt ?? 0)} uur</strong></p>
        </TinyPanel>
        <TinyPanel tone="lime" title={`Zaterdag ${String(raw.saturdayDate ?? "")}`}>
          <p>Gewerkt: <strong>{String(raw.saturdayGewerkt ?? "?")} uur</strong></p>
        </TinyPanel>
      </div>
      <ExplainerNote>
        <strong>Accepteren</strong> = Medewerker werkte echt op zaterdag. Registratie is correct. &nbsp;|&nbsp;
        <strong>Afwijzen</strong> = Uren staan op verkeerde dag. Verplaats naar vrijdag.
      </ExplainerNote>
    </div>
  );
}

function VerzuimDetail({ raw }: { raw: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[var(--v7-text)]">
        Zowel ziekte als verlof geregistreerd op dezelfde dag
      </p>
      <p className="text-sm text-[var(--v7-text)]">
        Opmerking in BCS: <strong>&ldquo;{String(raw.opmerking ?? "—")}&rdquo;</strong>
      </p>
      <ExplainerNote>
        <strong>Accepteren</strong> = Beide registraties kloppen (bijzondere situatie). &nbsp;|&nbsp;
        <strong>Afwijzen</strong> = Dubbele BCS-registratie. Verwijder één van de twee.
      </ExplainerNote>
    </div>
  );
}

export function FlaggedRow({ row }: { row: FlaggedRowData }) {
  const review = row.uren_controle_reviews?.[0];
  const isSuppressed = row.suppressed_by_exception;
  const isReviewed = !!review;

  const containerClasses = isSuppressed
    ? "border-[var(--v7-line)] bg-[var(--v7-panel-2)] opacity-60"
    : isReviewed
      ? "border-emerald-500/30 bg-emerald-500/10"
      : "border-[var(--v7-line)] bg-[var(--v7-panel)]";

  return (
    <div
      className={`flex flex-col gap-3 rounded-[var(--v7-radius-sm)] border p-4 ${containerClasses}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-[var(--v7-text)]">
          {formatDate(row.day_date)}
        </span>
        {row.week_number && (
          <span className="text-xs text-[var(--v7-muted)]">(week {row.week_number})</span>
        )}
        {isSuppressed && (
          <Badge variant="outline" className="border-[var(--v7-line)] text-[var(--v7-muted)]">
            Uitzondering
          </Badge>
        )}
        {isReviewed && (
          <Badge
            variant="outline"
            className={
              review.decision === "accept"
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300"
            }
          >
            {review.decision === "accept" ? "✓ Geaccepteerd" : "✗ Afgewezen"}
          </Badge>
        )}
      </div>

      {/* Rule-specific detail */}
      {!isSuppressed && (
        <>
          {row.rule_type === "tnt_mismatch" && (
            <TntMismatchDetail raw={row.raw_values} />
          )}
          {row.rule_type === "verschil_outlier" && (
            <VerschilDetail raw={row.raw_values} date={row.day_date} />
          )}
          {row.rule_type === "weekend_flip" && (
            <WeekendFlipDetail raw={row.raw_values} />
          )}
          {row.rule_type === "verzuim_bcs_duplicate" && (
            <VerzuimDetail raw={row.raw_values} />
          )}
        </>
      )}

      {/* Review result */}
      {isReviewed && review.reason && (
        <p className="text-xs italic text-[var(--v7-muted)]">
          Reden: {review.reason} — door {review.reviewer_email ?? "onbekend"} op{" "}
          {new Date(review.created_at).toLocaleDateString("nl-NL")}
        </p>
      )}

      {/* Actions */}
      {!isReviewed && !isSuppressed && <ReviewActions flaggedRowId={row.id} />}
    </div>
  );
}
