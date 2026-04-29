import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "ssh2-sftp-client",
    "ssh2",
    "@napi-rs/keyring",
    "cross-keychain",
    "@zapier/zapier-sdk-cli-login",
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

export default nextConfig;
