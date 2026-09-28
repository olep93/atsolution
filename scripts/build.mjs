import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const enabled = process.env.GALLERY_ENABLED === 'true';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
if (enabled) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('A valid SUPABASE_URL is required.');
  let payload = {};
  try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch {}
  if (!key.startsWith('sb_publishable_') && payload.role !== 'anon') throw new Error('Only a publishable or anon key may be sent to the browser.');
  if (process.env.GALLERY_AUTH_READY !== 'true') throw new Error('Complete and verify the auth setup before enabling the gallery.');
}
await mkdir('public/assets', { recursive: true });
await writeFile('public/assets/config.js', `export default ${JSON.stringify({ enabled, url: enabled ? url : '', key: enabled ? key : '' })};\n`);
await build({
  entryPoints: ['src/gallery.js', 'src/admin.js'],
  outdir: 'public/assets', bundle: true, minify: true, format: 'esm', target: ['es2022'],
  external: ['/assets/config.js'], legalComments: 'eof',
});
console.log(`Built gallery and administration. Gallery ${enabled ? 'enabled' : 'awaiting service setup'}.`);
