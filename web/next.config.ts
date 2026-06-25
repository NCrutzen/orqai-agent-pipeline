import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Pin the workspace root to THIS app directory. Stray lockfiles higher up
// (~/package-lock.json, plus the monorepo's own) made Next/Turbopack infer the
// home directory as the workspace root, which corrupted server route-handler
// output — route handlers (/auth/callback, the manifest metadata route) failed
// at runtime/build with "No response is returned from route handler". Pinning the
// root fixes file tracing so those handlers resolve correctly. Local-only issue
// (Vercel has no stray lockfile), but required for the prod build to run here.
const appRoot = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
  serverExternalPackages: [
    "ssh2-sftp-client",
    "ssh2",
    "@napi-rs/keyring",
    "cross-keychain",
    "@zapier/zapier-sdk-cli-login",
    // Phase 116 attachment extraction: unpdf lazy-loads the @napi-rs/canvas
    // native binding for renderPageAsImage (scanned-PDF rasterisation). The
    // .node binding is a non-ECMAScript asset Turbopack cannot place in an ESM
    // chunk — externalise so it is require()'d at runtime in the Node server.
    "@napi-rs/canvas",
    "unpdf",
  ],

  // Phase 56.7-03 (D-07). Forward operator bookmarks pointed at the old
  // debtor-email-specific URL to the new dynamic-segment route. The
  // `/:path*` form catches query strings and any trailing path segments.
  //
  // permanent: false (307) for one deploy cycle so we can reverse cheaply
  // if anything breaks. Per D-07, flip to permanent: true (308) in a
  // follow-up commit after operator caches have been re-warmed. NOT in
  // scope for 56.7 — single-line change for the next deploy.
  async redirects() {
    return [
      {
        source: "/automations/debtor-email-review",
        destination: "/automations/debtor-email/review",
        permanent: false,
      },
      {
        source: "/automations/debtor-email-review/:path*",
        destination: "/automations/debtor-email/review/:path*",
        permanent: false,
      },
    ];
  },
};

// Note: the Serwist service worker is NOT wired into this config. It is bundled
// by a separate `serwist build` step (configurator mode) after `next build` — see
// serwist.config.js and the `build` script in package.json — so the SW build is
// fully decoupled from Next's (Turbopack) compilation. SW registration happens
// client-side via <SerwistProvider> in app/(app)/layout.tsx.
export default nextConfig;
