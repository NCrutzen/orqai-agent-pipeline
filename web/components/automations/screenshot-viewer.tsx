"use client";

/**
 * Thumbnail + lightbox for a screenshot.
 *
 * Accepts EITHER a direct `url` (newer automations embed a signed URL in
 * `result.screenshots.{before,after}.url` with ~1h TTL) or a `path`
 * (legacy shape) that we can sign on-demand via the server action.
 *
 * If a direct `url` fails to load (TTL expired), we transparently fall
 * back to re-signing `path` via `getScreenshotUrl`.
 */

import { useEffect, useState } from "react";
import { ImageOff, ZoomIn } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getScreenshotUrl } from "./screenshot-actions";

interface ScreenshotViewerProps {
  /** Stable bucket path. Used to re-sign when `url` is missing/expired. */
  path?: string;
  /** Optional pre-signed URL (e.g. from result.screenshots.*.url). */
  url?: string | null;
  label: string;
  className?: string;
}

export function ScreenshotViewer({
  path,
  url: initialUrl,
  label,
  className,
}: ScreenshotViewerProps) {
  const [url, setUrl] = useState<string | null>(initialUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [triedRefresh, setTriedRefresh] = useState(false);

  useEffect(() => {
    // If we already have a URL (from the caller), don't fetch proactively —
    // only re-sign on <img onError>.
    if (initialUrl) {
      setUrl(initialUrl);
      setError(null);
      setTriedRefresh(false);
      return;
    }
    if (!path) {
      setError("missing path");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await getScreenshotUrl(path);
      if (cancelled) return;
      setUrl(res.url);
      setError(res.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [path, initialUrl]);

  const refreshFromPath = async () => {
    if (triedRefresh || !path) {
      setError("expired");
      return;
    }
    setTriedRefresh(true);
    const res = await getScreenshotUrl(path);
    setUrl(res.url);
    setError(res.error);
  };

  return (
    <Dialog>
      <div
        className={cn(
          "flex flex-col gap-1.5 rounded-[var(--v7-radius-inner,14px)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] p-2",
          className,
        )}
      >
        <div className="flex items-center justify-between text-[11px] text-[var(--v7-muted)]">
          <span className="font-medium uppercase tracking-[0.08em]">
            {label}
          </span>
          {url && (
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[var(--v7-brand-primary)] hover:underline"
              >
                <ZoomIn size={11} />
                Vergroot
              </button>
            </DialogTrigger>
          )}
        </div>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={!url}
            className="group relative block h-40 overflow-hidden rounded-[var(--v7-radius-inner,10px)] border border-[var(--v7-line)] bg-[var(--v7-panel)] disabled:cursor-default"
          >
            {error && !url ? (
              <div className="flex h-full items-center justify-center gap-2 text-[12px] text-[var(--v7-red)]">
                <ImageOff size={14} />
                <span>Kan screenshot niet laden</span>
              </div>
            ) : url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={label}
                onError={refreshFromPath}
                className="h-full w-full object-cover object-top transition-transform duration-200 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="h-full w-full animate-pulse bg-[var(--v7-panel-2)]" />
            )}
          </button>
        </DialogTrigger>
      </div>

      <DialogContent
        className="max-h-[92vh] w-[min(92vw,1400px)] overflow-auto rounded-[var(--v7-radius)] border border-[var(--v7-line)] bg-[var(--v7-panel)] p-4"
        showCloseButton
      >
        <DialogTitle className="mb-3 text-[13px] uppercase tracking-[0.1em] text-[var(--v7-muted)]">
          {label}
        </DialogTitle>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            onError={refreshFromPath}
            className="mx-auto max-h-[80vh] w-auto rounded-[var(--v7-radius-inner,10px)] border border-[var(--v7-line)]"
          />
        ) : (
          <div className="flex h-80 items-center justify-center text-[var(--v7-muted)]">
            Screenshot niet beschikbaar
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
