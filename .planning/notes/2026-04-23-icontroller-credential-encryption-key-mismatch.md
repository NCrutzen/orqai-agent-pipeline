---
date: "2026-04-23 12:46"
promoted: false
---

iController CREDENTIAL_ENCRYPTION_KEY mismatch — resolveCredentials faalt met "Decipheriv.final: Unsupported state or unable to authenticate data" wanneer een worker probeert in te loggen via credentials. Observed 2026-04-23 op w0 (cookies gewiped, moest fresh inloggen). Fix: óf env var in Vercel matchen aan de key waarmee credentials werden encrypted, óf iController credential opnieuw versleutelen met huidige env-var. File: web/lib/credentials/crypto.ts. Credential row ID voor iController prod: dfae6b50-59dd-44e6-81ac-79d4f3511c3f. Workaround nu: w1's session-cookies gekopieerd naar w0's key; sfRemember-cookie geldig tot 2026-05-06. Tijdbom: zodra alle 3 session-cookies expiren gaat elke worker die fresh moet inloggen omvallen.
