"use client";

import { useRef, useState, useActionState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Play, Loader2, Upload, X, FileText } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { startPipeline } from "./actions";

const PLACEHOLDER = `Describe what you want the agent swarm to do. Be specific about:
- What triggers the process
- What steps are involved
- What systems or data sources are used
- What the desired outcome is

Example: Process incoming invoices from email, extract key fields (vendor, amount, PO number), match against purchase orders in SAP, route for approval based on amount thresholds, and post to the GL once approved.`;

function submitAction(_prevState: unknown, formData: FormData) {
  return startPipeline(formData);
}

export default function NewRunPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [useCase, setUseCase] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [, formAction, isPending] = useActionState(submitAction, null);

  const isValid = useCase.trim().length >= 10;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="p-5">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-[12px] text-[var(--v7-muted)]">
        <Link href="/" className="hover:text-[var(--v7-text)] transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="size-3.5" />
        <Link
          href={`/projects/${projectId}`}
          className="hover:text-[var(--v7-text)] transition-colors"
        >
          Project
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[var(--v7-text)]">Create Agent Swarm</span>
      </nav>

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-[32px] leading-[1.1] tracking-[-0.03em] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
          Create Agent Swarm
        </h1>
        <p className="mt-1 text-[14px] text-[var(--v7-muted)]">
          Describe your use case and we&apos;ll design an agent swarm for it
        </p>
      </div>

      {/* Form */}
      <GlassCard className="max-w-2xl p-5">
        <div className="pb-3">
          <h2 className="text-[14px] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
            Run Configuration
          </h2>
        </div>
        <div>
          <form action={formAction} className="flex flex-col gap-5">
            <input type="hidden" name="projectId" value={projectId} />

            {/* Run name */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="runName"
                className="text-[14px] font-medium text-[var(--v7-text)]"
              >
                Run Name
                <span className="ml-1 text-[12px] font-normal text-[var(--v7-muted)]">
                  (optional)
                </span>
              </label>
              <Input
                id="runName"
                name="runName"
                placeholder="e.g., Invoice Processing Agents"
                disabled={isPending}
              />
              <p className="text-[12px] text-[var(--v7-muted)]">
                Optional &mdash; auto-generated from description if left blank
              </p>
            </div>

            {/* Use case description */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="useCase"
                className="text-[14px] font-medium text-[var(--v7-text)]"
              >
                Use Case Description
                <span className="ml-1 text-[12px] font-normal text-[var(--v7-red)]">*</span>
              </label>
              <Textarea
                id="useCase"
                name="useCase"
                rows={6}
                placeholder={PLACEHOLDER}
                value={useCase}
                onChange={(e) => setUseCase(e.target.value)}
                disabled={isPending}
                required
                minLength={10}
              />
              {useCase.length > 0 && useCase.trim().length < 10 && (
                <p className="text-[12px] text-[var(--v7-red)]">
                  Please enter at least 10 characters
                </p>
              )}
            </div>

            {/* Reference files */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-medium text-[var(--v7-text)]">
                Reference Files
                <span className="ml-1 text-[12px] font-normal text-[var(--v7-muted)]">
                  (optional)
                </span>
              </label>
              <div
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-[var(--v7-radius-inner)] border-2 border-dashed p-6 transition-colors ${
                  isDragging
                    ? "border-[var(--v7-teal)] bg-[var(--v7-teal-soft)]"
                    : "border-[var(--v7-glass-border)] hover:border-[var(--v7-muted)]"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="size-5 text-[var(--v7-muted)]" />
                <p className="text-[14px] text-[var(--v7-muted)]">
                  Drop files here or click to browse
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={isPending}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {files.map((file, i) => (
                    <div
                      key={`${file.name}-${i}`}
                      className="flex items-center justify-between rounded-[var(--v7-radius-sm)] border border-[var(--v7-glass-border)] px-3 py-1.5 text-[14px] text-[var(--v7-text)]"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <FileText className="size-3.5 shrink-0 text-[var(--v7-muted)]" />
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(i);
                        }}
                        className="ml-2 shrink-0 text-[var(--v7-muted)] hover:text-[var(--v7-text)]"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full"
              disabled={!isValid || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Starting Pipeline...
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  Start Pipeline
                </>
              )}
            </Button>
          </form>
        </div>
      </GlassCard>
    </div>
  );
}
