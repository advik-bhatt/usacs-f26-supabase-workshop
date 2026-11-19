-- Run with: npx supabase test db
--
-- Accounts and profile pictures: Storage is just more tables with RLS, so it
-- can be tested exactly like the rest.

begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ben@example.com');

insert into public.cooks (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Ana'),
  ('22222222-2222-2222-2222-222222222222', 'Ben');

select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'the avatars bucket exists and is public (anyone can see a picture)'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '11111111-1111-1111-1111-111111111111/me.webp') $$,
  'Ana can upload into her own folder'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '22222222-2222-2222-2222-222222222222/gotcha.webp') $$,
  '42501', 'new row violates row-level security policy for table "objects"',
  'Ana cannot upload into Ben''s folder'
);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars'),
  1,
  'Ana can only list her own files'
);

select lives_ok(
  $$ update public.cooks set avatar_path = '11111111-1111-1111-1111-111111111111/me.webp'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  'Ana can point her profile at her picture'
);

select throws_ok(
  $$ update public.cooks set avatar_path = '22222222-2222-2222-2222-222222222222/ben.webp'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '23514', null,
  'but not at a picture in someone else''s folder'
);

-- RLS turns an update of someone else's row into an update of zero rows
update public.cooks set name = 'Hacked' where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select name from public.cooks where id = '22222222-2222-2222-2222-222222222222'),
  'Ben',
  'Ana renaming Ben changes nothing (RLS filters the update to zero rows)'
);

reset role;
select * from finish();
rollback;
