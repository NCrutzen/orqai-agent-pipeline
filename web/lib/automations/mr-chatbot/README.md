# MR Chatbot

**Status:** building (v1)
**Type:** standalone-app
**Eigenaar:** Danny Vaessens
**Project ID (Supabase):** `9adc6592-bfa5-43e1-8029-f498b0752e7d`

## Wat is het

Interne chatbot voor Moyne Roberts medewerkers. Toegankelijk via gedeelde URL achter M365 SSO. Beantwoordt "hoe doe ik X"-vragen met **concrete stap-voor-stap instructies** in plaats van linkjes te dumpen. Gebruikt web search wanneer nodig en detecteert de taal van de gebruiker (NL/EN/FR/DE).

## Systemen

- **Vercel** — hosting (route `/chatbot` in agent-workforce)
- **Supabase Auth** — bestaande M365 SSO + invite-only gate
- **Orq.ai** — LLM router (`anthropic/claude-sonnet-4-6`)
- **Tavily** — web search

## Trigger

Gebruiker opent `https://[domain]/chatbot` → wordt geredirect naar `/login` als niet ingelogd → na M365 SSO terug naar chatbot.

## Aanpak

```
Browser → POST /api/chatbot/chat (SSE)
            ↓
Server: Orq.ai router (non-stream probe → tool-calls?)
            ├─ Ja → Tavily web search → resultaat als tool message
            │       (max 3 iteraties)
            └─ Nee → stream antwoord chunked terug naar browser
```

System prompt: `lib/automations/mr-chatbot/system-prompt.ts`
- Detecteert taal en antwoordt in dezelfde taal
- Vraagt eerst om context (device/OS/versie) als die ontbreekt
- Geeft stap-voor-stap, geen linkjes-only

## Aannames

- v1 heeft **geen** conversatie-persistentie (state in client-memory). Persistentie + history-sidebar komt in v2 als gebruik aantoont dat het nodig is.
- v1 heeft **geen** Notion-koppeling — bewust scope-down.
- "MR-only" toegang via bestaande Supabase invite-flow (zelfde gate als de rest van agent-workforce). Iemand met geldig M365-account die geen invite heeft krijgt `no_access` error.
- Tavily free tier (1000 calls/maand) is genoeg voor v1; bij groei upgraden of switch naar Exa.

## Credentials / env vars

| Variabele | Bron | Bestaat al? |
|---|---|---|
| `ORQ_API_KEY` | Vercel env | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel env | ✅ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel env | ✅ |
| `TAVILY_API_KEY` | tavily.com (free) | **NIEUW — toevoegen aan Vercel** |

## Setup-stappen

1. Account op tavily.com (gratis) → API key kopiëren
2. Vercel: project agent-workforce → Settings → Environment Variables → `TAVILY_API_KEY`
3. Deploy → URL `/chatbot` is beschikbaar voor alle invited MR-users

## Roadmap (v2+)

- Conversatie-persistentie in Supabase + sidebar met history
- Notion-koppeling (specifieke workspace, dagelijkse Inngest-sync naar embeddings)
- Feedback-knoppen (👍/👎) → trainingset bouwen
- Eval-set met representatieve vragen (`/gsd-eval-review`)
