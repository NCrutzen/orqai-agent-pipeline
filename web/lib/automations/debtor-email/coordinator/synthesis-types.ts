// Phase 65 D-06 — synthesis-agent output (zod, mirrors Studio Tool C "synthesis-output-v1").
import { z } from "zod";

export const SYNTHESIS_VERSION_V1 = "2026-05-01.v1" as const;

export const synthesisOutputSchema = z.object({
  body_html: z.string().min(1),
  detected_tone: z.enum(["neutral", "de-escalation"]),
  synthesis_version: z.literal(SYNTHESIS_VERSION_V1),
});

export type SynthesisOutput = z.infer<typeof synthesisOutputSchema>;
