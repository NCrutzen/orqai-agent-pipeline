import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "ssh2-sftp-client",
    "ssh2",
    "@napi-rs/keyring",
    "cross-keychain",
    "@zapier/zapier-sdk-cli-login",
  ],
};

export default nextConfig;
