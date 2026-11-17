-- Run with: npx supabase test db
--
-- Two traders, Ana and Ben, and a market. These check the rules (who can see
-- and touch what) and the economics (does the matching engine get the money
-- and the shares right).

begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

update public.market set open = true;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'ben@example.com');

insert into public.traders (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Ana'),
  ('22222222-2222-2222-2222-222222222222', 'Ben');

-- totals before anyone trades; nothing should create or destroy money or shares
create temp table before as
  select (select sum(cash_cents) from public.accounts) cash, (select sum(qty) from public.positions) shares;
grant select on before to authenticated;

select is((select cash_cents from public.accounts where trader_id = '11111111-1111-1111-1111-111111111111'),
  1000000::bigint, 'joining opens an account with $10,000 (trigger)');
select is((select qty from public.positions where trader_id = '11111111-1111-1111-1111-111111111111' and symbol = 'SLICE'),
  20, 'and 20 shares of every stock');

-- logged out
set local role anon;
select throws_ok('select * from public.stocks', '42501', null, 'anon cannot read prices at all (no grant)');
reset role;

-- Ana
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is((select count(*)::int from public.accounts), 1, 'Ana sees one account: hers');
select is((select count(distinct trader_id)::int from public.positions), 1, 'Ana sees only her own positions');
select throws_ok($$ update public.accounts set cash_cents = 99999999 $$, '42501', null, 'Ana cannot give herself money (no grant)');
select throws_ok($$ update public.stocks set last_cents = 1 where symbol = 'SLICE' $$, '42501', null, 'Ana cannot set a price (no grant)');
select throws_ok($$ insert into public.orders (trader_id, symbol, side, kind, qty, limit_cents)
                    values ('11111111-1111-1111-1111-111111111111', 'SLICE', 'buy', 'limit', 1, 1) $$,
  '42501', 'new row violates row-level security policy for table "orders"', 'Ana cannot write an order directly (RLS)');
select throws_ok($$ select public.news('SLICE', 'fake news', 'good') $$, '42501', null, 'Ana cannot publish news');

select is((public.place_order('SLICE', 'sell', 'limit', 25, 4300)) ->> 'error',
  'you only have 20 SLICE shares free to sell (no short selling here)', 'no short selling');

-- Ana offers 5 SLICE at $43
select is((public.place_order('SLICE', 'sell', 'limit', 5, 4300)) -> 'order' ->> 'status', 'open', 'Ana''s ask rests on the book');
select is((select reserved from public.positions where symbol = 'SLICE'), 5, 'and 5 of her shares are set aside');
select is((public.place_order('SLICE', 'sell', 'limit', 16, 4400)) ->> 'error',
  'you only have 15 SLICE shares free to sell (no short selling here)', 'she cannot sell the reserved shares twice');

-- Ben
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((public.place_order('SLICE', 'buy', 'limit', 3, 4500)) ->> 'avg_cents', '4300',
  'Ben bids $45 and pays $43: the resting order sets the price');
select is((select qty from public.positions where symbol = 'SLICE'), 23, 'Ben now has 23 SLICE');
select is((select cash_cents from public.accounts), (1000000 - 3 * 4300)::bigint, 'and paid exactly 3 x $43');
select is((select reserved_cents from public.accounts), 0::bigint, 'with nothing left reserved (his order filled completely)');
select is((select last_cents from public.stocks where symbol = 'SLICE'), 4300, 'the last trade is the new price');

select is((public.place_order('SLICE', 'buy', 'market', 10, null)) ->> 'filled', '2',
  'a market order takes what is on the book (2 left) and cancels the rest');

select is((public.place_order('SLICE', 'buy', 'limit', 1, 2000000)) ->> 'error',
  'not enough cash: that order needs $20000.00, you have $9785.00 free', 'cannot bid more than you have');

-- back to Ana: cancel releases what was set aside
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select ok((public.place_order('BREW', 'buy', 'limit', 10, 2000)) -> 'order' ->> 'id' is not null, 'Ana bids for BREW');
select is((public.cancel_order((select max(id) from public.orders))) -> 'order' ->> 'status', 'cancelled', 'and cancels it');
select is((select reserved_cents from public.accounts), 0::bigint, 'which frees her cash');

reset role;

select ok(
  (select sum(cash_cents) from public.accounts) = (select cash from before)
  and (select sum(qty) from public.positions) = (select shares from before),
  'no money or shares were created or destroyed'
);

select * from finish();
rollback;
