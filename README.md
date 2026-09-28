# AT Solutions

Statisk nettside med tre sider. Ren HTML og CSS, ingen kjøretidsavhengigheter, eksterne fontkall, analyseverktøy eller skjemaer.

- `public/index.html`: Hjem med tjenester og bedriftspresentasjon.
- `public/galleri/index.html`: Galleri, klart for ekte bilder.
- `public/kontakt/index.html`: Kontaktinformasjon.
- `public/style.css`: Felles responsiv utforming.
- `public/fonts/`: Barlow regular/semibold med SIL Open Font License.
- `docs/design-review.md`: Bransjereferanser, designvalg og anbefalt videre innhold.

Lokal forhåndsvisning: `python3 -m http.server 4173 --directory public`

Vercel: Framework Preset **Other**, ingen byggekommando, Output Directory **public**. `vercel.json` overstyrer prosjektets tidligere Next.js-preset. Push til main publiseres automatisk.

Hovedadresse: https://atsolution.no/. Øvrige domener er koblet til prosjektet i Vercel og videresendes med HTTP 308. DNS ligger hos Domeneshop. E-postoppsettet er separat og skal bevares ved senere nettsideendringer.
