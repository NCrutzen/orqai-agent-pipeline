import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase_pipeline = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: "email_pipeline" } }
);

const supabase_debtor = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { db: { schema: "debtor" } }
);

async function main() {
  console.log("=== OUT-OF-OFFICE vs SYSTEM AUTO-REPLY ANALYSIS ===\n");

  // Detect OoO patterns vs system notifications
  let autoReplyEmails = [];
  let offset = 0;
  while (true) {
    const { data } = await supabase_debtor
      .from("email_analysis")
      .select("email_id")
      .eq("email_intent", "auto_reply")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    autoReplyEmails.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Total auto_reply emails: ${autoReplyEmails.length}\n`);

  // Analyze by sender type and content
  const realPersonOoO = [];
  const systemAutoReply = [];
  const oooKeywords = /absent|vacation|congé|auswesenheit|out of office|afwezig|im urlaub|unavailable|zurück|disponible|back|away/i;
  const systemKeywords = /notification|delivery|confirmation|automatisch|automatic|system|mailer|postmaster|noreply|no-reply|donotreply|trinergy|basware|tradeshift|edi|order|invoice|payment/i;

  // Sample emails to detect patterns
  for (let i = 0; i < Math.min(autoReplyEmails.length, 300); i += 100) {
    const batch = autoReplyEmails.slice(i, i + 100);
    const emailIds = batch.map((a) => a.email_id);
    
    const { data: emailDetails } = await supabase_pipeline
      .from("emails")
      .select("id, sender_email, subject, body_text")
      .in("id", emailIds);
    
    for (const email of emailDetails || []) {
      const isRealPerson = email.sender_email && !email.sender_email.toLowerCase().includes("noreply") &&
        !email.sender_email.toLowerCase().includes("no-reply") &&
        !email.sender_email.toLowerCase().includes("no_reply") &&
        !/^[a-z]+@[a-z]+\.com|\.be|\.nl/.test(email.sender_email) || /\.[a-z]{2,}$/.test(email.sender_email);
      
      const hasOooKeywords = (email.subject + " " + (email.body_text || "")).match(oooKeywords);
      const hasSystemKeywords = (email.subject + " " + (email.body_text || "")).match(systemKeywords);

      if (hasOooKeywords && isRealPerson) {
        realPersonOoO.push({
          sender: email.sender_email,
          subject: email.subject,
          body: (email.body_text || "").substring(0, 300)
        });
      }

      if (hasSystemKeywords && !hasOooKeywords) {
        systemAutoReply.push({
          sender: email.sender_email,
          subject: email.subject,
          body: (email.body_text || "").substring(0, 300)
        });
      }
    }
  }

  console.log(`OoO from real persons: ${realPersonOoO.length}`);
  console.log(`System auto-replies: ${systemAutoReply.length}\n`);

  // Show samples
  console.log("REAL PERSON OoO SAMPLES:");
  for (let i = 0; i < Math.min(3, realPersonOoO.length); i++) {
    const e = realPersonOoO[i];
    console.log(`\n  From: ${e.sender}`);
    console.log(`  Subject: ${e.subject?.substring(0, 80)}`);
    console.log(`  Body: ${e.body?.substring(0, 200)}`);
  }

  console.log("\n\nSYSTEM AUTO-REPLY SAMPLES:");
  for (let i = 0; i < Math.min(3, systemAutoReply.length); i++) {
    const e = systemAutoReply[i];
    console.log(`\n  From: ${e.sender}`);
    console.log(`  Subject: ${e.subject?.substring(0, 80)}`);
    console.log(`  Body: ${e.body?.substring(0, 200)}`);
  }

  // Get counts by language for OoO patterns
  console.log("\n\n=== OoO KEYWORDS BY LANGUAGE ===\n");

  const langOoO = {
    nl: /absent|afwezig|congé|vakantie|verlof|away|ter plaatse|niet aanwezig|op kantoor|terug op/i,
    fr: /congé|absent|vacation|hors|unavailable|disponible|retour|absent du bureau|en vacances|out of office|je suis/i,
    en: /out of office|absent|away|vacation|unavailable|back|not available|off|ill leave/i
  };

  for (const lang of ["nl", "fr", "en"]) {
    let emails = [];
    offset = 0;
    while (true) {
      const { data } = await supabase_debtor
        .from("email_analysis")
        .select("email_id")
        .eq("email_intent", "auto_reply")
        .eq("language", lang)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      emails.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    let oooCount = 0;
    let otherAutoReplyCount = 0;

    // Sample emails
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100);
      const emailIds = batch.map((a) => a.email_id);
      
      const { data: emailDetails } = await supabase_pipeline
        .from("emails")
        .select("subject, body_text")
        .in("id", emailIds);
      
      for (const email of emailDetails || []) {
        const content = (email.subject + " " + (email.body_text || "")).toLowerCase();
        if (langOoO[lang].test(content)) {
          oooCount++;
        } else {
          otherAutoReplyCount++;
        }
      }
    }

    console.log(`${lang.toUpperCase()}: ${oooCount} OoO patterns, ${otherAutoReplyCount} other auto-replies`);
  }
}

main().catch(console.error);
