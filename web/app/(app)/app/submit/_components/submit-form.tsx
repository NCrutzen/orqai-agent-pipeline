"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TypeSelector } from "./type-selector";
import { DicteerButton } from "./dicteer-button";
import { ScreenRecorder } from "./screen-recorder";
import { SoortSelector } from "./soort-selector";
import { CategorieCombobox, type Categorie } from "./categorie-combobox";
import { FotoUpload } from "./foto-upload";
import { submitTicket } from "../_actions/submit-ticket";
import { getVideoUploadUrl } from "../_actions/get-upload-url";
import { getPhotoUploadUrl } from "../_actions/get-photo-upload-url";
import { createClient } from "@/lib/supabase/client";

// ─── Form state ──────────────────────────────────────────────────────────────

// Extended union to cover two-step upload flow (UI-SPEC §Submit CTA states 1-5)
type SubmitState = "idle" | "uploading" | "ingesting" | "confirmed" | "error";

interface SubmitFormProps {
  softwareCategories: Categorie[];
  hardwareCategories: Categorie[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SubmitForm({ softwareCategories, hardwareCategories }: SubmitFormProps) {
  const [selectedType, setSelectedType] = React.useState<string>("");
  const [title, setTitle] = React.useState<string>("");
  const [omschrijving, setOmschrijving] = React.useState<string>("");
  // WR-04: initialise with null (not undefined cast) so string | null checks are correct at runtime.
  const [selectedSystem, setSelectedSystem] = React.useState<string | null>(null);
  const [submitState, setSubmitState] = React.useState<SubmitState>("idle");
  const [submissionId, setSubmissionId] = React.useState<string>("");
  const [errorMessage, setErrorMessage] = React.useState<string>("");

  // Plan 03 recording state
  const [videoStorageUrl, setVideoStorageUrl] = React.useState<string | null>(null);
  const [videoBlob, setVideoBlob] = React.useState<Blob | null>(null);
  const [recordingDuration, setRecordingDuration] = React.useState<number>(0);
  // textOnly is ONLY set via the fallback's onTextOnly (D-02: recording required on capable desktop)
  const [textOnly, setTextOnly] = React.useState<boolean>(false);
  const [uploadPercent, setUploadPercent] = React.useState<number>(0);

  // Track whether user explicitly chose a software system (including "staat er niet bij")
  // Kept for handleSoortChange cross-mode reset; no longer drives allRequiredFilled (categorieSelected does)
  const [systemSelected, setSystemSelected] = React.useState<boolean>(false);

  // Phase 5: hardware state
  const [soort, setSoort] = React.useState<"software" | "hardware" | "">("");
  const [categorieSelected, setCategorieSelected] = React.useState<boolean>(false);
  // WR-04: initialise with null (not undefined cast) so string | null checks are correct at runtime.
  const [selectedCategorie, setSelectedCategorie] = React.useState<string | null>(null);
  const [photos, setPhotos] = React.useState<File[]>([]);
  const [submitAttempted, setSubmitAttempted] = React.useState<boolean>(false);
  const [photoUploadProgress, setPhotoUploadProgress] = React.useState<string>("");

  // Focus management for confirmation state (Accessibility Contract)
  const confirmHeadingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (submitState === "confirmed" && confirmHeadingRef.current) {
      confirmHeadingRef.current.focus();
    }
  }, [submitState]);

  // ─── Derived state ─────────────────────────────────────────────────────────

  // Phase 5: hardware path does not require video (D-08 — zachte nudge instead)
  const allRequiredFilled =
    selectedType !== "" &&
    title.trim() !== "" &&
    soort !== "" &&
    categorieSelected &&
    (soort === "hardware"
      ? true                               // foto not required (D-08)
      : videoBlob !== null || textOnly);   // software path unchanged

  // Soft nudge: show when hardware + no photo + no omschrijving + user tried to submit
  const showNudge =
    soort === "hardware" &&
    photos.length === 0 &&
    omschrijving.trim() === "" &&
    submitAttempted;

  // ─── Handlers ──────────────────────────────────────────────────────────────

  // handleSoortChange clears cross-mode state on flip to avoid stale values
  function handleSoortChange(next: "software" | "hardware") {
    setSoort(next);
    if (next === "hardware") {
      // Clear software-mode system selection so no stale software_key leaks into hardware submissions
      setSelectedSystem(null);
      setSystemSelected(false);
    } else {
      // Clear hardware-mode category selection
      setSelectedCategorie(null);
      setCategorieSelected(false);
      setPhotos([]);
    }
  }

