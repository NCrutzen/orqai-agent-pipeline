import { config as dotenv } from "dotenv";
// .env.local has priority (Vercel CLI pulls vars here), .env as fallback
dotenv({ path: ".env.local" });
dotenv();

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceKey: process.env.SUPABASE_SERVICE_KEY!,
  },
  orq: {
    apiKey: process.env.ORQ_API_KEY!,
  },
  sugarcrm: {
    url: process.env.SUGARCRM_URL || "https://walkerfire.sugaropencloud.eu",
    username: process.env.SUGARCRM_USERNAME,
    password: process.env.SUGARCRM_PASSWORD,
  },
  zapier: {
    connectionId: "58816663", // Sugar CRM // NCrutzen
    clientId: process.env.ZAPIER_CLIENT_ID,
    clientSecret: process.env.ZAPIER_CLIENT_SECRET,
  },
};
