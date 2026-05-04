import type { Fixture } from "../shared/harness";

export const fixture: Fixture = {
  brand_code: "acme-corp",
  swarm_type: "sales-email-stub",
  email_subject: "Could you resend invoice INV-789?",
  email_body_text:
    "Hi, I haven't received invoice INV-789. Could you please resend it? Thanks, John",
  email_sender_email: "john@buyer.com",
  email_sender_first_name: "John",
  email_mailbox: "sales@acme-corp.com",
  expected_register_language: "en",
  expected_signoff: "Kind regards",
  expected_formal_address: "you",
  expected_body_contains: ["invoice", "INV-789"],
  brand_register: {
    code: "acme-corp",
    display_name: "Acme Corp",
    register_language: "en",
    register_dialect: "en-US",
    signoff_phrase: "Kind regards",
    formal_address: "you",
    nxt_database_alias: "acme-corp",
    icontroller_company: "acme-corp",
  },
};
