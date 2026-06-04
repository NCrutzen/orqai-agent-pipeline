// Plan 02-03 Task 2 — url-allowlist tests (plan-checker B-5 SSRF gate).
//
// `validateVideoUrlHost` is the choke-point that BOTH transcribe.ts (this
// plan) and extract-frames.ts (Plan 02-04) call BEFORE any fetch of the
// user-supplied `video_storage_url`. Internal IPs, localhost, http://, and
// non-allow-listed hosts MUST be rejected.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateVideoUrlHost } from "../url-allowlist";

const ORIG_ENV = process.env.SUPPORT_VIDEO_ALLOWED_HOSTS;

describe("validateVideoUrlHost", () => {
  beforeEach(() => {
    delete process.env.SUPPORT_VIDEO_ALLOWED_HOSTS;
  });
  afterEach(() => {
    if (ORIG_ENV === undefined) delete process.env.SUPPORT_VIDEO_ALLOWED_HOSTS;
    else process.env.SUPPORT_VIDEO_ALLOWED_HOSTS = ORIG_ENV;
  });

  it("rejects AWS metadata IP 169.254.169.254", () => {
    expect(validateVideoUrlHost("http://169.254.169.254/foo")).toBe(false);
    expect(validateVideoUrlHost("https://169.254.169.254/foo")).toBe(false);
  });

  it("rejects localhost", () => {
    expect(validateVideoUrlHost("http://localhost/foo")).toBe(false);
    expect(validateVideoUrlHost("https://localhost/foo")).toBe(false);
  });

  it("rejects bare internal hostname (not in allow-list)", () => {
    expect(validateVideoUrlHost("http://internal-host/foo")).toBe(false);
    expect(validateVideoUrlHost("https://internal-host/foo")).toBe(false);
  });

  it("accepts an https Supabase storage URL by default", () => {
    expect(
      validateVideoUrlHost(
        "https://abc.supabase.co/storage/v1/object/sign/support/vid.mp4?token=xxx",
      ),
    ).toBe(true);
  });

  it("rejects http even when host is on the allow-list (https-only)", () => {
    expect(validateVideoUrlHost("http://abc.supabase.co/storage/v1/object/sign/x")).toBe(false);
  });

  it("respects SUPPORT_VIDEO_ALLOWED_HOSTS env override", () => {
    process.env.SUPPORT_VIDEO_ALLOWED_HOSTS = ".example.com,.supabase.co";
    expect(validateVideoUrlHost("https://foo.example.com/x")).toBe(true);
    expect(validateVideoUrlHost("https://foo.evil.com/x")).toBe(false);
  });

  it("rejects private/loopback/link-local IP ranges", () => {
    expect(validateVideoUrlHost("https://10.0.0.5/x")).toBe(false);
    expect(validateVideoUrlHost("https://192.168.1.1/x")).toBe(false);
    expect(validateVideoUrlHost("https://172.16.0.1/x")).toBe(false);
    expect(validateVideoUrlHost("https://172.31.255.254/x")).toBe(false);
    expect(validateVideoUrlHost("https://127.0.0.1/x")).toBe(false);
    expect(validateVideoUrlHost("https://[::1]/x")).toBe(false);
    expect(validateVideoUrlHost("https://[fe80::1]/x")).toBe(false);
  });

  it("rejects raw IPv4 even if numerically outside private ranges (allow-list is host-suffix-based)", () => {
    expect(validateVideoUrlHost("https://8.8.8.8/x")).toBe(false);
  });

  it("rejects malformed URLs defensively", () => {
    expect(validateVideoUrlHost("not-a-url")).toBe(false);
    expect(validateVideoUrlHost("")).toBe(false);
    expect(validateVideoUrlHost("ftp://abc.supabase.co/x")).toBe(false);
  });
});
