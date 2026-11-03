alter table public.houses
  add column if not exists photo_urls text[] not null default '{}';

alter table public.meters
  add column if not exists photo_url text;

alter table public.tenants
  add column if not exists photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mok-record-photos',
  'mok-record-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "MOK record photos upload own folder" on storage.objects;
create policy "MOK record photos upload own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mok-record-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "MOK record photos update own folder" on storage.objects;
create policy "MOK record photos update own folder"
on storage.objects for update to authenticated
using (
  bucket_id = 'mok-record-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'mok-record-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "MOK record photos delete own folder" on storage.objects;
create policy "MOK record photos delete own folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'mok-record-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

alter table public.houses
  drop constraint if exists houses_photo_urls_max_six;

alter table public.houses
  add constraint houses_photo_urls_max_six
  check (cardinality(photo_urls) <= 6);
