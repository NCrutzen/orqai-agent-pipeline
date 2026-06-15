/** Read-only probe: list messages currently in verkoop@ afgehandeld/2026. */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

import { graphFetch } from "../lib/outlook/client";

const FOLDER_2026 =
  "AAMkADlkNmVhNWJmLTM3YWQtNDhjZC1hOGNlLTg1MTFiMmY4N2Y3NgAuAAAAAAAkKnpVliuUSZ9SIS2B16A6AQDEgeAhMZXiSqbtTNcgI_m5AAKaztw9AAA=";

async function main() {
  const res = await graphFetch(
    `/users/verkoop@smeba.nl/mailFolders/${FOLDER_2026}/messages?$select=subject,receivedDateTime,lastModifiedDateTime&$orderby=lastModifiedDateTime desc&$top=10`,
    { method: "GET" },
  );
  const body = (await res.json()) as {
    value?: { subject?: string; receivedDateTime?: string; lastModifiedDateTime?: string }[];
  };
  console.log(`status ${res.status} — ${body.value?.length ?? 0} berichten:`);
  for (const m of body.value ?? []) {
    console.log(`  - [mod ${m.lastModifiedDateTime}] ${(m.subject ?? "").slice(0, 60)}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
