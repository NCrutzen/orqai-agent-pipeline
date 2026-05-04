import type { Fixture } from "../shared/harness";

export const fixture: Fixture = {
  brand_code: "acme-corp",
  swarm_type: "sales-email-stub",
  email_subject: "Invoice please",
  email_body_text: "Send invoice INV-001 again. Thanks.",
  email_sender_email: "buyer@cust.io",
  email_sender_first_name: null,
  email_mailbox: "sales@acme-corp.com",
  expected_register_language: "en",
  expected_signoff: "Kind regards",
  expected_formal_address: "you",
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
