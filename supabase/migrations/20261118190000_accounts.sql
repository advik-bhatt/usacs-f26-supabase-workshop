-- Accounts and profile pictures.
--
-- Sign-up, sign-in, magic links and password resets need no SQL at all:
-- Supabase Auth handles them, and every account is a row in auth.users.
-- What does need SQL is where your picture lives and who can touch it.

-- Your picture's path in Storage, e.g. 'a1b2.../1700000000.webp'. The check
-- makes sure it points into your own folder.
alter table public.crew
  add column avatar_path text
  check (avatar_path is null or avatar_path like id::text || '/%');

-- you could already rename yourself; now you can set your picture too
grant update (name, avatar_path) on public.crew to authenticated;

-- The bucket. Public means anyone with the URL can *see* a picture, which is
-- what a leaderboard needs. Writing is still governed by the policies below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
on conflict (id) do nothing;

-- Storage is Postgres too: every file is a row in storage.objects, and these
-- are ordinary RLS policies on it. The first folder in the path has to be
-- your user id, so you can only ever touch avatars/<your id>/...
create policy "avatars: see your own files"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: upload into your own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: replace your own files"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: delete your own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