  function handleSystemChange(key: string | null) {
    setSelectedSystem(key);
    setSystemSelected(true);
  }

  function handleCategorieChange(key: string | null) {
    setSelectedCategorie(key);
    setCategorieSelected(true);
  }

  async function handleSubmit() {
    // WR-02: setSubmitAttempted must fire BEFORE the guard so showNudge can
    // activate when the user clicks submit with required fields still missing.
    setSubmitAttempted(true);
    if (!allRequiredFilled) return;

    setErrorMessage("");
    setPhotoUploadProgress("");

    let resolvedVideoUrl: string | null = videoStorageUrl;

    // Two-step upload (04-PATTERNS.md §submit-form handleSubmit)
    if (videoBlob && !videoStorageUrl) {
      setSubmitState("uploading");
      setUploadPercent(0);

      // Step 1: get signed upload URL from Server Action (admin client, T-04-09)
      const uploadInfo = await getVideoUploadUrl();
      if ("error" in uploadInfo) {
        setErrorMessage(uploadInfo.error);
        setSubmitState("error");
        return;
      }

      // Step 2: browser uploads blob directly to Supabase storage (bypasses serverless body limit)
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("support-tickets-videos")
        .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, videoBlob, {
          contentType: "video/webm",
          upsert: false,
        });

      if (uploadError) {
        // One silent retry before surfacing the error (UI-SPEC state 4)
        const { error: retryError } = await supabase.storage
          .from("support-tickets-videos")
          .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, videoBlob, {
            contentType: "video/webm",
          });
        if (retryError) {
          setErrorMessage(
            "Upload mislukt. Controleer je verbinding en probeer opnieuw."
          );
          setSubmitState("error");
          return;
        }
      }

      // Step 3: get public URL (bucket is public — Pitfall 7; host is *.supabase.co → SSRF T-04-10)
      const {
        data: { publicUrl },
      } = supabase.storage
        .from("support-tickets-videos")
        .getPublicUrl(uploadInfo.path);

