import "dotenv/config";

export const env = {
  supabase: {
    url: required("SUPABASE_URL", process.env.SUPABASE_URL),
    serviceKey: required(
      "SUPABASE_SERVICE_KEY",
      process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
  },
  orq: {
    apiKey: required("ORQ_API_KEY", process.env.ORQ_API_KEY),
  },
};

function required(name: string, val: string | undefined): string {
  if (!val) throw new Error(`Missing env var ${name}`);
  return val;
}
