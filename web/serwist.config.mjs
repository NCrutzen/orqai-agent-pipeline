import { spawnSync } from "node:child_process";
import { serwist } from "@serwist/next/config";

// Serwist configurator mode. `serwist build serwist.config.mjs` runs AFTER
// `next build` (see the "build" script in package.json) and bundles app/sw.ts
// into public/sw.js with the precache manifest injected. Because it is a
// separate step, the SW build is fully decoupled from Next's (Turbopack)
// compilation — no contention with metadata-route prerendering.
//
// withNextConfig reads the resolved Next.js config so the precache globDirectory
// points at the build output (.next) automatically. Mirrors the package type
// (commonjs) by using an explicit .mjs extension for ESM.

// Cache-busting revision for the precached offline entry: the current git commit,
// falling back to a random id when git is unavailable (e.g. CI shallow clone).
const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ??
  crypto.randomUUID();

export default serwist.withNextConfig(() => ({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  // Do NOT precache prerendered HTML pages. The only prerendered routes are
  // /login, /rijtijden and /_not-found; precaching /login made the SW serve a
  // stale build-time login page, interfering with the M365 SSO re-login flow.
  // Static assets (/_next/*) are still precached via the default glob.
  precachePrerendered: false,
}));