      resolvedVideoUrl = publicUrl;
      // Store so ingest retry reuses the SAME already-uploaded URL (no re-upload)
      setVideoStorageUrl(publicUrl);
      setUploadPercent(100);
    }

    // Phase 5: photo upload loop (hardware path, serial for...of — Pitfall 5)
    const photoUrls: string[] = [];
    if (soort === "hardware" && photos.length > 0) {
      setSubmitState("uploading");
      let uploaded = 0;
      // WR-03: hoist createClient() before the loop — one instance for all photos
      const supabase = createClient();
      for (const photo of photos) {
        const ext = photo.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const uploadInfo = await getPhotoUploadUrl(ext);
        if ("error" in uploadInfo) {
          setErrorMessage("Foto-upload mislukt. Controleer je verbinding en probeer opnieuw.");
          setSubmitState("error");
          return;
        }
        const { error: uploadError } = await supabase.storage
          .from("support-tickets-photos")
          .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, photo, {
            contentType: photo.type,
            upsert: false,
          });
        if (uploadError) {
          setErrorMessage("Foto-upload mislukt. Controleer je verbinding en probeer opnieuw.");
          setSubmitState("error");
          return;
        }
        const {
          data: { publicUrl: photoPublicUrl },
        } = supabase.storage
          .from("support-tickets-photos")
          .getPublicUrl(uploadInfo.path);
        photoUrls.push(photoPublicUrl);
        uploaded += 1;
        // Surface progress per UI-SPEC §Submit CTA
        setPhotoUploadProgress(`Foto's uploaden… ${uploaded}/${photos.length}`);
      }
      setPhotoUploadProgress("");
    }

    // Step 4: call submitTicket with extended payload
    setSubmitState("ingesting");

    // systeem is gated on soort to prevent stale software-system values leaking into hardware tickets
    // (CONTRACT-01 corruption path: null ?? selectedSystem would fall through to a stale software key)
    const result = await submitTicket({
      user_chosen_type: selectedType,
      title: title.trim(),
      omschrijving: omschrijving.trim() || undefined,
      systeem: soort === "hardware" ? (selectedCategorie ?? undefined) : selectedSystem,
      video_storage_url: soort === "software" ? resolvedVideoUrl : null,
      soort: soort || undefined,
      photo_storage_urls: photoUrls.length > 0 ? photoUrls : undefined,
    });

    if ("submission_id" in result) {
      setSubmissionId(result.submission_id);
      setSubmitState("confirmed");
    } else {
      setErrorMessage(result.error);
      setSubmitState("error");
    }
  }

  function handleRetry() {
    setSubmitState("idle");
    setErrorMessage("");
    setUploadPercent(0);
    setPhotoUploadProgress("");
  }

  // ─── Confirmation state ────────────────────────────────────────────────────

  if (submitState === "confirmed") {
    return (
      <div className="flex flex-col items-center py-16 text-center animate-in fade-in slide-in-from-bottom-2 duration-200">
        <CheckCircle2 className="size-12 text-[var(--v7-teal)]" aria-hidden="true" />
        {/* tabIndex={-1} so focus() works programmatically */}
        <h1
          ref={confirmHeadingRef}
          tabIndex={-1}
          className="font-display text-xl font-semibold text-[var(--v7-text)] mt-4 outline-none"
        >
          Ticket ingediend
        </h1>
        <p className="text-sm text-[var(--v7-muted)] mt-2 max-w-sm">
          Je ticket is ontvangen en wordt verwerkt. Je ziet het straks terug in Mijn tickets.
        </p>
        <div className="mt-6 bg-[var(--v7-teal-soft)] border border-[var(--v7-line)] rounded-xl px-6 py-4 text-sm text-center w-full max-w-xs">
          <p className="text-[var(--v7-muted)]">Referentie</p>
          <p className="font-semibold text-[var(--v7-text)] font-mono text-base mt-0.5 break-all">
            {submissionId}
          </p>
        </div>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/app/tickets">Naar Mijn tickets</Link>
        </Button>
      </div>
    );
  }

  // ─── Form state ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Section 1 — Type probleem */}
      <div className="rounded-xl border border-[var(--v7-line)] bg-[var(--v7-panel)] p-6">
        <h2 className="font-display text-base font-semibold text-[var(--v7-text)] mb-4">
          Type probleem
        </h2>
        <TypeSelector value={selectedType} onValueChange={setSelectedType} />
      </div>

      {/* Section 2 — Titel en omschrijving */}
      <div className="rounded-xl border border-[var(--v7-line)] bg-[var(--v7-panel)] p-6">
        <h2 className="font-display text-base font-semibold text-[var(--v7-text)] mb-4">
          Titel en omschrijving
        </h2>

        {/* Titel field */}
        <div className="mb-4">
          <label
            htmlFor="submit-title"
            className="text-sm font-semibold text-[var(--v7-text)] mb-1.5 block"
          >
            Titel *
          </label>
          <Input
            id="submit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Geef je ticket een korte titel"
            maxLength={120}
            aria-required="true"
          />
        </div>

        {/* Omschrijving field + DicteerButton */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="submit-omschrijving"
              className="text-sm font-semibold text-[var(--v7-text)]"
            >
              Omschrijving
            </label>
            <DicteerButton
              onTranscript={(updater) => setOmschrijving(updater)}
            />
          </div>
          <Textarea
            id="submit-omschrijving"
            value={omschrijving}
            onChange={(e) => setOmschrijving(e.target.value)}
            placeholder="Optioneel — beschrijf het probleem in eigen woorden. Je kunt ook inspreken."
            rows={4}
            className="resize-none"
          />
          <p className="text-sm text-[var(--v7-muted)] mt-1">
            Optioneel. Je toelichting wordt ook vastgelegd via de voice-over in de opname.
          </p>
        </div>
      </div>

      {/* Section 3 — Soort probleem */}
      <div className="rounded-xl border border-[var(--v7-line)] bg-[var(--v7-panel)] p-6">
        <h2 className="font-display text-base font-semibold text-[var(--v7-text)] mb-4">
          Soort probleem
        </h2>
        <SoortSelector value={soort} onValueChange={handleSoortChange} />
      </div>

      {/* Section 3b — Categorie (conditioneel op soort) */}
      {soort !== "" && (
        <div className="rounded-xl border border-[var(--v7-line)] bg-[var(--v7-panel)] p-6 animate-in fade-in slide-in-from-top-1 duration-150">
          <h2 className="font-display text-base font-semibold text-[var(--v7-text)] mb-4">
            {soort === "software" ? "Software-systeem" : "Hardware-categorie"}
          </h2>
          <CategorieCombobox
            categories={soort === "software" ? softwareCategories : hardwareCategories}
            value={selectedCategorie}
            onChange={handleCategorieChange}
            triggerPlaceholder={soort === "software" ? "Zoek een software-systeem…" : "Kies een hardware-categorie…"}
            searchPlaceholder={soort === "software" ? "Systeem zoeken…" : "Categorie zoeken…"}
            sentinelLabel={soort === "software" ? "Mijn systeem staat er niet bij →" : "Mijn apparaat staat er niet bij →"}
          />
          {/* Nudge when sentinel selected */}
          {categorieSelected && selectedCategorie === null && (
            <p className="text-sm text-[var(--v7-muted)] mt-2">
              Geef dan een beschrijving in de omschrijving hierboven.
            </p>
          )}
        </div>
      )}

      {/* Section 4 — conditioneel op soort (D-04) */}
      {soort === "software" && (
        <div className="rounded-xl border border-[var(--v7-line)] bg-[var(--v7-panel)] p-6">
          <h2 className="font-display text-base font-semibold text-[var(--v7-text)] mb-4">
            Schermopname
          </h2>
          {/* SUB-05 mode-seam (D-04): soort === "software" activates the recorder branch */}
          <ScreenRecorder
            disabled={!(selectedType !== "" && title.trim() !== "" && categorieSelected)}
            onRecorded={(blob, dur) => {
              setVideoBlob(blob);
              setRecordingDuration(dur);
              setTextOnly(false);
            }}
            onCleared={() => {
              setVideoBlob(null);
              setVideoStorageUrl(null);
              setRecordingDuration(0);
            }}
            onTextOnly={() => setTextOnly(true)}
          />
          {/* recordingDuration is set via onRecorded above; used in future UI enhancements (IN-02: removed dead null-render) */}
        </div>
      )}
      {soort === "hardware" && (
        <div className="rounded-xl border border-[var(--v7-line)] bg-[var(--v7-panel)] p-6">
          <h2 className="font-display text-base font-semibold text-[var(--v7-text)] mb-4">
            Foto&apos;s toevoegen
          </h2>
          <FotoUpload photos={photos} onPhotosChange={setPhotos} />
          {showNudge && (
            <div
              role="status"
              className="flex items-start gap-2 rounded-lg bg-[var(--v7-amber-soft)] border border-[var(--v7-line)] px-4 py-3 mt-3 animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <AlertTriangle className="size-4 text-[var(--v7-amber)] mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-[var(--v7-amber)]">
                Een foto of toelichting helpt IT enorm. Je kunt ook inspreken in het omschrijvingsveld.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Upload progress area (UI-SPEC §Submit CTA states 1-5) */}
      {submitState === "uploading" && (
        <div className="rounded-xl border border-[var(--v7-line)] bg-[var(--v7-panel)] p-4">
          <p className="text-sm text-[var(--v7-text)] mb-2">
            {soort === "hardware"
              ? (photoUploadProgress || "Foto's uploaden…")
              : `Video uploaden… ${uploadPercent}%`}
          </p>
          {soort === "software" && (
            <div
              role="progressbar"
              aria-valuenow={uploadPercent}
              aria-valuemax={100}
              aria-label="Upload voortgang"
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--v7-line)" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{
                  width: `${uploadPercent}%`,
                  background: "var(--v7-teal)",
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {submitState === "error" && (
        <div className="rounded-xl border border-[var(--v7-line)] bg-[var(--v7-panel)] p-4 flex items-start gap-3">
          <AlertTriangle className="size-4 text-[var(--v7-red)] mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--v7-red)] font-semibold">
              {errorMessage.startsWith("Upload mislukt") || errorMessage.startsWith("Foto-upload mislukt")
                ? errorMessage
                : "Er is iets misgegaan bij het versturen. Probeer het opnieuw of neem contact op met IT."}
            </p>
            {errorMessage &&
              !errorMessage.startsWith("Upload mislukt") &&
              !errorMessage.startsWith("Foto-upload mislukt") &&
              !errorMessage.startsWith("Er is iets") && (
                <p className="text-sm text-[var(--v7-muted)] mt-0.5">{errorMessage}</p>
              )}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
            Opnieuw proberen
          </Button>
        </div>
      )}

      {/* Submit CTA — the only solid brand-primary button on the page */}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={
          !allRequiredFilled ||
          submitState === "uploading" ||
          submitState === "ingesting"
        }
        className="w-full mt-2 bg-[var(--v7-brand-primary)] text-[var(--v7-inverse)] hover:bg-[var(--v7-brand-primary)]/90 h-11"
        title={
          !allRequiredFilled
            ? "Vul type, titel, soort en categorie in" +
              (soort === "software" ? " en maak een opname" : "") +
              " om in te dienen"
            : undefined
        }
      >
        {submitState === "ingesting" ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Ticket wordt verstuurd…
          </span>
        ) : (
          "Indienen"
        )}
      </Button>
    </div>
  );
}
