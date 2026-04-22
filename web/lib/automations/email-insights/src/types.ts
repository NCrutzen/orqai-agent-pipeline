import { z } from "zod";

export const DomainConfigSchema = z.object({
  domain: z.string(),
  filter: z.object({
    source: z.string(),
    direction: z.enum(["incoming", "sent"]),
    mailbox_in: z.array(z.string()),
    received_after: z.string().optional(),
  }),
  skip_analyzed_categories: z.array(z.string()).default([]),
  analysis_schema: z.string().optional(),
  output_language: z.string().default("en"),
  min_cluster_size: z.number().int().min(2).default(30),
  cluster_distance_threshold: z.number().min(0).max(1).default(0.18),
  top_n_questions: z.number().int().min(1).default(50),
  top_n_complaints: z.number().int().min(1).default(25),
  llm_model: z.string().default("anthropic/claude-haiku-4-5-20251001"),
  embedding_model: z.string().default("openai/text-embedding-3-small"),
});
export type DomainConfig = z.infer<typeof DomainConfigSchema>;

export const ExtractedIntentsSchema = z.object({
  questions: z.array(z.object({ normalized: z.string().min(3).max(300) })).default([]),
  complaints: z.array(z.object({ normalized: z.string().min(3).max(300) })).default([]),
});
export type ExtractedIntents = z.infer<typeof ExtractedIntentsSchema>;

export interface EmailRow {
  id: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  sender_email: string | null;
  sender_name: string | null;
  mailbox: string;
  direction: string;
  received_at: string | null;
}
