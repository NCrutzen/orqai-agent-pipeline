/**
 * Acquireert een NXT/Auth0 access_token via Browserless-login.
 * Capture'd de POST /oauth/token response om expires_in en token_type te halen.
 */

import { chromium } from "playwright-core";
import { createClient } from "@supabase/supabase-js";
import { decryptCredential } from "../../credentials/crypto";
import type { NxtEnvironment } from "./token-store";

const NXT_BASES: Record<NxtEnvironment, string> = {
  acceptance: "https://acc.sb.n-xt.org",
  production: "https://sb.n-xt.org",
};

const CRED_NAMES: Record<NxtEnvironment, string> = {
  acceptance: "NXT Acceptance Login",
  production: "NXT Production Login",
};

interface AcquiredToken {
  accessToken: string;
  expiresAt: string;
  acquiredAt: string;
  username: string;
}

async function loadNxtCredentials(env: NxtEnvironment): Promise<{ username: string; password: string }> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await sb
    .from("credentials")
    .select("encrypted_values")
    .eq("name", CRED_NAMES[env])
    .eq("environment", env)
    .single();
  if (error || !data) throw new Error(`No credential ${CRED_NAMES[env]}: ${error?.message}`);
  return JSON.parse(decryptCredential(data.encrypted_values));
}

export async function acquireTokenViaBrowserless(
  env: NxtEnvironment
): Promise<AcquiredToken> {
  const { username, password } = await loadNxtCredentials(env);
  const base = NXT_BASES[env];

  const ws = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=120000`;
  const browser = await chromium.connectOverCDP(ws, { timeout: 30_000 });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // We luisteren NIET op /oauth/token (die levert een JWE-access_token op die NXT
  // niet accepteert). In plaats daarvan capture'n we de Bearer header die het
  // Angular-front feitelijk stuurt naar /api/* — dat is de RS256 JWT die werkt.
  const captured: { token: string | null } = { token: null };
  page.on("request", (req) => {
    const u = req.url();
    if (!u.includes(`${base}/api/`) || u.includes("auth0.com")) return;
    const auth = req.headers()["authorization"];
    if (auth && auth.startsWith("Bearer ") && !captured.token) {
      captured.token = auth.slice(7);
    }
  });

  try {
    await page.goto(`${base}/#/home`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2000);
    const userField = page
      .locator('input[type="email"], input[name="username"], input[id*="user" i]')
      .first();
    await userField.waitFor({ state: "visible", timeout: 30_000 });
    await userField.fill(username);
    await page.locator('input[type="password"]').first().fill(password);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/#\/(home|dashboard)/, { timeout: 30_000 }).catch(() => {});
    // Geef de Angular app tijd om de eerste /api/* request te doen zodat we de
    // bearer header pakken
    await page.waitForTimeout(5000);
  } finally {
    await ctx.close();
    await browser.close();
  }

  if (!captured.token) {
    throw new Error("Geen Bearer-token gezien op /api/* tijdens NXT login");
  }
  const bearerToken: string = captured.token;

  // Decode JWT exp claim om TTL te bepalen
  const payload = JSON.parse(
    Buffer.from(bearerToken.split(".")[1] + "==", "base64").toString("utf8")
  ) as { exp?: number };
  const acquiredAt = new Date();
  const expiresAt =
    typeof payload.exp === "number"
      ? new Date(payload.exp * 1000)
      : new Date(acquiredAt.getTime() + 23 * 3600 * 1000); // fallback 23u

  return {
    accessToken: bearerToken,
    expiresAt: expiresAt.toISOString(),
    acquiredAt: acquiredAt.toISOString(),
    username,
  };
}
