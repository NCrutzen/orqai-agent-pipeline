# Klachten Dashboard

**Status:** building
**Type:** hybrid (Zapier ingest + Vercel dashboard)
**Eigenaar:** Danny Vaessens
**Systemen:** Zapier, Supabase, Vercel
**Supabase project id:** 672d1246-12f9-4e39-bca7-62bd5da21dd0

## Wat doet het
Intern dashboard op Vercel (Microsoft 365 SSO guard) dat klant-klachten toont met filters op categorie, periode en klantnaam. Biedt CSV-export t.b.v. voorbereiding van klantgesprekken.

## Waarom
Klachten worden vandaag geregistreerd in een Zapier Table. Dat is prima opslag maar geen dashboard — collega's willen aantallen per week, trends en op-maat exports. Een Supabase-tabel + Next.js pagina geeft dat zonder dat we live Zapier-API rate limits hoeven te managen.

## Trigger
Klacht komt binnen (huidige invoerroute onbekend — nog te verifiëren bij gebruiker) → bestaande Zap creëert een rij in Supabase `public.klachten` via de officiële Zapier–Supabase integratie (actie "Create Row").

## Aanpak
- **Bron:** Supabase tabel `public.klachten` (migration in `supabase/migrations/20260423_klachten.sql`)
- **Ingest:** Zapier Supabase action direct naar tabel. Geen custom endpoint.
- **Dashboard:** `web/app/(dashboard)/klachten/` — server page + client component. Queries via `@/lib/supabase/client` (RLS zorgt voor auth-gate).
- **Export:** client-side CSV-bouw, Excel-vriendelijk (UTF-8 BOM).

## Aannames
- Klachten hebben minimaal: `klantnaam`, `categorie`, `omschrijving` + een datum waarop klacht binnenkwam.
- Exacte kolommen uit Zapier Tables zijn nog niet opgehaald; schema is op basis van best-practice. Bij mismatch: kolommen toevoegen of mappen in de Zap.
- Eén gedeelde dashboard-view voor alle ingelogde MR-collega's (geen per-user filtering in fase 1).

## Credentials
Geen extra credentials nodig. Supabase service role wordt door Zapier geconfigureerd (apart account aan Zapier-kant).

## Zapier configuratie (nog te doen door eigenaar)
1. Bewerk bestaande "klacht binnenkomen"-Zap.
2. Vervang (of dupliceer) de actie "Create Row in Tables" met **Supabase → Create Row**.
3. Tabel: `klachten`.
4. Veld-mapping volgens schema in migration file. Sterk aanbevolen: vul `bron_referentie` met de Zapier Tables record-ID → voorkomt duplicaten bij retries.
5. Test de Zap met een dummy record; verifieer in dashboard.

## Fase 2 (nog niet gebouwd)
- Mutaties vanuit dashboard (status wijzigen, behandelaar toewijzen, notities)
- Drilldown per klacht
- Grafieken (klachten per categorie / over tijd)
- Audit-log van mutaties
