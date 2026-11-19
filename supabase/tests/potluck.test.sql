-- Run with: npx supabase test db
--
-- Two players, Ana and Ben. The rules (who can see and change what) and the
-- game (budgets, baskets, what you can cook, how it's scored).

begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

update public.game set open = true;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ben@example.com');

insert into public.players (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Ana'),
  ('22222222-2222-2222-2222-222222222222', 'Ben');

select is((select phase from public.player_state where player_id = '11111111-1111-1111-1111-111111111111'),
  'menu', 'joining puts you on the live dashboard (trigger)');

set local role anon;
select throws_ok('select * from public.runs', '42501', null, 'logged out: no access at all');
reset role;

-- Ana
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is(public.menu_cost_cents('{roast-turkey}'), 1900, 'a turkey dinner costs $19.00 in ingredients');

select ok(public.start_run('{roast-turkey,pumpkin-pie,mac-and-cheese,cornbread}') ->> 'error' like 'That menu costs about $46.50%',
  'a menu over the allowance gets a friendly no');

select ok((public.start_run('{mashed-potatoes,cranberry-sauce}') ->> 'run_id') is not null, 'a menu inside the allowance starts a run');
create temp table r as select max(id) id from public.runs;
grant select on r to authenticated;

select is((select phase from public.player_state where player_id = '11111111-1111-1111-1111-111111111111'),
  'shopping', 'and the dashboard shows her shopping');

select is((public.buy((select id from r), 'potatoes') ->> 'spent_cents')::int, 200, 'buying potatoes spends $2.00');
select public.buy((select id from r), 'butter');
select public.buy((select id from r), 'milk');
select is(public.cookable((select id from r)), '{mashed-potatoes}', 'potatoes, butter, milk: mashed potatoes are cookable, sauce is not');

select throws_ok($$ update public.runs set score = 99999 $$, '42501', null, 'Ana cannot write a score (no grant)');
select throws_ok($$ update public.runs set budget_cents = 99999 $$, '42501', null, 'Ana cannot raise her budget (no grant)');
select throws_ok($$ insert into public.purchases (run_id, player_id, ingredient, price_cents) values (1, '11111111-1111-1111-1111-111111111111', 'turkey', 1) $$,
  '42501', null, 'Ana cannot put a $0.01 turkey in her basket (no grant)');
select throws_ok($$ update public.player_state set phase = 'done' $$, '42501', null, 'Ana can set her location but not her phase');
select lives_ok($$ update public.player_state set location = 'Dairy & Eggs' where player_id = '11111111-1111-1111-1111-111111111111' $$,
  'Ana can say where she is standing');

select ok(public.finish_run((select id from r), '{}') ->> 'error' like 'This trip is over%', 'cannot finish before heading home');
select ok((public.head_home((select id from r)) ->> 'ok')::boolean, 'heading home');
select ok(public.finish_run((select id from r), '{"mashed-potatoes": 1}') ->> 'error' like 'Whoa, faster than any oven%',
  'finishing instantly is refused (nobody cooks that fast)');

select pg_sleep(1.3);
select ok((public.finish_run((select id from r), '{"mashed-potatoes": 5}') ->> 'score')::int > 0, 'after cooking for real, she gets a score');
select is((select score from public.runs where id = (select id from r)),
  round(100 * 1.0 * 2.0)::int,
  'mashed potatoes, accuracy clamped to 1.0, fastest speed bonus: 100 x 1.0 x 2.0 = 200');

-- Ben can see Ana's run (it's a race) but not her basket
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.runs), 1, 'Ben can see Ana''s run on the leaderboard');
select is((select count(*)::int from public.purchases), 0, 'but not what she bought');

reset role;

-- the leaderboard ranks by score, not by who joined first
insert into public.runs (player_id, recipes, budget_cents, status, score, rating, finished_at, result)
values ('22222222-2222-2222-2222-222222222222', '{cornbread}', 4000, 'done', 999, 'Great!', now(), '{"dishes": [{}]}');
select is((select array_agg(e ->> 'name') from jsonb_array_elements(public.dashboard() -> 'leaderboard') e),
  array['Ben', 'Ana'], 'leaderboard: highest score first');

select * from finish();
rollback;
