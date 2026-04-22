import { redirect } from "next/navigation";

/**
 * Debtor Email is registered as a swarm in the `projects` table. Live runs
 * are rendered by the swarm page — this route redirects to preserve any
 * bookmarks from the first iteration of the feature.
 */
export default function DebtorEmailRedirectPage() {
  redirect("/swarm/60c730a3-be04-4b59-87e8-d9698b468fc9");
}
