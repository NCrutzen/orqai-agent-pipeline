import { listInboxMessages } from "@/lib/outlook";
import { classify, type Category } from "@/lib/debtor-email/classify";
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
  searchParams: Promise<{ before?: string }>;
}

export default async function DebtorEmailReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const before = params.before;

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

  const predictions = messages.map((m) => {
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

  // Group by (category, band).
  const groupMap = new Map<string, typeof predictions>();
  for (const p of predictions) {
    const key = `${p.category}:${p.confidenceBand}`;
    const arr = groupMap.get(key) ?? [];
    arr.push(p);
    groupMap.set(key, arr);
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
    />
  );
}
