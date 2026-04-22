"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/ui/glass-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  executeReviewDecisions,
  fetchReviewEmailBody,
  type ExecuteResult,
  type ReviewDecision,
} from "./actions";
import type { Category } from "@/lib/debtor-email/classify";

interface Prediction {
  id: string;
  subject: string;
  from: string;
  fromName: string;
  receivedAt: string;
  bodyPreview: string;
  category: Category;
  confidence: number;
  matchedRule: string;
  confidenceBand: "high" | "medium" | "low";
  alreadyCategorized: boolean;
}

interface Group {
  key: string;
  category: Category;
  confidenceBand: string;
  count: number;
  items: Prediction[];
}

const CATEGORY_NL: Record<Category, string> = {
  auto_reply: "Auto-Reply",
  ooo_temporary: "Out-of-Office (tijdelijk)",
  ooo_permanent: "Out-of-Office (permanent)",
  payment_admittance: "Betalingsbevestiging",
  unknown: "Onbekend",
};

const ACTIONABLE_CATEGORIES: Category[] = [
  "auto_reply",
  "ooo_temporary",
  "ooo_permanent",
  "payment_admittance",
];

// Keep in sync with LABEL_ONLY_CATEGORIES in actions.ts. These categories
// get the Outlook label but are NOT archived — a human must update NXT
// with the new contact address first.
const LABEL_ONLY_CATEGORIES = new Set<Category>(["ooo_permanent"]);

// Lijst van bestaande classifier-regels waarnaar de reviewer bij een
// Onbekend hand-pick kan hinten ("deze mail zou onder deze regel
// moeten vallen maar de regex miste 'm"). Gebruikt voor gerichte
// classifier-uitbreiding — zie telemetry result.rule_hint.
const RULE_HINTS: Array<{ value: string; label: string; cat: Category }> = [
  { value: "subject_acknowledgement", label: "subject_acknowledgement (ack/ontvangstbevestiging)", cat: "auto_reply" },
  { value: "subject_ticket_ref", label: "subject_ticket_ref (ticketnummer / procesnummer)", cat: "auto_reply" },
  { value: "reply_prefix+system_sender", label: "reply_prefix+system_sender (RE:/FW: van noreply@)", cat: "auto_reply" },
  { value: "reply_prefix+ap_automation_sender", label: "reply_prefix+ap_automation_sender (Basware/Blue10/Tradeshift)", cat: "auto_reply" },
  { value: "subject_autoreply", label: "subject_autoreply (Automatisch antwoord / OoO subject)", cat: "auto_reply" },
  { value: "subject_autoreply+body_temporary", label: "subject_autoreply+body_temporary (tijdelijk weg)", cat: "ooo_temporary" },
  { value: "subject_autoreply+body_mailbox_retired", label: "body_mailbox_retired (mailbox retired / nieuw adres)", cat: "ooo_permanent" },
  { value: "payment_subject", label: "payment_subject (Betalingsbevestiging / Zahlungsavis)", cat: "payment_admittance" },
  { value: "payment_sender+subject", label: "payment_sender+subject (role-sender + payment-subject)", cat: "payment_admittance" },
  { value: "subject_paid_marker", label: "subject_paid_marker (gemarkeerd als Betaald)", cat: "payment_admittance" },
  { value: "blocked_submission_rejected", label: "blocked_submission_rejected (systeem wijst submit af)", cat: "unknown" },
  { value: "NEW_RULE_NEEDED", label: "⚠ Nieuwe regel nodig (geen bestaande past)", cat: "unknown" },
];

const BAND_COLOR: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  low: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const BAND_LABEL: Record<string, string> = {
  high: "Hoog (≥0.90)",
  medium: "Gemiddeld (0.80–0.89)",
  low: "Laag (<0.80)",
};

type RowState = {
  include: boolean;
  override: Category | ""; // "" = keep predicted
  notes: string;
  // Optionele hint: welke classifier-regel had moeten matchen volgens
  // de reviewer. Alleen relevant bij Onbekend hand-picks.
  ruleHint: string;
};

