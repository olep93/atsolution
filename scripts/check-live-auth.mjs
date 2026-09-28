// Checks first access and recovery with a disposable account; sends no email.
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);
const check = result => { if (result.error) throw result.error; return result.data; };
const email = `gallery-check-${randomUUID()}@example.invalid`;
let id;
try {
  id = check(await service.auth.admin.createUser({ email, email_confirm: false })).user.id;
  const first = check(await service.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: 'https://atsolution.no/admin/?set-password=1' } }));
  check(await client.auth.verifyOtp({ token_hash: first.properties.hashed_token, type: 'magiclink' }));
  const password = randomBytes(32).toString('base64url');
  check(await client.auth.updateUser({ password }));
  check(await client.auth.signOut());
  check(await client.auth.signInWithPassword({ email, password }));
  assert.equal(check(await client.rpc('is_gallery_admin')), false, 'email authentication does not grant admin access');
  check(await client.auth.signOut());
  const recovery = check(await service.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: 'https://atsolution.no/admin/?set-password=1' } }));
  check(await client.auth.verifyOtp({ token_hash: recovery.properties.hashed_token, type: 'recovery' }));
  const newPassword = randomBytes(32).toString('base64url');
  check(await client.auth.updateUser({ password: newPassword }));
  check(await client.auth.signOut());
  assert.ok((await client.auth.signInWithPassword({ email, password })).error, 'old password rejected');
  check(await client.auth.signInWithPassword({ email, password: newPassword }));
  console.log('PASS: first password, verified recovery, new password, old password rejection and admin isolation. No email sent.');
} finally {
  if (id) check(await service.auth.admin.deleteUser(id));
  console.log('Disposable auth test account removed.');
}
