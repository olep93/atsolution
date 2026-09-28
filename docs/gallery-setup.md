# Jobbarkivet

## Funksjon

Sindre bruker «Logg inn» nederst på galleriets hovedside. Innloggingen er diskret, men sikkerheten bygger på verifisert innlogging og en administratortillatelse i databasen, ikke på at adressen er ukjent.

- Første gang: få lenke på registrert e-post og velg eget passord.
- Glemt passord: ny verifisert e-postlenke, deretter nytt passord.
- Ny jobb: tittel, valgfri tekst og dato, flere bilder med bildetekster.
- Lagre som privat kladd eller publiser. Den første bildefilen er forsidebildet.
- Åpne eldre jobber for å endre tekst, omorganisere bilder eller legge til nye.
- Arkivering skjuler jobben; gjenoppretting lager en kladd.
- SMS er ikke aktivert eller nødvendig. Brukeren valgte e-postgjenoppretting.

## Opprettede tjenester

- Vercel-prosjekt: `atsolution` i team `ole93`.
- Supabase: `atsolution-gallery`, prosjekt `ksvyiryhuebhixdhgafo`, gratisplan, Stockholm.
- SQL-migrasjonen er kjørt i dette prosjektet. Andre databaseprosjekter er ikke brukt.
- Sindres e-postkonto er opprettet uten at noe passord er valgt for ham. Kontoens UUID er eneste permanente rad i `private.gallery_admins`.
- Åpen brukerregistrering, anonyme brukere og telefoninnlogging er deaktivert.
- Site URL: `https://atsolution.no/admin/`.
- Godkjent redirect: `https://atsolution.no/admin/?set-password=1`.

## E-post og aktivering

Det er opprettet en egen e-postbruker hos Domeneshop. Den er adskilt fra de vanlige postkassene og påvirker ikke `post@atsolution.no` eller `sindre@atsolution.no`.

- Avsender: `auth@atsolution.no`, navn `AT Solutions`.
- SMTP-innloggingen mot `smtp.domeneshop.no` er kontrollert lokalt og virker, men Domeneshop avviser utsendelser fra Supabases AWS-adresser med `ACR04`. Denne postkassen kan derfor ikke brukes direkte som Supabase-relé.
- Norske maler er satt for førstegangsinnlogging og passordgjenoppretting. Begge bruker Supabases engangslenke.
- Serveren og klienten krever minst 12 tegn i passordet.
- Resend ble ikke tatt i bruk. Eksisterende Resend-domener, nøkler, webhooks og prosjekter ble ikke endret.
- Forhåndsvisningen er aktivert for testing. Produksjonsvariablene er satt tilbake til `false`, slik at innloggingen viser en rolig «snart klar»-tilstand fremfor en feil, fram til et kompatibelt transaksjonelt SMTP-relé er koblet til.

## Miljøvariabler

`SUPABASE_URL` og `SUPABASE_ANON_KEY` (alternativt `SUPABASE_PUBLISHABLE_KEY`) inngår i offentlig klientkonfigurasjon. Dette er tilsiktede offentlige nøkler; RLS beskytter dataene. Byggeskriptet avviser service-role-nøkler som klientnøkkel.

`SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL` og øvrige databasepassord brukes bare i operatørverktøy. De blir aldri skrevet til `public/`. `.env*`, `.vercel` og `public/assets` er ignorert av Git. Vercel-integrasjonen har levert tjenestens miljøvariabler til riktig prosjekt.

## Tilgang og bilder

Tilgang avgjøres av brukerens uforanderlige UUID i `private.gallery_admins`, ikke av e-postadressen i nettleseren eller redigerbare brukerdata. Jobber lagres atomisk gjennom RPC-er; en versjonskonflikt gir `PT409`. Ikke bruk `40001` for slike konflikter: PostgREST kan da forsøke samme transaksjon på nytt uten å stoppe.

Storage-bøtten er privat. Uinnloggede kan kun lese bilder knyttet til en publisert og ikke-arkivert jobb. De kan ikke laste opp eller generere signerte lenker. Supabases gateway bruker både `object.get_authenticated` og `object.get_authenticated_info` ved nedlasting; begge er eksplisitt tillatt for publiserte bilder. Offentlige bildekall bruker cacheNonce slik at ny visning sjekker aktuell tilgang. Tidligere nedlastede kopier kan ikke tilbakekalles.

Originaler begrenses til 20 MB, dimensjoner leses før dekoding, og bildene omkodes til JPEG på maksimalt 2200 piksler. Ompakking fjerner opprinnelig EXIF, blant annet GPS. Inntil 40 bilder per jobb. HEIC støttes ikke direkte; eksporter til JPG først. Arkivering og fjerning fra en jobb sletter ikke filen permanent, så ubrukt lagring bør gjennomgås ved behov.

## Kontroll

`pnpm test` kjører PostgreSQL-baserte RLS/RPC-tester via PGlite og tester bilde-/feltvalidering.

Med riktig, dedikert `.env.local`:

```sh
node --env-file=.env.local scripts/check-live-gallery.mjs
node --env-file=.env.local scripts/check-live-auth.mjs
```

Disse testene oppretter engangskontoer og testjobber i AT Solutions-prosjektet, og fjerner sine egne data i `finally`. Ingen e-post sendes. Kontroller eventuell opprydding hvis prosessen avbrytes uten at `finally` kjøres. Det er ikke tilstrekkelig å bestå disse testene for å bekrefte faktisk e-postlevering.

Lokal UI-fixture: bygg først, kjør `node tests/preview-server.mjs`, åpne `http://127.0.0.1:4174/admin/`. Bruker og passord er fiktive; den gule testmarkeringen gjør det tydelig at dette ikke er produksjon.

## Driftsbegrensninger

Gratisplanenes kvoter og eventuell pausing må følges opp når arkivet får trafikk. Avtal sikkerhetskopiering av databasen og bildefilene før løsningen blir virksomhetens eneste arkiv. Ikke lagre kundens eneste originalbilder her.
