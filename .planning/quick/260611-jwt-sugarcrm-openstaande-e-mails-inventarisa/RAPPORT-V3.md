# RAPPORT-V3 — echte onbeantwoorde klantmail op verkoop@smeba.nl

> PRODUCTION -- SugarCRM (Emails+Cases, read-only) + Microsoft Graph (Sent-Items, read-only)
> Quick task 260611-jwt · gegenereerd 2026-06-11 15:36 · mailbox `verkoop@smeba.nl` · vanaf 2026-05-01

> **Read-only.** Geen writes naar Sugar / Outlook / productie-tabellen — alleen dit rapport + script.

## 1. Context & methode

Dit rapport **vervangt RAPPORT-V2**. V2 had twee fouten die het cijfer onbruikbaar maakten:

1. **Verkeerde populatie.** V2 selecteerde Cases via een team-regex (`smeba|verkoop|kede|berki|fire control`). Sugar is een **gedeelde groep-instance**; die regex liet UK/Apex/Keyways-data binnen en miste tegelijk BX-Verkoop inbound. V3 scopet **strikt op `mailbox_name = "BX Verkoop"`** — live geverifieerd: al die inbound heeft `to_addrs_names = verkoop@smeba.nl`. Alle andere mailboxen worden uitgesloten.
2. **Onbetrouwbaar beantwoord-signaal.** V2 keek alleen of de Outlook-conversatie een Sent-Items-reply had. Maar **Sugar verstuurt antwoorden via een eigen SMTP-account** — die komen NIET in verkoop@ Sent Items. Daardoor telde V2 maar 3/905 als beantwoord.

V3 bepaalt **beantwoord** via OR van twee betrouwbare bronnen (géén subject-fuzzy):

- **(A) Sugar-outbound op de case** — er bestaat een `Emails`-record met dezelfde `parent_id` (case), `type="out"`, en `date_sent` > de inbound `date_sent`. Dekt het mei/Sugar-tijdperk.
- **(B) Outlook Sent op ADRES** — verkoop@ Sent Items bevat een bericht met een `toRecipients`-adres == het afzender-emailadres van de inbound, met `sentDateTime` > inbound `date_sent`. Dekt juni/post-cutover. Match op **e-mailadres** (betrouwbaar), niet op subject.

Het afzender-emailadres komt uit `from_addr_name` (op BX-Verkoop inbound is dat live geverifieerd het echte e-mailadres), met fallback op de `link/from` EmailParticipants-relate.

Een case telt als **open** wanneer zijn status niet in {closed, resolved, duplicate, rejected, cancelled, canceled, autoclosed} valt.

## 2. Trechter

| Stap | Mails | % van inbound | Distinct cases |
| --- | ---: | ---: | ---: |
| inbound verkoop@ (BX Verkoop) | 1237 | 100% | 1037 |
| ↳ in een **open** case | 398 | 32.2% | 386 |
| ↳ **onbeantwoord** (na A+B) | 345 | 27.9% | 337 |
| ↳ **niet-ruis** | 305 | 24.7% | 300 |
| ↳ **extern** = ECHTE klantmail | 169 | 13.7% | 164 |

## 3. Maandsplitsing — echte klantmail

| Maand | echte klantmail | distinct cases |
| --- | ---: | ---: |
| 2026-05 | 50 | 47 |
| 2026-06 | 119 | 118 |
| **totaal** | **169** | **164** |

## 4. Beantwoord-bron (op open cases)

Van de 398 inbound-mails in open cases zijn er **53 beantwoord**, verdeeld over:

| Bron | Mails |
| --- | ---: |
| (A) alleen Sugar-outbound | 5 |
| (B) alleen Outlook-Sent-adres | 48 |
| (A+B) beide | 0 |
| **totaal beantwoord** | **53** |

> Ter contrast: V2's enige signaal (Outlook conversatie-reply) ving slechts 3 mails. De Sugar-outbound-bron (A) is wat het mei-tijdperk redt.

## 5. Echte onbeantwoorde klantmail — concrete lijst (oudste eerst)

Kolom "case-genoot" = ja wanneer dezelfde case nóg een onbeantwoorde klantmail heeft (zelfde werk, meerdere mails).

