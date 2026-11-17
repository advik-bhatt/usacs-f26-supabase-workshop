-- Run with: npx supabase test db
--
-- These pretend to be different people by switching role and setting the JWT
-- claims Postgres would normally get from a real request.

begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ben@example.com');

insert into public.crew (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Ana'),
  ('22222222-2222-2222-2222-222222222222', 'Ben');

insert into public.credits (crew_id, amount) values
  ('11111111-1111-1111-1111-111111111111', 300),
  ('22222222-2222-2222-2222-222222222222', 500);

select ok(public.post_targets(2) = 2, 'two targets go up on the board');

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every table in public has row level security enabled'
);

-- logged out: gate 1 stops everything
set local role anon;
select throws_ok('select * from public.targets', '42501', null, 'anon cannot read the board at all (no grant)');
reset role;

-- now be Ana
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.credits), 1, 'Ana sees exactly one credits row: her own');
select is((select sum(amount)::int from public.credits), 300, 'and it is her 300');

select throws_ok(
  $$ insert into public.deflections (target_id, crew_id, lead_days, mass_kg, direction, dv_ms, miss_km, capture_km, saved, score, seconds)
     values (1, '11111111-1111-1111-1111-111111111111', 1, 1, 'prograde', 1, 1e9, 1, true, 9999, 1) $$,
  '42501', 'new row violates row-level security policy for table "deflections"',
  'Ana cannot write her own result (RLS)'
);

select throws_ok($$ update public.mission set targets_per_tick = 0 $$, '42501', null,
  'Ana cannot stop new targets (no grant)');

select throws_ok(
  $$ insert into public.crew (id, name) values ('22222222-2222-2222-2222-222222222222', 'Imposter') $$,
  '42501', null, 'Ana cannot join as Ben');

select throws_ok(
  $$ select public.finish_target('11111111-1111-1111-1111-111111111111', 1, 100, 1000, 'prograde', 1, 1e9, 1, true, 999) $$,
  '42501', null, 'Ana cannot call finish_target; only the Edge Function can');

select isnt_empty('select * from public.claim_target()', 'Ana can claim a target');

select is(
  (select id from public.claim_target()),
  (select id from public.targets where crew_id = '11111111-1111-1111-1111-111111111111'),
  'claiming again gives Ana the same target, not a second one'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select isnt(
  (select id from public.claim_target()),
  (select id from public.targets where crew_id = '11111111-1111-1111-1111-111111111111'),
  'Ben gets a different target while Ana is still working hers'
);

select throws_ok(
  $$ insert into public.events (kind, crew_id) values ('saved', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null, 'Ben cannot fake a save in the event log');

reset role;
select * from finish();
rollback;
