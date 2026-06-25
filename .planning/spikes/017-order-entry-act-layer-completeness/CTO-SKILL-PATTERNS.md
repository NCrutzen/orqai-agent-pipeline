# Hoe de CTO zijn NXT-skills bouwt — patronen om over te nemen

Read-only studie van de 19 concept-skills in `/Users/nickcrutzen/Downloads/skills/` (CTO = in-house
NXT-expert, authoritative per source-trust). Doel: onze order-entry-handlers hierop baseren i.p.v. opnieuw
uitvinden. Citaten verwijzen naar `~/Downloads/skills/<skill>/...`.

## De 10 patronen

1. **Consistente, kopieerbare SKILL.md-structuur.** YAML-frontmatter (`name` + trigger-rijke
   `description` met NL+EN-synoniemen) → secties: wat-het-doet → platform-fit → **auth** → **safety** →
   commands → entity/body-**schemas als tabellen** → **"confirmed vs to-verify"** → **gotchas
   (hard geleerd)** → file-inventory → guardrails. Reference/context-skills zijn `user-invocable: false`
   (`nxt-context/SKILL.md:10`) — pure kennis die naar `../../systems/nxt/docs/` wijst.

2. **3-lagenmodel als ruggengraat** (`nxt-context/SKILL.md:21-27`): A = read-only warehouse-SQL
   (referentie/validatie), B = Auth0-M2M — bewust gedocumenteerd als **dood** (`nxt-exact-interface/SKILL.md:68-73`
   houdt `--via m2m` aan *zodat de 401-faal vastligt*), C = interne SPA `/api/` + camunda-rest = de write-laag.
   Defunct agent-workforce-proxy expliciet als verwijderd gemarkeerd. **Dode paden bewaren met de reden.**

3. **Eén gedeelde SPA-Bearer-token-laag, per merk gecached, hergebruikt door álle skills.** Auth0
   **id_token** (~10h TTL), cache `~/.config/nxt/token-<brand>` (chmod 600). Resolutie-volgorde
   (`nxt.py:90-124`): `--token` → `$NXT_TOKEN_<BRAND>` → cache → CDP auto-grab uit debug-Chrome. Geldig
   alleen met >120s over. **401 → re-auth** uniform. camunda-tasks/send-rules/exact-interface/crm-import/
   invoice-finalize **hergebruiken nxt-user's `nxt.py`** i.p.v. dupliceren. → *build once, reuse everywhere*.

4. **Harde read-vs-write-scheiding.** Reads (`list/count/get/scan/check/status`) "safe to run freely";
   writes gated. `db.py` weigert non-SELECT/multi-statement. De diagnose-skill houdt zijn write-pad
   (`set-status`) op een apart codepad met strikte regex (alleen single-column `SET status=` op één
   PK+GUID) + **column-scoped grant** (`GRANT UPDATE ON dbo.bpa_external_task(status)`). Least-privilege by design.

5. **Idempotency expliciet — én ze zeggen wanneer het NIET zo is.** proforma `start` skipt als al
   `suspended_by=PROFORMA_PROCESS`; crm-import zegt openlijk **"No idempotency skip (by design)"**;
   invoice-finalize matcht op globally-unique `external_task_id` (niet het niet-unieke Faknr) om de
   verkeerde rij niet te raken. → **kies een globally-unique key (order-GUID, niet ordernr/quoteref).**

6. **Vast safety-patroon:** default acc; prod vereist aparte expliciete flag (`--confirm-prod`,
   `--yes`, `--confirm-impact`); **dry-run default**; verplichte **present-back-and-confirm** vóór elke
   write (echo genormaliseerd resultaat met opgeloste codes naast menselijke waarden — "county:
   Gelderland → 2432" — lijst defaults + missende velden, dán vragen). Cancellaties tonen
   **preflight blast-radius** ("je annuleert EX maar HR blijft actief — bedoeld?").

7. **Endpoints + payloads als CONFIRMED-tabellen met provenance.** Elk entity-schema = field/type/notes
   "Captured from a real request"; elk endpoint getagd `(CONFIRMED)` met methode/pad/statuscodes/quirks.
   Aparte "What's confirmed vs to-verify"- en "API quirks & gotchas (learned the hard way)"-secties
   (collections zijn 405, order-scheme POST + lowercase `"active"`, customer `email1` verplicht (anders 500),
   site-city in `address3`, move geeft 200 lege body).

8. **Warehouse-reads valideren vóór writes.** Coded fields tegen cached `catalog/*.json`
   (countries/counties/areas/order_types/industries/classifications/asset_types/items) — onbekend =
   afwijzen, niet verzinnen. Catalogs ververst uit de **prod** warehouse (read-only `claude`-user),
   prod-read zelf gated ("requires explicit user approval each time").

9. **Uniforme brand/env-scoping.** `bx→sb, uk→wf, ie→af`; hosts `[acc.]<prefix>.n-xt.org`; default
   `bx`/`acc`, override via `NXT_BRAND`/`NXT_ENV`. Scheidt **platform/host** (welke host + token-cache)
   van **brandId** (in URL-pad / op records) — bv. brand `IN` leeft op de `sb`-host. Token-caches per platform.

10. **Eén skill, veel gevallen via profiles — geen skill-per-bedrijf.** nxt-migrate gebruikt
    `profiles/<BRANDID>/` elk met eigen SQL die een vast **canoniek kolomcontract** produceert; nieuwe
    acquisitie = nieuw profiel, geen code. Compositie boven duplicatie: migrate + crm-import **delegeren
    alle writes** aan nxt-user/camunda-tasks.

## Over te nemen voor de order-entry-handler
- Hergebruik nxt-user's `nxt.py`-tokenlaag verbatim (per-merk-cache, >120s-check, 401→re-auth, CDP-grab). Geen tweede auth-pad.
- Default acc; expliciete `--confirm-prod`-achtige flag voor prod; dry-run default; verplichte present-back-met-opgeloste-codes-confirm vóór elke write.
- Valideer elk coded field tegen cached catalogs vóór POST; wijs onbekend af.
- Documenteer elk endpoint als CONFIRMED field-tabel (methode/pad/status/quirks) + "confirmed vs to-verify" + "gotchas".
- Benoem idempotency expliciet; kies een globally-unique matching key (order-GUID).
- Scheid platform/host van brandId; houd de bx→sb/uk→wf/ie→af-matrix.
- Verschillen alleen in mapping (merken/quote-bronnen)? → profile-patroon (canoniek contract + per-bron SQL/transform), geen handler-per-merk.
