import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JOB = '11111111-1111-4111-8111-111111111111';
const PHOTO = '22222222-2222-4222-8222-222222222222';
const path = `${JOB}/${PHOTO}.jpg`;
const photos = [{ id: PHOTO, path, caption: '<script>not HTML</script>', width: 1200, height: 800 }];
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function storage.allow_only_operation(text) returns boolean language sql stable as $$ select current_setting('storage.operation', true) = $1 $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id bigint generated always as identity, bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage, public to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    grant usage on sequence storage.objects_id_seq to anon, authenticated;
    insert into auth.users values ('${ADMIN}'), ('${OTHER}');
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/001_job_gallery.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into private.gallery_admins values ('${ADMIN}');`);
});
after(async () => { await db?.close(); });

async function as(role, user = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec(`set role ${role}`);
}
async function save(version, status = 'draft', images = photos, date = '2026-09-28', title = 'Serviceoppdrag') {
  return db.query('select * from public.save_job($1,$2,$3,$4,$5,$6,$7)', [JOB, version, title, 'Arbeid utført.', date, status, JSON.stringify(images)]);
}
test('only the explicitly allowed UUID can administer or upload', async () => {
  await as('anon');
  assert.equal((await db.query('select public.is_gallery_admin() as allowed')).rows[0].allowed, false);
  await assert.rejects(() => save(0, 'draft', []), /permission denied/);
  await as('authenticated', OTHER);
  await assert.rejects(() => save(0, 'draft', []), /Access denied/);
  await assert.rejects(() => db.query("insert into storage.objects(bucket_id,name) values ('job-images',$1)", [path]), /row-level security/);
  await assert.rejects(() => db.exec(`insert into private.gallery_admins values ('${OTHER}')`), /permission denied/);
  await as('authenticated', ADMIN);
  assert.equal((await db.query('select public.is_gallery_admin() as allowed')).rows[0].allowed, true);
  await db.query("insert into storage.objects(bucket_id,name) values ('job-images',$1)", [path]);
  await assert.rejects(() => db.exec("insert into storage.objects(bucket_id,name) values ('job-images','bad.svg')"), /row-level security/);
});
test('drafts and draft photos are private; published jobs are readable', async () => {
  await as('authenticated', ADMIN);
  await save(0);
  await as('anon');
  assert.equal((await db.query('select * from public.jobs')).rows.length, 0);
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  await as('authenticated', OTHER);
  assert.equal((await db.query('select * from public.jobs')).rows.length, 0);
  await as('authenticated', ADMIN);
  await save(1, 'published');
  await as('anon');
  assert.equal((await db.query('select * from public.jobs')).rows.length, 1);
  await db.exec("select set_config('storage.operation', 'storage.object.get_authenticated', false)");
  assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
  await db.exec("select set_config('storage.operation', 'storage.object.create_signed_url', false)");
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0, 'anonymous visitors must not mint long-lived signed URLs');
  await assert.rejects(() => db.exec("update public.jobs set title = 'hijacked'"), /permission denied/);
});
test('stale versions cannot overwrite edits and image metadata is validated', async () => {
  await as('authenticated', ADMIN);
  await assert.rejects(() => save(1, 'published'), /Version conflict/);
  await assert.rejects(() => save(2, 'published', [{ ...photos[0], path: 'https://example.org/a.jpg' }]), /Invalid image/);
  await assert.rejects(() => save(2, 'published', [{ ...photos[0], width: null }]), /Invalid image/);
  await assert.rejects(() => save(2, 'published', [...photos, ...photos]), /Invalid image/);
  await assert.rejects(() => save(2, 'published', [{ ...photos[0], caption: 'x'.repeat(501) }]), /Invalid image/);
  await assert.rejects(() => save(2, 'published', []), /Invalid image count/);
  await assert.rejects(() => save(2, 'published', photos, 'infinity'), /check constraint/);
  await assert.rejects(() => save(2, 'published', photos, '10000-01-01'), /check constraint/);
  await assert.rejects(() => save(2, 'published', photos, null, ''), /Invalid job/);
  const result = await save(2, 'published', photos, null, 'Oppdatert jobb');
  assert.equal(result.rows[0].version, 3);
  assert.deepEqual(result.rows[0].photos, photos, 'existing photos and captions survive editing');
});
test('archive hides the job and images; restoring produces a private draft', async () => {
  await as('authenticated', OTHER);
  await assert.rejects(() => db.query('select public.archive_job($1,3,true)', [JOB]), /Access denied/);
  await as('authenticated', ADMIN);
  await db.query('select public.archive_job($1,3,true)', [JOB]);
  await as('anon');
  await db.exec("select set_config('storage.operation', 'storage.object.get_authenticated', false)");
  assert.equal((await db.query('select * from public.jobs')).rows.length, 0);
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  await as('authenticated', ADMIN);
  await assert.rejects(() => save(4), /Version conflict/);
  await db.query('select public.archive_job($1,4,false)', [JOB]);
  const result = (await db.query('select * from public.jobs')).rows[0];
  assert.equal(result.status, 'draft'); assert.equal(result.archived, false); assert.equal(result.version, 5);
});
