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

// Extract local part from email
function getLocalPart(email) {
  return email?.split("@")[0] || "";
}

// Extract domain from email
function getDomain(email) {
  return email?.split("@")[1] || "";
}

async function main() {
  console.log("=== SENDER PATTERN & SUBJECT ANALYSIS ===\n");

  // 1. AUTO-REPLY SENDER PATTERNS
  console.log("1. AUTO-REPLY SENDER PATTERNS\n");
  
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

  // Analyze sender patterns
  const senderDomains = {};
  const senderLocalPatterns = {};
  const noreplyLikePatterns = {};
  
  for (let i = 0; i < autoReplyEmails.length; i += 100) {
    const batch = autoReplyEmails.slice(i, i + 100);
    const emailIds = batch.map((a) => a.email_id);
    
    const { data: emailDetails } = await supabase_pipeline
      .from("emails")
      .select("sender_email")
      .in("id", emailIds);
    
    for (const email of emailDetails || []) {
      if (!email.sender_email) continue;
      const domain = getDomain(email.sender_email);
      const local = getLocalPart(email.sender_email);
      
      senderDomains[domain] = (senderDomains[domain] || 0) + 1;
      
      // Track noreply-like patterns
      if (local && /no[-_]?reply|noreply|donotreply|mailer-daemon|postmaster/i.test(local)) {
        const key = `${local}@${domain}`;
        noreplyLikePatterns[key] = (noreplyLikePatterns[key] || 0) + 1;
      }
    }
  }

  console.log("Top domains (auto_reply):");
  const topDomains = Object.entries(senderDomains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [domain, count] of topDomains) {
    console.log(`  ${count.toString().padStart(3)} @${domain}`);
  }

  console.log(`\nNoreply-like senders (auto_reply): ${Object.keys(noreplyLikePatterns).length} addresses`);
  const topNoreply = Object.entries(noreplyLikePatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [email, count] of topNoreply) {
    console.log(`  ${count.toString().padStart(3)} ${email}`);
  }

  // 2. AUTO-REPLY SUBJECT PREFIX ANALYSIS BY LANGUAGE
  console.log("\n2. AUTO-REPLY SUBJECT PREFIXES BY LANGUAGE\n");

  const langs = ["nl", "fr", "en"];
  const subjectPrefixes = {
    nl: {},
    fr: {},
    en: {}
  };

  for (const lang of langs) {
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

    // Get subject details
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100);
      const emailIds = batch.map((a) => a.email_id);
      
      const { data: emailDetails } = await supabase_pipeline
        .from("emails")
        .select("subject")
        .in("id", emailIds);
      
      for (const email of emailDetails || []) {
        if (!email.subject) continue;
        
        // Extract prefix (first 50 chars or up to first colon)
        const colonIdx = email.subject.indexOf(":");
        const prefix = colonIdx > 0 
          ? email.subject.substring(0, colonIdx)
          : email.subject.substring(0, 50);
        
        subjectPrefixes[lang][prefix] = (subjectPrefixes[lang][prefix] || 0) + 1;
      }
    }
  }

  for (const lang of langs) {
    console.log(`${lang.toUpperCase()} (n=${Object.values(subjectPrefixes[lang]).reduce((a, b) => a + b, 0)}):`);
    const sorted = Object.entries(subjectPrefixes[lang])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    for (const [prefix, count] of sorted) {
      const pct = (count / Object.values(subjectPrefixes[lang]).reduce((a, b) => a + b, 0) * 100).toFixed(1);
      console.log(`  ${count.toString().padStart(3)} (${pct.padStart(5)}%) "${prefix}"`);
    }
    console.log("");
  }

  // 3. PAYMENT EMAIL SENDER PATTERNS
  console.log("3. PAYMENT INTENT SENDER PATTERNS\n");

  let paymentEmails = [];
  offset = 0;
  while (true) {
    const { data } = await supabase_debtor
      .from("email_analysis")
      .select("email_id, email_intent")
      .in("email_intent", ["payment_confirmation", "payment_dispute", "payment_plan", "payment_delay"])
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    paymentEmails.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  const paymentDomains = {};
  const paymentNoreplyLike = {};
  const paymentLocalPatterns = {};
  
  for (let i = 0; i < paymentEmails.length; i += 100) {
    const batch = paymentEmails.slice(i, i + 100);
    const emailIds = batch.map((a) => a.email_id);
    
    const { data: emailDetails } = await supabase_pipeline
      .from("emails")
      .select("sender_email")
      .in("id", emailIds);
    
    for (const email of emailDetails || []) {
      if (!email.sender_email) continue;
      const domain = getDomain(email.sender_email);
      const local = getLocalPart(email.sender_email);
      
      paymentDomains[domain] = (paymentDomains[domain] || 0) + 1;
      
      // Payment-specific patterns
      if (local && /bill|payment|invoice|factur|betaal|accounting|compte|pay|finance|account/i.test(local)) {
        paymentLocalPatterns[local] = (paymentLocalPatterns[local] || 0) + 1;
      }
    }
  }

  console.log("Top payment-related local parts:");
  const topPaymentLocal = Object.entries(paymentLocalPatterns)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [local, count] of topPaymentLocal) {
    console.log(`  ${count.toString().padStart(3)} ${local}@*`);
  }

  console.log("\nTop payment domains:");
  const topPaymentDomains = Object.entries(paymentDomains)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [domain, count] of topPaymentDomains) {
    console.log(`  ${count.toString().padStart(3)} @${domain}`);
  }

  // 4. PAYMENT SUBJECT PATTERNS BY LANGUAGE
  console.log("\n4. PAYMENT SUBJECT PREFIXES BY LANGUAGE\n");

  const paymentSubjectPrefixes = {
    nl: {},
    fr: {},
    en: {}
  };

  for (const lang of langs) {
    let emails = [];
    offset = 0;
    while (true) {
      const { data } = await supabase_debtor
        .from("email_analysis")
        .select("email_id")
        .in("email_intent", ["payment_confirmation", "payment_dispute", "payment_plan", "payment_delay"])
        .eq("language", lang)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      emails.push(...data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    // Get subject details
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100);
      const emailIds = batch.map((a) => a.email_id);
      
      const { data: emailDetails } = await supabase_pipeline
        .from("emails")
        .select("subject")
        .in("id", emailIds);
      
      for (const email of emailDetails || []) {
        if (!email.subject) continue;
        
        const colonIdx = email.subject.indexOf(":");
        const prefix = colonIdx > 0 
          ? email.subject.substring(0, colonIdx)
          : email.subject.substring(0, 50);
        
        paymentSubjectPrefixes[lang][prefix] = (paymentSubjectPrefixes[lang][prefix] || 0) + 1;
      }
    }
  }

  for (const lang of langs) {
    const total = Object.values(paymentSubjectPrefixes[lang]).reduce((a, b) => a + b, 0);
    if (total === 0) continue;
    console.log(`${lang.toUpperCase()} (n=${total}):`);
    const sorted = Object.entries(paymentSubjectPrefixes[lang])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [prefix, count] of sorted) {
      const pct = (count / total * 100).toFixed(1);
      console.log(`  ${count.toString().padStart(3)} (${pct.padStart(5)}%) "${prefix}"`);
    }
    console.log("");
  }
}

main().catch(console.error);
