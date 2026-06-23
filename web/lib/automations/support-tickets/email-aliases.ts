import "server-only";

import { graphFetch } from "@/lib/outlook/client";
import { isLocale, type Locale } from "@/lib/i18n/config";

// Resolve a logged-in M365 user's identity from Microsoft Graph, in ONE cached
// call, returning:
//   - emails: ALL of the user's addresses, so the tickets app can match ClickUp
//     tickets recorded under any of a person's identities (group members have
//     e.g. <name>.cb@moyneroberts.com AND a brand address like @smeba.nl, and
//     M365 logs them in under one of them).
//   - preferredLocale: the AD `preferredLanguage`, used as the default UI
//     language when the user hasn't explicitly chosen one.
//
// Requires the Graph connection's directory read permission; on any error we
// fall back to { emails: [login], preferredLocale: null } — no regression.

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface UserIdentity {
  emails: string[];
  preferredLocale: Locale | null;
}

const cache = new Map<string, { identity: UserIdentity; exp: number }>();

interface GraphUser {
  mail?: string | null;
  userPrincipalName?: string | null;
  proxyAddresses?: string[] | null;
  otherMails?: string[] | null;
  preferredLanguage?: string | null;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/** Map an AD preferredLanguage (e.g. "nl-NL", "fr", "en-US") to a supported Locale. */
function mapPreferredLanguage(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const prefix = value.trim().toLowerCase().split("-")[0];
  return isLocale(prefix) ? prefix : null;
}

// Fall back to the user's Outlook/mailbox display language
// (mailboxSettings.language.locale, e.g. "nl-NL") when AD preferredLanguage is
// empty — it's far more often populated. Needs MailboxSettings.Read on the
// connection; any failure → null (caller falls back to the default).
async function fetchMailboxLocale(upn: string): Promise<Locale | null> {
  try {
    const res = await graphFetch(
      `/users/${encodeURIComponent(upn)}/mailboxSettings`,
      { method: "GET" },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { language?: { locale?: string | null } };
    return mapPreferredLanguage(body?.language?.locale);
  } catch {
    return null;
  }
}

/** Pull SMTP addresses out of Graph proxyAddresses (e.g. "SMTP:x@y.com" → "x@y.com"). */
function smtpFromProxies(proxies: string[] | null | undefined): string[] {
  if (!Array.isArray(proxies)) return [];
  return proxies
    .filter((p) => typeof p === "string" && /^smtp:/i.test(p))
    .map((p) => p.slice(p.indexOf(":") + 1));
}

// Find the user who has `login` as ANY of their addresses. Graph's /users/{key}
// only resolves by id or UPN — an alias/proxy address 404s — so we use an
// advanced $filter search across proxyAddresses/mail/UPN/otherMails, which needs
// `$count=true` + the `ConsistencyLevel: eventual` header.
function buildUserSearchPath(login: string): string {
  const e = login.replace(/'/g, "''"); // OData single-quote escaping
  const filter =
    `proxyAddresses/any(p:p eq 'SMTP:${e}') or ` +
    `proxyAddresses/any(p:p eq 'smtp:${e}') or ` +
    `mail eq '${e}' or userPrincipalName eq '${e}' or ` +
    `otherMails/any(m:m eq '${e}')`;
  return (
    `/users?$count=true&$select=mail,userPrincipalName,proxyAddresses,otherMails,preferredLanguage` +
    `&$filter=${encodeURIComponent(filter)}`
  );
}

function emailsFromGraphUser(u: GraphUser, login: string): string[] {
  const candidates = [
    login,
    u.mail ?? "",
    u.userPrincipalName ?? "",
    ...smtpFromProxies(u.proxyAddresses),
    ...(Array.isArray(u.otherMails) ? u.otherMails : []),
  ];
  return [...new Set(candidates.map(normalize).filter((x) => x.includes("@")))];
}

/**
 * Resolve a logged-in email to the user's full identity (all addresses + AD
 * preferred locale). Never throws — on any failure returns
 * { emails: [login], preferredLocale: null }.
 */
export async function resolveUserIdentity(
  loginEmail: string,
): Promise<UserIdentity> {
  const login = normalize(loginEmail);
  if (!login) return { emails: [], preferredLocale: null };

  const hit = cache.get(login);
  if (hit && hit.exp > Date.now()) return hit.identity;

  let identity: UserIdentity = { emails: [login], preferredLocale: null };
  try {
    const res = await graphFetch(buildUserSearchPath(login), {
      method: "GET",
      headers: { ConsistencyLevel: "eventual" },
    });
    if (res.ok) {
      const body = (await res.json()) as { value?: GraphUser[] };
      const users = Array.isArray(body.value) ? body.value : [];
      if (users.length > 0) {
        let preferredLocale = mapPreferredLanguage(users[0].preferredLanguage);
        // Fall back to the Outlook mailbox language when AD has none.
        if (!preferredLocale && users[0].userPrincipalName) {
          preferredLocale = await fetchMailboxLocale(users[0].userPrincipalName);
        }
        identity = {
          emails: [
            ...new Set(users.flatMap((u) => emailsFromGraphUser(u, login))),
          ],
          preferredLocale,
        };
      }
    } else {
      console.warn(
        `[support-tickets/email-aliases] Graph ${res.status} for ${login} — falling back to login email only`,
      );
    }
  } catch (err) {
    console.warn(
      `[support-tickets/email-aliases] Graph lookup failed for ${login} (${String(err).slice(0, 120)}) — falling back to login email only`,
    );
  }

  cache.set(login, { identity, exp: Date.now() + CACHE_TTL_MS });
  return identity;
}

/** All of the user's email addresses (always includes the login). */
export async function resolveUserEmails(loginEmail: string): Promise<string[]> {
  return (await resolveUserIdentity(loginEmail)).emails;
}
