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
  console.log("=== DETAILED PATTERN ANALYSIS ===\n");

  // Get all auto_reply emails with their full details
  console.log("1. AUTO-REPLY PATTERN ANALYSIS");
  
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

  console.log(`Total auto_reply emails: ${autoReplyEmails.length}`);

  // Get their email details in batches
  const senderPatterns = {};
  const subjectPatterns = {};
  const langBreakdown = {};
  
  for (let i = 0; i < autoReplyEmails.length; i += 100) {
    const batch = autoReplyEmails.slice(i, i + 100);
    const emailIds = batch.map((a) => a.email_id);
    
    const { data: emailDetails } = await supabase_pipeline
      .from("emails")
      .select("sender_email, subject, body_text")
      .in("id", emailIds);
    
    if (emailDetails) {
      for (const email of emailDetails) {
        // Extract sender patterns
        if (email.sender_email) {
          const [localPart, domain] = email.sender_email.split("@");
          const senderKey = `${localPart || ""}@${domain || ""}`;
          senderPatterns[senderKey] = (senderPatterns[senderKey] || 0) + 1;
        }
        
        // Extract subject patterns
        if (email.subject) {
          const subject = email.subject.substring(0, 100);
          subjectPatterns[subject] = (subjectPatterns[subject] || 0) + 1;
        }
      }
    }
  }

  console.log("\nTop 20 sender addresses (auto_reply):");
  const topSenders = Object.entries(senderPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [sender, count] of topSenders) {
    console.log(`  ${count.toString().padStart(3)} ${sender}`);
  }

  console.log("\nTop 20 subject patterns (auto_reply):");
  const topSubjects = Object.entries(subjectPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [subject, count] of topSubjects) {
    console.log(`  ${count.toString().padStart(3)} "${subject}"`);
  }

  // 2. Analyze payment intents and patterns
  console.log("\n2. PAYMENT-RELATED EMAIL ANALYSIS");
  
  const paymentIntents = [
    "payment_confirmation",
    "payment_dispute", 
    "payment_delay",
    "payment_plan"
  ];
  
  let paymentEmails = [];
  for (const intent of paymentIntents) {
    let offset = 0;
    while (true) {
      const { data } = await supabase_debtor
        .from("email_analysis")
        .select("email_id")
        .eq("email_intent", intent)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      paymentEmails.push(...data.map(e => ({ ...e, intent })));
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  console.log(`Total payment-related emails: ${paymentEmails.length}`);
  
  const paymentSenders = {};
  const paymentSubjects = {};
  
  for (let i = 0; i < paymentEmails.length; i += 100) {
    const batch = paymentEmails.slice(i, i + 100);
    const emailIds = batch.map((a) => a.email_id);
    
    const { data: emailDetails } = await supabase_pipeline
      .from("emails")
      .select("sender_email, subject")
      .in("id", emailIds);
    
    if (emailDetails) {
      for (const email of emailDetails) {
        if (email.sender_email) {
          paymentSenders[email.sender_email] = (paymentSenders[email.sender_email] || 0) + 1;
        }
        if (email.subject) {
          const subject = email.subject.substring(0, 100);
          paymentSubjects[subject] = (paymentSubjects[subject] || 0) + 1;
        }
      }
    }
  }

  console.log("\nTop 20 senders (payment intents):");
  const topPaymentSenders = Object.entries(paymentSenders)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [sender, count] of topPaymentSenders) {
    console.log(`  ${count.toString().padStart(3)} ${sender}`);
  }

  console.log("\nTop 15 subject patterns (payment intents):");
  const topPaymentSubjects = Object.entries(paymentSubjects)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [subject, count] of topPaymentSubjects) {
    console.log(`  ${count.toString().padStart(3)} "${subject}"`);
  }

  // 3. Analyze address_change (could indicate payment-adjacent)
  console.log("\n3. ADDRESS_CHANGE EMAIL ANALYSIS");
  
  let addrChangeEmails = [];
  offset = 0;
  while (true) {
    const { data } = await supabase_debtor
      .from("email_analysis")
      .select("email_id")
      .eq("email_intent", "address_change")
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    addrChangeEmails.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Total address_change emails: ${addrChangeEmails.length}`);

  // 4. Get sample emails with language and intent
  console.log("\n4. SAMPLE AUTO-REPLY EMAILS BY LANGUAGE");
  
  const langs = ["nl", "fr", "en"];
  for (const lang of langs) {
    const { data: samples } = await supabase_debtor
      .from("email_analysis")
      .select("email_id")
      .eq("email_intent", "auto_reply")
      .eq("language", lang)
      .limit(3);

    if (samples && samples.length > 0) {
      console.log(`\n${lang.toUpperCase()} samples:`);
      const emailIds = samples.map((s) => s.email_id);
      const { data: emailDetails } = await supabase_pipeline
        .from("emails")
        .select("sender_email, subject, body_text")
        .in("id", emailIds);

      for (const email of emailDetails || []) {
        console.log(`\n  From: ${email.sender_email}`);
        console.log(`  Subject: ${email.subject?.substring(0, 70)}`);
        console.log(`  Body (first 150): ${(email.body_text || "").substring(0, 150)}`);
      }
    }
  }
}

main().catch(console.error);
