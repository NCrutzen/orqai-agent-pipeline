/**
 * Zod schemas for raw Orq.ai trace and span payloads returned by the MCP
 * list_traces and list_spans tools.
 *
 * Every shape uses `.passthrough()` so Orq.ai can evolve their payload
 * without breaking our pipeline -- we only validate the fields we actually
 * read in the trace mapper.
 */

import { z } from "zod";

export const TraceItemSchema = z
  .object({
    _id: z.string(),
    trace_id: z.string(),
    start_time: z.string(),
    end_time: z.string(),
    name: z.string().nullable().optional(),
    attributes: z
      .object({
        orq: z
          .object({
            project_id: z.string().nullable().optional(),
            billing: z
              .object({ total_cost: z.number().optional() })
              .passthrough()
              .optional(),
            duration: z.number().optional(),
          })
          .passthrough()
          .optional(),
        gen_ai: z
          .object({
            operation: z.object({ name: z.string() }).optional(),
            usage: z
              .object({
                prompt_tokens: z.number().optional(),
                completion_tokens: z.number().optional(),
                total_tokens: z.number().optional(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough()
          .optional(),
        leading_span: z
          .object({
            span_id: z.string(),
            span_type: z.string(),
          })
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type TraceItem = z.infer<typeof TraceItemSchema>;

export const SpanItemSchema = z
  .object({
    _id: z.string(),
    trace_id: z.string(),
    span_id: z.string().optional(),
    parent_id: z.string().nullable().optional(),
    start_time: z.string(),
    end_time: z.string().optional(),
    name: z.string().nullable().optional(),
    type: z.string().optional(),
    attributes: z
      .object({
        gen_ai: z
          .object({
            operation: z.object({ name: z.string() }).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type SpanItem = z.infer<typeof SpanItemSchema>;

export const ListTracesResponseSchema = z.object({
  items: z.array(TraceItemSchema),
  next_cursor: z.string().nullable().optional(),
  has_more: z.boolean().optional(),
});

export type ListTracesResponse = z.infer<typeof ListTracesResponseSchema>;

export const ListSpansResponseSchema = z.object({
  items: z.array(SpanItemSchema),
  next_cursor: z.string().nullable().optional(),
  has_more: z.boolean().optional(),
});

export type ListSpansResponse = z.infer<typeof ListSpansResponseSchema>;
