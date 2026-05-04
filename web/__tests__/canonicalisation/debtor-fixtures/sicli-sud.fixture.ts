import type { Fixture } from "../shared/harness";

export const fixture: Fixture = {
  brand_code: "sicli-sud",
  email_subject: "Pourriez-vous renvoyer la facture 22222 ?",
  email_body_text:
    "Bonjour, je n'ai pas reçu la facture 22222. Pouvez-vous me la renvoyer ? Merci, Marie",
  email_sender_email: "marie@client.fr",
  email_sender_first_name: "Marie",
  email_mailbox: "debiteurs@sicli-sud.fr",
  expected_register_language: "fr",
  expected_signoff: "Cordialement",
  expected_formal_address: "vous",
  expected_body_contains: ["facture"],
};
