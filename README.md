# AT Solutions

Lett, statisk nettside med tre sider. Ingen JavaScript, eksterne fonter, sporing eller avhengigheter.

- `public/index.html`: Hjem
- `public/galleri/index.html`: Galleri
- `public/kontakt/index.html`: Kontakt oss
- `public/style.css`: Felles utforming

Lokal forhåndsvisning: `python3 -m http.server 4173 --directory public`

Vercel: Framework Preset **Other**, ingen byggekommando, Output Directory **public**. Oppsettet ligger i `vercel.json`. Endringer som pushes til main publiseres når GitHub-repoet er koblet til Vercel.