interface Props {
  mailbox: string;
  fetchedAt: string;
  totalFetched: number;
  fetchLimit: number;
  unknownCount: number;
  groups: Group[];
  fetchError: string | null;
  // ISO timestamp of the current "before" filter (null = newest window).
  beforeCursor: string | null;
  // Oldest receivedAt in the current window — cursor for the next older page.
  // Null when fewer than fetchLimit items were returned (end of inbox).
  olderCursor: string | null;
  // Count of messages in this window that were hidden because they already
  // carry one of our MR category labels.
  alreadyHandled: number;
  // Active ?rule= filter (null = normal category-grouped view).
  ruleFilter: string | null;
  // Alle regels die minstens 1 match hebben in het huidige venster, met
  // aantallen. Gebruikt door de precision-targeting widget.
  rulesInWindow: Array<{ rule: string; count: number }>;
}

export function BulkReview(props: Props) {
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [executing, startExecute] = useTransition();
  const [executionResult, setExecutionResult] = useState<ExecuteResult | null>(null);
  const [executedGroups, setExecutedGroups] = useState<Set<string>>(new Set());
  const [bodies, setBodies] = useState<
    Record<string, { loading: boolean; text?: string; error?: string }>
  >({});

  const loadBody = (id: string) => {
    if (bodies[id]?.text || bodies[id]?.loading) return;
    setBodies((prev) => ({ ...prev, [id]: { loading: true } }));
    fetchReviewEmailBody(id).then((res) => {
      setBodies((prev) => ({
        ...prev,
        [id]: res.ok
          ? { loading: false, text: res.bodyText || "(leeg)" }
          : { loading: false, error: res.error },
      }));
    });
  };

  const getRow = (id: string): RowState =>
    rowStates[id] ?? { include: true, override: "", notes: "", ruleHint: "" };

  const patchRow = (id: string, patch: Partial<RowState>) =>
    setRowStates((prev) => ({ ...prev, [id]: { ...getRow(id), ...patch } }));

  const isUnknownGroup = openGroup?.category === "unknown";

  // For unknown groups: show all items so the reviewer can hand-pick the ones
  // worth labeling (to train the classifier). For rule-matched groups: a
  // deterministic 15-sample is enough to spot-check before bulk-approving.
  const sample = useMemo(
    () => {
      if (!openGroup) return [];
      if (openGroup.category === "unknown") return openGroup.items;
      return shuffle(openGroup.items, openGroup.key).slice(0, 15);
    },
    [openGroup],
  );

  const liveStats = useMemo(() => {
    if (!openGroup) return { approve: 0, exclude: 0, recat: 0 };
    let approve = 0,
      exclude = 0,
      recat = 0;
    for (const item of openGroup.items) {
      const s = getRow(item.id);
      if (openGroup.category === "unknown") {
        // Unknown group semantics: "approve" is a no-op, so only count
        // recategorizations (real-category overrides) as actions.
        if (s.override && s.override !== "unknown") recat++;
      } else {
        if (!s.include) exclude++;
        else if (s.override && s.override !== item.category) recat++;
        else approve++;
      }
    }
    return { approve, exclude, recat };
  }, [openGroup, rowStates]);

  const submit = (group: Group) => {
    const isUnknown = group.category === "unknown";
    const decisions: ReviewDecision[] = group.items.flatMap((item) => {
      const s = getRow(item.id);

      if (isUnknown) {
        // Only send items where the reviewer explicitly assigned a real
        // category. Everything else stays untouched (no log, no action).
        if (!s.override || s.override === "unknown") return [];
        return [
          {
            id: item.id,
            subject: item.subject,
            from: item.from,
            bodyPreview: item.bodyPreview,
            receivedAt: item.receivedAt,
            predictedCategory: item.category,
            predictedConfidence: item.confidence,
            predictedRule: item.matchedRule,
            decision: "recategorize" as const,
            overrideCategory: s.override as Category,
            notes: s.notes || undefined,
            ruleHint: s.ruleHint || undefined,
            // Label only — keep in inbox for manual verification. No
            // archive, no iController delete.
            labelOnly: true,
          },
        ];
      }

      let decision: ReviewDecision["decision"];
      if (!s.include) decision = "exclude";
      // "Onbekend (overslaan)" in the dropdown means skip — the backend has
      // no Outlook label for `unknown`, so treat it as an explicit exclude.
      else if (s.override === "unknown") decision = "exclude";
      else if (s.override && s.override !== item.category) decision = "recategorize";
      else decision = "approve";
      return [
        {
          id: item.id,
          subject: item.subject,
          from: item.from,
          bodyPreview: item.bodyPreview,
          receivedAt: item.receivedAt,
          predictedCategory: item.category,
          predictedConfidence: item.confidence,
          predictedRule: item.matchedRule,
          decision,
          overrideCategory: decision === "recategorize" ? (s.override as Category) : undefined,
          notes: s.notes || undefined,
        },
      ];
    });
    // Chunked submit — each iController browser action takes ~15-20s,
    // and a single Vercel serverless invocation is capped at 300s. Without
    // chunking a ~30-item payment group silently exceeds the limit and the
    // server action crashes, producing a white "Application error" screen.
    // 10 items/chunk = ~200s worst-case per call = safely under the budget.
    const CHUNK = 10;
    startExecute(async () => {
      setOpenGroup(null);
      setExecutionResult({
        total: decisions.length,
        executed: 0,
        succeeded: 0,
        failed: 0,
        excluded: 0,
        recategorized: 0,
        errors: [],
      });
      if (decisions.length === 0) {
        setExecutedGroups((prev) => new Set(prev).add(group.key));
        return;
      }
      for (let i = 0; i < decisions.length; i += CHUNK) {
        const chunk = decisions.slice(i, i + CHUNK);
        try {
          const res = await executeReviewDecisions(chunk);
          setExecutionResult((prev) => ({
            total: decisions.length,
            executed: (prev?.executed ?? 0) + res.executed,
            succeeded: (prev?.succeeded ?? 0) + res.succeeded,
            failed: (prev?.failed ?? 0) + res.failed,
            excluded: (prev?.excluded ?? 0) + res.excluded,
            recategorized: (prev?.recategorized ?? 0) + res.recategorized,
            errors: [...(prev?.errors ?? []), ...res.errors],
          }));
        } catch (err) {
          // Server action crashed (timeout, network, etc.). Surface it so
          // the page doesn't white-screen and the user knows exactly how
          // many items made it through before the crash.
          setExecutionResult((prev) => ({
            total: decisions.length,
            executed: prev?.executed ?? 0,
            succeeded: prev?.succeeded ?? 0,
            failed: (prev?.failed ?? 0) + chunk.length,
            excluded: prev?.excluded ?? 0,
            recategorized: prev?.recategorized ?? 0,
            errors: [
              ...(prev?.errors ?? []),
              ...chunk.map((d) => ({
                messageId: d.id,
                subject: d.subject,
                error: `batch crashed: ${String(err)}`,
              })),
            ],
          }));
          return;
        }
      }
      setExecutedGroups((prev) => new Set(prev).add(group.key));
    });
  };

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Debiteuren e-mail — bulkreview</h1>
        <p className="text-muted-foreground text-sm">
          Mailbox: <code>{props.mailbox}</code> · {props.totalFetched} e-mails geclassificeerd
          {props.alreadyHandled > 0
            ? ` · ${props.alreadyHandled} al afgehandeld (verborgen)`
            : ""}
          {props.totalFetched + props.alreadyHandled === props.fetchLimit
            ? ` · venster: ${props.fetchLimit}`
            : ""}
          {props.beforeCursor
            ? ` · ouder dan ${new Date(props.beforeCursor).toLocaleString("nl-NL")}`
            : " · nieuwste venster"}
          {" · opgehaald "}
          {new Date(props.fetchedAt).toLocaleTimeString("nl-NL")}
        </p>
        <div className="flex items-center gap-3 text-sm">
          {props.beforeCursor && (
            <a href="?" className="underline hover:text-foreground">
              ← Terug naar nieuwste
            </a>
          )}
          {props.olderCursor && (
            <a
              href={`?before=${encodeURIComponent(props.olderCursor)}`}
              className="underline hover:text-foreground"
            >
              Laad {props.fetchLimit} oudere →
            </a>
          )}
          {!props.olderCursor && props.beforeCursor && (
            <span className="text-muted-foreground">Einde van inbox bereikt</span>
          )}
        </div>
      </header>

      {props.fetchError && (
        <GlassCard className="p-4 border-rose-500/40 bg-rose-500/5">
          <strong className="text-rose-700 dark:text-rose-300">Fout bij ophalen:</strong>
          <pre className="text-xs mt-2 whitespace-pre-wrap">{props.fetchError}</pre>
        </GlassCard>
      )}

      {!props.fetchError && (
        <>
          {/* Precision-targeting widget — klikbare regel-filter om gericht
              samples te verzamelen voor regels die nog onder 95% CI-lo
              zitten. Gebaseerd op de telemetry-analyse: rule X heeft N
              matches in dit venster beschikbaar. */}
          {props.rulesInWindow.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">
                {props.ruleFilter ? "Regel-filter actief" : "Gericht labelen per regel"}
              </h2>
              {props.ruleFilter ? (
                <GlassCard className="p-3 flex items-center gap-3 border-amber-500/40 bg-amber-500/5">
                  <code className="text-sm font-mono">{props.ruleFilter}</code>
                  <span className="text-sm text-muted-foreground">
                    — toont alleen items die deze regel matchen
                  </span>
                  <a
                    href={props.beforeCursor ? `?before=${encodeURIComponent(props.beforeCursor)}` : "?"}
                    className="ml-auto text-sm underline hover:text-foreground"
                  >
                    Filter weg →
                  </a>
                </GlassCard>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {props.rulesInWindow.map(({ rule, count }) => {
                    const qs = new URLSearchParams();
                    qs.set("rule", rule);
                    if (props.beforeCursor) qs.set("before", props.beforeCursor);
                    return (
                      <a
                        key={rule}
                        href={`?${qs.toString()}`}
                        className="text-xs font-mono px-2 py-1 rounded border border-border hover:border-foreground hover:bg-muted/50 transition-colors"
                      >
                        {rule} <span className="text-muted-foreground">·</span> {count}
                      </a>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Groepen klaar voor batch-actie</h2>
            {props.groups.length === 0 && (
              <GlassCard className="p-4 text-sm text-muted-foreground">
                Geen matches in deze batch. Alles viel in <em>Onbekend</em> — gaat naar de mens.
              </GlassCard>
            )}
            <div className="space-y-2">
              {props.groups.map((g) => {
                const done = executedGroups.has(g.key);
                return (
                  <GlassCard key={g.key} className="p-4 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{CATEGORY_NL[g.category]}</span>
                        <Badge className={BAND_COLOR[g.confidenceBand]}>
                          {BAND_LABEL[g.confidenceBand]}
                        </Badge>
                        <span className="text-muted-foreground text-sm">{g.count} e-mails</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {g.category === "unknown"
                          ? "Vallen buiten de huidige regels — bekijk en label handmatig om de classifier te trainen"
                          : LABEL_ONLY_CATEGORIES.has(g.category)
                            ? "Actie bij goedkeuring: alleen labelen — vereist handmatige update van contactadres in NXT, blijft in inbox"
                            : "Actie bij goedkeuring: labelen en archiveren in Outlook"}
                      </p>
                    </div>
                    {done ? (
                      <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        Verwerkt
                      </Badge>
                    ) : (
                      <Button disabled={executing} onClick={() => setOpenGroup(g)}>
                        {g.category === "unknown" ? "Bekijk & label" : "Beoordeel & goedkeuren"}
                      </Button>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          </section>

          {executionResult && (
            <GlassCard className="p-4 border-emerald-500/40 bg-emerald-500/5">
              <div className="font-semibold">Laatste batch</div>
              <div className="text-sm mt-1 space-y-0.5">
                <div>
                  ✓ Uitgevoerd: {executionResult.succeeded} / {executionResult.total}
                  {executing && executionResult.succeeded + executionResult.failed + executionResult.excluded < executionResult.total && (
                    <span className="text-muted-foreground"> — bezig, batch loopt door…</span>
                  )}
                </div>
                {executionResult.recategorized > 0 && (
                  <div>
                    ↺ Gehercategoriseerd (mens heeft corrigeerd):{" "}
                    {executionResult.recategorized}
                  </div>
                )}
                {executionResult.excluded > 0 && (
                  <div>✗ Uitgesloten: {executionResult.excluded}</div>
                )}
                {executionResult.failed > 0 && (
                  <details className="mt-2">
                    <summary className="text-sm cursor-pointer text-rose-700 dark:text-rose-300">
                      {executionResult.failed} mislukt — klik om te tonen
                    </summary>
                    <ul className="text-xs mt-2 space-y-1">
                      {executionResult.errors.slice(0, 20).map((e) => (
                        <li key={e.messageId} className="font-mono">
                          {e.subject.slice(0, 70)} — {e.error}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </GlassCard>
          )}
        </>
      )}

      {openGroup && (
        <Dialog open onOpenChange={(open) => !open && setOpenGroup(null)}>
          <DialogContent className="!max-w-[min(1200px,95vw)] max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>
                {CATEGORY_NL[openGroup.category]} · {BAND_LABEL[openGroup.confidenceBand]} ·{" "}
                {openGroup.count} e-mails
              </DialogTitle>
            </DialogHeader>

            <div className="text-sm text-muted-foreground">
              {isUnknownGroup
                ? `Blader door alle ${openGroup.count} onbekende e-mails en kies een
                   categorie voor de items die de classifier zou moeten herkennen.
                   Gelabelde items krijgen alleen het Outlook-label en blijven in de
                   inbox staan voor verificatie — ze worden niet gearchiveerd. Items
                   die je op "Onbekend" laat staan blijven volledig onaangeroerd.`
                : `Controleer ${sample.length} willekeurige voorbeelden. Vink e-mails uit die je wilt
                   overslaan, of wijzig het label voor correctie. De rest wordt gelabeld en
                   gearchiveerd in Outlook. Je feedback wordt opgeslagen zodat de classifier beter
                   wordt.`}
            </div>

            <div className="flex items-center gap-4 text-sm p-2 rounded-md bg-muted/50">
              {isUnknownGroup ? (
                <>
                  <span>
                    <strong className="text-amber-700 dark:text-amber-300">
                      {liveStats.recat}
                    </strong>{" "}
                    labelen
                  </span>
                  <span className="text-muted-foreground">
                    <strong>{openGroup.count - liveStats.recat}</strong> blijven staan
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <strong className="text-emerald-700 dark:text-emerald-300">
                      {liveStats.approve}
                    </strong>{" "}
                    goedkeuren
                  </span>
                  {liveStats.recat > 0 && (
                    <span>
                      <strong className="text-amber-700 dark:text-amber-300">
                        {liveStats.recat}
                      </strong>{" "}
                      hercategoriseren
                    </span>
                  )}
                  {liveStats.exclude > 0 && (
                    <span>
                      <strong className="text-rose-700 dark:text-rose-300">
                        {liveStats.exclude}
                      </strong>{" "}
                      uitgesloten
                    </span>
                  )}
                  <span className="text-muted-foreground ml-auto">
                    (Keuzes gelden voor de hele groep van {openGroup.count})
                  </span>
                </>
              )}
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 pr-2">
              {sample.map((item) => {
                const s = getRow(item.id);
                const isRecat = !!s.override && s.override !== item.category;
                const isLabeled = isUnknownGroup && !!s.override && s.override !== "unknown";
                const showNotes = (!isUnknownGroup && !s.include) || (isRecat && !isUnknownGroup) || isLabeled;
                return (
                  <div
                    key={item.id}
                    className={`rounded-md border p-3 space-y-2 ${
                      isUnknownGroup
                        ? isLabeled
                          ? "border-amber-500/30 bg-amber-500/5"
                          : "border-border"
                        : !s.include
                          ? "opacity-60 border-rose-500/30 bg-rose-500/5"
                          : isRecat
                            ? "border-amber-500/30 bg-amber-500/5"
                            : "border-border"
                    }`}
                  >
                    <div className="flex gap-3">
                      {!isUnknownGroup && (
                        <input
                          type="checkbox"
                          checked={s.include}
                          onChange={(e) => patchRow(item.id, { include: e.target.checked })}
                          className="mt-1 h-4 w-4"
                          aria-label="Opnemen in batch"
                        />
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="font-semibold text-sm break-words">
                          {item.subject || "(geen onderwerp)"}
                        </div>
                        <div className="text-xs text-muted-foreground break-all">
                          {item.fromName ? `${item.fromName} <${item.from}>` : item.from} ·{" "}
                          {new Date(item.receivedAt).toLocaleString("nl-NL")}
                        </div>
                        {bodies[item.id]?.text ? (
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words bg-muted/40 rounded p-2 max-h-80 overflow-y-auto">
                            {bodies[item.id].text}
                          </pre>
                        ) : (
                          <p className="text-xs text-muted-foreground break-words line-clamp-3">
                            {item.bodyPreview}
                          </p>
                        )}
                        {bodies[item.id]?.error && (
                          <p className="text-xs text-rose-600 dark:text-rose-400">
                            Kon mail niet ophalen: {bodies[item.id].error}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground font-mono">
                          <span>rule: {item.matchedRule}</span>
                          <span>·</span>
                          <span>conf {item.confidence.toFixed(2)}</span>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (bodies[item.id]?.text) {
                                setBodies((prev) => {
                                  const next = { ...prev };
                                  delete next[item.id];
                                  return next;
                                });
                              } else {
                                loadBody(item.id);
                              }
                            }}
                            className="underline hover:text-foreground disabled:opacity-50"
                            disabled={bodies[item.id]?.loading}
                          >
                            {bodies[item.id]?.loading
                              ? "laden…"
                              : bodies[item.id]?.text
                                ? "toon preview"
                                : "toon volledige e-mail"}
                          </button>
                        </div>
                      </div>
                      <div className="w-48 shrink-0">
                        <Select
                          value={s.override || item.category}
                          onValueChange={(v) => patchRow(item.id, { override: v as Category })}
                          disabled={!s.include}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACTIONABLE_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c} className="text-xs">
                                {CATEGORY_NL[c]}
                              </SelectItem>
                            ))}
                            <SelectItem value="unknown" className="text-xs">
                              {CATEGORY_NL.unknown} (overslaan)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {/* Rule-hint dropdown voor Onbekend hand-picks — welke
                        bestaande regel had dit moeten vangen. Alleen tonen
                        als reviewer een echte categorie heeft gekozen
                        (niet "overslaan"). */}
                    {isUnknownGroup && isLabeled && (
                      <div className="flex items-center gap-2 pl-7">
                        <label className="text-[11px] text-muted-foreground whitespace-nowrap">
                          Welke regel had dit moeten vangen?
                        </label>
                        <Select
                          value={s.ruleHint || "none"}
                          onValueChange={(v) =>
                            patchRow(item.id, { ruleHint: v === "none" ? "" : v })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue placeholder="(optioneel — helpt gerichte classifier-uitbreiding)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-xs text-muted-foreground">
                              — geen hint —
                            </SelectItem>
                            {RULE_HINTS.filter(
                              (rh) => rh.cat === s.override || rh.value === "NEW_RULE_NEEDED",
                            ).map((rh) => (
                              <SelectItem key={rh.value} value={rh.value} className="text-xs">
                                {rh.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {showNotes && (
                      <textarea
                        value={s.notes}
                        onChange={(e) => patchRow(item.id, { notes: e.target.value })}
                        placeholder={
                          isUnknownGroup
                            ? "Welk woord/patroon mist de classifier? (bv. 'Confirmation:', 'Ontvangstbevestiging')"
                            : !s.include
                              ? "Waarom uitsluiten? (optioneel — helpt de classifier leren)"
                              : "Waarom hercategoriseren? (optioneel — helpt de classifier leren)"
                        }
                        rows={2}
                        className="w-full text-xs rounded-md border border-border bg-background/60 px-2 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </div>
                );
              })}
              {!isUnknownGroup && openGroup.count > sample.length && (
                <div className="text-xs text-muted-foreground p-2">
                  Steekproef van {sample.length} van {openGroup.count}. Je keuzes hierboven gelden
                  alleen voor deze zichtbare rijen — alle overige {openGroup.count - sample.length}{" "}
                  worden standaard gelabeld en gearchiveerd.
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setOpenGroup(null)}>
                Annuleer
              </Button>
              <Button
                disabled={executing || (isUnknownGroup && liveStats.recat === 0)}
                onClick={() => submit(openGroup)}
              >
                {executing
                  ? "Bezig…"
                  : isUnknownGroup
                    ? `Label ${liveStats.recat} e-mails`
                    : `Voer uit: ${liveStats.approve + liveStats.recat} acties, ${liveStats.exclude} uitgesloten`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Deterministic shuffle so the sample is stable per group-key. */
function shuffle<T>(arr: T[], seed: string): T[] {
  const a = [...arr];
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
