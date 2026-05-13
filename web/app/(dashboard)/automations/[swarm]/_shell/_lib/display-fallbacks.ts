// Phase 82.3 Plan 10 — display-layer fallbacks for the detail-pane header.
// CONTEXT.md §Data-quality fix: "Planning" is an Outlook display-name artifact
// from a system mailbox; treat it as a sentinel for "no real sender".

const PLANNING_SENTINEL = "Planning";

export function displaySender(
  from_name: string | null | undefined,
  from_email: string | null | undefined,
): string {
  const name = (from_name ?? "").trim();
  if (name.length > 0 && name !== PLANNING_SENTINEL) return name;
  const email = (from_email ?? "").trim();
  if (email.length > 0) return email;
  return "(unknown sender)";
}

export function displaySubject(subject: string | null | undefined): string {
  const s = (subject ?? "").trim();
  return s.length > 0 ? s : "(no subject)";
}
