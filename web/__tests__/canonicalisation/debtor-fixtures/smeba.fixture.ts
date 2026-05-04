import type { Fixture } from "../shared/harness";

export const fixture: Fixture = {
  brand_code: "smeba",
  email_subject: "Kunt u factuur 12345 opnieuw sturen?",
  email_body_text:
    "Beste, kunt u factuur 12345 opnieuw mailen? Met groet, Jan",
  email_sender_email: "jan@klant.nl",
  email_sender_first_name: "Jan",
  email_mailbox: "debiteuren@smeba.nl",
  expected_register_language: "nl",
  expected_signoff: "Met vriendelijke groet",
  expected_formal_address: "u",
  expected_body_contains: ["factuur"],
};
