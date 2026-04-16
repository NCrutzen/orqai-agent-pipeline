import type { Page } from "playwright-core";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "automation-screenshots";

interface ScreenshotOptions {
  /** Subfolder in the bucket, e.g. "debtor-emails" or "prolius-report" */
  automation: string;
  /** Descriptive label, e.g. "before-delete" or "after-archive" */
  label: string;
  /** Full page screenshot (default: true) */
  fullPage?: boolean;
}

interface ScreenshotResult {
  path: string;
  url: string | null;
}

/**
 * Capture a screenshot and upload to Supabase Storage.
 * Path format: {automation}/{label}-{timestamp}.png
 * Returns the storage path and a signed URL (1h expiry).
 */
export async function captureScreenshot(
  page: Page,
  options: ScreenshotOptions,
): Promise<ScreenshotResult> {
  const { automation, label, fullPage = true } = options;
  const timestamp = Date.now();
  const path = `${automation}/${label}-${timestamp}.png`;

  const buffer = await page.screenshot({ fullPage });
  const admin = createAdminClient();

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: "image/png",
      upsert: false,
    });

  if (error) {
    throw new Error(`Screenshot upload failed: ${error.message}`);
  }

  const { data: urlData } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);

  return { path, url: urlData?.signedUrl ?? null };
}

/**
 * Capture before/after screenshot pair for audit trail.
 * Returns both paths for storage in automation_runs result.
 */
export async function captureBeforeAfter(
  page: Page,
  automation: string,
  actionLabel: string,
  action: () => Promise<void>,
): Promise<{ before: ScreenshotResult; after: ScreenshotResult }> {
  const before = await captureScreenshot(page, {
    automation,
    label: `${actionLabel}-before`,
  });

  await action();

  const after = await captureScreenshot(page, {
    automation,
    label: `${actionLabel}-after`,
  });

  return { before, after };
}
