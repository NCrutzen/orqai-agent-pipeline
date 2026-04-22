import { listInboxMessages } from "@/lib/outlook";
import { classify, type Category } from "@/lib/debtor-email/classify";
import { createAdminClient } from "@/lib/supabase/admin";
import { BulkReview } from "./bulk-review";

const MAILBOX = "debiteuren@smeba.nl";
const FETCH_LIMIT = 300;

export const dynamic = "force-dynamic";
// Server actions on this route include iController browser automation per
// approved item (≈5–10s each after session warmup). An 18-item batch can
// take ≈3 min. Vercel Pro allows up to 300s.
export const maxDuration = 300;

function bandFor(conf: number): "high" | "medium" | "low" {
  if (conf >= 0.9) return "high";
  if (conf >= 0.8) return "medium";
  return "low";
}

interface PageProps {
  searchParams: Promise<{ before?: string; rule?: string }>;
}

export default async function DebtorEmailReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const before = params.before;
  const ruleFilter = params.rule || null;

  let messages = [] as Awaited<ReturnType<typeof listInboxMessages>>;
  let fetchError: string | null = null;
  try {
    messages = await listInboxMessages(MAILBOX, FETCH_LIMIT, { before });
  } catch (err) {
    fetchError = String(err);
  }

  // Oldest item in the current window → cursor for the next "older" page.
  // Messages are Graph-ordered newest-first, so the last one is the oldest.
  const olderCursor =
    messages.length === FETCH_LIMIT ? messages[messages.length - 1]?.receivedAt : null;

  // Items die al een van onze eigen categorie-labels hebben zijn al
  // afgehandeld (door automation OF door een eerdere hand-label uit deze
  // UI). ooo_permanent en unknown-handpicks blijven in de inbox (om NXT-
  // update / verificatie mogelijk te maken), dus zonder deze filter
  // komen ze bij elke page-load terug in de Onbekend-groep. Andere
  // Outlook-categorieën (persoonlijke vlag van een gebruiker) worden
  // genegeerd — alleen onze 4 triggeren de skip.
  const MR_LABELS = new Set([
    "Auto-Reply",
    "OoO — Temporary",
    "OoO — Permanent",
    "Payment Admittance",
  ]);

  // Mails that a reviewer has already acted on in bulk-review get logged
  // to automation_runs — even when the Outlook label couldn't be applied
  // (archive 404s, label-only categories that leave the mail in the
  // inbox, etc.). Hiding on Outlook label alone kept re-surfacing those,
  // which defeats the "work the mailbox once" flow. We additionally
  // exclude any message_id with a non-failed debtor-email-review /
  // debtor-email-cleanup run so the page converges to zero once the
  // reviewer has processed the mailbox. Failed runs stay visible so the
  // human can retry if they choose.
  const messageIds = messages.map((m) => m.id);
  const reviewedIds = new Set<string>();
  if (messageIds.length > 0) {
    try {
      const admin = createAdminClient();
      const { data: handledRuns } = await admin
        .from("automation_runs")
        .select("result->>message_id")
        .like("automation", "debtor-email-%")
        .in("status", ["feedback", "completed", "skipped_idempotent", "deferred"])
        .in("result->>message_id", messageIds);
      for (const row of handledRuns ?? []) {
        const id = (row as Record<string, unknown>)["message_id"];
        if (typeof id === "string") reviewedIds.add(id);
      }
    } catch {
      // Non-fatal: fall back to Outlook-label filter only.
    }
  }

  const isHandled = (m: (typeof messages)[number]): boolean =>
    m.categories.some((c) => MR_LABELS.has(c)) || reviewedIds.has(m.id);

  const alreadyHandled = messages.filter(isHandled).length;

  const predictions = messages
    .filter((m) => !isHandled(m))
    .map((m) => {
      const r = classify({ subject: m.subject, from: m.from, bodySnippet: m.bodyPreview });
      return {
        id: m.id,
        subject: m.subject,
        from: m.from,
        fromName: m.fromName,
        receivedAt: m.receivedAt,
        bodyPreview: m.bodyPreview.slice(0, 240),
        category: r.category,
        confidence: r.confidence,
        matchedRule: r.matchedRule,
        confidenceBand: bandFor(r.confidence),
        alreadyCategorized: m.categories.length > 0,
      };
    });

  // Tel per regel in het huidige venster (vóór eventuele rule-filter).
  // Hiermee kan de UI een targeting-widget tonen: "regel X heeft Y matches
  // beschikbaar — klik om alleen die te zien en snel naar 95% CI te duwen".
  const rulePerWindow = new Map<string, number>();
  for (const p of predictions) {
    if (p.category === "unknown") continue;
    rulePerWindow.set(p.matchedRule, (rulePerWindow.get(p.matchedRule) ?? 0) + 1);
  }
  const rulesInWindow = Array.from(rulePerWindow.entries())
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count);

  // Rule-filter: als ?rule=X in URL staat, toon alleen één "virtuele" groep
  // met alle items die precies die regel matchen. Versnelt gerichte
  // sample-opbouw voor regels die nog onder 95% CI-lo zitten.
  const groupMap = new Map<string, typeof predictions>();
  if (ruleFilter) {
    const matching = predictions.filter((p) => p.matchedRule === ruleFilter);
    if (matching.length > 0) {
      groupMap.set(`rule:${ruleFilter}`, matching);
    }
  } else {
    for (const p of predictions) {
      const key = `${p.category}:${p.confidenceBand}`;
      const arr = groupMap.get(key) ?? [];
      arr.push(p);
      groupMap.set(key, arr);
    }
  }

  const catOrder: Record<Category, number> = {
    auto_reply: 1,
    ooo_temporary: 2,
    ooo_permanent: 3,
    payment_admittance: 4,
    unknown: 9,
  };
  const bandOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };

  const groups = Array.from(groupMap.entries())
    .map(([key, items]) => ({
      key,
      category: items[0].category,
      confidenceBand: items[0].confidenceBand,
      count: items.length,
      items,
    }))
    .sort((a, b) => {
      const ca = catOrder[a.category] ?? 5;
      const cb = catOrder[b.category] ?? 5;
      if (ca !== cb) return ca - cb;
      return (bandOrder[a.confidenceBand] ?? 9) - (bandOrder[b.confidenceBand] ?? 9);
    });

  const unknownCount = predictions.filter((p) => p.category === "unknown").length;

  return (
    <BulkReview
      mailbox={MAILBOX}
      fetchedAt={new Date().toISOString()}
      totalFetched={predictions.length}
      fetchLimit={FETCH_LIMIT}
      unknownCount={unknownCount}
      groups={groups}
      fetchError={fetchError}
      beforeCursor={before ?? null}
      olderCursor={olderCursor}
      alreadyHandled={alreadyHandled}
      ruleFilter={ruleFilter}
      rulesInWindow={rulesInWindow}
    />
  );
}
