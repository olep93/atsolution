// Disposable integration test against the dedicated Supabase project.
// Creates only its own test account/job, and removes both in finally.
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;
if (!url || !key || !process.env.POSTGRES_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing dedicated gallery environment.');
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const client = createClient(url, key, { auth: { persistSession: false } });
const anon = createClient(url, key, { auth: { persistSession: false } });
const sql = postgres(process.env.POSTGRES_URL, { max: 1, ssl: 'require', connect_timeout: 15 });
const id = randomUUID(), photoId = randomUUID(), path = `${id}/${photoId}.jpg`;
let userId;
const check = result => { if (result.error) throw result.error; return result.data; };
const publicImage = () => fetch(url + '/storage/v1/object/authenticated/job-images/' + path + '?cacheNonce=' + randomUUID(), {
  headers: { apikey: key, Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store',
});
try {
  const email = `gallery-check-${randomUUID()}@example.invalid`;
  const password = randomBytes(32).toString('base64url');
  userId = check(await service.auth.admin.createUser({ email, password, email_confirm: true })).user.id;
  check(await client.auth.signInWithPassword({ email, password }));
  assert.equal(check(await client.rpc('is_gallery_admin')), false);
  const job = { p_id: id, p_expected_version: 0, p_title: 'Midlertidig funksjonstest', p_body: 'Testdata som fjernes automatisk.', p_job_date: null, p_status: 'draft', p_photos: [] };
  assert.ok((await client.rpc('save_job', job)).error, 'unlisted users cannot create jobs');
  await sql`insert into private.gallery_admins(user_id) values (${userId})`;
  assert.equal(check(await client.rpc('is_gallery_admin')), true);
  const draft = check(await client.rpc('save_job', job).single());
  assert.equal(draft.version, 1);
  const file = await readFile('public/logo.jpg');
  assert.ok((await anon.storage.from('job-images').upload(path, file, { contentType: 'image/jpeg', cacheControl: '0' })).error, 'public upload rejected');
  check(await client.storage.from('job-images').upload(path, file, { contentType: 'image/jpeg', cacheControl: '0' }));
  assert.equal(check(await anon.from('jobs').select('id').eq('id', id)).length, 0);
  assert.equal((await publicImage()).ok, false, 'draft photo private');
  job.p_expected_version = 1; job.p_status = 'published'; job.p_photos = [{ id: photoId, path, caption: 'Testbilde', width: 409, height: 104 }];
  console.log('Draft creation, private upload and draft protection passed.');
  const published = check(await client.rpc('save_job', job).single());
  assert.equal(published.version, 2);
  assert.equal(check(await anon.from('jobs').select('id').eq('id', id)).length, 1);
  console.log('Published metadata visible; checking image read.');
  const response = await publicImage(); assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, file.length);
  assert.ok((await anon.storage.from('job-images').createSignedUrl(path, 86400)).error, 'public cannot mint signed URLs');
  assert.ok((await client.rpc('save_job', job)).error, 'stale version rejected');
  console.log('Published download and signing restriction passed.');
  const signed = check(await client.storage.from('job-images').createSignedUrls([path], 60));
  assert.ok(signed[0].signedUrl, 'admin thumbnails supported');
  check(await client.rpc('archive_job', { p_id: id, p_expected_version: 2, p_archived: true }));
  assert.equal(check(await anon.from('jobs').select('id').eq('id', id)).length, 0);
  assert.equal((await publicImage()).ok, false, 'archived photo private');
  console.log('PASS: live authorization, upload, draft, publish, image download, signing restriction, version conflict and archive.');
} finally {
  await service.storage.from('job-images').remove([path]);
  await sql`delete from public.jobs where id = ${id}`;
  if (userId) check(await service.auth.admin.deleteUser(userId));
  await sql.end();
  console.log('Disposable test account, image and job removed.');
}
