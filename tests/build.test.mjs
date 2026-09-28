import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('service-role credentials cannot be included in the browser bundle', () => {
  const key = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role:'service_role' })).toString('base64url'), 'test'].join('.');
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { encoding:'utf8', env:{ ...process.env, GALLERY_ENABLED:'true', GALLERY_AUTH_READY:'true', SUPABASE_URL:'https://example.supabase.co', SUPABASE_ANON_KEY:key } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Only a publishable or anon key/);
  assert.ok(!result.stderr.includes(key));
});
