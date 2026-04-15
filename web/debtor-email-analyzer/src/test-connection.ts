import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
  db: { schema: "email_pipeline" },
});

async function main() {
  const { data, error } = await supabase.from("emails").select("id").limit(1);
  if (error && error.code === "42P01") {
    console.log("Table does not exist yet — need to create it");
  } else if (error) {
    console.log("Error:", error.message, error.code);
  } else {
    console.log("Connected! Table exists, rows found:", data.length);
  }
}

main();
