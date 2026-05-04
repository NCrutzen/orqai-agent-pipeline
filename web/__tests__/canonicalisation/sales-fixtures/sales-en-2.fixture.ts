import type { Fixture } from "../shared/harness";

export const fixture: Fixture = {
  brand_code: "acme-corp",
  swarm_type: "sales-email-stub",
  email_subject: "Need a copy of last month's invoice",
  email_body_text:
    "Hello, can you send me invoice INV-456 from last month? Best, Sarah",
  email_sender_email: "sarah@another-buyer.co.uk",
  email_sender_first_name: "Sarah",
  email_mailbox: "sales@acme-corp.com",
  expected_register_language: "en",
  expected_signoff: "Kind regards",
  expected_formal_address: "you",
  expected_body_contains: ["invoice"],
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
