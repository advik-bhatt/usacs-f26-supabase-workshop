-- Run with: npx supabase test db
--
-- These pretend to be different people by switching role and setting the JWT
-- claims Postgres would normally get from a real request.

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- two cooks
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ben@example.com');

insert into public.cooks (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Ana'),
  ('22222222-2222-2222-2222-222222222222', 'Ben');

insert into public.tips (cook_id, cents) values
  ('11111111-1111-1111-1111-111111111111', 300),
  ('22222222-2222-2222-2222-222222222222', 500);

select public.place_orders(2);

-- every table in public has RLS on
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'every table in public has row level security enabled'
);

-- logged out: gate 1 stops everything
set local role anon;
select throws_ok(
  'select * from public.tickets',
  '42501', null,
  'anon cannot read tickets at all (no grant)'
);
reset role;

-- now be Ana
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.tips),
  1,
  'Ana sees exactly one tip row: her own'
);

select is(
  (select sum(cents)::int from public.tips),
  300,
  'and it is the 300 cent one'
);

select throws_ok(
  $$ insert into public.serves (ticket_id, cook_id, score, correct, seconds)
     values (1, '11111111-1111-1111-1111-111111111111', 999, true, 1) $$,
  '42501', 'new row violates row-level security policy for table "serves"',
  'Ana cannot write her own score (RLS)'
);

select throws_ok(
  $$ update public.shift set tickets_per_tick = 0 $$,
  '42501', null,
  'Ana cannot turn off the order flow (no grant)'
);

select throws_ok(
  $$ insert into public.cooks (id, name) values ('22222222-2222-2222-2222-222222222222', 'Imposter') $$,
  '42501', null,
  'Ana cannot sign up as Ben'
);

select throws_ok(
  $$ select public.finish_ticket('11111111-1111-1111-1111-111111111111', 1, true, 15, 350, 'S', '{cheese}') $$,
  '42501', null,
  'Ana cannot call finish_ticket; only the Edge Function can'
);

-- the market
select is((select count(*)::int from public.wallets), 1, 'Ana sees exactly one wallet: her own');
select is((select cash_cents from public.wallets), 2000, 'and it holds her $20 allowance, opened by the trigger');
select throws_ok($$ update public.wallets set cash_cents = 999999 $$, '42501', null,
  'Ana cannot give herself money (no grant)');
select throws_ok($$ update public.toppings set price_cents = 1 $$, '42501', null,
  'Ana cannot crash the price of pepperoni (no grant)');
select throws_ok($$ select public.stimulus(100000) $$, '42501', null,
  'Ana cannot print money; only the host can');

select isnt_empty(
  'select * from public.grab_ticket()',
  'Ana can grab a ticket off the rail'
);

select is(
  (select id from public.grab_ticket()),
  (select id from public.tickets where cook_id = '11111111-1111-1111-1111-111111111111'),
  'grabbing again gives Ana the same ticket, not a second one'
);

-- Ben grabs too: he must get the other ticket, never Ana's
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select isnt(
  (select id from public.grab_ticket()),
  (select id from public.tickets where cook_id = '11111111-1111-1111-1111-111111111111'),
  'Ben gets a different ticket while Ana is still cooking hers'
);

select throws_ok(
  $$ insert into public.events (kind, cook_id) values ('served', '22222222-2222-2222-2222-222222222222') $$,
  '42501', null,
  'Ben cannot fake a served event in the log'
);

reset role;
select * from finish();
rollback;
