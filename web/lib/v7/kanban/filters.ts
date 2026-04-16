/**
 * Smart filter predicates -- shared between the sidebar (chip list) and
 * the Kanban board (filtering visible jobs).
 *
 * Each filter is a single URL-param value: `?filter=blocked|review|sla`.
 * Absence of the param means no filter (show everything).
 */

import type { SwarmJob } from "@/lib/v7/types";

export const SMART_FILTERS = [
  { key: "blocked", label: "Only blocked" },
  { key: "review", label: "Needs review" },
  { key: "sla", label: "High SLA risk" },
] as const;

export type SmartFilterKey = (typeof SMART_FILTERS)[number]["key"];

const SLA_TAG_TOKENS = new Set(["sla", "blocked", "risk"]);

function readTagsLowercase(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.toLowerCase());
}

export function isSmartFilterKey(value: unknown): value is SmartFilterKey {
  return (
    typeof value === "string" &&
    SMART_FILTERS.some((f) => f.key === value)
  );
}

export function getFilterPredicate(
  filter: string | null,
): (job: SwarmJob) => boolean {
  if (filter === "blocked") {
    return (job) =>
      (job.priority === "urgent" || job.priority === "high") &&
      job.stage === "review";
  }
  if (filter === "review") {
    return (job) => job.stage === "review";
  }
  if (filter === "sla") {
    return (job) => {
      const tags = readTagsLowercase(job.tags);
      return tags.some((t) => SLA_TAG_TOKENS.has(t));
    };
  }
  return () => true;
}
