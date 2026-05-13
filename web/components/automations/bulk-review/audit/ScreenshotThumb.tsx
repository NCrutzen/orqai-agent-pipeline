"use client";

// Phase 82.3 Plan 05 — ScreenshotThumb client component.
// Renders a 128px-max thumbnail of an iController capture stored in the
// `automation-screenshots` Supabase Storage bucket. On mount it requests
// a signed URL from /api/automations/audit/signed-url (Plan 08 lands the
// API route — until then this component degrades to the error fallback).
//
// UI-SPEC §Interaction Contract:
//   - max-height 128px, native aspect ratio
//   - click toggles inline full-width expand (NO modal)
//   - skeleton shimmer at thumbnail dimensions while fetching
//   - muted error line + Refresh button on fetch failure
//   - 200ms client-side cache to avoid duplicate fetches when both Before
//     and After thumbs render or when an expander is rapidly re-opened

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const SIGNED_URL_TTL_MS = 200;

interface CacheEntry {
  url: string;
  cachedAt: number;
}

// Module-level cache, intentionally shared across all ScreenshotThumb
// instances so two thumbs requesting the same path within 200ms hit only
// one network call.
const signedUrlCache = new Map<string, CacheEntry>();

interface Props {
  path: string;
  label: string;
}

const wrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2, 8px)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-muted, #8a93a3)",
};

const thumbImgStyle: React.CSSProperties = {
  maxHeight: 128,
  height: "auto",
  width: "auto",
  cursor: "pointer",
  borderRadius: 4,
  border: "1px solid var(--border, #1f2a3a)",
};

const fullImgStyle: React.CSSProperties = {
  width: "100%",
  height: "auto",
  borderRadius: 4,
  border: "1px solid var(--border, #1f2a3a)",
};

const errorTextStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-muted, #8a93a3)",
};

const refreshBtnStyle: React.CSSProperties = {
  marginLeft: 8,
  padding: "2px 8px",
  fontSize: 12,
  background: "transparent",
  color: "var(--text, #e6ebf2)",
  border: "1px solid var(--border, #1f2a3a)",
  borderRadius: 4,
  cursor: "pointer",
};

export function ScreenshotThumb({ path, label }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);

  const doFetch = useCallback(async () => {
    setLoading(true);
    setError(false);

    // Cache check — within 200ms of last successful fetch for this path,
    // reuse the URL without hitting the network.
    const cached = signedUrlCache.get(path);
    if (cached && Date.now() - cached.cachedAt < SIGNED_URL_TTL_MS) {
      setUrl(cached.url);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(
        `/api/automations/audit/signed-url?path=${encodeURIComponent(path)}`,
        { signal: ac.signal },
      );
      if (!res.ok) {
        setError(true);
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { url: string; expires_at: string };
      signedUrlCache.set(path, { url: json.url, cachedAt: Date.now() });
      setUrl(json.url);
      setLoading(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(true);
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void doFetch();
    return () => {
      abortRef.current?.abort();
    };
  }, [doFetch]);

  return (
    <div style={wrapStyle} data-testid={`screenshot-thumb-${label}`}>
      <span style={labelStyle}>{label}</span>
      {loading ? (
        <Skeleton
          aria-label="Loading screenshot…"
          style={{ height: 128, width: 200 }}
        />
      ) : error ? (
        <div style={errorTextStyle}>
          Screenshot unavailable. Refresh to retry.
          <button
            type="button"
            style={refreshBtnStyle}
            onClick={() => void doFetch()}
          >
            Refresh
          </button>
        </div>
      ) : url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={label}
            style={thumbImgStyle}
            onClick={() => setExpanded((v) => !v)}
          />
          {expanded ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`${label} (expanded)`}
              style={fullImgStyle}
              data-testid={`screenshot-full-${label}`}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
