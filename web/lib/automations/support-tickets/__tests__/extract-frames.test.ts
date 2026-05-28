// Plan 02-04 Task 1 — extractFrames tests.
//
// Tests cover:
//   - SSRF reject (plan-checker B-5; uses validateVideoUrlHost fixtures)
//   - happy path: 5 frames evenly spaced, uploaded to Supabase Storage
//   - default count = 5
//   - count > 10 rejection
//   - duration < 1s short-circuit
//   - ffmpeg spawn non-zero exit
//   - even-spacing math (60s video, count=5 → [10, 20, 30, 40, 50])
//
// Strategy: mock node:child_process spawn + node:fs/promises + global fetch +
// supabase storage chain. All file/process IO is fenced behind mocks; we
// assert only at the boundary (timestamps passed to spawn, keys passed to
// storage.upload).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// Mock ffmpeg-static — must export a string path
vi.mock("ffmpeg-static", () => ({ default: "/fake/path/to/ffmpeg" }));

// Build a child_process.spawn mock. spawnCalls records every call; per call,
// we register an exit code (0 by default) plus any stderr output.
type SpawnCall = { command: string; args: string[] };
const spawnCalls: SpawnCall[] = [];
let spawnExitCode = 0;
let spawnStderr = "";
let spawnStdout = ""; // for ffprobe duration output

// Sequential outputs — used to differentiate ffprobe duration calls vs ffmpeg
// frame extraction calls. Index increments per spawn call.
const spawnScript: Array<{ exitCode?: number; stderr?: string; stdout?: string }> = [];

const spawn = (command: string, args: ReadonlyArray<string>) => {
  const callIdx = spawnCalls.length;
  spawnCalls.push({ command, args: [...args] });
  const ee = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  const scripted = spawnScript[callIdx];
  const code = scripted?.exitCode ?? spawnExitCode;
  const stderr = scripted?.stderr ?? spawnStderr;
  const stdout = scripted?.stdout ?? spawnStdout;
  queueMicrotask(() => {
    if (stdout.length > 0) ee.stdout.emit("data", Buffer.from(stdout));
    if (stderr.length > 0) ee.stderr.emit("data", Buffer.from(stderr));
    ee.emit("close", code);
  });
  return ee;
};
vi.mock("node:child_process", () => ({
  default: { spawn },
  spawn,
}));

// fs/promises — readFile returns a fake JPEG buffer, unlink no-ops.
vi.mock("node:fs/promises", () => ({
  default: {},
  readFile: vi.fn(async () => Buffer.from("fake-jpeg-bytes")),
  unlink: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

// fs (sync) — createWriteStream returns a writable stream stub used by the
// streaming download path.
vi.mock("node:fs", async () => {
  const { Writable } = await import("node:stream");
  const createWriteStream = () => {
    const w = new Writable({
      write(_chunk: unknown, _enc: BufferEncoding, cb: (err?: Error | null) => void) {
        cb(null);
      },
    });
    return w;
  };
  return {
    default: { createWriteStream },
    createWriteStream,
  };
});

// Capture supabase storage upload calls.
type UploadCall = { bucket: string; key: string; body: unknown; opts: unknown };
const uploadCalls: UploadCall[] = [];
let storageUploadError: { message: string } | null = null;
function buildSupabaseMock() {
  return {
    storage: {
      from(bucket: string) {
        return {
          upload(key: string, body: unknown, opts: unknown) {
            uploadCalls.push({ bucket, key, body, opts });
            return Promise.resolve({
              data: { path: `${bucket}/${key}` },
              error: storageUploadError,
            });
          },
        };
      },
    },
  };
}

beforeEach(() => {
  spawnCalls.length = 0;
  spawnScript.length = 0;
  uploadCalls.length = 0;
  spawnExitCode = 0;
  spawnStderr = "";
  spawnStdout = "";
  storageUploadError = null;
  // mock global fetch — returns a body with ~1MB Content-Length and a stream.
  const fakeBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff])); // tiny payload
      controller.close();
    },
  });
  (globalThis as { fetch?: unknown }).fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (h: string) => (h.toLowerCase() === "content-length" ? "1024" : null),
    },
    body: fakeBody,
    arrayBuffer: async () => new ArrayBuffer(8),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: configure spawn script for a "duration=N seconds" ffprobe call
// followed by `count` ffmpeg frame calls.
function scriptDurationThenFrames(durationSec: number, count: number) {
  // ffprobe writes duration to stdout
  spawnScript.push({ exitCode: 0, stdout: `${durationSec}\n` });
  for (let i = 0; i < count; i++) {
    spawnScript.push({ exitCode: 0 });
  }
}

const TICKET_ID = "abc-123-ticket";
const VALID_VIDEO_URL = "https://abc.supabase.co/storage/v1/object/sign/v.mp4?t=1";

