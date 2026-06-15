# Triage V2 — recente "New" SugarCRM-cases: beantwoord / ruis / onbeantwoord

> PRODUCTION -- SugarCRM (Cases+Emails, read-only) + Microsoft Graph (read-only) + Supabase (read-only)
> Quick task 260611-jwt · gegenereerd 2026-06-11 14:48 · mailbox `verkoop@smeba.nl` · vanaf 2026-05-01

## 1. Context & methode

Vervolg op het ADDENDUM in RAPPORT.md: de eerdere telling werkte op een DB-snapshot die maar t/m 2026-05-06 liep. Dit rapport haalt de populatie **rechtstreeks uit Sugar** (Cases = source of truth): alle cases met status **"New"** en `date_entered >= 2026-05-01` voor de Smeba/NL-teams (`smeba|verkoop|kede|berki|fire control`). Per case nemen we de **inbound trigger-mail**.

We delen elke mail EXCLUSIEF in (volgorde: beantwoord > ruis > onbeantwoord):

- **beantwoord** — de Outlook-conversatie (`conversationId`) heeft een Sent-Items-reply NA de inbound. Sugar-status "New" is hier stale → geen actie.
- **ruis** — subject draagt een `[SPAM]`-tag (Smeba's eigen spamfilter), afzender matcht no-reply/notificatie, subject matcht auto-reply/out-of-office, óf onze eigen Stage-1 noise-classificatie (`pipeline_events`, swarm `sales-email`) gaf een noise-verdict.
- **onbeantwoord** — de rest: écht openstaand werk.

Per mail bepalen we de **Outlook-locatie** (Inbox / Sugar Archive / overig / niet gevonden) via exact `internetMessageId` (Trap A) en anders fuzzy `$search` op gestript subject ±2 dagen (Trap B, gecapt op 1000).

> **Read-only.** Geen writes naar Sugar/Outlook/productie-tabellen — alleen dit rapport + script.

## 2. Totalen per categorie

| Categorie | Mails | % | Distinct cases |
| --- | ---: | ---: | ---: |
| beantwoord | 3 | 0.3% | 3 |
| ruis | 348 | 38.5% | 348 |
| onbeantwoord | 554 | 61.2% | 547 |
| **totaal** | **905** | 100% | **897** |

## 3. Categorie × Outlook-locatie (mails)

| Categorie | Inbox | Sugar Archive | overig | niet gevonden |
| --- | ---: | ---: | ---: | ---: |
| beantwoord | 1 | 1 | 1 | 0 |
| ruis | 7 | 2 | 2 | 337 |
| onbeantwoord | 107 | 222 | 3 | 222 |

## 4. Maandsplitsing (mails per categorie)

| Maand | beantwoord | ruis | onbeantwoord | totaal |
| --- | ---: | ---: | ---: | ---: |
| 2026-05 | 0 | 340 | 351 | 691 |
| 2026-06 | 3 | 8 | 203 | 214 |

## 5. Onbeantwoord — concrete lijst (oudste eerst)

Kolom "case-genoot" = ja wanneer dezelfde case nóg een onbeantwoorde mail heeft (zelfde werk, meerdere mails). Exact- en fuzzy-matches gescheiden — fuzzy NIET vermengen met exact.

### 5a. Exact / pipeline-locatie (betrouwbaar) — 222

| Datum | Subject | Afzender | Locatie | case-genoot |
| --- | --- | --- | --- | --- |
| 2026-05-04 | [CASE:760984] FW: noodverlichting | planning@smeba.nl | niet gevonden | — |
| 2026-05-05 | [CASE:761477] Inzending contactformulier smeba.nl van Chadia | info@smeba.nl | niet gevonden | — |
| 2026-05-05 | [CASE:761658] Q2Q Ltd Statement | adele.buckley@q2q-it.com | niet gevonden | — |
| 2026-05-05 | [CASE:761766] Smeba - Herinnering: Maak Maandelijks Ruimte - Verkoop Ons Uw Auto | info@impexcompany.nl | niet gevonden | — |
| 2026-05-05 | [CASE:761769] Cargill EMEA Request for Statement of Accounts | EMEA_supplier_statement_request@cargill. | niet gevonden | — |
| 2026-05-05 | [CASE:761777] 台湾经贸网电子报 2026-05-06 | subscribeletter@taiwantrade.com | niet gevonden | — |
| 2026-05-06 | [CASE:761805] Initiativbewerbung als Berechnungsingenieur (FEM‑Ingenieur) — Fors | narra.c@firemail.de | niet gevonden | — |
| 2026-05-06 | [CASE:761811] Afspraak maken (Smeba) - 1597796 - 473608/536877 Jumbo Supermarkt | lehu@smeba.nl | niet gevonden | — |
| 2026-05-06 | [CASE:761821] Openingstijden of n.a.w. aanpassen (Smeba) - 1590624 - 525142/6377 | rori@smeba.nl | niet gevonden | — |
| 2026-05-06 | [CASE:761831] Afspraak maken (Smeba) - 1589492 - 590775/637002 RWZI Geldermalsen | remo@smeba.nl | niet gevonden | — |
| 2026-05-06 | [CASE:761852] U heeft succesvol een volgende stap voltooid. U kunt nu uw aanbied | karunakarmiramontes@gmail.com | niet gevonden | — |
| 2026-05-06 | [CASE:761874] Sluiting Dekamarkt Amsterdam Pretoriusstraat 10 mei | jkromwijk@dekamarkt.nl | niet gevonden | — |
| 2026-05-06 | [CASE:761882] Openingstijden of n.a.w. aanpassen (Smeba) - 1605540 - 491174/4911 | edwl@smeba.nl | niet gevonden | — |
| 2026-05-06 | [CASE:761892] Openingstijden of n.a.w. aanpassen (Smeba) - 1625907 - 589434/6332 | mostafa.asmi.sf@moyneroberts.com | niet gevonden | — |
| 2026-05-06 | [CASE:761891] Openingstijden of n.a.w. aanpassen (Smeba) - 1605065 - 532409/5155 | mostafa.asmi.sf@moyneroberts.com | niet gevonden | — |
| 2026-05-06 | [CASE:761893] Openingstijden of n.a.w. aanpassen (Smeba) - 1602860 - 589711/6333 | mostafa.asmi.sf@moyneroberts.com | niet gevonden | — |
| 2026-05-06 | [CASE:761938] Re: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factu | roger.vandenhoudt@skynet.be | niet gevonden | — |
| 2026-05-06 | [CASE:762016] Afspraak maken (Smeba) - 1617242 - 532404/453358 85100 DC Sassenhe | danny.hoedemakers.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-06 | [CASE:762072] Openingstijden of n.a.w. aanpassen (Smeba) - 1602752 - 532283/5377 | paco@smeba.nl | niet gevonden | — |
| 2026-05-06 | [CASE:762107] Niet aanwezig (Smeba) - 1587023 - 510853/510853 The Bronx | sten.claessen.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-06 | [CASE:762108] Niet aanwezig (Smeba) - 1603826 - 218300/537194 Xenos 0172 | sten.claessen.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-06 | [CASE:762139] Openingstijden of n.a.w. aanpassen (Smeba) - 1590609 - 525142/6377 | rori@smeba.nl | niet gevonden | — |
| 2026-05-06 | [CASE:762199] Factuur uitgevoerd onderhoud Ceva Nieuwegein. | NRandshuizen@kuijpers.com | niet gevonden | — |
| 2026-05-06 | [CASE:762200] 1234199 OHD - Blusmiddelen | niels.lutjeboer@kropman.nl | niet gevonden | — |
| 2026-05-06 | [CASE:762245] Werkbon 608 Hoogezand | rutger.van_der_kloet@lidl.nl | niet gevonden | — |
| 2026-05-06 | [CASE:762283] 1473105 - 532406/546090 Serviceflat Ter Wolven + Cado | peter@smeba-fire.be | niet gevonden | — |
| 2026-05-06 | [CASE:762295] Offerte plaatsing brandtrap IKO Brecht | Frederik.Knaepkens@brecht.be | niet gevonden | — |
| 2026-05-06 | [CASE:762369] Niet aanwezig (Smeba) - 1601838 - 511524/511524 Bismillah | raas@smeba.nl | niet gevonden | — |
| 2026-05-06 | [CASE:762380] 1572581 - 532406/546091 De Spil + admin centrum | peter@smeba-fire.be | niet gevonden | — |
| 2026-05-06 | [CASE:762381] Bestelling IO00248 | info@efbe.nl | niet gevonden | — |
| 2026-05-06 | [CASE:762414] Openingstijden of n.a.w. aanpassen (Smeba) - 1590617 - 525142/6377 | rori@smeba.nl | niet gevonden | — |
| 2026-05-06 | [CASE:762511] Beeindigen samenwerking | rboer76@ziggo.nl | niet gevonden | — |
| 2026-05-06 | [CASE:762520] offerte brandladder - Kwekerijstraat 67, 2140 Borgerhout | sukruyildiz95@hotmail.com | niet gevonden | — |
| 2026-05-07 | [CASE:762538] Vakmensen in de metaal gezocht? Brainstorm over nieuw voorschakelt | dorgelo@metaalunie.nl | niet gevonden | — |
| 2026-05-07 | [CASE:762575] Niet aanwezig (Smeba) - 1610883 - 496451/634456 Tijdelijke huisbes | dave.rozekrans.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-07 | [CASE:762576] Re: Niet aanwezig (Smeba) - 1610883 - 496451/634456 Tijdelijke hui | dave.rozekrans.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-07 | [CASE:762582] Nexeye Payment advice 2000075133 | CrediteurenBE@hansanders.com | niet gevonden | — |
| 2026-05-07 | [CASE:762586] Afspraak maken (Smeba) - 1600339 - 589995/638231 DC 2: Prinsenhil  | sehi@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:762585] Afspraak maken (Smeba) - 1600350 - 589995/638235 Farmeli BV | sehi@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:762613] Niet aanwezig (Smeba) - 1589715 - 530495/531922 Vesaliusinstituut | kode@smeba-fire.be | niet gevonden | — |
| 2026-05-07 | [CASE:762662] Homepage-Remake?!!! | saranshsingh439@gmail.com | niet gevonden | — |
| 2026-05-07 | [CASE:762714] PRODUKTION IN KLEINEN UND MITTLEREN SERIEN - ZUVERLÄSSIGE QUALITÄT | engineering@p-solutions.ba | niet gevonden | — |
| 2026-05-07 | [CASE:762716] electrical installation company - subcontractor (UAB Diamantas, Li | export@diamantas.lt | niet gevonden | — |
| 2026-05-07 | [CASE:762742] Factuur retour | crediteuren@nmg.nl | niet gevonden | — |
| 2026-05-07 | [CASE:762782] Afspraak maken (Smeba) - 1505716 - 532291/537737 Dhr D. Bazelmans | petwin.arets.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-07 | [CASE:762784] Openingstijden of n.a.w. aanpassen (Smeba) - 1618002 - 531273/5159 | edve@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:762834] Afspraak maken (Smeba) - 1599210 - 591362/635722 Altijd Lente Kind | sehi@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:762835] Afspraak maken (Smeba) - 1460778 - 530921/533211 Eyes + More Breda | sehi@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:762837] Smeba - factuur 17340643 | n.sieliakus@mijn-thuis.nl | niet gevonden | — |
| 2026-05-07 | [CASE:762853] Openingstijden of n.a.w. aanpassen (Smeba) - 1617496 - 530144/5304 | edve@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:762888] Re: Re: | Sarasmith23ti@outlook.com | niet gevonden | — |
| 2026-05-07 | [CASE:762909] Re: 1st Rank? | sohpianicole8465@outlook.com | niet gevonden | — |
| 2026-05-07 | [CASE:762953] Re: send — Portfolio & Pricing | abigailclarke.co.uk@hotmail.com | niet gevonden | — |
| 2026-05-07 | [CASE:762969] Afspraak maken (Smeba) - 1611364 - 322197/322197 Las-/Constructieb | kim.van.groot.battave.sb@moyneroberts.co | niet gevonden | — |
| 2026-05-07 | [CASE:762968] Afspraak maken (Smeba) - 1615825 - 456609/456029 Jola Textiel BV | kim.van.groot.battave.sb@moyneroberts.co | niet gevonden | — |
| 2026-05-07 | [CASE:762996] Afspraak maken (Smeba) - 1600941 - 506141/506141 Drogisterij en Sp | miui@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:763052] Afspraak maken (Smeba) - 1547014 - 421843/421843 Meyert-Laan Zonwe | mada@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:763073] Afspraak maken (Smeba) - 1602962 - 517119/517119 Mvr. M. Brouwer | miui@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:763091] RE: Preventief onderhoud 2026 blusmiddelen \| Kreuning \| Platinaw | nina.hofstee@fleximgroup.com | niet gevonden | — |
| 2026-05-07 | [CASE:763116] Separate Remittance Advice: paper document number - 3021185 | aecomremittances@aecom.com | niet gevonden | — |
| 2026-05-07 | [CASE:763127] Verbandtrommels WE Leidschendam | vincent.van.amerongen@wefashion.com | niet gevonden | — |
| 2026-05-07 | [CASE:763152] Bestelling blusmateriaal | facilitair@dayes.eu | niet gevonden | — |
| 2026-05-07 | [CASE:763153] Niet aanwezig (Smeba) - 1611862 - 524216/524216 Night Shop Serhan | raas@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:763191] NW32227//#SUK// Offerteaanvraag levering en plaatsing brandblusser | noordwest.vve@mvgm.nl | niet gevonden | — |
| 2026-05-07 | [CASE:763193] Afspraak maken (Smeba) - 1536300 - 213031/313304 (11C01) Generaal- | dupr@smeba.nl | niet gevonden | — |
| 2026-05-07 | [CASE:763208] Bouwonderneming Goevaers & Znn -> GEVA | secretariaat@gevavastgoed.nl | niet gevonden | — |
| 2026-05-07 | [CASE:763225] Inquiry on a Potential RVM Partnership for  WALKER FIRE (UK) LTD | sales03@aizorings.com | niet gevonden | — |
| 2026-05-07 | [CASE:763347] Initiativbewerbung als Business-Intelligence-Consultant, Data Anal | mohebbi.s@firemail.de | niet gevonden | — |
| 2026-05-08 | [CASE:763372] IMPORTANT: Employee's Performance Report - May '06  (Ref: -94736 ® | hr@smeba-fire.be | niet gevonden | — |
| 2026-05-08 | [CASE:763371] IMPORTANT: Employee's Performance Report - May '06  (Ref: -58446 ® | hr@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763377] Courrier recommandé | orthopediesanchez@skynet.be | niet gevonden | — |
| 2026-05-08 | [CASE:763390] Supply of Petroleum Products & Storage Services FOB/CIF \| Kazakhs | info@omarabdulla.biz | niet gevonden | — |
| 2026-05-08 | [CASE:763391] Supply of Petroleum Products & Storage Services FOB/CIF \| Kazakhs | info@omarabdulla.biz | niet gevonden | — |
| 2026-05-08 | [CASE:763396] Afspraak maken (Smeba) - 1610468 - 516241/466024 VvE Denenburg 75  | danny.hoedemakers.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-08 | [CASE:763404] Niet aanwezig (Smeba) - 1555317 - 470046/532994 Van Vonderen Schil | sehi@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763408] Cleaning, Repair & Home Service App | charikanova280@gmail.com | niet gevonden | — |
| 2026-05-08 | [CASE:763413] Niet aanwezig (Smeba) - 1616181 - 464879/464878 Tennispark Eindenh | dave.rozekrans.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-08 | [CASE:763422] FW: werkbon | S.Chadli@coop-voc.eu | niet gevonden | — |
| 2026-05-08 | [CASE:763455] Niet aanwezig (Smeba) - 1513598 - 530574/537842 Holland & Barrett  | mostafa.asmi.sf@moyneroberts.com | niet gevonden | — |
| 2026-05-08 | [CASE:763472] Informatieverstrekking inzake overname | NFR@hema.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763533] Afspraak maken (Smeba) - 1595466 - 510126/510126 Alie & Brenda Uw  | miui@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763545] Afspraak maken (Smeba) - 1521374 - 491531/454918 716 Gamma Bouwmar | danny.hoedemakers.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-08 | [CASE:763582] uw factuur 17339417 (SMEBA BRANDBEVEILIGING BV) (26142) (MT120) | anja.vanmeer@besix.com | niet gevonden | — |
| 2026-05-08 | [CASE:763580] Afspraak maken (Smeba) - 1616181 - 464879/464878 Tennispark Einden | dave.rozekrans.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-08 | [CASE:763598] Afspraak maken (Smeba) - 1607424 - 530980/638376 Apotheek 't Zuid  | edwl@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763597] Openingstijden of n.a.w. aanpassen (Smeba) - 1611321 - 531435/5251 | remo@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763632] Afspraak maken (Smeba) - 1597796 - 473608/536877 Jumbo Supermarkt | lehu@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763656] RE: Afspraak maken (Smeba) - 1597796 - 473608/536877 Jumbo Superma | RiSc@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763694] Afspraak maken (Smeba) - 1589972 - 530549/509971 FOD Financiën | chha@smeba-fire.be | niet gevonden | — |
| 2026-05-08 | [CASE:763695] Afspraak maken (Smeba) - 1589972 - 530549/509971 FOD Financiën | chha@smeba-fire.be | niet gevonden | — |
| 2026-05-08 | [CASE:763712] Offerteaanvraag | lbaarda@zvtechniek.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763711] Niet aanwezig (Smeba) - 1594368 - 530152/530213 Frituur De Puntzak | kode@smeba-fire.be | niet gevonden | — |
| 2026-05-08 | [CASE:763724] Niet aanwezig (Smeba) - 1607303 - 589864/633878 B313 PartsPoint De | keku@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763731] Payment advice from H&B | EssenzaAccounts@hollandandbarrett.com | niet gevonden | — |
| 2026-05-08 | [CASE:763762] Niet aanwezig (Smeba) - 1602489 - 300944/300944 Vos Makelaars | lehu@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763773] Niet aanwezig (Smeba) - 1619095 - 479625/532955 Benu Servicepunt D | dave.rozekrans.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-08 | [CASE:763783] Re: Niet aanwezig (Smeba) - 1619095 - 479625/532955 Benu Servicepu | dave.rozekrans.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-08 | [CASE:763790] Afspraak maken (Smeba) - 1509997 - 445366/493840 Holland & Barrett | dave.rozekrans.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-08 | [CASE:763800] Bescherm uw bouwplaats tegen diefstal, vandalisme en stilstand | jmoerland@ecotax.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763811] FW: 44538.02 Lauriergracht 116 | order@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763827] Niet aanwezig (Smeba) - 1595744 - 460446/493746 32-GS Van Dal Mann | rono@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763847] Quick question - Need a Mobile App for Your Business? | maverickjones573@gmail.com | niet gevonden | — |
| 2026-05-08 | [CASE:763860] Openingstijden of n.a.w. aanpassen (Smeba) - 1620293 - 504778/5077 | bako@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763862] Wil je kandidaten? | arjan@wr.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763873] Afspraak maken (Smeba) - 1633084 - 530676/532479 Dekamarkt Filiaal | dave.rozekrans.sb@moyneroberts.com | niet gevonden | — |
| 2026-05-08 | [CASE:763883] Afspraak maken (Smeba) - 1613854 - 490097/490097 Fotohuis Oss | kim.van.groot.battave.sb@moyneroberts.co | niet gevonden | — |
| 2026-05-08 | [CASE:763882] Afspraak maken (Smeba) - 1603799 - 456609/456013 Jola Mode | kim.van.groot.battave.sb@moyneroberts.co | niet gevonden | — |
| 2026-05-08 | [CASE:763887] $ Car Rental & Ride-Sharing App's?! | anoukua8@gmail.com | niet gevonden | — |
| 2026-05-08 | [CASE:763884] Afspraak maken (Smeba) - 1612647 - 501461/501461 Studio 54 | kim.van.groot.battave.sb@moyneroberts.co | niet gevonden | — |
| 2026-05-08 | [CASE:763885] Re:  yes — Portfolio & Pricing | charlottejames.co.uk@hotmail.com | niet gevonden | — |
| 2026-05-08 | [CASE:763886] Niet aanwezig (Smeba) - 1611862 - 524216/524216 Night Shop Serhan | raas@smeba.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763888] 64Y1-美金来换RMB--nXCc | ArthurChristina59653@outlook.com | niet gevonden | — |
| 2026-05-08 | [CASE:763929] Rapportage | customercare@securitas.nl | niet gevonden | — |
| 2026-05-08 | [CASE:763997] Uw voertuig heeft onderhoud nodig ⚠ | periodic-report@pm.free2move-connectflee | niet gevonden | — |
| 2026-05-08 | [CASE:763996] Het gezondheidsrapport van uw voertuig | periodic-report@pm.free2move-connectflee | niet gevonden | — |
| 2026-05-08 | [CASE:764003] Re: send — Portfolio & Pricing | merry.miller67@outlook.com | niet gevonden | — |
| 2026-05-08 | [CASE:764030] RE: Keuringen Brandblussers + CFHR | P.Busing@mindef.nl | niet gevonden | — |
| 2026-05-08 | [CASE:764042] Re: Re: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. F | roger.vandenhoudt@skynet.be | niet gevonden | — |
| 2026-05-08 | [CASE:764043] Re: Re: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. F | roger.vandenhoudt@skynet.be | niet gevonden | — |
| 2026-05-09 | [CASE:764049] ERIKS bv Orderbevestiging  354304310, uw referentie 30025390 | astrid.pool@eriks.com | niet gevonden | — |
| 2026-05-09 | [CASE:764055] Quotation for Pump | johnmorrispb37@gmail.com | niet gevonden | — |
| 2026-05-09 | [CASE:764076] Businesses/Project Financing Opportunity | NasserAlMaskati@algurabinvestment.org | niet gevonden | — |
| 2026-05-09 | [CASE:764077] Businesses/Project Financing Opportunity | NasserAlMaskati@algurabinvestment.org | niet gevonden | — |
| 2026-05-09 | [CASE:764162] Re: send — Portfolio & Pricing | rachel.cooperx@outlook.com | niet gevonden | — |
| 2026-05-09 | [CASE:765020] DE:85-46: Your payment | 113281akg@gmail.com | niet gevonden | — |
| 2026-05-09 | [CASE:764187] Opzegging | m.burgers.nl@gmail.com | niet gevonden | — |
| 2026-05-10 | [CASE:764228] Inzending contactformulier smeba.nl van aXxnYMKgFasKRRrr | info@smeba.nl | niet gevonden | — |
| 2026-05-10 | [CASE:764268] Niet geleverde artikelen, inkooporder: INK0081176 | inkoopstatus@lasaulec.nl | niet gevonden | — |
| 2026-05-10 | [CASE:764272] Smeba Fire - Het beste bod voor uw auto? | info@impexcompany.be | niet gevonden | — |
| 2026-05-11 | [CASE:764301] Your receipt from Klipfolio Inc. #2250-9816 | invoice+statements@klipfolio.com | niet gevonden | — |
| 2026-05-11 | [CASE:764319] BTI´i Q21 | comunicaciones@quimica21.es | niet gevonden | — |
| 2026-05-11 | [CASE:764320] FW: RUMC Faculteit MRI 14T - Blusgasinstallatie | Potman@vandorp.eu | niet gevonden | — |
| 2026-05-11 | [CASE:764348] Herinnering - Interview met de heer of mevrouw over brandveilighei | interview@european-business.com | niet gevonden | — |
| 2026-05-11 | [CASE:764364] Redesign van de homepage | mohanbagkegj@gmail.com | niet gevonden | — |
| 2026-05-11 | [CASE:764365] - 1589943 - 525142/527852 159 MULTIPHARMA SINT-PIETERS-LEEUW | peter@smeba-fire.be | niet gevonden | — |
| 2026-05-11 | [CASE:764383] Snelladerstudie SMEBA FIRE - verwacht rendement | william@bellade.be | niet gevonden | — |
| 2026-05-11 | [CASE:764580] Re: | JabulileKaya@outlook.com | niet gevonden | — |
| 2026-05-11 | [CASE:764631] Woningisolatie zonder investering: check nu uw gemeente | assiste.chat@umontreal.ca | niet gevonden | — |
| 2026-05-11 | [CASE:764642] Inzending contactformulier smeba.nl van Luuk de Ruijter | info@smeba.nl | niet gevonden | — |
| 2026-05-11 | [CASE:764726] FW: FW: M-25830 : Werkbon n.a.v. werkzaamheden 1503989 op locatie  | order@smeba.nl | niet gevonden | — |
| 2026-05-11 | [CASE:764729] Belangrijke mededeling: sluiting Elro 15 mei 2026 | receptie@elroduurzamedaken.nl | niet gevonden | — |
| 2026-05-11 | [CASE:764730] PO 1965 Rijzertlaan Den Bosch - inspectie droge blusleiding | Youk.Brill@rebogroep.nl | niet gevonden | — |
| 2026-05-11 | [CASE:764785] Destil Telesales actie 21-5 a.s. | J.Leensen@destil.nl | niet gevonden | — |
| 2026-05-11 | [CASE:764958] Revamp Apps / Web. | williamrurkee@gmail.com | niet gevonden | — |
| 2026-05-11 | [CASE:764807] Backorder Overzicht - AnB-Rimex | catchall@anb-rimex.be | niet gevonden | — |
| 2026-05-11 | [CASE:764822] Onderhoud en controle | j.boerboom@lelieinstallateurs.nl | niet gevonden | — |
| 2026-05-11 | [CASE:764970]  WALKER FIRE (UK) LTD& The RVM-D1200Ads Revenue and Efficiency Opp | sales03@aizorings.com | niet gevonden | — |
| 2026-05-11 | [CASE:764983] Factuur 10012696 | administratie@baslease.com | niet gevonden | — |
| 2026-05-12 | [CASE:764990] Smeba - Autoverkoop alert: Verkrijg de beste waarde voor uw auto b | info@impexcompany.nl | niet gevonden | — |
| 2026-05-12 | [CASE:765001] Re: Homepage design!! | kareenabajaj78@hotmail.com | niet gevonden | — |
| 2026-05-12 | [CASE:765042] Doe mee aan de SixDay van SV Terwolde – 14 juni! | sponsoring@svterwolde.nl | niet gevonden | — |
| 2026-05-12 | [CASE:765043] Betalingsherinnering | administratie.nl@solutions30.com | niet gevonden | — |
| 2026-05-12 | [CASE:765047] Inzending contactformulier smeba.nl van Lisanne Dollevoet | info@smeba.nl | niet gevonden | — |
| 2026-05-12 | [CASE:765054] request for order confirmation for PO 4521445260, Cargill, CBS_AB | Procurement_BE@cargill.com | niet gevonden | — |
| 2026-05-12 | [CASE:765075] Vebri Work \| Beschikbaar personeel week 21 | inlenen@vebriwork.com | niet gevonden | — |
| 2026-05-12 | [CASE:765202] Re: | alishaparrytech28@outlook.com | niet gevonden | — |
| 2026-05-12 | [CASE:765306] Verzoek keuring brandslanghaspels | wklvastgoed@gmail.com | niet gevonden | — |
| 2026-05-12 | [CASE:765323] Energiecontract voor Smeba Brandbeveiliging B.V. | info@mkbenergieofferte.com | niet gevonden | — |
| 2026-05-12 | [CASE:765372] Inzending contactformulier smeba.nl van Jos Langenhuijzen | info@smeba.nl | niet gevonden | — |
| 2026-05-12 | [CASE:765460] eppol-facturen – ontbrekende bijlage / identificatie vestiging | virginie.massun@sterkescholen.be | niet gevonden | — |
| 2026-05-12 | [CASE:765495] # Taxi/Cab Booking & Travel Booking Software development?!` | wilsonmoore2987@gmail.com | niet gevonden | — |
| 2026-05-12 | [CASE:765498] rapportage DKC | michel.wildenbeest@dkc.nl | niet gevonden | — |
| 2026-05-12 | [CASE:765520] Vacature special (Bij 440.000 huishoudens) | nick@starterspers.nl | niet gevonden | — |
| 2026-05-12 | [CASE:765521] Ingka Group Nederland verbetert en versterkt het facturatie- en be | supplier.onboarding.gl@ingka.ikea.com | niet gevonden | — |
| 2026-05-12 | [CASE:765538] FW: automùatische brandblusinstallatie | luc.vanderauwera@vlaanderen.be | niet gevonden | — |
| 2026-05-12 | [CASE:765669] Multi-Category Rental Marketplace App ?!` | danieldaniel9017@gmail.com | niet gevonden | — |
| 2026-05-12 | [CASE:765681] Factuur 26T01814 van AGO Totaaltechniek BV | info@ago-groep.nl | niet gevonden | — |
| 2026-05-12 | [CASE:765720] ✅ Je Facebook-pagina komt in aanmerking voor de blauwe verificatie | case168@update-badgefacebook.com | niet gevonden | — |
| 2026-05-12 | [CASE:765786] Offerte aanvraag Smeba 2026 | Christiaan.Knipping@frieslandcampina.com | niet gevonden | — |
| 2026-05-12 | [CASE:765804] Aankoop gebruikte vrachtwagens en bouw machines | pieter@haverhoektrucks.nl | niet gevonden | — |
| 2026-05-12 | [CASE:765807] 台湾经贸网电子报 2026-05-13 | subscribeletter@taiwantrade.com | niet gevonden | — |
| 2026-05-13 | [CASE:765823] PRODUCT INQUIRY | wanglei2956@gmail.com | niet gevonden | — |
| 2026-05-13 | [CASE:765841] Potential Business Collaboration Opportunity *** | info@brokernoahdzien.com | niet gevonden | — |
| 2026-05-13 | [CASE:765840] Potential Business Collaboration Opportunity *** | info@brokernoahdzien.com | niet gevonden | — |
| 2026-05-13 | [CASE:765871] Keuring blusmiddelen | jacqueline.elissen@jumbo.com | niet gevonden | ja |
| 2026-05-13 | [CASE:765874] Nexeye Payment advice 2000075168 | CrediteurenBE@hansanders.com | niet gevonden | — |
| 2026-05-13 | [CASE:765873] Verlopen blusmiddelen Bouwmaat Den Haag Binckhorst | bme-facilitair@Bouwmaten.nl | niet gevonden | — |
| 2026-05-13 | [CASE:765897] Uw concurrent scoort beter op Google. Toeval? | daniel@samonlinemarketing.nl | niet gevonden | — |
| 2026-05-13 | [CASE:765975] TR: SMEBA FIRE BV - VDL BUS KONINGSHOOIKT - Order A56802289 | verkoop@sicli-noord.be | niet gevonden | — |
| 2026-05-13 | [CASE:765986] Inzending contactformulier smeba.nl van H ten Hoeve | info@smeba.nl | niet gevonden | — |
| 2026-05-13 | [CASE:765997] ✅ May I send You a quote..  www.smeba-fire.be | raunakjha4887@gmail.com | niet gevonden | — |
| 2026-05-13 | [CASE:766043] RE: Offerte 1586548 | r.flos@venlogistics.nl | niet gevonden | — |
| 2026-05-13 | [CASE:766174] Loan Available | denverix.com@ | niet gevonden | — |
| 2026-05-13 | [CASE:766216] Betalingen  13-05-2026 | administratie@mc-l.nl | niet gevonden | — |
| 2026-05-13 | [CASE:766234] werkadres 486810 | r.crediet@staphorst.nl | niet gevonden | — |
| 2026-05-13 | [CASE:766358] FW: aanvraag | order@smeba.nl | niet gevonden | — |
| 2026-05-15 | [CASE:767784] Offerte | paul@sandmannoptiek.nl | niet gevonden | — |
| 2026-05-18 | [CASE:769181] FW: Offerte brandblussers | info@smeba.nl | niet gevonden | — |
| 2026-05-18 | [CASE:769254] FW: Offerteaanvraag | info@smeba.nl | niet gevonden | — |
| 2026-05-18 | [CASE:769307] FW: Onderhoud brandblussers | info@smeba.nl | niet gevonden | — |
| 2026-05-20 | [CASE:770382] Offerte | Nils.poldervaart@cbre.com | niet gevonden | — |
| 2026-05-20 | [CASE:770686] contract | mast@smeba.nl | niet gevonden | — |
| 2026-05-21 | [CASE:780874] FW: Pictoborden brandslang en brandblusser | info@smeba.nl | niet gevonden | — |
| 2026-05-21 | [CASE:780887] FW: Offerte aanvraag | info@smeba.nl | niet gevonden | — |
| 2026-05-21 | [CASE:780907] FW: offerte getekend | info@smeba.nl | niet gevonden | — |
| 2026-05-22 | [CASE:780876] FW: OA3868SH - Brandblussers mobiel onderhoud groot  (1x 5 jaar) S | info@smeba.nl | niet gevonden | — |
| 2026-05-26 | [CASE:780864] FW: (426) Kindcentrum Wilhelmina - gegevens brandbeveiliging | info@smeba.nl | niet gevonden | — |
| 2026-05-26 | [CASE:780867] FW: contract | info@smeba.nl | niet gevonden | — |
| 2026-05-26 | [CASE:780912] FW: Aanvraag | info@smeba.nl | niet gevonden | — |
| 2026-05-27 | [CASE:780933] FW: Noodverlichting | Storing.Smeba@smeba.nl | niet gevonden | — |
| 2026-05-28 | [CASE:780959] FW: | eric@smeba.nl | niet gevonden | — |
| 2026-05-28 | [CASE:780866] FW: Aangescherpte richtlijnen voor facturatie en orderbevestiginge | info@smeba.nl | niet gevonden | — |
| 2026-05-28 | [CASE:780870] FW: Vraag | info@smeba.nl | niet gevonden | — |
| 2026-06-01 | [CASE:780878] FW: DCJ / Lotus Aanvraag voorstel nulmeting en onderhoud kleine bl | planning@smeba.nl | niet gevonden | — |
| 2026-06-01 | [CASE:780871] FW: Installeren push sleutelkluis | info@smeba.nl | niet gevonden | — |
| 2026-06-02 | [CASE:779695] Brandblussers | inforicisgarage@gmail.com | niet gevonden | — |
| 2026-06-02 | [CASE:780883] FW: JMB RAP technisch overzicht opdrachten - Smeba Brandbeveiligin | Storing.Smeba@smeba.nl | niet gevonden | — |
| 2026-06-03 | [CASE:780187] FW: 3114 CC: Offerte SB016036 n.a.v. bezoek monteur op locatie: 43 | r.evers@aevego.nl | niet gevonden | — |
| 2026-06-03 | [CASE:780868] FW: aanvraag nieuwe brandblusser en onderhoud en keuring | info@smeba.nl | niet gevonden | — |
| 2026-06-03 | [CASE:780667] Controle 2026 | firedepartment@tue.nl | niet gevonden | — |
| 2026-06-04 | [CASE:781406] Info | geert.van.beek@enexis.nl | niet gevonden | — |
| 2026-06-04 | [CASE:781387] Aanvraag offerte | Margret.Bel@dichtbijkinderopvang.nl | niet gevonden | — |
| 2026-06-04 | [CASE:781513] Facturen | mhermkens@c.snap.com | niet gevonden | — |
| 2026-06-04 | [CASE:781526] Beeindigen onderhoudscontract | pieter@piet-wijchen.nl | niet gevonden | — |
| 2026-06-04 | [CASE:781568] RE: Herinnering offerte SB016083 n.a.v. bezoek monteur op locatie: | helpdeskbouwbureau@dirk.nl | niet gevonden | — |
| 2026-06-04 | [CASE:781646] Fw: planning Gasunie - zie mail van zoeven / Aanbieding onderhoud  | anja@smeba.nl | niet gevonden | — |
| 2026-06-05 | [CASE:781692] FW: Brandblusser | info@smeba.nl | niet gevonden | — |
| 2026-06-05 | [CASE:781781] Onderhoud blusmiddelen 2026 | fs@dehaagsescholen.nl | niet gevonden | — |
| 2026-06-05 | [CASE:781868] FW: documenten | mebo@smeba.nl | niet gevonden | — |
| 2026-06-06 | [CASE:782268] FW: Inzending contactformulier smeba.nl van Henco van Doorn | info@smeba.nl | niet gevonden | — |
| 2026-06-10 | [CASE:784097] RE: [External] Herinnering offerte SB015861 n.a.v. bezoek monteur  | pwn.nl@equans.com | niet gevonden | — |
| 2026-06-10 | [CASE:784320] | info@sandmannoptiek.nl | niet gevonden | — |

### 5b. Fuzzy-match-locatie (onzeker, handmatig verifiëren) — 332

| Datum | Subject | Afzender | Locatie | case-genoot |
| --- | --- | --- | --- | --- |
| 2026-05-04 | [CASE:760853] GVB Noord Zuidlijn | raho@smeba.nl | Sugar Archive | — |
| 2026-05-04 | [CASE:760870] FW: Opdracht tot uitvoering Referentie J.H.van Kuijk/case 722858 o | bestuur@lindenhove.nl | Sugar Archive | — |
| 2026-05-04 | [CASE:760904] ordernummers opvragen AED | gwenda.haan@smeba.nl | Sugar Archive | — |
| 2026-05-04 | [CASE:760911] FW: Betwisting factuur – keuring brandblusser - factuur: 33050819 | ribo5@hotmail.com | Sugar Archive | — |
| 2026-05-04 | [CASE:760935] wanneer offerte Jumbo Amstelveen in PIT? | j.schuttevaar@rbm-retail.com | Sugar Archive | — |
| 2026-05-04 | [CASE:760951] FW: Storing Dirk nr: BB M2605 0262  Prio 2 - 2 dagen - 5045 Dirk E | Storing.Smeba@smeba.nl | Sugar Archive | — |
| 2026-05-04 | [CASE:760960] Van Dal Mannenmode Roden | michaelbrouwer@vdal.nl | Sugar Archive | — |
| 2026-05-05 | [CASE:761072] FW: Niet aanwezig (Smeba) - 1590623 - 525142/637775 659 Popelin Me | gwenda.haan@smeba.nl | Sugar Archive | — |
| 2026-05-05 | [CASE:761121] Verlenging afspraken tbv IKEA | kim.vanerven@heydayfm.nl | Sugar Archive | — |
| 2026-05-05 | [CASE:761134] FW: Facturen WijWijzer | crediteuren@smeba.nl | Sugar Archive | — |
| 2026-05-05 | [CASE:761770] Inzending contactformulier smeba-fire.be van Tim Meerschaut | info@smeba.nl | Sugar Archive | — |
| 2026-05-06 | [CASE:761926] FW: Beheer BHV kasten | m.vespignani@calduran.nl | Sugar Archive | — |
| 2026-05-06 | [CASE:762325] RE: Planning jaarlijkse keuring | bas.wissink@vcsobservation.com | Sugar Archive | — |
| 2026-05-07 | [CASE:762783] Telefonisch contact betreft afspraak | Service@toonen-installatietechniek.nl | Sugar Archive | — |
| 2026-05-07 | [CASE:763069] FW: Werkbon n.a.v. werkzaamheden 1512512 op locatie 528247 - Holla | LindadeJong@hollandandbarrett.com | Sugar Archive | — |
| 2026-05-07 | [CASE:763097] FW: Corning Fogostraat 12 en 13 Amsterdam AED onderhoud | planning@smeba.nl | Sugar Archive | — |
| 2026-05-07 | [CASE:763178] FW: Afspraak voorstel WO 1624732 | planning@smeba.nl | Sugar Archive | — |
| 2026-05-07 | [CASE:763203] Re: Offerte SB014378 n.a.v. bezoek monteur op locatie: 451279 - Vv | vve@vanderhorstmakelaardij.nl | Sugar Archive | — |
| 2026-05-07 | [CASE:763317] FW: Afspraak aankondiging WO 1618456:  WE - Offerte lithium blusse | anja.hol@moyneroberts.com | Sugar Archive | — |
| 2026-05-08 | [CASE:763451] Onderhoud Fedasil: Deurne | chha@smeba-fire.be | Sugar Archive | — |
| 2026-05-08 | [CASE:763485] FW: Job Back Order - SB - 504666 - 529334 - 1530765 - MO | order@smeba.nl | Sugar Archive | — |
| 2026-05-08 | [CASE:763544] FW: Job Back Order - BB - 588040 - 631189 - 1529610 - MO | Order@berki.nl | Sugar Archive | — |
| 2026-05-08 | [CASE:763686] Herinnering offerte SB012968 n.a.v. bezoek monteur op locatie: 454 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-08 | [CASE:763705] 531772 Sportcentrum Brothers - kopie factuur en afwijzing offerte | debiteuren@smeba.nl | Sugar Archive | — |
| 2026-05-08 | [CASE:763736] RE: [BULK] Offerte SB013726 n.a.v. bezoek monteur op locatie: 6403 | suzan@ahsliedrecht.com | Sugar Archive | — |
| 2026-05-08 | [CASE:763771] FW: Werkbon n.a.v. werkzaamheden 1616974 op locatie 534410 - Holla | propertybenelux@hollandandbarrett.com | Sugar Archive | — |
| 2026-05-08 | [CASE:763825] FW: Controle brandblusser etc. | order@smeba.nl | Sugar Archive | — |
| 2026-05-08 | [CASE:763844] Herinnering offerte SB014258 n.a.v. bezoek monteur op locatie: 462 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-08 | [CASE:763918] Herinnering offerte SF013007 n.a.v. bezoek monteur op locatie: 477 | verkoop@smeba-fire.be | Sugar Archive | — |
| 2026-05-08 | [CASE:763943] Afspraak maken (Smeba) - 1560860 - 320564/320564 Cafetaria Koning | miui@smeba.nl | Sugar Archive | — |
| 2026-05-08 | [CASE:764005] FW: Offerte SB014683 n.a.v. bezoek monteur op locatie: 511931 - RC | e.stienstra@rcn.nl | Sugar Archive | — |
| 2026-05-11 | [CASE:764361] keuren brandslangahaspels en blussers Crematorium Oss | j.gesthuizen@megens.tech | Sugar Archive | ja |
| 2026-05-11 | [CASE:764418] FW: Hobrand BV - Inkooporder INK124767 | orders@hobrand.nl | Sugar Archive | — |
| 2026-05-11 | [CASE:764420] S50 Bluswagens | D.Zondervan.01@mindef.nl | Sugar Archive | — |
| 2026-05-11 | [CASE:764640] Réponse automatique : Herinnering offerte SF013065 n.a.v. bezoek m | david.vanhove@syndic-spirit.be | overig | ja |
| 2026-05-11 | Réponse automatique : Nieuwe case gemaakt voor #[CASE:764640] | david.vanhove@syndic-spirit.be | overig | ja |
| 2026-05-11 | [CASE:764672] Fw: Rapport n.a.v. werkzaamheden 1565473 op locatie 517208 - ENORA | elger@smeba-fire.be | Sugar Archive | — |
| 2026-05-12 | [CASE:765033] FW: Brandblusser voor in de bus - Gasunie | anja@smeba.nl | Sugar Archive | — |
| 2026-05-12 | [CASE:765097] RE: Onderhoudscontract blusmiddelen | T.vanLeest@vpagroep.nl | Sugar Archive | — |
| 2026-05-12 | [CASE:765107] FW: [External] RE: JDE-Utrecht verwijderen blusgas flessen FU27 | sander.van.es@equans.com | Sugar Archive | — |
| 2026-05-12 | [CASE:765171] FW: 1633779 Planning jaarlijkse keuring - VCS Observation Waalwijk | Storing.Smeba@smeba.nl | Sugar Archive | — |
| 2026-05-12 | [CASE:765287] RE: Herinnering offerte SF013065 n.a.v. bezoek monteur op locatie: | Lydia.Kaplan@syndic-spirit.be | Sugar Archive | ja |
| 2026-05-12 | [CASE:765496] Kom bij ons langs tijdens de vakbeurs Renovatie & Transformatie | info@nbd-online.nl | Sugar Archive | — |
| 2026-05-12 | [CASE:765599] Re: Herinnering offerte SB014446 n.a.v. bezoek monteur op locatie: | facilitymanagement.waddinxveen@lidl.nl | Sugar Archive | — |
| 2026-05-12 | [CASE:765589] Doorschakelen Directe telefoonnummers Berki - Goes (IN) | guus.van.hout.sb@moyneroberts.com | Sugar Archive | — |
| 2026-05-12 | [CASE:765612] Herinnering offerte SB012378 n.a.v. bezoek monteur op locatie: 454 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-12 | RE: Fair Bianca Betreft: [CASE:765287] RE: Herinnering offerte SF013065 n.a.v. b | Lydia.Kaplan@syndic-spirit.be | Sugar Archive | ja |
| 2026-05-13 | [CASE:765856] Re: price? | Shilapa25.Webexpert@outlook.com | Sugar Archive | — |
| 2026-05-13 | [CASE:766213] Re: Herinnering offerte SF011822 n.a.v. bezoek monteur op locatie: | marie.verleye@sportjoy.be | Sugar Archive | — |
| 2026-05-13 | [CASE:766231] FW: Offerte SB014980 n.a.v. bezoek monteur op locatie: 525913 - Nu | sonja.vandenheuvel@rubix.com | Sugar Archive | — |
| 2026-05-13 | [CASE:766232] TR: We have just received a new Invoice with ID 33050927 from Supp | Beatrice.Lambot@fedasil.be | Sugar Archive | — |
| 2026-05-13 | [CASE:766260] Offerteaanvraag THTK onderhoud | messages@mail.12build.com | Sugar Archive | — |
| 2026-05-13 | [CASE:766333] FW: [P4/Normaal]  JUMBO RIJKEVORSEL MERKSPLASSE (RAP) JMB-WV-53167 | Storing.Smeba@smeba.nl | Sugar Archive | — |
| 2026-05-13 | [CASE:766489] Herinnering offerte SB012839 n.a.v. bezoek monteur op locatie: 479 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-13 | [CASE:766605] KRISTAL: jaarlijks onderhoud blusmiddelen Kristalweg 107 | info@organiquebv.nl | Sugar Archive | — |
| 2026-05-14 | [CASE:767147] Herinnering offerte SB012910 n.a.v. bezoek monteur op locatie: 637 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-15 | [CASE:767720] Herinnering offerte SB012968 n.a.v. bezoek monteur op locatie: 454 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-15 | [CASE:767721] Fwd: RE: Offerte aanvraag PID2026 - Brandblussers Offerte SMEQ 985 | info@kffn.nl | Sugar Archive | — |
| 2026-05-15 | [CASE:767977] Herinnering offerte SB013005 n.a.v. bezoek monteur op locatie: 454 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-15 | [CASE:768004] Herinnering offerte SF013007 n.a.v. bezoek monteur op locatie: 477 | verkoop@smeba-fire.be | Sugar Archive | — |
| 2026-05-18 | [CASE:768644] FW: Afspraak voorstel WO 1620093 | planning@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:768659] FW: planning Gasunie - zie mail van zoeven / Aanbieding onderhoud  | anja.hol@moyneroberts.com | Sugar Archive | — |
| 2026-05-18 | [CASE:769122] FW: Bestelling voor GGZ Eindhoven inkooporder 52616348 | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769157] FW: JMB - RAP Chats. Jumbo Rijkevorsel Merksplasse (RAP) | Storing.Smeba@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769182] FW: Naamswijziging naar Strukton Civiel Nederland per 1 juni 2026 | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769200] FW: automùatische brandblusinstallatie | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769204] 329041 Vrouwenschool \| Fwd: FW: Inzending contactformulier smeba. | debiteuren@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769221] Herinnering offerte SB013102 n.a.v. bezoek monteur op locatie: 456 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769223] URGENT - Hobrand BV - Inkooporder INK124767 | astrid.engelse@hobrand.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769241] FW: Opzegging | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769288] FW: Verbandtrommels WE Leidschendam | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769286] FW: NW32227//#SUK// Offerteaanvraag levering en plaatsing brandblu | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769290] FW: Beeindigen samenwerking | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769292] FW: Offerte plaatsing brandtrap IKO Brecht | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769305] FW: Sluiting Dekamarkt Amsterdam Pretoriusstraat 10 mei | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769303] FW: Re: Re: Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factu | info@smeba.nl | Sugar Archive | — |
| 2026-05-18 | [CASE:769309] FW: TO01909 / Herstellen gebreken blusmiddelen 2026 / Rijnzathe 16 | info@smeba.nl | Sugar Archive | — |
| 2026-05-19 | [CASE:769539] Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050937 | eckleyf@gmail.com | Sugar Archive | — |
| 2026-05-19 | [CASE:769789] Kosten opgaven afpersen BSH bij Villa Arena | Verwoert@verwoert.nl | Sugar Archive | — |
| 2026-05-19 | [CASE:769935] brandblusser tankstation | Marc.dehouwer@robberechts.be | Sugar Archive | — |
| 2026-05-19 | RE: Fair Bianca Betreft: [CASE:765287] RE: Herinnering offerte SF013065 n.a.v. b | melissa.druart@syndic-spirit.be | Sugar Archive | ja |
| 2026-05-20 | [CASE:770579] FW: Inzending contactformulier smeba.nl van Dirk Hu | info@smeba.nl | Sugar Archive | — |
| 2026-05-20 | [CASE:770746] FW: Mapnummer: G00185407, Naam debiteur: Mango Groningen, Ref. opd | xadr@smeba.nl | Sugar Archive | — |
| 2026-05-20 | [CASE:770937] FW: Werkorder: WRK-260841 | planning@bostersvanwezel.nl | Sugar Archive | — |
| 2026-05-20 | RE: Nieuwe case gemaakt voor #[CASE:764361] | j.gesthuizen@megens.tech | Sugar Archive | ja |
| 2026-05-21 | [CASE:780893] FW: Opzegging contract deb. 492369 | info@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:771375] FW: Adreswijziging VvE Arcadia Lisse | info@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:780869] FW: Afspraak voorstel WO 1620672 | mast@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:771474] Inzending contactformulier smeba-fire.be van Tom Deketelaere | info@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:780946] Fwd: FW: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 173 | debiteuren@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:780964] FW: NW32227//#SUK// Offerteaanvraag levering en plaatsing brandblu | info@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:771919] FW: prijsaanvraag onderhoudscontract brandhaspels 4 jaar - Fedasil | Peggy.Moons@fedasil.be | Sugar Archive | — |
| 2026-05-21 | [CASE:771934] Spuitstuk brandhaspel diameter 6mm | alba@bovenbouw.be | Sugar Archive | — |
| 2026-05-21 | [CASE:780948] Herinnering offerte SB012910 n.a.v. bezoek monteur op locatie: 637 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:780896] FW: Beëindiging overeenkomst Pleysier Delft per 17 juli 2026 | info@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:780908] FW: 8101 Opzegging contract | info@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:780891] FW: Installeren push sleutelkluis | info@smeba.nl | Sugar Archive | — |
| 2026-05-21 | [CASE:772332] Sollicitation d’une entrevue en présentiel pour concertation opéra | Pierre.Nyebel@fedasil.be | Sugar Archive | — |
| 2026-05-22 | [CASE:780903] FW: Offerteaanvraag - Nieuwbouw Amarant Kloppend Hart te Tilburg | info@smeba.nl | Sugar Archive | — |
| 2026-05-22 | [CASE:780944] Herinnering offerte SB012968 n.a.v. bezoek monteur op locatie: 454 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-22 | [CASE:780941] WO 1614727 | pascal@smeba.nl | Sugar Archive | — |
| 2026-05-22 | [CASE:772814] FW: Onderhoud veiligheidsmiddelen | info@smeba.nl | Sugar Archive | — |
| 2026-05-22 | [CASE:780885] FW: met enige spoed op regie | planning@smeba.nl | Sugar Archive | — |
| 2026-05-22 | [CASE:780956] FW: Afspraak voorstel WO 1510381 | planning@smeba.nl | Sugar Archive | — |
| 2026-05-25 | [CASE:780930] Herinnering offerte SB013102 n.a.v. bezoek monteur op locatie: 456 | verkoop@smeba.nl | Sugar Archive | — |
| 2026-05-26 | [CASE:780889] Afspraak maken (Smeba) - 1607896 - 532364/516703 Stichting gastenh | toro@smeba.nl | Sugar Archive | — |
| 2026-05-26 | [CASE:773579] Offerte O2026-7966-001 Reparatie DBL Vve Emily Brontësingel 77 t/m | info@noordam.info | Sugar Archive | — |
| 2026-05-26 | [CASE:773602] Concept Serviceovereenkomst Smeba per 01-06-2026 Gilead | Clemens.vanWelt@cbre.com | Sugar Archive | — |
| 2026-05-26 | [CASE:780901] RE: Graag update over werkorder 1625136 Bas Truck Nijmegen>>> hoe  | babr@smeba.nl | Sugar Archive | — |
| 2026-05-26 | [CASE:780968] FW: Onderhoudsrapport | info@smeba.nl | Sugar Archive | — |
| 2026-05-26 | [CASE:780960] FW: Offerteaanvraag – VME Gretrystraat 1 | info@smeba.nl | Sugar Archive | — |
| 2026-05-26 | [CASE:780911] FW: Brandblusser voor in de bus. | planning@smeba.nl | Sugar Archive | — |
| 2026-05-26 | [CASE:780875] FW: Onderhoud brandveiligheid WUR | anja@smeba.nl | Sugar Archive | — |
| 2026-05-27 | [CASE:774129] RE: Sollicitation d’une entrevue en présentiel pour concertation o | Pierre.Nyebel@fedasil.be | Sugar Archive | — |
| 2026-05-27 | [CASE:780872] FW: Inzending contactformulier smeba.nl van Thea | info@smeba.nl | Sugar Archive | — |
| 2026-05-27 | [CASE:780955] FW: Afspraak maken (Smeba) - 1625265 - 592226/640420 Veilinghal 7 | nonvisit@smeba.nl | Sugar Archive | — |
| 2026-05-27 | [CASE:780958] FW: Afspraak maken (Smeba) - 1624978 - 592207/640389 Raw Logies | nonvisit@smeba.nl | Sugar Archive | — |
| 2026-05-27 | [CASE:780943] FW: Adreswijziging | info@smeba.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:780934] FW: Inzending contactformulier smeba.nl van Michel Trietsch | info@smeba.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:780895] FW: Rapport droge stijgleidingen. | info@smeba.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:774836] FW: Afspraakbevestiging WO 1523162 | planning@smeba.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:780865] FW: Inzending contactformulier smeba.nl van Robert Nijman | info@smeba.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:775092] Opzegging De Run 4210 | Jerney@bestronics.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:775094] RE: Vraag over offerte P3 blusmiddelen na preventief onderhoud | ldijk4@heijmans.nl | Sugar Archive | — |
| 2026-05-28 | RE: Nieuwe case gemaakt voor #[CASE:765871] | efc.facilitair@jumbo.com | Sugar Archive | ja |
| 2026-05-28 | [CASE:775314] Verzoek offerte onderhoudscontraact 2026 - 207 Nike-Hilversum | alger.vanmourik@nike.com | Sugar Archive | — |
| 2026-05-28 | [CASE:780942] FW: Inzending contactformulier smeba.nl van Pierre Kuijpers | info@smeba.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:780931] FW: Schuimblusser voor in huis | info@smeba.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:780963] FW: Inzending contactformulier smeba.nl van Gert-Jan de Snoo | info@smeba.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:775345] Beëindigen contract | farahm1985@live.nl | Sugar Archive | — |
| 2026-05-28 | [CASE:775404] RE: Gespreksverslag en actielijst overleg dinsdag 7 april 2026: ac | anja@smeba.nl | Inbox | — |
| 2026-05-28 | [CASE:775435] Herstelling blustoestel Zwembad Arendonk | bert.van.loon@arendonk.be | Sugar Archive | — |
| 2026-05-29 | [CASE:780894] Inzending PFAS-formulier smeba.nl van jTctzfaqtHhjjehNkPePXJp | info@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:780905] FW: Handbrandblusmiddelen in opslag ASN Bank | planning@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:775532] FW: JMB RAP technisch overzicht opdrachten - Smeba Brandbeveiligin | elger@smeba-fire.be | Sugar Archive | — |
| 2026-05-29 | [CASE:780967] FW: Samenwerking met Brandpreventie | info@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:780938] FW: Storing Dirk nr: BB M2605 2380  Prio 2 - 2 dagen - 1067 Dirk L | Storing.Smeba@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:780965] FW: Breda/Maastricht | pascal@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:780947] FW: [External] Aanvraag opdrachtnummer - Pro forma - 1526758 | planning@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:780906] FW: Jaarlijkse controle – Tenaz Energy Den Helder (Oostoeverweg 10 | planning@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:780884] FW: Huur en onderhoudscontract brandblussers Fedorest Brugge | info@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:780952] FW: Planmatig - Offerteaanvraag 9083-135406-1 | order@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:776714] beëindiging huurovereenkomst VTP6 / Seacon | gpeeters@seaconlogistics.com | Sugar Archive | — |
| 2026-05-29 | [CASE:780957] FW: Offerte onderhoud blusmiddelen | info@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:780904] FW: Onderhoud veiligheidsmiddelen | info@smeba.nl | Sugar Archive | — |
| 2026-05-29 | [CASE:780873] FW: Vraag over afgekeurde schuimbrandblussers, PFAS en onderhoudsa | info@smeba.nl | Sugar Archive | — |
| 2026-05-31 | [CASE:780909] FW: Inzending contactformulier smeba.nl van Linda Toeback | info@smeba.nl | Sugar Archive | — |
| 2026-05-31 | [CASE:780882] Inzending contactformulier smeba-fire.be van SEBfrit | info@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:778651] Afspraak voorstel WO 1590158 | Ilaisa.Beverley@fedasil.be | Sugar Archive | — |
| 2026-06-01 | [CASE:780932] FW: Inkooporder P0001566 voor SMEBA brandbeveiliging | info@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:778774] Keuring brandblusser Grensstraat 10 te 's-Heerenberg | administratie@r2construct.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:778773] Restpunten 22 mei | BDerlagen@merem.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780900] FW: Verzoek tot afmelding klantnummer 493071 | info@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:778874] Foute adres | elger@smeba-fire.be | Sugar Archive | — |
| 2026-06-01 | [CASE:780935] FW: Inzending contactformulier smeba.nl van Wilco Kuppens | info@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780877] FW: JMB RAP technisch overzicht opdrachten - Smeba Brandbeveiligin | Storing.Smeba@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780880] FW: Openingstijden of n.a.w. aanpassen (Smeba) - 1603365 - 531715/ | nonvisit@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:779032] 5610 Bleiswijk blusmiddelen | mdgraaf@Heijmans.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780886] FW: D'Oude Post - offerte/factuur | info@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780890] FW: Werkbon n.a.v. werkzaamheden 1474075 op locatie 475017 - B019  | info@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:779057] aanmelding Ommen / Dalfsen HEMA | gr.doornewaard@vab-hema.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780951] FW: Begroting preventief jaarlijks onderhoud | order@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780961] FW: Afhandeling reparatieverzoek 8467-260027-1 | info@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780936] offerte 2026 - P3 - SB014088 | leny@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780939] Inzending contactformulier smeba-fire.be van Paul Van Royen | info@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780949] FW: Loonbelastingverklaring opvragen | info@smeba.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:779262] uitvoering onderhoud en controle sportclub Eefde | voorzitter@sp-eefde.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:779282] HEMA Apeldoorn, Hoofdstraat 50A - Notulen 2e Bouwvergadering | stef@ddpm.nl | Sugar Archive | — |
| 2026-06-01 | [CASE:780937] Inzending contactformulier smeba-fire.be van Dirk Goelen | info@smeba.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:779400] FW: Inkooporder P0040476-ADE-4791 van Ekro voor Smeba Brandbeveili | info@smeba.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:780953] Keurings rapporten equans | lehu@smeba.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:780950] FW: Offerte plaatsing brandtrap IKO Brecht | info@smeba.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:780940] FW: Status navraag storingnr: BB M2605 0262 - 5045 Dirk Etten-Leur | order@smeba.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:779722] RE: Brandblusser voor in de bus. | D.Tepper@gasunie.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:779814] FW: Factuur 173399902, Werkorder 1598808 | j.vandijck@destil.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:780898] Fwd: Smeba / Snap - Opname Piet Heinkade | raho@smeba.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:779885] Inkooporder - IOEB0321157 ∙ Smeba Brandbeveiliging B.V. | NRandshuizen@kuijpers.com | Sugar Archive | — |
| 2026-06-02 | [CASE:779904] RE: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17342508 | jaap.tiemens@miniso.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:780954] FW: aanvraag nieuwe brandblusser en onderhoud en keuring | info@smeba.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:779968] FW: Offerte Castelijns Swaans ref SB015803 | j.borgmans@castelijns-swaans.nl | Sugar Archive | — |
| 2026-06-02 | [CASE:780100] Jaarlijkse keuring/onderhoud + extra opdracht | robin@fulfilment.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780897] FW: Jaarlijkse keuring/onderhoud + extra opdracht | info@smeba.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780234] RE: Herinnering offerte SB013635 n.a.v. bezoek monteur op locatie: | francisco.snelder@kinop.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780899] FW: JMB RAP technisch overzicht opdrachten - Smeba Brandbeveiligin | Storing.Smeba@smeba.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780242] vragen werkorder 1469437 | maaikedevries@kleine-ikke.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780255] RE: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050459 | rik@dvfoods.be | Sugar Archive | — |
| 2026-06-03 | [CASE:780303] Re: Herinnering offerte SB015809 n.a.v. bezoek monteur op locatie: | info@vosmakelaars.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780326] FW: Herinnering offerte SB015259 n.a.v. bezoek monteur op locatie: | JTheunissen@geelen-beton.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780879] FW: Werkbon Zwartewaterallee Zwolle | planning@smeba.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780902] FW: Dolmans Venlo | eric@smeba.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780892] FW: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17338395 | info@smeba.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780881] FW: Sluiting Scala - Amstelring | planning@smeba.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780910] Automatic reply: Herinnering offerte SF013705 n.a.v. bezoek monteu | cel.log.ottignies@minfin.fed.be | Sugar Archive | — |
| 2026-06-03 | [CASE:780966] FW: Inzending contactformulier smeba.nl van Henk-Jan Wielders | info@smeba.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780611] Assetslijst Philips | arjen.heerkes@spie.com | Sugar Archive | — |
| 2026-06-03 | [CASE:780679] Re: Herinnering offerte SB015946 n.a.v. bezoek monteur op locatie: | servicedeskenexis@nl.issworld.com | Sugar Archive | — |
| 2026-06-03 | [CASE:780682] FW: Herinnering offerte SB014622 n.a.v. bezoek monteur op locatie: | epeters@wymefa.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780708] FW: Herinnering offerte SB015450 n.a.v. bezoek monteur op locatie: | beheer@nrw-wonen.nl | Sugar Archive | — |
| 2026-06-03 | [CASE:780764] HEMA Apeldoorn, Hoofdstraat 50A - Notulen 3e Bouwvergadering | stef@ddpm.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:780822] FW: Herinnering offerte SB015883 n.a.v. bezoek monteur op locatie: | a.vandeutekom@sanquin.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:780833] graag offerte voor leveren 1 x draagbaar blustoestel | Rob.eeftens@equans.com | Sugar Archive | — |
| 2026-06-04 | [CASE:780970] Inzending contactformulier smeba-fire.be van Petra Hulselmans | info@smeba.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:780971] Wijzigingen Techno Deelnemers 4-6-2026 | Linna@technobenelux.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:780972] FW: defecte lampen nooduitgang | info@smeba.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:780982] FW: Offerte SB016085 n.a.v. bezoek monteur op locatie: 639906 - An | A.Slob@dehaagsescholen.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781007] Fwd: Re: Offerte SB014378 n.a.v. bezoek monteur op locatie: 451279 | roosmarijn@vanderhorstmakelaardij.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781008] Fwd: Re: Offerte SB014465 n.a.v. bezoek monteur op locatie: 451275 | roosmarijn@vanderhorstmakelaardij.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781009] Fwd: Re: Offerte SB014469 n.a.v. bezoek monteur op locatie: 451268 | roosmarijn@vanderhorstmakelaardij.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781046] FW: Afspraakbevestiging WO 1626465 | planning@smeba.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781085] FW: Aanvraag prijs voor proclamatie | info@smeba.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781087] RE: Herinnering offerte SB014128 n.a.v. bezoek monteur op locatie: | harderwijk@rubix.com | Sugar Archive | — |
| 2026-06-04 | [CASE:781124] I-2026-06-0090 verbandtrommels/pleisterdispensors | r.heijligers@GGDBZO.nl | Sugar Archive | ja |
| 2026-06-04 | [CASE:781158] Prijs backorder  ivm  mandaat | rori@smeba.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781159] Handbrandblussers en fire blanket keuring | Aaron.Chundro@cbre.com | Sugar Archive | — |
| 2026-06-04 | [CASE:781265] RE: Herinnering offerte SB014505 n.a.v. bezoek monteur op locatie: | rvrossum@unica.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781318] Statusupdate Onderhoud blusmiddelen KWG Maarsbergseweg 17/17A Woud | facilitairezaken@nidos.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781339] FW: HEMA Amsterdam Nieuwendijk - Offerteaanvraag verbouwing HEMA10 | leny@smeba.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781413] Fw: Afspraak voorstel WO 1626567 - STOPZETTING VAN DE PLANNING | elger@smeba-fire.be | Sugar Archive | — |
| 2026-06-04 | [CASE:781423] Re: Offerte SB016626 n.a.v. bezoek monteur op locatie: 329727 - Ge | gpetersbeheer@gmail.com | Sugar Archive | — |
| 2026-06-04 | [CASE:781474] Re: Herinnering offerte SB016044 n.a.v. bezoek monteur op locatie: | facilitymanagement.heerenveen@lidl.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781486] RE: Herinnering offerte SB015542 n.a.v. bezoek monteur op locatie: | factuur@marifrunt.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781487] RE: Herinnering offerte SB016085 n.a.v. bezoek monteur op locatie: | fs@dehaagsescholen.nl | Sugar Archive | — |
| 2026-06-04 | [CASE:781544] RE: HERINNERING OPENSTAAND ADVIES INZAKE (BRAND) VEILIGHEID - SMEQ | TReijman@gps-perimeter.nl | Sugar Archive | — |
| 2026-06-05 | [CASE:781677] 2x getekende offerte Inproba | rkersten@inproba.nl | Sugar Archive | — |
| 2026-06-05 | [CASE:781697] FW: Noodverlichting | Storing.Smeba@smeba.nl | Sugar Archive | — |
| 2026-06-05 | [CASE:781727] Nieuwe werkvoorbereider UvA-UK & KNAW | blanoi@heijmans.nl | Inbox | — |
| 2026-06-05 | [CASE:781854] the store tracker in PDF, week 23, 05-06-2026 | PeterTeunissen@hollandandbarrett.com | Inbox | — |
| 2026-06-05 | [CASE:781967] FW: inspectierapportage brandhaspel en brandblusser inc. contract | info@smeba.nl | Inbox | — |
| 2026-06-05 | [CASE:781966] Actie en besluiten evaluatiegesprek 19-5-2026 | eprincen@heijmans.nl | Inbox | — |
| 2026-06-05 | [CASE:782001] Re: Aanvraag opdrachtnummer - Pro forma - 1489433 | run1000@heijmans.nl | Inbox | — |
| 2026-06-05 | [CASE:782002] FW: Werkbon n.a.v. werkzaamheden 1619072 op locatie 458142 - RVB D | planning@smeba.nl | Inbox | — |
| 2026-06-05 | [CASE:782073] Onderhoudsofferte WUR – Perceel West (SPIE) | andre.vanzwam@spie.com | Inbox | — |
| 2026-06-06 | [CASE:782305] Opzeggen overeenkomst | mandy@man-company.nl | Inbox | — |
| 2026-06-07 | [CASE:782334] RE: Herinnering offerte SB015196 n.a.v. bezoek monteur op locatie: | info@akkyfit.nl | Inbox | — |
| 2026-06-07 | [CASE:782353] FW: Opzeggen overeenkomst | info@smeba.nl | Inbox | — |
| 2026-06-08 | [CASE:782449] RE: Offerte SB016380 n.a.v. bezoek monteur op locatie: 418216 - (1 | GD.vd.Meijden@mindef.nl | Inbox | — |
| 2026-06-08 | [CASE:782461] Tweede locatie Maasoever | td@maasoever.com | Inbox | — |
| 2026-06-08 | [CASE:782472] FW: Tweede locatie Maasoever | info@smeba.nl | Inbox | — |
| 2026-06-08 | [CASE:782489] FW: facturen vraag terugbellen | xadr@smeba.nl | Inbox | — |
| 2026-06-08 | [CASE:782545] RE: Herinnering offerte SB016192 n.a.v. bezoek monteur op locatie: | administratie@indeneng.nl | Inbox | — |
| 2026-06-08 | [CASE:782556] FW: Vervanging materialen BHV-doos – locatie Nijmegen | facilitair@onited.com | Inbox | — |
| 2026-06-08 | [CASE:782572] FW: Brandblusser voor in de bus. | D.Tepper@gasunie.nl | Inbox | — |
| 2026-06-08 | [CASE:782625] RE: Offerte SB016732 n.a.v. bezoek monteur op locatie: 529854 - IP | sales@crisicom.nl | Inbox | — |
| 2026-06-08 | [CASE:782655] RE: Herinnering offerte SF013909 n.a.v. bezoek monteur op locatie: | log.ant.hasselt@minfin.fed.be | Inbox | — |
| 2026-06-08 | [CASE:782656] OFF-00197 akk offerte herstel gebreken droge blusleidingen - Zutph | wilbert@remans.nl | Inbox | — |
| 2026-06-08 | [CASE:782657] FW: [EXT] Rapport n.a.v. werkzaamheden 1522963 op locatie 634023 - | IFacility@allianceautomotive.nl | Inbox | — |
| 2026-06-08 | [CASE:782695] FW: Heijmans, Verzoek voor een openstaande postenlijst ref.: **151 | info@smeba.nl | Inbox | — |
| 2026-06-08 | [CASE:782696] Re: Herinnering offerte SB014299 n.a.v. bezoek monteur op locatie: | menno@delokatie.org | Inbox | — |
| 2026-06-08 | [CASE:782776] RE: Handbrandblussers en fire blanket keuring | Aaron.Chundro@cbre.com | Inbox | — |
| 2026-06-08 | [CASE:782795] FW: [EXT] Rapport n.a.v. werkzaamheden 1517092 op locatie 634014 - | IFacility@allianceautomotive.nl | Inbox | — |
| 2026-06-08 | [CASE:782817] FW: Werkorder: WRK-260841 | planning@bostersvanwezel.nl | Inbox | — |
| 2026-06-08 | [CASE:782853] FW: [EXT] Rapport n.a.v. werkzaamheden 1517472 op locatie 634025 - | IFacility@allianceautomotive.nl | Inbox | — |
| 2026-06-08 | [CASE:782898] Factuur controle brandblusser JB Schreuder-Schiermonnikoog | jan_schreuder@live.nl | Inbox | — |
| 2026-06-08 | [CASE:782914] FW: Herinnering offerte SF014340 n.a.v. bezoek monteur op locatie: | mia.vanderstappen@grimbergen.be | Inbox | — |
| 2026-06-08 | [CASE:782967] FW: Offerteaanvraag Piekenpoort | order@smeba.nl | Inbox | — |
| 2026-06-08 | [CASE:782968] 329366 - Jachthaven Molenwaard; klacht tarieven en dubbele keuring | debiteuren@smeba.nl | Inbox | — |
| 2026-06-08 | [CASE:782977] Informatie met betrekking tot contract, facturen, onderhoud, etc.  | Mirte.vanZeventer@asnbank.nl | Inbox | — |
| 2026-06-08 | [CASE:783005] Order t.b.v. Lidl 1914 fil. Den Bosch Het Wielsem | tim@snijders-best.nl | Inbox | — |
| 2026-06-08 | [CASE:783006] FW: Defibtech prijslijst 2026 | order@smeba.nl | Inbox | — |
| 2026-06-08 | [CASE:783018] FW: Ontbreken juiste flownaam en/of codering factuur 17343013 | xadr@smeba.nl | Inbox | — |
| 2026-06-08 | [CASE:783072] FW: Offerte aanvraag 12 stuk Brandblusser ecoschuim 6ltr | Carmaine.Choy@lasaulec.nl | Inbox | — |
| 2026-06-08 | [CASE:783083] RE: Herinnering offerte SB016260 n.a.v. bezoek monteur op locatie: | S.TerHove@timing.nl | Inbox | — |
| 2026-06-08 | [CASE:783092] FW: Herinnering offerte SF016231 n.a.v. bezoek monteur op locatie: | christophe.severeyns@multipharma.be | Inbox | — |
| 2026-06-08 | [CASE:783101] RE: Offerte SB016880 n.a.v. bezoek monteur op locatie: 647066 - OV | cees.blaak@kennemerhart.nl | Inbox | — |
| 2026-06-08 | [CASE:783120] Blusstof over datum | Carmen.Melchels@delibarn.com | Inbox | — |
| 2026-06-08 | [CASE:783154] Re: 592207 - VERZOEK TOT BETALING | ribo5@hotmail.com | Inbox | — |
| 2026-06-09 | [CASE:783191] FW: Werkbon Lidl | info@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783194] RE: Offerte SB016878 n.a.v. bezoek monteur op locatie: 527736 - As | facilitair@asito.nl | Inbox | — |
| 2026-06-09 | [CASE:783198] SMEBA---Breda,Maastricht,Den Haag | joao.gomes4@cbre.com | Inbox | — |
| 2026-06-09 | [CASE:783199] Terugbelverzoek. | stst@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783213] credit akkoord? | debiteuren@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783228] RE: PM, BENEHEART SERIES AED, LEI-310-055-AED, PREVENTIVE MAINTENA | arjan.ruimschoot@apleona.com | Inbox | — |
| 2026-06-09 | [CASE:783242] RE: Herinnering offerte SB016256 n.a.v. bezoek monteur op locatie: | info@wivn.nl | Inbox | — |
| 2026-06-09 | [CASE:783243] FW: Inzending contactformulier smeba.nl van Gerard de Ridder | info@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783244] FW: Controle en onderhoud brandblussers | info@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783263] Fwd: Herinnering offerte SB014811 n.a.v. bezoek monteur op locatie | frank@totaalvve.nl | Inbox | — |
| 2026-06-09 | [CASE:783349] FW: JMB RAP technisch overzicht opdrachten - Smeba Brandbeveiligin | Storing.Smeba@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783400] FW: Kosten opgaven afpersen BSH bij Villa Arena | Villaarena@verwoert.nl | Inbox | — |
| 2026-06-09 | [CASE:783401] Re: Herinnering offerte SB014178 n.a.v. bezoek monteur op locatie: | rolf.hoogkamer@jumbo.com | Inbox | — |
| 2026-06-09 | [CASE:783402] Aanvraag Werktuigbouwkundig en elektrotechnisch onderhoud Het Loo  | JOost@unica.nl | Inbox | — |
| 2026-06-09 | [CASE:783478] FW: Offerte SF016933 n.a.v. bezoek monteur op locatie: 556127 - 63 | christophe.severeyns@multipharma.be | Inbox | — |
| 2026-06-09 | [CASE:783499] FW: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17340404 | order@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783589] 429735 - Broeken Binkie; terugbelverzoek nav klacht | debiteuren@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783591] RE: [External] Herinnering offerte SB016334 n.a.v. bezoek monteur  | pwn.nl@equans.com | Inbox | — |
| 2026-06-09 | [CASE:783590] RE: [External] Herinnering offerte SB016335 n.a.v. bezoek monteur  | pwn.nl@equans.com | Inbox | — |
| 2026-06-09 | [CASE:783599] Re: Herinnering offerte SB015725 n.a.v. bezoek monteur op locatie: | facilitymanagement.heerenveen@lidl.nl | Inbox | — |
| 2026-06-09 | [CASE:783631] RE: Offerte SB016936 n.a.v. bezoek monteur op locatie: 533808 - Pa | service@crmd.nu | Inbox | — |
| 2026-06-09 | [CASE:783632] Nieuwe opdracht M-12609 - Meester B.M. Teldersstraat 3, ARNHEM (Ra | service@crmd.nu | Inbox | — |
| 2026-06-09 | [CASE:783650] Onderhoud branblusapparaat. | ehdeboer@outlook.com | Inbox | — |
| 2026-06-09 | [CASE:783660] FW: 5610 Bleiswijk blusmiddelen | order@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783668] FW: Openingstijden of n.a.w. aanpassen (Smeba) - 1594516 - 521437/ | nonvisit@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783683] FW: Brandblussers RVA Hoofdbestuur | info@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783684] FW: Aanvraag quote vorstvrije schuimblussers | info@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783685] FW: Onderhoud veiligheidsmiddelen | info@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783772] Offerte SB016975 n.a.v. bezoek monteur op locatie: 454914 - 725 Ga | verkoop@smeba.nl | Inbox | — |
| 2026-06-09 | RE: Nieuwe case gemaakt voor #[CASE:781124] | r.heijligers@GGDBZO.nl | Inbox | ja |
| 2026-06-09 | [CASE:783785] Offerte SB016978 n.a.v. bezoek monteur op locatie: 454877 - 682 Ga | verkoop@smeba.nl | Inbox | — |
| 2026-06-09 | [CASE:783811] Re: Offerte SB016977 n.a.v. bezoek monteur op locatie: 536402 - 77 | facilitymanagement.heerenveen@lidl.nl | Inbox | — |
| 2026-06-09 | [CASE:783876] 1 brandhaspel verzegelen | Carmen.Melchels@delibarn.com | Inbox | ja |
| 2026-06-09 | Automatic reply: Nieuwe case gemaakt voor #[CASE:783876] | Carmen.Melchels@delibarn.com | Inbox | ja |
| 2026-06-10 | [CASE:783927] FW: 2x getekende offerte Inproba | rkersten@inproba.nl | Inbox | — |
| 2026-06-10 | [CASE:783930] RE: [External] Herinnering offerte SB015837 n.a.v. bezoek monteur  | pwn.nl@equans.com | Inbox | — |
| 2026-06-10 | [CASE:783934] RE: Offerte SB016983 n.a.v. bezoek monteur op locatie: 537790 - La | maarten.roobol@lampidee.nl | Inbox | — |
| 2026-06-10 | [CASE:783944] Fwd: Offerte SB016755 n.a.v. bezoek monteur op locatie: 646905 - P | winkelbeheer@roobol.com | Inbox | — |
| 2026-06-10 | [CASE:783950] FW: Brandveiligheid woongebouwen | vve@vbtgroep.nl | Inbox | — |
| 2026-06-10 | [CASE:783959] Keuring brandslanghaspels en blusmiddelen | aart.wiersema@conexus.nu | Inbox | — |
| 2026-06-10 | [CASE:783975] facturen VvE Lindenhove | bestuur@lindenhove.nl | Inbox | — |
| 2026-06-10 | [CASE:783989] FW: (426) Kindcentrum Wilhelmina - gegevens brandbeveiliging | info@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:783991] FW: Brandveilligheid Lumar | info@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:783990] FW: Niet geleverde artikelen, inkooporder: INK0086828 | info@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:783992] Re: Offerte n.a.v. onderhoud | bas.dejong@zgapeldoorn.nl | Inbox | — |
| 2026-06-10 | [CASE:784013] RE: [External] Herinnering offerte SB015374 n.a.v. bezoek monteur  | pwn.nl@equans.com | Inbox | — |
| 2026-06-10 | [CASE:784039] FW: JMB RAP technisch overzicht opdrachten - Smeba Brandbeveiligin | Storing.Smeba@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:784052] FW: prijsopgave en keuring/ibs brandslanghaspels | Storing.Smeba@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:784080] RE: [EXT] Herinnering offerte SB015273 n.a.v. bezoek monteur op lo | Paul.vanderHelm@twobirds.com | Inbox | — |
| 2026-06-10 | [CASE:784155] Offerte aanvraag | OAZareaassistenten@gasunie.nl | overig | — |
| 2026-06-10 | [CASE:784198] FW: Bericht inzake uw factuur 17343037 (Smeba Brandbeveiliging B.V | info@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:784205] RE: Herinnering offerte SB016437 n.a.v. bezoek monteur op locatie: | pkluytmans@meyra.nl | Inbox | — |
| 2026-06-10 | [CASE:784217] FW: Herinnering offerte SF014649 n.a.v. bezoek monteur op locatie: | christophe.severeyns@multipharma.be | Inbox | — |
| 2026-06-10 | [CASE:784218] Re: Offerte SB015825 n.a.v. bezoek monteur op locatie: 511928 - RC | m.vannetten@rcn.nl | Inbox | — |
| 2026-06-10 | [CASE:784251] FW: 1640162 Re: 01. Opdrachtbrief reparatie - Filiaal: NLE00003 -  | planning@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:784259] FW: Rapport droge stijgleidingen. | info@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:784260] Onderstaande adres | arpr@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:784283] Vraag adhv werkzaamheden. | IFacility@allianceautomotive.nl | Inbox | — |
| 2026-06-10 | [CASE:784342] RE: Herinnering offerte SB015898 n.a.v. bezoek monteur op locatie: | A.Cuijten@acdiana.nl | Inbox | — |
| 2026-06-10 | [CASE:784348] RE: Offerte SF016415 n.a.v. bezoek monteur op locatie: 433867 - Mu | lien.riepen@mcgroup.be | Inbox | — |
| 2026-06-10 | [CASE:784349] FW: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17340404 | Storing.Smeba@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:784358] Prijsopgaaf | marco.scholten@buildingservices.nl | Inbox | — |
| 2026-06-10 | [CASE:784364] NLD_WeWork Amsterdam_Fire extinguisher Maintenance | Sheila.Broersen@cbre.com | Inbox | — |
| 2026-06-10 | [CASE:784365] RE: Offerte SB017078 n.a.v. bezoek monteur op locatie: 516593 - AZ | rene@az-import.nl | Inbox | — |
| 2026-06-10 | [CASE:784372] FW: Inzending contactformulier smeba.nl van Rick Martens | operationeel@smeba.nl | Inbox | — |
| 2026-06-10 | [CASE:784384] Re: Herinnering offerte SB015436 n.a.v. bezoek monteur op locatie: | wil.campschroer@plus.nl | Inbox | — |

## 6. Betrouwbaarheids-kanttekeningen

- **Locatie-match:** Trap A (exact `internetMessageId` via eigen pipeline-index) is zeker; Trap B (fuzzy `$search` op gestript subject + ±2 dagen) is best-effort — fuzzy-rijen in §5b handmatig verifiëren vóór actie.
- **Fuzzy-budget:** cap 1000, gebruikt 905. **0 mails vielen boven de cap** en kregen locatie "niet gevonden" zonder fuzzy-poging — verhoog `--fuzzy-cap=<n>` voor volledige dekking.
- **Sugar-synthetische message-ids:** Sugar's outbound-mails dragen `<…@…sugaropencloud.eu>` ids die niet in Outlook bestaan; exact-match werkt vooral op de originele inbound. Daardoor leunt de locatie deels op fuzzy.
- **"beantwoord" = conversatie-niveau:** een Sent-reply in dezelfde `conversationId` ná de inbound. Een reply via een NIEUWE thread (zonder reply-relatie) wordt niet als beantwoord herkend en valt in onbeantwoord — mogelijk lichte onderschatting van "beantwoord".
- **Ruis vóór onbeantwoord, ná beantwoord:** een beantwoorde auto-reply telt als beantwoord, niet als ruis (volgorde-keuze).

## 7. Beslis-opties

De onbeantwoorde populatie (554 mails) verdeelt zich over: **Inbox 107** (al zichtbaar), **Sugar Archive 222** (onzichtbaar voor het team), **niet gevonden 222**.

1. **Sugar-Archive-onbeantwoorden terugzetten** naar de Inbox (222 mails) — dit is de feitelijke verborgen werkvoorraad. Aparte move-actie, NA dit rapport.
2. **Inbox-onbeantwoorden** (107) zijn al zichtbaar — geen verplaatsing nodig, hooguit een attentielijst voor het team.
3. **Niets doen / alleen Sugar-status opschonen** — als blijkt dat de "New"-status puur stale is (veel beantwoord/ruis), kan de connector-uitschakeling + een Sugar-bulkclose volstaan.

> **Verplaatsen blijft buiten scope van dit rapport.** Dit levert de feiten; de move/close is een aparte beslissing.
