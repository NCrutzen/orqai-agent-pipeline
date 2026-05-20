import { createZapierSdk } from "@zapier/zapier-sdk";
import { config } from "./config.js";

const zapier = createZapierSdk(
  config.zapier.clientId
    ? {
        credentials: {
          clientId: config.zapier.clientId,
          clientSecret: config.zapier.clientSecret!,
        },
      }
    : undefined
);

const CONNECTION_ID = "56014785"; // zapier@moyneroberts.com
const MAILBOX = "info@smeba.nl";

async function main() {
  console.log(`Probing ${MAILBOX} via connection ${CONNECTION_ID}...\n`);

  // 1. Can we see the mailbox at all?
  const userRes = await zapier.fetch(
    `https://graph.microsoft.com/v1.0/users/${MAILBOX}?$select=id,displayName,mail,userPrincipalName`,
    { method: "GET", connectionId: CONNECTION_ID }
  );
  console.log(`GET /users/${MAILBOX} → ${userRes.status}`);
  console.log(await userRes.text());
  console.log("");

  // 2. Can we list inbox messages?
  const msgRes = await zapier.fetch(
    `https://graph.microsoft.com/v1.0/users/${MAILBOX}/mailFolders/inbox/messages?$select=id,subject,from,receivedDateTime&$top=3&$orderby=receivedDateTime desc`,
    { method: "GET", connectionId: CONNECTION_ID }
  );
  console.log(`GET inbox/messages → ${msgRes.status}`);
  const body = await msgRes.text();
  console.log(body.slice(0, 2000));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
