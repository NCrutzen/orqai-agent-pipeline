// Plan 02-03 Task 2 step (a) — SSRF host allow-list (plan-checker B-5).
//
// Shared choke-point called BEFORE every fetch of the user-supplied
// `support_tickets.video_storage_url`. Used by:
//   - transcribe.ts (this plan) — before the ElevenLabs Scribe call
//   - extract-frames.ts (Plan 02-04) — before the ffmpeg fetch
//
// Threat model: T-02-15 (Spoofing — SSRF via `video_storage_url`). An attacker
// with control over a submission's video URL could point us at internal
// AWS-metadata IPs, RFC1918 networks, or loopback to exfiltrate cloud
// credentials or scan internal services. This module is the single deny-by-
// default gate.
//
// Rules enforced:
//   1. `new URL(url)` must succeed. Malformed → reject.
//   2. Scheme MUST be `https:`. http:// is rejected even on allow-listed hosts.
//   3. Hostname MUST end with one of the suffixes in
//      `process.env.SUPPORT_VIDEO_ALLOWED_HOSTS` (comma-split, trimmed).
//      Default: `['.supabase.co']`. Note the leading dot — guards against a
//      malicious `evil-supabase.co`.
//   4. Hostnames that look like raw IP addresses are rejected wholesale
//      (allow-list is host-suffix-based; an IP cannot match a `.foo` suffix
//      anyway, but we add an explicit IP check for defense-in-depth and to
//      catch operator misconfiguration like `SUPPORT_VIDEO_ALLOWED_HOSTS=8.8.8.8`).
//   5. Specific private/loopback/link-local ranges are explicitly rejected
//      even if hostname-resolution-style attacks would somehow surface them.
//
// Does NOT do DNS resolution. A determined attacker could register
// `evil.supabase.co.attacker.example` — that fails rule 3 (suffix mismatch).
// A more sophisticated DNS-rebind attack is out of scope for this layer;
// the storage URLs we accept come from our own Supabase project and are
// already short-lived signed URLs.
//
// SAFETY-04 / SAFETY-05 references — this is a transport-layer gate, distinct
// from PII (content-layer, pii-detect.ts) and cost-ceiling (Stage 2 wiring,
// stage-2-enrichment.ts).

const DEFAULT_ALLOWED_HOST_SUFFIXES = [".supabase.co"];

// Hosts that are ALWAYS rejected, regardless of allow-list configuration.
// `localhost` and `*.localhost` per RFC 6761.
const ALWAYS_DENY_HOSTS = new Set(["localhost"]);

// Compiled once. Matches IPv4 dotted-quad (loose; we validate ranges below).
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isPrivateOrLoopbackIPv4(host: string): boolean {
  const m = IPV4_RE.exec(host);
  if (!m) return false;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return false;
  const [a, b] = octets;
  // 127.0.0.0/8 — loopback
  if (a === 127) return true;
  // 10.0.0.0/8 — RFC1918
  if (a === 10) return true;
  // 192.168.0.0/16 — RFC1918
  if (a === 192 && b === 168) return true;
  // 172.16.0.0/12 — RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 169.254.0.0/16 — link-local (incl. 169.254.169.254 AWS/GCP metadata)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8 — RFC1122 "this host"
  if (a === 0) return true;
  // 100.64.0.0/10 — RFC 6598 shared address space (carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isAnyIPv4(host: string): boolean {
  return IPV4_RE.test(host);
}

function isRejectedIPv6(host: string): boolean {
  // URL parser strips the surrounding [] from `hostname`. ::1 is the loopback.
  // fe80::/10 is link-local. fc00::/7 is unique-local (private). ::ffff:x.x.x.x
  // is the IPv4-mapped form — we additionally reject any v4-mapped that maps
  // into a private/loopback IPv4.
  if (host === "::1") return true;
  const lower = host.toLowerCase();
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    // fe80::/10 — link-local
    return true;
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) {
    // fc00::/7 — unique-local
    return true;
  }
  // Reject any literal IPv6 host that the URL parser would expose. The
  // surface area for IPv6-to-internal-IPv4 mapping attacks is large enough
  // that for this codebase we simply deny ALL IPv6 literal hostnames — the
  // allow-list is host-suffix-based and Supabase Storage hostnames are
  // domain-name form, never IPv6 literals. Defense in depth.
  if (lower.includes(":")) return true;
  return false;
}

function readAllowList(): string[] {
  const raw = process.env.SUPPORT_VIDEO_ALLOWED_HOSTS;
  if (!raw || raw.trim() === "") return DEFAULT_ALLOWED_HOST_SUFFIXES;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Validate that `url` is safe to fetch as a user-supplied video URL.
 *
 * Returns `true` ONLY if ALL of:
 *   - URL is parseable
 *   - scheme is `https:`
 *   - hostname is not a raw IPv4 or IPv6 literal
 *   - hostname is not in the always-deny set (`localhost`)
 *   - hostname is not a private/loopback/link-local IPv4 (defense in depth)
 *   - hostname endsWith one of the configured allow-list suffixes
 *
 * Plan-checker B-5 — SSRF gate. Default allow-list: `['.supabase.co']`.
 * Override via env `SUPPORT_VIDEO_ALLOWED_HOSTS` (comma-separated).
 */
export function validateVideoUrlHost(url: string): boolean {
  if (typeof url !== "string" || url.length === 0) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (host.length === 0) return false;

  if (ALWAYS_DENY_HOSTS.has(host)) return false;

  // Block any IPv4 hostname outright (allow-list is suffix-based; IPs don't
  // match suffixes like `.supabase.co` anyway, but be explicit).
  if (isAnyIPv4(host)) {
    return false;
  }

  // The URL parser strips [] from hostname for `https://[::1]/...` → `::1`.
  if (isRejectedIPv6(host)) return false;

  // Defense-in-depth: even though IPs are already rejected above, double-
  // check the private/loopback ranges so a future code change can't
  // accidentally regress.
  if (isPrivateOrLoopbackIPv4(host)) return false;

  const suffixes = readAllowList();
  for (const suf of suffixes) {
    // Strict suffix match. `.supabase.co` matches `abc.supabase.co` but not
    // `evil-supabase.co` (no leading dot in attacker host).
    if (host === suf.replace(/^\./, "")) return true; // exact host match (e.g. `supabase.co`)
    if (host.endsWith(suf)) return true;
  }

  return false;
}
