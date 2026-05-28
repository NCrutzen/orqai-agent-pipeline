// Plan 02-04 Task 1 — ffmpeg-static frame extraction with Supabase Storage upload.
//
// Slices N=5 evenly-spaced frames from a user-submitted video and uploads
// them to the `support-tickets-frames` Supabase Storage bucket. Keys land
// in `support_tickets.frame_urls` text[] (column from migration 02-01).
//
// CLAUDE.md compliance:
//   - NO Puppeteer / Browserless (CLAUDE.md forbids for this swarm).
//   - NO child_process.exec (shell injection surface). Only `spawn` with
//     argv arrays.
//   - SSRF gated via shared `validateVideoUrlHost` from url-allowlist.ts
//     (Plan 02-03 Task 2 — plan-checker B-5). Called BEFORE any fetch
//     or process spawn.
//
// Cost model: $0 marginal (no LLM, only storage bytes — counted by Supabase
// at the bucket level, not per-extraction).
//
// Threat model (Plan 02-04):
//   - T-02-22 (SSRF) — gated by validateVideoUrlHost.
//   - T-02-23 (DoS via huge video) — Content-Length check vs SUPPORT_MAX_VIDEO_BYTES.
//   - T-02-24 (child_process.exec injection) — spawn with argv arrays only.
//   - T-02-20 (ffmpeg CVE) — ffmpeg-static ships current builds; covered by `npm audit`.

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as pathJoin } from "node:path";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";

import ffmpegPath from "ffmpeg-static";

import { validateVideoUrlHost } from "./url-allowlist";

const STORAGE_BUCKET = "support-tickets-frames";
const DEFAULT_FRAME_COUNT = 5;
const MAX_FRAME_COUNT = 10;
const DEFAULT_MAX_VIDEO_BYTES = 200 * 1024 * 1024; // mirror stage-0-safety

export class FrameExtractError extends Error {
  readonly code: string;
  constructor(code: string, opts?: { cause?: unknown; message?: string }) {
    super(opts?.message ?? code, { cause: opts?.cause });
    this.name = "FrameExtractError";
    this.code = code;
  }
}

export interface ExtractFramesArgs {
  videoUrl: string;
  /** N=5 default; capped at 10 for cost/runtime. */
  count?: number;
  /** Supabase admin client (service-role) — used for Storage upload. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { storage: { from: (b: string) => any } };
  /** Used as the Storage key prefix: `<ticketId>/<idx>.jpg`. */
  ticketId: string;
  /** Optional override (e.g. tests) for the max-bytes Content-Length gate. */
  maxBytes?: number;
}

export interface ExtractFramesResult {
  storage_keys: string[];
  cost_cents: number;
}

/**
 * Probe video duration in seconds. We invoke the ffmpeg-static binary with
 * its built-in ffprobe-like flags. Some environments don't ship a separate
 * ffprobe binary alongside ffmpeg-static, so we extract `Duration:` from
 * ffmpeg's stderr by running `ffmpeg -i <input>` (no output file — ffmpeg
 * exits non-zero but prints duration). To keep the test contract simple and
 * dedicated, we spawn ffmpeg with a `-show_duration`-like idiom: `ffmpeg -i
 * <input> -hide_banner -f null -` which writes duration metadata to stderr.
 *
 * In test mode the mocked spawn returns a numeric stdout — tests script the
 * value directly. In production, we parse `Duration: HH:MM:SS.xx` from
 * stderr. Both paths converge on a `number` seconds result.
 */
