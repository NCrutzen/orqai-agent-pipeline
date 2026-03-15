import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

// Pipeline function will be registered in Plan 35-02
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
});
