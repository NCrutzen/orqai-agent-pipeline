/**
 * Token store voor NXT/Auth0 access tokens.
 * Tokens komen van Browserless-login flow (zie acquire-token-via-browserless.ts).
 * Worden encrypted opgeslagen in de Supabase `settings` tabel onder een
 * deterministische key per environment.
 */

import { createClient } from "@supabase/supabase-js";
import { encryptCredential, decryptCredential } from "../../credentials/crypto";

export type NxtEnvironment = "acceptance" | "production";

const SETTING_KEY_PREFIX = "nxt_oauth_token_";

interface StoredToken {
  accessToken: string;
  expiresAt: string; // ISO
  acquiredAt: string;
  username: string;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function storeToken(env: NxtEnvironment, token: StoredToken): Promise<void> {
  const sb = admin();
  const encrypted = encryptCredential(JSON.stringify(token));
  const { error } = await sb.from("settings").upsert({
    key: `${SETTING_KEY_PREFIX}${env}`,
    value: { encrypted },
  });
  if (error) throw new Error(`Failed to store NXT token: ${error.message}`);
}

export async function loadToken(env: NxtEnvironment): Promise<StoredToken | null> {
  const sb = admin();
  const { data, error } = await sb
    .from("settings")
    .select("value")
    .eq("key", `${SETTING_KEY_PREFIX}${env}`)
    .maybeSingle();
  if (error) throw new Error(`Failed to load NXT token: ${error.message}`);
  if (!data?.value || !(data.value as { encrypted?: string }).encrypted) return null;
  return JSON.parse(
    decryptCredential((data.value as { encrypted: string }).encrypted)
  ) as StoredToken;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh als <5min over

/**
 * Geeft een geldig access_token terug. Acquireert een nieuwe via Browserless
 * als er geen token is of de huidige binnenkort verloopt.
 */
export async function getValidToken(env: NxtEnvironment): Promise<string> {
  const existing = await loadToken(env);
  const now = Date.now();
  if (existing && new Date(existing.expiresAt).getTime() - now > REFRESH_MARGIN_MS) {
    return existing.accessToken;
  }

  // Lazy-import om Browserless dependency niet te trekken in cold path
  const { acquireTokenViaBrowserless } = await import(
    "./acquire-token-via-browserless"
  );
  const fresh = await acquireTokenViaBrowserless(env);
  await storeToken(env, fresh);
  return fresh.accessToken;
}
