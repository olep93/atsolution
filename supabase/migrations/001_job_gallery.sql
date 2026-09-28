-- Run once in the dedicated AT Solutions Supabase project, as postgres.
-- No password, email address or public API key belongs in this migration.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.gallery_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on private.gallery_admins from public, anon, authenticated;

create function public.is_gallery_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.gallery_admins where user_id = auth.uid()); $$;
revoke all on function public.is_gallery_admin() from public;
grant execute on function public.is_gallery_admin() to anon, authenticated;

create table public.jobs (
  id uuid primary key,
  title text not null check (length(btrim(title)) between 1 and 140),
  body text not null default '' check (length(body) <= 20000),
  job_date date check (job_date between date '1900-01-01' and date '2100-12-31'),
  status text not null default 'draft' check (status in ('draft', 'published')),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 40),
  archived boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or jsonb_array_length(photos) > 0)
);
create index jobs_public_order on public.jobs (job_date desc nulls last, created_at desc) where status = 'published' and not archived;
alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;
grant select on public.jobs to anon, authenticated;
create policy jobs_read on public.jobs for select to anon, authenticated
  using ((status = 'published' and not archived) or (select public.is_gallery_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-images', 'job-images', false, 8388608, array['image/jpeg']);

create policy job_images_read on storage.objects for select to anon, authenticated
using (bucket_id = 'job-images' and (
  (select public.is_gallery_admin()) or ((storage.allow_only_operation('storage.object.get_authenticated') or storage.allow_only_operation('storage.object.get_authenticated_info')) and exists (
    select 1 from public.jobs j where j.status = 'published' and not j.archived
      and j.photos @> jsonb_build_array(jsonb_build_object('path', name))
  ))
));
create policy job_images_upload on storage.objects for insert to authenticated
with check (bucket_id = 'job-images' and (select public.is_gallery_admin())
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$');
-- No UPDATE or DELETE policy. Uploaded files are immutable; changing a photo
-- uploads a new UUID. Unused files can be cleaned up by an operator later.

create function public.save_job(
  p_id uuid, p_expected_version integer, p_title text, p_body text,
  p_job_date date, p_status text, p_photos jsonb
) returns public.jobs
language plpgsql security definer set search_path = ''
as $$
declare
  result public.jobs;
  photo jsonb;
  seen text[] := array[]::text[];
begin
  if not public.is_gallery_admin() then raise exception 'Access denied' using errcode = '42501'; end if;
  if p_id is null or p_expected_version is null or p_expected_version < 0
    or p_title is null or length(btrim(p_title)) not between 1 and 140
    or p_body is null or length(p_body) > 20000
    or p_status is null or p_status not in ('draft','published')
    or p_photos is null or jsonb_typeof(p_photos) <> 'array'
  then raise exception 'Invalid job' using errcode = '22023'; end if;
  if jsonb_array_length(p_photos) > 40 or (p_status = 'published' and jsonb_array_length(p_photos) = 0)
  then raise exception 'Invalid image count' using errcode = '22023'; end if;
  for photo in select value from jsonb_array_elements(p_photos) loop
    if jsonb_typeof(photo) <> 'object'
      or not (photo ?& array['id','path','caption','width','height'])
      or jsonb_typeof(photo->'id') <> 'string'
      or jsonb_typeof(photo->'path') <> 'string'
      or jsonb_typeof(photo->'caption') <> 'string'
      or jsonb_typeof(photo->'width') <> 'number'
      or jsonb_typeof(photo->'height') <> 'number'
      or (photo->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or (photo->>'path') <> p_id::text || '/' || (photo->>'id') || '.jpg'
      or length(photo->>'caption') > 500
      or (photo->>'width')::numeric not between 1 and 2200
      or (photo->>'height')::numeric not between 1 and 2200
      or (photo->>'path') = any(seen)
      or not exists (select 1 from storage.objects where bucket_id = 'job-images' and name = photo->>'path')
    then raise exception 'Invalid image' using errcode = '22023'; end if;
    seen := array_append(seen, photo->>'path');
  end loop;
  -- Keep only the supported fields. Never store arbitrary client metadata.
  select coalesce(jsonb_agg(jsonb_build_object('id', item->>'id', 'path', item->>'path',
    'caption', item->>'caption', 'width', (item->>'width')::integer, 'height', (item->>'height')::integer)), '[]'::jsonb)
  into p_photos from jsonb_array_elements(p_photos) item;
  if p_expected_version = 0 then
    insert into public.jobs (id, title, body, job_date, status, photos)
    values (p_id, btrim(p_title), p_body, p_job_date, p_status, p_photos) returning * into result;
  else
    update public.jobs set title = btrim(p_title), body = p_body, job_date = p_job_date,
      status = p_status, photos = p_photos, version = version + 1, updated_at = now()
    where id = p_id and version = p_expected_version and not archived returning * into result;
    if not found then raise exception 'Version conflict: reload job' using errcode = 'PT409'; end if;
  end if;
  return result;
end;
$$;
revoke all on function public.save_job(uuid,integer,text,text,date,text,jsonb) from public, anon;
grant execute on function public.save_job(uuid,integer,text,text,date,text,jsonb) to authenticated;

create function public.archive_job(p_id uuid, p_expected_version integer, p_archived boolean)
returns public.jobs language plpgsql security definer set search_path = ''
as $$
declare result public.jobs;
begin
  if not public.is_gallery_admin() then raise exception 'Access denied' using errcode = '42501'; end if;
  update public.jobs set archived = p_archived, status = 'draft', version = version + 1, updated_at = now()
    where id = p_id and version = p_expected_version returning * into result;
  if not found then raise exception 'Version conflict: reload job' using errcode = 'PT409'; end if;
  return result;
end;
$$;
revoke all on function public.archive_job(uuid,integer,boolean) from public, anon;
grant execute on function public.archive_job(uuid,integer,boolean) to authenticated;
commit;