| Datum | Subject | Afzender (adres) | Case-id | Case-status | case-genoot |
| --- | --- | --- | --- | --- | --- |
| 2026-05-04 | FW: Opdracht tot uitvoering Referentie J.H.van Kuijk/case 722858 offerte SB00774 | bestuur@lindenhove.nl | 0c9a7f46 | New | — |
| 2026-05-04 | FW: Betwisting factuur – keuring brandblusser - factuur: 33050819 | ribo5@hotmail.com | 8cdf7c18 | New | — |
| 2026-05-04 | wanneer offerte Jumbo Amstelveen in PIT? | j.schuttevaar@rbm-retail.com | 4bd077a4 | New | — |
| 2026-05-04 | Van Dal Mannenmode Roden | michaelbrouwer@vdal.nl | 6dc6c532 | New | — |
| 2026-05-05 | Offerteaanvraag RWS CIV | messages@mail.12build.com | cedeec88 | In Progress | — |
| 2026-05-05 | Verlenging afspraken tbv IKEA | kim.vanerven@heydayfm.nl | 1075a410 | New | — |
| 2026-05-06 | FW: Brandblusser | peter.saarloos@hanab.nl | 54c4faac | In Progress | — |
| 2026-05-07 | FW: Werkbon n.a.v. werkzaamheden 1512512 op locatie 528247 - Holland & Barrett F | lindadejong@hollandandbarrett.com | 452009d4 | New | — |
| 2026-05-07 | Re: Offerte SB014378 n.a.v. bezoek monteur op locatie: 451279 - VvE Kantoren Ple | vve@vanderhorstmakelaardij.nl | abcc2b26 | New | — |
| 2026-05-08 | FW: werkbon | s.chadli@coop-voc.eu | 463cc534 | New | — |
| 2026-05-08 | RE: [BULK] Offerte SB013726 n.a.v. bezoek monteur op locatie: 640334 - Albert He | suzan@ahsliedrecht.com | 48f01f88 | New | — |
| 2026-05-08 | FW: Werkbon n.a.v. werkzaamheden 1616974 op locatie 534410 - Holland & Barett fi | propertybenelux@hollandandbarrett.com | ca123264 | New | — |
| 2026-05-08 | FW: Offerte SB014683 n.a.v. bezoek monteur op locatie: 511931 - RCN Het Grote Bo | e.stienstra@rcn.nl | a1b921f8 | New | — |
| 2026-05-11 | keuren brandslangahaspels en blussers Crematorium Oss | j.gesthuizen@megens.tech | eccdcd0c | New | ja |
| 2026-05-11 | FW: Hobrand BV - Inkooporder INK124767 | orders@hobrand.nl | 9dcb3eb6 | New | — |
| 2026-05-11 | S50 Bluswagens | d.zondervan.01@mindef.nl | a3cd2acc | New | — |
| 2026-05-11 | offertes AKD en Deloitte keuringen FY27 | ovanbavel@deloitte.nl | c18abdc6 | New | ja |
| 2026-05-12 | FW: Rapport n.a.v. werkzaamheden 1606686 op locatie 535098 - 202104 Tango Nijker | q8@contrall.nl | f38b3f60 | New | — |
| 2026-05-12 | Re: Herinnering offerte SB014446 n.a.v. bezoek monteur op locatie: 638146 - Lidl | facilitymanagement.waddinxveen@lidl.nl | 9e3118ce | New | — |
| 2026-05-12 | Offerte aanvraag Smeba 2026 | christiaan.knipping@frieslandcampina.com | 8ce90866 | New | — |
| 2026-05-13 | Keuring blusmiddelen | jacqueline.elissen@jumbo.com | 3c636c38 | New | ja |
| 2026-05-13 | Re: Herinnering offerte SF011822 n.a.v. bezoek monteur op locatie: 488197 - SPOR | marie.verleye@sportjoy.be | c31e3ba0 | New | — |
| 2026-05-13 | FW: Offerte SB014980 n.a.v. bezoek monteur op locatie: 525913 - Nutricia Haps | sonja.vandenheuvel@rubix.com | 0e3bd5c4 | New | — |
| 2026-05-13 | TR: We have just received a new Invoice with ID 33050927 from Supplier 089177821 | beatrice.lambot@fedasil.be | 1111387a | New | — |
| 2026-05-13 | Offerteaanvraag THTK onderhoud | messages@mail.12build.com | b20bf4ac | New | — |
| 2026-05-13 | KRISTAL: jaarlijks onderhoud blusmiddelen Kristalweg 107 | info@organiquebv.nl | 180a12d4 | New | — |
| 2026-05-15 | Fwd: RE: Offerte aanvraag PID2026 - Brandblussers Offerte SMEQ 98503 | info@kffn.nl | 0e6e7338 | New | — |
| 2026-05-15 | Offerte | paul@sandmannoptiek.nl | c76c8806 | New | — |
| 2026-05-18 | URGENT - Hobrand BV - Inkooporder INK124767 | astrid.engelse@hobrand.nl | 1a5cc85e | New | — |
| 2026-05-19 | Re: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050937 | eckleyf@gmail.com | 54b52df8 | New | — |
| 2026-05-19 | Kosten opgaven afpersen BSH bij Villa Arena | verwoert@verwoert.nl | c0e4cea0 | New | — |
| 2026-05-19 | brandblusser tankstation | marc.dehouwer@robberechts.be | b98f5f7a | New | — |
| 2026-05-20 | Offerte | nils.poldervaart@cbre.com | 347bfed2 | New | — |
| 2026-05-20 | offertes AKD en Deloitte keuringen FY27 | ovanbavel@deloitte.nl | c18abdc6 | New | ja |
| 2026-05-20 | FW: Werkorder: WRK-260841 | planning@bostersvanwezel.nl | 5b16a73c | New | — |
| 2026-05-20 | Nieuwe case gemaakt voor #[CASE:764361] | j.gesthuizen@megens.tech | eccdcd0c | New | ja |
| 2026-05-21 | FW: prijsaanvraag onderhoudscontract brandhaspels 4 jaar - Fedasil Kapellen | peggy.moons@fedasil.be | 4d67efb8 | New | — |
| 2026-05-21 | Spuitstuk brandhaspel diameter 6mm | alba@bovenbouw.be | 78cc770e | New | — |
| 2026-05-21 | Sollicitation d’une entrevue en présentiel pour concertation opérationnelle - Lo | pierre.nyebel@fedasil.be | 59d4817a | New | — |
| 2026-05-26 | Offerte O2026-7966-001 Reparatie DBL Vve Emily Brontësingel 77 t/m 251, Arnhem | info@noordam.info | a3802674 | New | — |
| 2026-05-26 | Concept Serviceovereenkomst Smeba per 01-06-2026 Gilead | clemens.vanwelt@cbre.com | c4ad3bc6 | New | — |
| 2026-05-27 | RE: Sollicitation d’une entrevue en présentiel pour concertation opérationnelle  | pierre.nyebel@fedasil.be | 45857f72 | New | — |
| 2026-05-28 | Stadshouderskade 55 te Amsterdam | johan.remkes@stb.eu | b4c07cbc | Pending Customer Action Required | — |
| 2026-05-28 | Opzegging De Run 4210 | jerney@bestronics.nl | f9ea93bc | New | — |
| 2026-05-28 | RE: Vraag over offerte P3 blusmiddelen na preventief onderhoud | ldijk4@heijmans.nl | 002f3c64 | New | — |
| 2026-05-28 | Nieuwe case gemaakt voor #[CASE:765871] | efc.facilitair@jumbo.com | 3c636c38 | New | ja |
| 2026-05-28 | Verzoek offerte onderhoudscontraact 2026 - 207 Nike-Hilversum | alger.vanmourik@nike.com | be58bd14 | New | — |
| 2026-05-28 | Beëindigen contract | farahm1985@live.nl | ec8eb2d4 | New | — |
| 2026-05-28 | Herstelling blustoestel Zwembad Arendonk | bert.van.loon@arendonk.be | cb9f0886 | New | — |
| 2026-05-29 | beëindiging huurovereenkomst VTP6 / Seacon | gpeeters@seaconlogistics.com | cc1099cc | New | — |
| 2026-06-01 | Afspraak voorstel WO 1590158 | ilaisa.beverley@fedasil.be | fe8e786a | New | — |
| 2026-06-01 | Keuring brandblusser Grensstraat 10 te 's-Heerenberg | administratie@r2construct.nl | 09ab91f6 | New | — |
| 2026-06-01 | Restpunten 22 mei | bderlagen@merem.nl | 065f68ec | New | — |
| 2026-06-01 | 5610 Bleiswijk blusmiddelen | mdgraaf@heijmans.nl | e1079bb2 | New | — |
| 2026-06-01 | aanmelding Ommen / Dalfsen HEMA | gr.doornewaard@vab-hema.nl | fb803036 | New | — |
| 2026-06-01 | uitvoering onderhoud en controle sportclub Eefde | voorzitter@sp-eefde.nl | 88f770a6 | New | — |
| 2026-06-01 | HEMA Apeldoorn, Hoofdstraat 50A - Notulen 2e Bouwvergadering | stef@ddpm.nl | d125f758 | New | — |
| 2026-06-02 | Brandblussers | inforicisgarage@gmail.com | 615ee6ee | New | — |
| 2026-06-02 | RE: Brandblusser voor in de bus. | d.tepper@gasunie.nl | 25d12814 | New | — |
| 2026-06-02 | FW: Factuur 173399902, Werkorder 1598808 | j.vandijck@destil.nl | d82fb588 | New | — |
| 2026-06-02 | Inkooporder - IOEB0321157 ∙ Smeba Brandbeveiliging B.V. | nrandshuizen@kuijpers.com | 3d8dbf12 | New | — |
| 2026-06-02 | RE: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 17342508 | jaap.tiemens@miniso.nl | acef7b0a | New | — |
| 2026-06-02 | FW: Offerte Castelijns Swaans ref SB015803 | j.borgmans@castelijns-swaans.nl | 930905de | New | — |
| 2026-06-02 | Jaarlijkse keuring/onderhoud + extra opdracht | robin@fulfilment.nl | 62b5869e | New | — |
| 2026-06-03 | offertes AKD en Deloitte keuringen FY27 | ovanbavel@deloitte.nl | c18abdc6 | New | ja |
| 2026-06-03 | FW: 3114 CC: Offerte SB016036 n.a.v. bezoek monteur op locatie: 433258 - VvE Com | r.evers@aevego.nl | 7264dff6 | New | — |
| 2026-06-03 | RE: Herinnering offerte SB013635 n.a.v. bezoek monteur op locatie: 633919 - KINO | francisco.snelder@kinop.nl | 50cafe56 | New | — |
| 2026-06-03 | vragen werkorder 1469437 | maaikedevries@kleine-ikke.nl | 61832330 | New | — |
| 2026-06-03 | RE: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: 33050459 | rik@dvfoods.be | 67242684 | New | — |
| 2026-06-03 | Re: Herinnering offerte SB015809 n.a.v. bezoek monteur op locatie: 300944 - Vos  | info@vosmakelaars.nl | 8d10bb00 | New | — |
| 2026-06-03 | FW: Herinnering offerte SB015259 n.a.v. bezoek monteur op locatie: 300876 - Geel | jtheunissen@geelen-beton.nl | 68f50b6a | New | — |
| 2026-06-03 | Assetslijst Philips | arjen.heerkes@spie.com | bb739304 | New | — |
| 2026-06-03 | Controle 2026 | firedepartment@tue.nl | 1783bd38 | New | — |
| 2026-06-03 | Re: Herinnering offerte SB015946 n.a.v. bezoek monteur op locatie: 531541 - Enex | servicedeskenexis@nl.issworld.com | 642541f6 | New | — |
| 2026-06-03 | FW: Herinnering offerte SB014622 n.a.v. bezoek monteur op locatie: 525607 - WYME | epeters@wymefa.nl | 68595316 | New | — |
| 2026-06-03 | FW: Herinnering offerte SB015450 n.a.v. bezoek monteur op locatie: 527269 - Pand | beheer@nrw-wonen.nl | 50226dca | New | — |
| 2026-06-03 | HEMA Apeldoorn, Hoofdstraat 50A - Notulen 3e Bouwvergadering | stef@ddpm.nl | 81076896 | New | — |
| 2026-06-04 | FW: Herinnering offerte SB015883 n.a.v. bezoek monteur op locatie: 627777 - Sanq | a.vandeutekom@sanquin.nl | fd5c6a70 | New | — |
| 2026-06-04 | graag offerte voor leveren 1 x draagbaar blustoestel | rob.eeftens@equans.com | 632e3ace | New | — |
| 2026-06-04 | Wijzigingen Techno Deelnemers 4-6-2026 | linna@technobenelux.nl | 15a52fb4 | New | — |
| 2026-06-04 | FW: Offerte SB016085 n.a.v. bezoek monteur op locatie: 639906 - Annie M.G. Schmi | a.slob@dehaagsescholen.nl | b9bf07e6 | New | — |
| 2026-06-04 | Fwd: Re: Offerte SB014378 n.a.v. bezoek monteur op locatie: 451279 - VvE Kantore | roosmarijn@vanderhorstmakelaardij.nl | fe1cad56 | New | — |
| 2026-06-04 | Fwd: Re: Offerte SB014465 n.a.v. bezoek monteur op locatie: 451275 - SUE \| Clou | roosmarijn@vanderhorstmakelaardij.nl | 016147e2 | New | — |
| 2026-06-04 | Fwd: Re: Offerte SB014469 n.a.v. bezoek monteur op locatie: 451268 - SUE \| Clou | roosmarijn@vanderhorstmakelaardij.nl | 04705a90 | New | — |
| 2026-06-04 | RE: Herinnering offerte SB014128 n.a.v. bezoek monteur op locatie: 476963 - Rubi | harderwijk@rubix.com | a468675e | New | — |
| 2026-06-04 | I-2026-06-0090 verbandtrommels/pleisterdispensors | r.heijligers@ggdbzo.nl | 87046818 | New | ja |
| 2026-06-04 | Handbrandblussers en fire blanket keuring | aaron.chundro@cbre.com | df01d0d0 | New | — |
| 2026-06-04 | RE: Herinnering offerte SB014505 n.a.v. bezoek monteur op locatie: 458091 - RVB  | rvrossum@unica.nl | d8e2575c | New | — |
| 2026-06-04 | Statusupdate Onderhoud blusmiddelen KWG Maarsbergseweg 17/17A Woudenberg Melding | facilitairezaken@nidos.nl | 69c9c58a | New | — |
| 2026-06-04 | Info | geert.van.beek@enexis.nl | e47af860 | New | — |
| 2026-06-04 | Aanvraag offerte | margret.bel@dichtbijkinderopvang.nl | fac1ed06 | New | — |
| 2026-06-04 | Re: Offerte SB016626 n.a.v. bezoek monteur op locatie: 329727 - Gerard Peters Be | gpetersbeheer@gmail.com | fb04a7dc | New | — |
| 2026-06-04 | RE: Herinnering offerte SB015542 n.a.v. bezoek monteur op locatie: 423038 - Mari | factuur@marifrunt.nl | 23d4013a | New | — |
| 2026-06-04 | RE: Herinnering offerte SB016085 n.a.v. bezoek monteur op locatie: 639906 - Anni | fs@dehaagsescholen.nl | 26f41cba | New | — |
| 2026-06-04 | Beeindigen onderhoudscontract | pieter@piet-wijchen.nl | 9f12787c | New | — |
| 2026-06-04 | RE: HERINNERING OPENSTAAND ADVIES INZAKE (BRAND) VEILIGHEID - SMEQ83351 | treijman@gps-perimeter.nl | fba22fe8 | New | — |
| 2026-06-04 | RE: Herinnering offerte SB016083 n.a.v. bezoek monteur op locatie: 528594 - Dirk | helpdeskbouwbureau@dirk.nl | d7f338dc | New | — |
| 2026-06-05 | 2x getekende offerte Inproba | rkersten@inproba.nl | 5322ea32 | New | — |
| 2026-06-05 | Nieuwe werkvoorbereider UvA-UK & KNAW | blanoi@heijmans.nl | 2bd92456 | New | — |
| 2026-06-05 | Onderhoud blusmiddelen 2026 | fs@dehaagsescholen.nl | 117cae5e | New | — |
| 2026-06-05 | the store tracker in PDF, week 23, 05-06-2026 | peterteunissen@hollandandbarrett.com | 88527928 | New | — |
| 2026-06-05 | Actie en besluiten evaluatiegesprek 19-5-2026 | eprincen@heijmans.nl | 9cfe3e58 | New | — |
| 2026-06-05 | Re: Aanvraag opdrachtnummer - Pro forma - 1489433 | run1000@heijmans.nl | fa0d752e | New | — |
| 2026-06-05 | Onderhoudsofferte WUR – Perceel West (SPIE) | andre.vanzwam@spie.com | 89dc952a | New | — |
| 2026-06-06 | Opzeggen overeenkomst | mandy@man-company.nl | 6cd34890 | New | — |
| 2026-06-07 | RE: Herinnering offerte SB015196 n.a.v. bezoek monteur op locatie: 432085 - Spor | info@akkyfit.nl | fc879eae | New | — |
| 2026-06-08 | RE: Offerte SB016380 n.a.v. bezoek monteur op locatie: 418216 - (14B46) MVK (Mar | gd.vd.meijden@mindef.nl | 72c2bff6 | New | — |
| 2026-06-08 | Tweede locatie Maasoever | td@maasoever.com | 53bb1dda | New | — |
| 2026-06-08 | RE: Herinnering offerte SB016192 n.a.v. bezoek monteur op locatie: 432684 - Inve | administratie@indeneng.nl | aeb95852 | New | — |
| 2026-06-08 | FW: Vervanging materialen BHV-doos – locatie Nijmegen | facilitair@onited.com | 1f61f20c | New | — |
| 2026-06-08 | FW: Brandblusser voor in de bus. | d.tepper@gasunie.nl | a3ba82f2 | New | — |
| 2026-06-08 | RE: Offerte SB016732 n.a.v. bezoek monteur op locatie: 529854 - IPO | sales@crisicom.nl | b372fa36 | New | — |
| 2026-06-08 | RE: Herinnering offerte SF013909 n.a.v. bezoek monteur op locatie: 509400 - FOD  | log.ant.hasselt@minfin.fed.be | 07d92966 | New | — |
| 2026-06-08 | OFF-00197 akk offerte herstel gebreken droge blusleidingen - Zutphenseweg 31 te  | wilbert@remans.nl | 0d038dbe | New | — |
| 2026-06-08 | FW: [EXT] Rapport n.a.v. werkzaamheden 1522963 op locatie 634023 - PartsPoint Ni | ifacility@allianceautomotive.nl | 10572818 | New | — |
| 2026-06-08 | Re: Herinnering offerte SB014299 n.a.v. bezoek monteur op locatie: 510829 - Krin | menno@delokatie.org | 19cbc382 | New | — |
| 2026-06-08 | RE: Handbrandblussers en fire blanket keuring | aaron.chundro@cbre.com | 2b39778e | New | — |
| 2026-06-08 | FW: [EXT] Rapport n.a.v. werkzaamheden 1517092 op locatie 634014 - PartsPoint Zo | ifacility@allianceautomotive.nl | 91987380 | New | — |
| 2026-06-08 | FW: Werkorder: WRK-260841 | planning@bostersvanwezel.nl | 060fc38e | New | — |
| 2026-06-08 | FW: [EXT] Rapport n.a.v. werkzaamheden 1517472 op locatie 634025 - PartsPoint Vi | ifacility@allianceautomotive.nl | cab2d7ac | New | — |
| 2026-06-08 | Factuur controle brandblusser JB Schreuder-Schiermonnikoog | jan_schreuder@live.nl | d5b166be | New | — |
| 2026-06-08 | FW: Herinnering offerte SF014340 n.a.v. bezoek monteur op locatie: 492472 - Poli | mia.vanderstappen@grimbergen.be | 8ba15e6e | New | — |
| 2026-06-08 | Informatie met betrekking tot contract, facturen, onderhoud, etc. (ASNBank) | mirte.vanzeventer@asnbank.nl | 20bfbb62 | New | — |
| 2026-06-08 | Order t.b.v. Lidl 1914 fil. Den Bosch Het Wielsem | tim@snijders-best.nl | 488f79a4 | New | — |
| 2026-06-08 | FW: Offerte aanvraag 12 stuk Brandblusser ecoschuim 6ltr | carmaine.choy@lasaulec.nl | fcf05f5c | New | — |
| 2026-06-08 | RE: Herinnering offerte SB016260 n.a.v. bezoek monteur op locatie: 524265 - Timi | s.terhove@timing.nl | 4d8f339c | New | — |
| 2026-06-08 | FW: Herinnering offerte SF016231 n.a.v. bezoek monteur op locatie: 637794 - 688  | christophe.severeyns@multipharma.be | ef54b682 | New | — |
| 2026-06-08 | RE: Offerte SB016880 n.a.v. bezoek monteur op locatie: 647066 - OV Overspaarne | cees.blaak@kennemerhart.nl | c5544c06 | New | — |
| 2026-06-08 | Blusstof over datum | carmen.melchels@delibarn.com | 4d920486 | New | — |
| 2026-06-08 | Re: 592207 - VERZOEK TOT BETALING | ribo5@hotmail.com | f2d7f506 | New | — |
| 2026-06-09 | RE: Offerte SB016878 n.a.v. bezoek monteur op locatie: 527736 - Asito B.V. | facilitair@asito.nl | 62a4ce80 | New | — |
| 2026-06-09 | SMEBA---Breda,Maastricht,Den Haag | joao.gomes4@cbre.com | 88dc813e | New | — |
| 2026-06-09 | RE: PM, BENEHEART SERIES AED, LEI-310-055-AED, PREVENTIVE MAINTENANCE, 1Y  Julli | arjan.ruimschoot@apleona.com | 0eec9cce | New | — |
| 2026-06-09 | RE: Herinnering offerte SB016256 n.a.v. bezoek monteur op locatie: 308132 - Woni | info@wivn.nl | 7afbfa44 | New | — |
| 2026-06-09 | Fwd: Herinnering offerte SB014811 n.a.v. bezoek monteur op locatie: 527268 - Pan | frank@totaalvve.nl | 4752642e | New | — |
| 2026-06-09 | FW: Kosten opgaven afpersen BSH bij Villa Arena | villaarena@verwoert.nl | 228f7246 | New | — |
| 2026-06-09 | Re: Herinnering offerte SB014178 n.a.v. bezoek monteur op locatie: 501968 - Jumb | rolf.hoogkamer@jumbo.com | 25ed1b46 | New | — |
| 2026-06-09 | Aanvraag Werktuigbouwkundig en elektrotechnisch onderhoud Het Loo Blusmiddelen | joost@unica.nl | 2af07d22 | New | — |
| 2026-06-09 | FW: Offerte SF016933 n.a.v. bezoek monteur op locatie: 556127 - 633 Popelin Mole | christophe.severeyns@multipharma.be | 8080ad54 | New | — |
| 2026-06-09 | RE: [External] Herinnering offerte SB016334 n.a.v. bezoek monteur op locatie: 52 | pwn.nl@equans.com | 811e708c | New | — |
| 2026-06-09 | RE: [External] Herinnering offerte SB016335 n.a.v. bezoek monteur op locatie: 52 | pwn.nl@equans.com | 7e49ca50 | New | — |
| 2026-06-09 | RE: Offerte SB016936 n.a.v. bezoek monteur op locatie: 533808 - Pand Telderstraa | service@crmd.nu | f53f7a74 | New | — |
| 2026-06-09 | Nieuwe opdracht M-12609 - Meester B.M. Teldersstraat 3, ARNHEM (Ravelijn) | service@crmd.nu | f7ee26bc | New | — |
| 2026-06-09 | Onderhoud branblusapparaat. | ehdeboer@outlook.com | 88a5eab8 | New | — |
| 2026-06-09 | Nieuwe case gemaakt voor #[CASE:781124] | r.heijligers@ggdbzo.nl | 87046818 | New | ja |
| 2026-06-09 | 1 brandhaspel verzegelen | carmen.melchels@delibarn.com | 71f39812 | New | — |
| 2026-06-10 | FW: 2x getekende offerte Inproba | rkersten@inproba.nl | d82dcf22 | New | — |
| 2026-06-10 | RE: [External] Herinnering offerte SB015837 n.a.v. bezoek monteur op locatie: 52 | pwn.nl@equans.com | 86c3652a | New | — |
| 2026-06-10 | RE: Offerte SB016983 n.a.v. bezoek monteur op locatie: 537790 - Lampidee 8 | maarten.roobol@lampidee.nl | e452824e | New | — |
| 2026-06-10 | Fwd: Offerte SB016755 n.a.v. bezoek monteur op locatie: 646905 - Pronto Wonen Ut | winkelbeheer@roobol.com | b75f6b56 | New | — |
| 2026-06-10 | FW: Brandveiligheid woongebouwen | vve@vbtgroep.nl | acaf58b2 | New | — |
| 2026-06-10 | Keuring brandslanghaspels en blusmiddelen | aart.wiersema@conexus.nu | 2d92959c | New | — |
| 2026-06-10 | facturen VvE Lindenhove | bestuur@lindenhove.nl | 37cfeda4 | New | — |
| 2026-06-10 | Re: Offerte n.a.v. onderhoud | bas.dejong@zgapeldoorn.nl | e1d6728a | New | — |
| 2026-06-10 | RE: [External] Herinnering offerte SB015374 n.a.v. bezoek monteur op locatie: 52 | pwn.nl@equans.com | ab70f650 | New | — |
| 2026-06-10 | RE: [EXT] Herinnering offerte SB015273 n.a.v. bezoek monteur op locatie: 465613  | paul.vanderhelm@twobirds.com | 69cff186 | New | — |
| 2026-06-10 | RE: [External] Herinnering offerte SB015861 n.a.v. bezoek monteur op locatie: 52 | pwn.nl@equans.com | eeb0034a | New | — |
| 2026-06-10 | Offerte aanvraag | oazareaassistenten@gasunie.nl | 24885bc0 | New | — |
| 2026-06-10 | RE: Herinnering offerte SB016437 n.a.v. bezoek monteur op locatie: 521112 - Meyr | pkluytmans@meyra.nl | 8e3e0a92 | New | — |
| 2026-06-10 | FW: Herinnering offerte SF014649 n.a.v. bezoek monteur op locatie: 637784 - 670  | christophe.severeyns@multipharma.be | 015641b0 | New | — |
| 2026-06-10 | Re: Offerte SB015825 n.a.v. bezoek monteur op locatie: 511928 - RCN Toppershoedj | m.vannetten@rcn.nl | 0332ffdc | New | — |
| 2026-06-10 | Vraag adhv werkzaamheden. | ifacility@allianceautomotive.nl | f55f77a0 | New | — |
| 2026-06-10 |  | info@sandmannoptiek.nl | e16c4b4a | New | — |
| 2026-06-10 | RE: Herinnering offerte SB015898 n.a.v. bezoek monteur op locatie: 433940 - Dian | a.cuijten@acdiana.nl | 00e0cc5e | New | — |
| 2026-06-10 | RE: Offerte SF016415 n.a.v. bezoek monteur op locatie: 433867 - Multi continenta | lien.riepen@mcgroup.be | 6c62e0ba | New | — |
| 2026-06-10 | Prijsopgaaf | marco.scholten@buildingservices.nl | d85fe10e | New | — |
| 2026-06-10 | NLD_WeWork Amsterdam_Fire extinguisher Maintenance | sheila.broersen@cbre.com | 2f13a836 | New | — |
| 2026-06-10 | RE: Offerte SB017078 n.a.v. bezoek monteur op locatie: 516593 - AZ-Import B.V. | rene@az-import.nl | 3159730a | New | — |
| 2026-06-10 | Re: Herinnering offerte SB015436 n.a.v. bezoek monteur op locatie: 425761 - 430  | wil.campschroer@plus.nl | 4d0c3a52 | New | — |

## 6. Outlook-locatie

**Bewust weggelaten.** Een betrouwbare Inbox/Archive-locatie vereist een exacte koppeling op `internet_message_id` via onze eigen pipeline. Sugar's `message_id` is een opaque 32-hex hash (géén RFC Message-ID) en is niet reproduceerbaar naar Outlook. De enige resterende route is subject-fuzzy `$search` — die gaf in V2 valse zekerheid (222× "niet gevonden", veel mismatch). Liever géén kolom dan een onbetrouwbare. Wie de fysieke locatie wil: koppel via de pipeline `internet_message_id` (aparte vervolgstap), niet via subject.

## 7. Kanttekeningen & beslis-opties

**Kanttekeningen**

- **Beantwoord (B) = adres-niveau, nieuwste Sent.** We matchen op het afzender-adres met de nieuwste `sentDateTime` ná de inbound. Bij een afzender met meerdere losse threads kan dit een antwoord op een ándere mail van dezelfde persoon als "beantwoord" tellen — lichte overschatting van beantwoord op high-volume-afzenders. Bewuste keuze: adres is betrouwbaarder dan subject.
- **Beantwoord (A) = case-niveau.** Elke Sugar-outbound op de case ná de inbound telt als antwoord, ook als het een ándere mail in dezelfde case beantwoordt. Voor "is er nog werk?" is case-niveau het juiste aggregatieniveau.
- **Case-status snapshot.** Statussen zijn op rapportagemoment opgehaald; een case die ná de inbound gesloten is, telt nu correct als niet-open.
- **Intern vs. ruis.** Interne afzenders (smeba.nl, smeba-fire.be, moyneroberts.com, berki.nl, `kede*`) zijn apart uitgesloten van "echte klantmail" maar zijn géén ruis — het kan reëel intern werk zijn.

**Beslis-opties**

1. **Attentielijst** — lever §5 (echte onbeantwoorde klantmail, oudste eerst) als werkvoorraad aan verkoop. Dit is de feitelijke backlog.
2. **Sugar-Archive terugzetten** — als blijkt dat een deel in Sugar weggearchiveerd is en daardoor onzichtbaar, een gerichte (aparte, niet-read-only) move-actie ná akkoord.
3. **Sugar-status opschonen** — de beantwoorde-maar-"New" cases (bron A/B) zijn stale; een Sugar-bulkclose op die set ruimt de telling op zonder klantimpact.

> Elke schrijf-actie blijft buiten scope van dit rapport — dit levert de feiten.
