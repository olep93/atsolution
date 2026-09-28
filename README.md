# AT Solutions

Nettside med tre offentlige hovedsider. Hjem og kontakt er ren HTML og CSS. Galleriet bruker Supabase for publiserte jobber; en separat administrasjon håndterer innlogging og redigering. Ingen eksterne fontkall, analyseverktøy eller ikonbibliotek.

- `public/index.html`: Hjem med tjenester og bedriftspresentasjon.
- `public/galleri/index.html`: Galleri med en diskret innloggingslenke nederst.
- `public/galleri/jobb/index.html`: En publisert jobb med tekst, bilder og bildetekster.
- `public/admin/index.html`: Administrasjon, utelatt fra søkemotorindeksering.
- `public/kontakt/index.html`: Kontaktinformasjon.
- `public/style.css`: Felles responsiv utforming.
- `public/fonts/`: Barlow regular/semibold med SIL Open Font License.
- `docs/design-review.md`: Bransjereferanser, designvalg og anbefalt videre innhold.
- `docs/gallery-setup.md`: Drift, e-post, sikkerhet og tjenesteoppsett.
- `supabase/migrations/001_job_gallery.sql`: Datamodell og tilgangskontroll.
- `src/`: JavaScript som bygges til `public/assets/`.

Installer med `pnpm install --frozen-lockfile`, kjør `pnpm test` og `pnpm build`.
Lokal forhåndsvisning: `python3 -m http.server 4173 --directory public`.
En separat lokal funksjonstest finnes i `tests/preview-server.mjs`; den har bare testdata og sendes ikke til Vercel.

Vercel: Framework Preset **Other**, byggekommando `pnpm build`, Output Directory **public**. `vercel.json` overstyrer prosjektets tidligere Next.js-preset. Push til main publiseres automatisk. Produksjonsinnloggingen er aktiv og sender norske førstegangs- og gjenopprettingslenker gjennom en separat Resend-konto og det verifiserte avsenderdomenet `auth.atsolution.no`.

Hovedadresse: https://atsolution.no/. Øvrige domener er koblet til prosjektet i Vercel og videresendes med HTTP 308. DNS ligger hos Domeneshop. E-postoppsettet er separat og skal bevares ved senere nettsideendringer.
