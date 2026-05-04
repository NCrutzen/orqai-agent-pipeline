import type { Fixture } from "../shared/harness";

export const fixture: Fixture = {
  brand_code: "sicli-noord",
  email_subject: "Factuur opnieuw",
  email_body_text:
    "Goedemiddag, ik heb factuur 11111 niet ontvangen. Kunt u die opnieuw sturen?",
  email_sender_email: "klant@sicli.be",
  email_sender_first_name: "Pieter",
  email_mailbox: "debiteuren@sicli-noord.be",
  expected_register_language: "nl",
  expected_signoff: "Met vriendelijke groet",
  expected_formal_address: "u",
};
