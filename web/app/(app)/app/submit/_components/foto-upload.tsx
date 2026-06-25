"use client";

import * as React from "react";
import { ImagePlus, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MAX_PHOTO_COUNT } from "@/lib/automations/support-tickets/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".heic"];
// IN-01: use the shared constant so schema limit and UI gate can never drift.
const MAX_PHOTOS = MAX_PHOTO_COUNT;

// ─── Props ───────────────────────────────────────────────────────────────────

interface FotoUploadProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FotoUpload({ photos, onPhotosChange }: FotoUploadProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const dropzoneInputRef = React.useRef<HTMLInputElement>(null);

  const [showDropzone, setShowDropzone] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);

  // WR-01: stable object URLs — created once per photos array, revoked on cleanup
  // to prevent accumulating blob URLs (one per render) from leaking memory on mobile.
  const objectUrls = React.useMemo(() => {
    return photos.map((f) => URL.createObjectURL(f));
  }, [photos]);

  React.useEffect(() => {
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [objectUrls]);

  // ─── File validation + add handler ───────────────────────────────────────

  function handleFilesAdded(files: File[]) {
    const valid = files.filter((f) => {
      const mimeOk = ALLOWED_TYPES.includes(f.type);
      const extOk = ALLOWED_EXTS.some((ext) =>
        f.name.toLowerCase().endsWith(ext)
      );
      return mimeOk || extOk; // iOS HEIC: MIME unreliable, fall back to ext
    });
    onPhotosChange([...photos, ...valid].slice(0, MAX_PHOTOS));
  }

  // ─── Drag-and-drop handlers ───────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave() {
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFilesAdded(files);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Helper text */}
      <p className="text-sm text-[var(--v7-muted)] mb-3">
        Voeg een of meer foto&apos;s toe. Optioneel, maar een foto helpt IT enorm bij het oplossen van je probleem.
      </p>

      {/* Hidden file inputs */}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        hidden
        ref={fileInputRef}
        onChange={(e) => handleFilesAdded(Array.from(e.target.files ?? []))}
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        ref={cameraInputRef}
        onChange={(e) => handleFilesAdded(Array.from(e.target.files ?? []))}
      />
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        hidden
        ref={dropzoneInputRef}
        onChange={(e) => handleFilesAdded(Array.from(e.target.files ?? []))}
      />

      {/* Toevoegen DropdownMenu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            type="button"
            className="gap-2"
            disabled={photos.length >= MAX_PHOTOS}
            title={photos.length >= MAX_PHOTOS ? "Maximaal 10 foto's" : undefined}
          >
            <ImagePlus className="size-4" aria-hidden="true" />
            Foto toevoegen
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
            <Upload className="size-4 mr-2" aria-hidden="true" />
            Foto kiezen uit bibliotheek
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => cameraInputRef.current?.click()}>
            <ImagePlus className="size-4 mr-2" aria-hidden="true" />
            Foto maken (camera)
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setShowDropzone((prev) => !prev);
            }}
          >
            <Upload className="size-4 mr-2" aria-hidden="true" />
            Slepen en neerzetten
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Drag-and-drop zone */}
      {showDropzone && (
        <div
          className={cn(
            "mt-3 rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors duration-150",
            isDragOver
              ? "border-[var(--v7-brand-primary)] bg-[var(--v7-brand-primary-soft)]"
              : "border-[var(--v7-line)] bg-[var(--v7-panel)]"
          )}
          role="region"
          aria-label="Afbeeldingen hier neerzetten"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => dropzoneInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              dropzoneInputRef.current?.click();
            }
          }}
          tabIndex={0}
        >
          <ImagePlus
            className="size-8 text-[var(--v7-faint)] mx-auto mb-2"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--v7-muted)]">
            Sleep foto&apos;s hierheen of klik om te kiezen
          </p>
        </div>
      )}

      {/* Photo thumbnail grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {photos.map((photo, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-lg overflow-hidden border border-[var(--v7-line)] animate-in fade-in zoom-in-95 duration-150"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={objectUrls[i]}
                alt={`Foto ${i + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => onPhotosChange(photos.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 rounded-full bg-[var(--v7-panel)] border border-[var(--v7-line)] size-6 flex items-center justify-center hover:bg-[var(--v7-panel-2,var(--v7-panel))]"
                aria-label={`Foto ${i + 1} verwijderen`}
              >
                <X className="size-3 text-[var(--v7-red)]" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
