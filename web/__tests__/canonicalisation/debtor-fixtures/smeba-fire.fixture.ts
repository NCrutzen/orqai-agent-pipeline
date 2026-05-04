import type { Fixture } from "../shared/harness";

export const fixture: Fixture = {
  brand_code: "smeba-fire",
  email_subject: "Kopie factuur graag",
  email_body_text: "Hallo, mag ik factuur 67890 nog eens? Dank, Anke",
  email_sender_email: "anke@klantbe.be",
  email_sender_first_name: "Anke",
  email_mailbox: "debiteuren@smeba-fire.be",
  expected_register_language: "nl",
  expected_signoff: "Met vriendelijke groet",
  expected_formal_address: "u",
  expected_body_contains: ["factuur"],
};
