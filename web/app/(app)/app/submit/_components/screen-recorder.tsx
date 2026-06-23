"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import {
  MonitorPlay,
  StopCircle,
  RotateCcw,
  MonitorOff,
  AlertTriangle,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ─── Types ────────────────────────────────────────────────────────────────────

type RecorderState = "idle" | "recording" | "preview" | "fallback";

interface ScreenRecorderProps {
  disabled: boolean;
  onRecorded: (blob: Blob, durationSeconds: number) => void;
  onCleared: () => void;
  onTextOnly: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ScreenRecorder({
  disabled,
  onRecorded,
  onCleared,
  onTextOnly,
}: ScreenRecorderProps) {
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [blobURL, setBlobURL] = useState<string | null>(null);
  const [showNoAudioWarning, setShowNoAudioWarning] = useState(false);
  const [noAudioDismissed, setNoAudioDismissed] = useState(false);
  const [autoStopMessage, setAutoStopMessage] = useState(false);
  // Announce timer to screen readers ~every 30s
  const [timerAnnounce, setTimerAnnounce] = useState<string>("");

  // Refs for imperative handles (chat-ui.tsx pattern)
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  // Avoid stale closure in onstop callback
  const elapsedRef = useRef(0);

  // Feature detection on mount (Pitfall 4 — if getDisplayMedia absent → fallback immediately)
  useEffect(() => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia
    ) {
      setRecorderState("fallback");
    }

    // Cleanup on unmount: stop recorder, clear timers, close AudioContext, stop tracks
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore — component is unmounting
        }
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
      tracksRef.current.forEach((t) => t.stop());
    };
  }, []);

  // startRecording MUST be a direct user-click handler (Pitfall 4 — async triggered by click)
  const startRecording = useCallback(async () => {
    try {
      // Capture display stream (video + optional system audio)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15 },
        audio: true,
      });

      // Capture microphone audio
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      // Combine audio via AudioContext (D-06: graceful if no display audio tracks)
      const audioContext = new AudioContext();
      const dest = audioContext.createMediaStreamDestination();

      if (displayStream.getAudioTracks().length > 0) {
        audioContext
          .createMediaStreamSource(displayStream)
          .connect(dest);
      }
      audioContext.createMediaStreamSource(micStream).connect(dest);

      // Combined stream: display video + mixed audio destination
      const combined = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      // Codec negotiation (D-08): vp9,opus preferred, plain webm fallback
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      const recorder = new MediaRecorder(combined, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setBlobURL(url);
        onRecorded(blob, elapsedRef.current);
        setRecorderState("preview");
      };

      recorder.start(1000); // collect chunks every second
      recorderRef.current = recorder;

      // Track all active tracks for cleanup
      tracksRef.current = [
        ...displayStream.getTracks(),
        ...micStream.getTracks(),
      ];

      audioCtxRef.current = audioContext;

      // ─── No-audio detection via AnalyserNode (D-10) ───────────────────────
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      // Connect mic source also to analyser (separate from dest)
      audioContext.createMediaStreamSource(micStream).connect(analyser);
      const bufferLength = analyser.fftSize;
      const dataArray = new Uint8Array(bufferLength);
      let silenceSeconds = 0;

      silenceTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(dataArray);
        const rms =
          Math.sqrt(
            dataArray.reduce((sum, v) => sum + (v - 128) ** 2, 0) /
              bufferLength
          ) / 128;
        if (rms < 0.01) {
          silenceSeconds++;
          if (silenceSeconds >= 5 && !noAudioDismissed) {
            setShowNoAudioWarning(true);
          }
        } else {
          silenceSeconds = 0;
          setShowNoAudioWarning(false);
          // Allow re-triggering on next silence period
          setNoAudioDismissed(false);
        }
      }, 1000);

      // ─── Timer with 5-min soft limit (D-07) ───────────────────────────────
      setElapsedSeconds(0);
      elapsedRef.current = 0;

      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => {
          const next = s + 1;
          elapsedRef.current = next;

          // Announce to screen readers every 30s
          if (next % 30 === 0) {
            setTimerAnnounce(`Opname loopt: ${formatMMSS(next)}`);
          }

          // Auto-stop at 300s (5 min)
          if (next >= 300) {
            if (timerRef.current) clearInterval(timerRef.current);
            if (silenceTimerRef.current)
              clearInterval(silenceTimerRef.current);
            recorderRef.current?.stop();
            tracksRef.current.forEach((t) => t.stop());
            setAutoStopMessage(true);
          }
          return next;
        });
      }, 1000);

      setRecorderState("recording");
    } catch (err) {
      // D-09: NotAllowedError or no mediaDevices → fallback state
      if (
        err instanceof DOMException ||
        !navigator.mediaDevices?.getDisplayMedia
      ) {
        setRecorderState("fallback");
      }
    }
  }, [onRecorded, noAudioDismissed]);

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    tracksRef.current.forEach((t) => t.stop());
    recorderRef.current?.stop();
  }

  function clearRecording() {
    if (blobURL) URL.revokeObjectURL(blobURL);
    setBlobURL(null);
    setElapsedSeconds(0);
    elapsedRef.current = 0;
    setAutoStopMessage(false);
    setShowNoAudioWarning(false);
    setNoAudioDismissed(false);
    setRecorderState("idle");
    onCleared();
  }

  // ─── Timer color: red during recording, amber at ≥240s ────────────────────
  const timerIsAmber = elapsedSeconds >= 240;
  const timerBadgeClass = timerIsAmber
    ? "bg-[var(--v7-amber-soft)] text-[var(--v7-amber)] border border-[var(--v7-amber)]"
    : "bg-[var(--v7-red-soft,rgba(181,69,78,0.12))] text-[var(--v7-red)] border border-[var(--v7-red)]";

  // ─── Render ───────────────────────────────────────────────────────────────

  // State 4a — Pre-recording
  if (recorderState === "idle") {
    return (
      <div>
        <p className="text-sm text-[var(--v7-muted)]">
          Neem je scherm op terwijl je het probleem uitlegt. Spreek luidop — de
          voice-over is essentieel voor de verwerking.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full mt-4"
          onClick={startRecording}
          disabled={disabled}
          title={disabled ? "Vul eerst type, titel en systeem in" : undefined}
        >
          <MonitorPlay className="size-4 mr-2" aria-hidden="true" />
          Start opname
        </Button>
      </div>
    );
  }

  // State 4b — Active recording
  if (recorderState === "recording") {
    return (
      <div>
        {/* Timer announce (screen readers, every ~30s) */}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {timerAnnounce}
        </span>

        {/* Recording header: indicator + timer badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2" aria-label="Opname actief">
            <span
              className="size-2 rounded-full animate-pulse bg-[var(--v7-red)]"
              aria-hidden="true"
            />
            <span className="text-sm text-[var(--v7-muted)]">
              Opname bezig
            </span>
          </div>
          <div aria-live="polite" aria-atomic="false">
            <Badge className={timerBadgeClass}>
              {formatMMSS(elapsedSeconds)}
            </Badge>
          </div>
        </div>

        {/* 4:00 warning (amber) */}
        {timerIsAmber && (
          <div className="flex items-center gap-2 mb-3 text-sm text-[var(--v7-amber)] animate-in fade-in slide-in-from-top-1 duration-150">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>
              Je opname stopt automatisch na 5 minuten. Rond je toelichting af.
            </span>
          </div>
        )}

        {/* No-audio warning (dismissable amber pill) */}
        {showNoAudioWarning && !noAudioDismissed && (
          <div
            className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-top-1 duration-150"
            style={{
              background: "var(--v7-amber-soft)",
              color: "var(--v7-amber)",
            }}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              <span>
                Geen audio gedetecteerd — spreek in de microfoon
              </span>
            </div>
            <button
              type="button"
              aria-label="Sluit waarschuwing"
              className="shrink-0 hover:opacity-70"
              onClick={() => {
                setNoAudioDismissed(true);
                setShowNoAudioWarning(false);
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Stop button */}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={stopRecording}
        >
          <StopCircle className="size-4 mr-2" aria-hidden="true" />
          Stop opname
        </Button>
      </div>
    );
  }

  // State 4c — Preview (after stop, before submit)
  if (recorderState === "preview") {
    return (
      <div>
        {autoStopMessage && (
          <p className="text-sm text-[var(--v7-muted)] mb-2">
            Opname gestopt na 5 minuten.
          </p>
        )}
        {blobURL && (
          <video
            src={blobURL}
            controls
            className="w-full rounded-lg max-h-64 mt-2"
            aria-label="Voorbeeld van je opname"
          />
        )}
        <p className="text-sm text-[var(--v7-muted)] mt-2">
          Opname: {formatMMSS(elapsedRef.current)}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 text-[var(--v7-brand-primary)]"
          onClick={clearRecording}
        >
          <RotateCcw className="size-4 mr-2" aria-hidden="true" />
          Opnieuw opnemen
        </Button>
      </div>
    );
  }

  // State 4d — Fallback (D-09): no getDisplayMedia or permission denied
  return (
    <div className="flex flex-col items-center text-center py-6">
      <MonitorOff
        className="size-12 text-[var(--v7-faint)] mb-4"
        aria-hidden="true"
      />
      <h3 className="font-display text-base font-semibold text-[var(--v7-text)] mb-2">
        Schermopname niet beschikbaar
      </h3>
      <p className="text-sm text-[var(--v7-muted)] max-w-sm">
        Schermopname werkt alleen in een desktop-browser (Chrome, Edge of
        Firefox). Zorg dat je de benodigde toestemming verleent in je browser.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        onClick={startRecording}
      >
        <RefreshCw className="size-4 mr-2" aria-hidden="true" />
        Opnieuw proberen
      </Button>
      <Separator className="my-4 w-full" />
      <p className="text-sm text-[var(--v7-red)] font-semibold mb-2">
        Toch indienen zonder opname?
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-[var(--v7-muted)]"
        onClick={onTextOnly}
      >
        Indienen zonder opname (minder volledig)
      </Button>
    </div>
  );
}