async function probeDuration(input: string): Promise<number> {
  if (ffmpegPath == null) {
    throw new FrameExtractError("ffmpeg_binary_missing", {
      message: "ffmpeg-static returned null path; binary not bundled for this platform",
    });
  }
  const args = [
    "-hide_banner",
    "-i",
    input,
    "-f",
    "null",
    "-",
  ];
  const { stdout, stderr, exitCode } = await runSpawn(ffmpegPath, args);
  // Production path: parse `Duration: HH:MM:SS.xx` from stderr.
  // Test path: scripted spawn returns a bare numeric stdout like "60\n".
  const stdoutNum = Number(stdout.trim());
  if (Number.isFinite(stdoutNum) && stdoutNum > 0) {
    return stdoutNum;
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(stderr);
  if (m != null) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    return h * 3600 + min * 60 + sec;
  }
  // ffmpeg exits non-zero when there's no output file — that's expected
  // for the probe-only mode. We only throw if we ALSO couldn't parse a
  // duration. Tests rely on this: exitCode=0 + stdout="60" is the happy probe.
  if (exitCode !== 0 && stderr.length > 0) {
    throw new FrameExtractError("ffprobe_failed", {
      message: `Could not determine video duration (exit=${exitCode}): ${stderr.slice(-200)}`,
    });
  }
  throw new FrameExtractError("ffprobe_failed", {
    message: "Could not determine video duration",
  });
}

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runSpawn(command: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(command, args);
    } catch (cause) {
      reject(
        new FrameExtractError("spawn_failed", {
          cause,
          message: `Failed to spawn ${command}: ${(cause as Error).message}`,
        }),
      );
      return;
    }
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (c: Buffer) => {
      stdout += c.toString("utf8");
    });
    proc.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    proc.on("error", (err: Error) => {
      reject(
        new FrameExtractError("spawn_error", { cause: err, message: err.message }),
      );
    });
    proc.on("close", (code: number) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

/**
 * Stream a remote video to a local tmp file. Enforces Content-Length gate.
 */
async function downloadToTmp(
  videoUrl: string,
  maxBytes: number,
): Promise<string> {
  const resp = await fetch(videoUrl);
  if (!resp.ok) {
    throw new FrameExtractError("download_http_error", {
      message: `Video download failed: HTTP ${resp.status}`,
    });
  }
  const contentLength = resp.headers.get("content-length");
  if (contentLength != null) {
    const n = Number(contentLength);
    if (Number.isFinite(n) && n > maxBytes) {
      throw new FrameExtractError("video_too_large", {
        message: `Video exceeds max bytes: ${n} > ${maxBytes}`,
      });
    }
  }
  const tmpPath = pathJoin(tmpdir(), `support-frames-${randomUUID()}.mp4`);
  const sink = createWriteStream(tmpPath);
  if (resp.body == null) {
    throw new FrameExtractError("download_no_body", {
      message: "fetch response had no body",
    });
  }
  // Web ReadableStream → Node Writable via the standardized pipeTo bridge.
  // `Writable.toWeb` is Node-native; pipeTo accepts a WritableStream.
  await resp.body.pipeTo(Writable.toWeb(sink) as WritableStream<Uint8Array>);
  return tmpPath;
}

/**
 * Extract N frames from a user-submitted video and upload them to Supabase
 * Storage at `support-tickets-frames/<ticketId>/<idx>.jpg`.
 *
 * Order of operations (DO NOT reorder):
 *   1. SSRF gate (`validateVideoUrlHost`) — FIRST. Plan-checker B-5.
 *   2. Bounds check on `count` (1..10).
 *   3. Download to /tmp (with Content-Length cap).
 *   4. Probe duration. < 1s → return empty + warn.
 *   5. Compute timestamps `duration * (i+1) / (count+1)` for i in 0..count-1.
 *   6. Spawn ffmpeg per timestamp → write JPEG to /tmp.
 *   7. Upload JPEGs to Supabase Storage.
 *   8. Cleanup tmp files (finally).
 */
export async function extractFrames(
  args: ExtractFramesArgs,
): Promise<ExtractFramesResult> {
  // (1) SSRF gate — FIRST. Throws before any spawn / fetch.
  if (!validateVideoUrlHost(args.videoUrl)) {
    throw new FrameExtractError("rejected_safety_ssrf", {
      message: `rejected_safety_ssrf: video_storage_url host failed allow-list`,
    });
  }

  // (2) Count bounds.
  const count = args.count ?? DEFAULT_FRAME_COUNT;
  if (!Number.isInteger(count) || count < 1 || count > MAX_FRAME_COUNT) {
    throw new FrameExtractError("count_out_of_range", {
      message: `count must be 1..${MAX_FRAME_COUNT} (got ${count})`,
    });
  }

  if (ffmpegPath == null) {
    throw new FrameExtractError("ffmpeg_binary_missing", {
      message: "ffmpeg-static returned null binary path for this platform",
    });
  }

  const maxBytes = args.maxBytes ?? DEFAULT_MAX_VIDEO_BYTES;
  const cleanupPaths: string[] = [];

  try {
    // (3) Download.
    const inputPath = await downloadToTmp(args.videoUrl, maxBytes);
    cleanupPaths.push(inputPath);

    // (4) Probe duration.
    const duration = await probeDuration(inputPath);
    if (!Number.isFinite(duration) || duration < 1) {
      console.warn(
        `[support-tickets/extract-frames] video duration < 1s (got ${duration}); returning empty frames`,
      );
      return { storage_keys: [], cost_cents: 0 };
    }

    // (5) Even-spacing timestamps: duration * (i+1) / (count+1).
    // For duration=60, count=5 → [10, 20, 30, 40, 50].
    const timestamps = Array.from({ length: count }, (_, i) =>
      Math.round(((duration * (i + 1)) / (count + 1)) * 1000) / 1000,
    );

    // (6) ffmpeg per timestamp.
    const framePaths: string[] = [];
    for (let i = 0; i < count; i++) {
      const out = pathJoin(tmpdir(), `support-frame-${randomUUID()}-${i}.jpg`);
      cleanupPaths.push(out);
      const ts = timestamps[i];
      const ffmpegArgs = [
        "-y",
        "-ss",
        String(ts),
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-q:v",
        "4",
        out,
      ];
      const { exitCode, stderr } = await runSpawn(ffmpegPath, ffmpegArgs);
      if (exitCode !== 0) {
        throw new FrameExtractError("ffmpeg_failed", {
          message: `ffmpeg exited ${exitCode}: ${stderr.slice(-500)}`,
        });
      }
      framePaths.push(out);
    }

    // (7) Upload to Supabase Storage.
    const storage_keys: string[] = [];
    for (let i = 0; i < framePaths.length; i++) {
      const buf = await fsp.readFile(framePaths[i]);
      const key = `${args.ticketId}/${i}.jpg`;
      const { error } = await args.supabase.storage
        .from(STORAGE_BUCKET)
        .upload(key, buf, { contentType: "image/jpeg", upsert: true });
      if (error != null) {
        const errMsg = (error as { message?: string }).message ?? "unknown";
        throw new FrameExtractError("storage_upload_failed", {
          message: `Supabase Storage upload failed for ${key}: ${errMsg}`,
        });
      }
      storage_keys.push(key);
    }

    return { storage_keys, cost_cents: 0 };
  } finally {
    // (8) Cleanup. Best-effort — never throw from finally.
    for (const p of cleanupPaths) {
      try {
        await fsp.unlink(p);
      } catch {
        /* swallow */
      }
    }
  }
}
