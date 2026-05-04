import type { Fixture } from "../shared/harness";

export const fixture: Fixture = {
  brand_code: "berki",
  email_subject: "Factuur 33333 graag opnieuw",
  email_body_text:
    "Beste, ik heb factuur 33333 niet ontvangen. Kunt u die nog eens sturen?",
  email_sender_email: "klant@berki-klant.nl",
  email_sender_first_name: "Sandra",
  email_mailbox: "debiteuren@berki.nl",
  expected_register_language: "nl",
  expected_signoff: "Met vriendelijke groet",
  expected_formal_address: "u",
};