describe("extractFrames — Plan 02-04", () => {
  it("Test 0a: SSRF reject — AWS metadata IP throws rejected_safety_ssrf before any spawn/fetch", async () => {
    const mod = await import("../extract-frames");
    const supabase = buildSupabaseMock();
    await expect(
      mod.extractFrames({
        videoUrl: "http://169.254.169.254/x",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        ticketId: TICKET_ID,
      }),
    ).rejects.toMatchObject({ code: "rejected_safety_ssrf" });
    expect(spawnCalls.length).toBe(0);
    expect(uploadCalls.length).toBe(0);
  });

  it("Test 0b: SSRF reject — localhost throws rejected_safety_ssrf", async () => {
    const mod = await import("../extract-frames");
    const supabase = buildSupabaseMock();
    await expect(
      mod.extractFrames({
        videoUrl: "https://localhost/v.mp4",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        ticketId: TICKET_ID,
      }),
    ).rejects.toMatchObject({ code: "rejected_safety_ssrf" });
  });

  it("Test 0c: SSRF reject — private CIDR 10.0.0.5 throws rejected_safety_ssrf", async () => {
    const mod = await import("../extract-frames");
    const supabase = buildSupabaseMock();
    await expect(
      mod.extractFrames({
        videoUrl: "https://10.0.0.5/v.mp4",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        ticketId: TICKET_ID,
      }),
    ).rejects.toMatchObject({ code: "rejected_safety_ssrf" });
  });

  it("Test 1: happy path — 5 frames from a 60s supabase URL → 5 keys + 5 uploads", async () => {
    scriptDurationThenFrames(60, 5);
    const mod = await import("../extract-frames");
    const supabase = buildSupabaseMock();
    const result = await mod.extractFrames({
      videoUrl: VALID_VIDEO_URL,
      count: 5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      ticketId: TICKET_ID,
    });
    expect(result.cost_cents).toBe(0);
    expect(result.storage_keys.length).toBe(5);
    expect(result.storage_keys).toEqual([
      `${TICKET_ID}/0.jpg`,
      `${TICKET_ID}/1.jpg`,
      `${TICKET_ID}/2.jpg`,
      `${TICKET_ID}/3.jpg`,
      `${TICKET_ID}/4.jpg`,
    ]);
    expect(uploadCalls.length).toBe(5);
    expect(uploadCalls.every((c) => c.bucket === "support-tickets-frames")).toBe(true);
  });

  it("Test 2: count omitted → default 5 frames extracted", async () => {
    scriptDurationThenFrames(60, 5);
    const mod = await import("../extract-frames");
    const supabase = buildSupabaseMock();
    const result = await mod.extractFrames({
      videoUrl: VALID_VIDEO_URL,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      ticketId: TICKET_ID,
    });
    expect(result.storage_keys.length).toBe(5);
  });

  it("Test 3: count > 10 → throws FrameExtractError(count must be 1..10)", async () => {
    const mod = await import("../extract-frames");
    const supabase = buildSupabaseMock();
    await expect(
      mod.extractFrames({
        videoUrl: VALID_VIDEO_URL,
        count: 11,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        ticketId: TICKET_ID,
      }),
    ).rejects.toThrow(/count must be 1\.\.10/);
  });

  it("Test 4: duration < 1s → returns empty storage_keys, no upload", async () => {
    spawnScript.push({ exitCode: 0, stdout: "0.5\n" });
    const mod = await import("../extract-frames");
    const supabase = buildSupabaseMock();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await mod.extractFrames({
      videoUrl: VALID_VIDEO_URL,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      ticketId: TICKET_ID,
    });
    expect(result.storage_keys).toEqual([]);
    expect(result.cost_cents).toBe(0);
    expect(uploadCalls.length).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it("Test 5: ffmpeg exit non-zero → throws FrameExtractError with stderr tail", async () => {
    spawnScript.push({ exitCode: 0, stdout: "60\n" }); // ffprobe ok
    spawnScript.push({ exitCode: 1, stderr: "ffmpeg: Invalid data found when processing input" });
    const mod = await import("../extract-frames");
    const supabase = buildSupabaseMock();
    await expect(
      mod.extractFrames({
        videoUrl: VALID_VIDEO_URL,
        count: 5,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabase as any,
        ticketId: TICKET_ID,
      }),
    ).rejects.toThrow(/Invalid data found|ffmpeg/i);
  });

  it("Test 6: even-spacing math — 60s video, count=5 → -ss args [10, 20, 30, 40, 50]", async () => {
    scriptDurationThenFrames(60, 5);
    const mod = await import("../extract-frames");
    const supabase = buildSupabaseMock();
    await mod.extractFrames({
      videoUrl: VALID_VIDEO_URL,
      count: 5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      ticketId: TICKET_ID,
    });
    // First spawn = ffprobe; following 5 spawns = ffmpeg with -ss <ts>
    const ffmpegCalls = spawnCalls.slice(1);
    expect(ffmpegCalls.length).toBe(5);
    const ssValues = ffmpegCalls.map((c) => {
      const i = c.args.indexOf("-ss");
      return Number(c.args[i + 1]);
    });
    expect(ssValues).toEqual([10, 20, 30, 40, 50]);
  });
});
