import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { executePipeline } from "@/lib/inngest/functions/pipeline";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executePipeline],
});
