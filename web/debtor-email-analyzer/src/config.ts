import "dotenv/config";

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceKey: process.env.SUPABASE_SERVICE_KEY!,
  },
  mailboxes: (process.env.SHARED_MAILBOXES || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  orq: {
    apiKey: process.env.ORQ_API_KEY!,
  },
  zapier: {
    clientId: process.env.ZAPIER_CLIENT_ID,
    clientSecret: process.env.ZAPIER_CLIENT_SECRET,
  },
};
