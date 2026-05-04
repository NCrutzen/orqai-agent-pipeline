import type { Fixture } from "../shared/harness";

export const fixture: Fixture = {
  brand_code: "smeba-uk",
  swarm_type: "debtor-email",
  email_subject: "Could you resend invoice 4567?",
  email_body_text:
    "Hello, I haven't received invoice 4567. Could you resend it please? Many thanks, Olivia",
  email_sender_email: "olivia@uk-customer.co.uk",
  email_sender_first_name: "Olivia",
  email_mailbox: "debtors@smeba.co.uk",
  expected_register_language: "en",
  expected_signoff: "Kind regards",
  expected_formal_address: "you",
  expected_body_contains: ["invoice", "4567"],
  brand_register: {
    code: "smeba-uk",
    display_name: "Smeba UK",
    register_language: "en",
    register_dialect: "en-GB",
    signoff_phrase: "Kind regards",
    formal_address: "you",
    nxt_database_alias: "smeba-uk",
    icontroller_company: "smeba-uk",
  },
};
