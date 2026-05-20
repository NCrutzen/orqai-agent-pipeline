---
date: "2026-04-23 11:13"
promoted: false
---

iController-cleanup throughput: BATCH_SIZE_PER_WORKER omhoog (5 → 10). Nu 72-114/u vs theoretische 180/u omdat dispatcher soms <15 rijen vindt wanneer vorige workers nog bezig zijn met hun flip-to-pending; met 10 items per shard is load-pending LIMIT = 30, meer ruimte voor round-robin-split ook als sommige rijen tijdelijk excluded zijn. Risico: batch-duur per worker verdubbelt van ~60-130s naar ~120-260s; onder 300s maxDuration en 600s Browserless-cap dus veilig. File: web/lib/inngest/functions/debtor-email-icontroller-cleanup-dispatcher.ts, constante BATCH_SIZE_PER_WORKER. Niet nu doen — huidige run eerst laten leeglopen.
