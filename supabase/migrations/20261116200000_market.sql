-- The market: everybody has a wallet, and ingredients cost money.
--
-- Every cook starts with an allowance. Making a pizza costs the dough plus
-- whatever each topping costs *right now*. A correct pizza pays what the
-- customer agreed to when they ordered. A wrong one pays nothing, and you
-- still bought the ingredients.
--
-- Prices move with demand: every time a topping goes on a plate its price
-- jumps by shift.demand_bump. Every tick the pantry restocks and prices
-- drift back toward their base by shift.restock_rate. So if the whole room
-- piles onto pepperoni, pepperoni gets expensive, and orders that need it
-- stop being worth making.

alter table public.toppings
  add column base_cents  int not null default 50 check (base_cents > 0),
  add column price_cents int not null default 50 check (price_cents > 0);

alter table public.shift
  add column allowance_cents int not null default 2000 check (allowance_cents >= 0),
  add column demand_bump  numeric not null default 0.06 check (demand_bump between 0 and 1),
  add column restock_rate numeric not null default 0.05 check (restock_rate between 0 and 1);

-- what the customer will pay, fixed when they order
alter table public.tickets add column pays_cents int;

-- your cash. Yours only.
create table public.wallets (
  cook_id    uuid primary key references public.cooks (id) on delete cascade,
  cash_cents int not null check (cash_cents >= 0),
  updated_at timestamptz not null default now()
);

-- every cent in or out, and why. Also yours only.
create table public.ledger (
  id        bigint generated always as identity primary key,
  cook_id   uuid not null references public.cooks (id) on delete cascade,
  ticket_id bigint references public.tickets (id) on delete set null,
  cents     int not null,
  reason    text not null,
  at        timestamptz not null default now()
);

create index ledger_cook_id_idx on public.ledger (cook_id);
create index ledger_ticket_id_idx on public.ledger (ticket_id);

-- the price of every topping, every tick, for the charts
create table public.price_ticks (
  at          timestamptz not null default now(),
  slug        text not null references public.toppings (slug) on delete cascade,
  price_cents int not null,
  primary key (at, slug)
);

create index price_ticks_slug_idx on public.price_ticks (slug);

alter table public.wallets     enable row level security;
alter table public.ledger      enable row level security;
alter table public.price_ticks enable row level security;

revoke all on public.wallets, public.ledger, public.price_ticks from anon, authenticated;
grant select on public.wallets, public.ledger, public.price_ticks to authenticated;

create policy "your wallet is yours"
  on public.wallets for select to authenticated using ((select auth.uid()) = cook_id);

create policy "your ledger is yours"
  on public.ledger for select to authenticated using ((select auth.uid()) = cook_id);

create policy "price history is public"
  on public.price_ticks for select to authenticated using (true);

-- New cooks get their allowance. A trigger, so nobody can join without a
-- wallet and nobody can hand themselves a bigger one.
create or replace function public.open_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowance int := (select allowance_cents from public.shift);
begin
  insert into public.wallets (cook_id, cash_cents) values (new.id, allowance);
  insert into public.ledger (cook_id, cents, reason) values (new.id, allowance, 'allowance');
  return new;
end;
$$;

create trigger cooks_open_wallet
  after insert on public.cooks
  for each row execute function public.open_wallet();

-- Dough by size, plus every topping at today's price.
create or replace function public.plate_cost_cents(p_size text, p_toppings text[])
returns int
language sql
stable
set search_path = ''
as $$
  select (case p_size when 'S' then 100 when 'M' then 150 else 200 end)
       + coalesce((select sum(price_cents) from public.toppings where slug = any (p_toppings)), 0)::int;
$$;

-- Same as before, except every ticket now has a price: what the plate costs
-- to make at the moment it's ordered, plus a 60% markup.
create or replace function public.place_orders(p_count int default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.shift;
  n int;
  picked text[];
  new_id bigint;
  new_msg bigint;
  new_size text;
  pays int;
begin
  select * into s from public.shift;
  n := coalesce(p_count, case when s.open then s.tickets_per_tick else 0 end);

  for i in 1..n loop
    select array_agg(slug order by slug) into picked
    from (
      select slug from public.toppings order by random() limit 1 + floor(random() * 3)::int
    ) t;

    if picked is null then
      raise exception 'no toppings on the menu. Did you run the seed? (npx supabase db reset)';
    end if;

    new_size := (array['S', 'M', 'L'])[1 + floor(random() * 3)::int];
    pays := round(public.plate_cost_cents(new_size, picked) * 1.6);

    insert into public.tickets (size, toppings, pays_cents)
    values (new_size, picked, pays)
    returning id into new_id;

    select * into new_msg from pgmq.send('tickets', jsonb_build_object('ticket_id', new_id));
    update public.tickets set msg_id = new_msg where id = new_id;

    perform public.log_event('placed', new_id, null,
      jsonb_build_object('size', new_size, 'toppings', picked, 'pays_cents', pays));
  end loop;

  return n;
end;
$$;

-- Finishing a ticket now moves money, all in one transaction:
--   1. lock the toppings on the plate and price them
--   2. refuse if you can't afford them (nothing changes)
--   3. charge you, pay you if it's right, tip you if it's right and quick
--   4. bump the price of everything you used
drop function public.finish_ticket(uuid, bigint, boolean, int, int, jsonb);

create or replace function public.finish_ticket(
  p_cook uuid,
  p_ticket bigint,
  p_correct boolean,
  p_score int,
  p_tip_cents int,
  p_plate_size text,
  p_plate text[],
  p_detail jsonb default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets;
  s public.shift;
  secs numeric;
  outcome text := case when p_correct then 'served' else 'botched' end;
  cost int;
  revenue int := 0;
  cash int;
begin
  select * into s from public.shift;
  select * into t from public.tickets where id = p_ticket for update;

  if not found then
    raise exception 'ticket % does not exist', p_ticket using errcode = 'P0002';
  end if;

  if t.status in ('served', 'botched', 'walked_out') then
    raise exception 'ticket #% is already done (%)', p_ticket, t.status using errcode = 'P0001';
  end if;

  if t.status <> 'cooking'
     or t.cook_id is distinct from p_cook
     or t.claimed_at < now() - make_interval(secs => s.cook_seconds) then
    -- Return the refusal instead of raising it: an exception would roll back
    -- this log_event too, and we want "late" in the event log.
    perform public.log_event('late', t.id, p_cook, jsonb_build_object('status_now', t.status));
    return jsonb_build_object(
      'error', format('too slow, ticket #%s went back on the rail', p_ticket),
      'hint', 'you have shift.cook_seconds to finish before the queue gives it to someone else');
  end if;

  -- lock in a fixed order so two cooks buying the same toppings can't deadlock
  perform 1 from public.toppings where slug = any (p_plate) order by slug for update;
  cost := public.plate_cost_cents(p_plate_size, p_plate);

  select cash_cents into cash from public.wallets where cook_id = p_cook for update;
  if cash is null or cash < cost then
    perform public.log_event('broke', t.id, p_cook, jsonb_build_object('cost_cents', cost, 'cash_cents', coalesce(cash, 0)));
    return jsonb_build_object(
      'error', format('you can''t afford the ingredients: they cost $%s, you have $%s',
        to_char(cost / 100.0, 'FM990.00'), to_char(coalesce(cash, 0) / 100.0, 'FM990.00')),
      'hint', 'prices drop as the pantry restocks; keep the ticket and try again in a few seconds');
  end if;

  if p_correct then
    revenue := t.pays_cents + p_tip_cents;
  end if;

  update public.wallets
  set cash_cents = cash_cents - cost + revenue, updated_at = now()
  where cook_id = p_cook;

  insert into public.ledger (cook_id, ticket_id, cents, reason) values (p_cook, t.id, -cost, 'ingredients');
  if p_correct then
    insert into public.ledger (cook_id, ticket_id, cents, reason) values (p_cook, t.id, t.pays_cents, 'customer paid');
    if p_tip_cents > 0 then
      insert into public.ledger (cook_id, ticket_id, cents, reason) values (p_cook, t.id, p_tip_cents, 'tip');
      insert into public.tips (cook_id, ticket_id, cents) values (p_cook, t.id, p_tip_cents);
    end if;
  end if;

  -- demand: everything you used just got more expensive for everyone else
  update public.toppings
  set price_cents = ceil(price_cents * (1 + s.demand_bump))
  where slug = any (p_plate);

  secs := round(extract(epoch from now() - t.claimed_at)::numeric, 1);
  perform pgmq.archive('tickets', t.msg_id);
  update public.tickets set status = outcome, done_at = now() where id = t.id;

  insert into public.serves (ticket_id, cook_id, score, correct, seconds)
  values (t.id, p_cook, p_score, p_correct, secs);

  perform public.log_event(outcome, t.id, p_cook, coalesce(p_detail, '{}') || jsonb_build_object(
    'seconds', secs, 'score', p_score, 'cost_cents', cost, 'revenue_cents', revenue, 'profit_cents', revenue - cost
  ));

  return jsonb_build_object(
    'status', outcome, 'seconds', secs, 'score', p_score, 'tip_cents', case when p_correct then p_tip_cents else 0 end,
    'cost_cents', cost, 'revenue_cents', revenue, 'profit_cents', revenue - cost, 'cash_cents', cash - cost + revenue
  );
end;
$$;

-- The tick, plus two new jobs: restock (prices drift back toward base) and
-- write down every price so the charts have history.
create or replace function public.kitchen_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.shift;
  r record;
begin
  select * into s from public.shift;

  for r in
    select id, cook_id from public.tickets
    where status = 'cooking'
      and claimed_at < now() - make_interval(secs => s.cook_seconds)
    for update skip locked
  loop
    update public.tickets set status = 'waiting', cook_id = null, claimed_at = null where id = r.id;
    perform public.log_event('dropped', r.id, r.cook_id, '{"why": "visibility timeout"}');
  end loop;

  for r in
    select id, msg_id from public.tickets
    where status = 'waiting'
      and placed_at < now() - make_interval(secs => s.patience_seconds)
    for update skip locked
  loop
    perform pgmq.delete('tickets', r.msg_id);
    update public.tickets set status = 'walked_out', done_at = now() where id = r.id;
    perform public.log_event('walked_out', r.id, null, '{}');
  end loop;

  -- restock: close part of the gap back to base price
  update public.toppings
  set price_cents = greatest(base_cents, floor(price_cents - (price_cents - base_cents) * s.restock_rate))
  where price_cents > base_cents;

  insert into public.price_ticks (slug, price_cents)
  select slug, price_cents from public.toppings;

  insert into public.queue_samples (waiting, cooking, oldest_seconds)
  select
    count(*) filter (where status = 'waiting'),
    count(*) filter (where status = 'cooking'),
    extract(epoch from now() - min(placed_at) filter (where status = 'waiting'))::int
  from public.tickets
  where status in ('waiting', 'cooking');

  perform public.place_orders();
end;
$$;

-- What the economy looks like as a whole. This function can read every
-- wallet (security definer), but it only ever hands back totals, medians and
-- an inequality score. Nobody's wallet leaves the database.
create or replace function public.economy_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select cash_cents, row_number() over (order by cash_cents) i, count(*) over () n
    from public.wallets
  )
  select jsonb_build_object(
    'money_supply_cents', coalesce((select sum(cash_cents) from w), 0),
    'median_cents', (select percentile_cont(0.5) within group (order by cash_cents) from w),
    'broke', (select count(*) from w where cash_cents < 400),
    'wallets', (select count(*) from w),
    -- Gini coefficient: 0 = everyone has the same, 1 = one cook has it all
    'gini', (
      select case when sum(cash_cents) > 0
        then round(((2.0 * sum(i * cash_cents)) / (max(n) * sum(cash_cents)) - (max(n) + 1.0) / max(n))::numeric, 3)
        else 0 end
      from w
    ),
    'prices', (
      select jsonb_agg(jsonb_build_object('slug', slug, 'emoji', emoji, 'label', label,
        'price_cents', price_cents, 'base_cents', base_cents) order by slug)
      from public.toppings
    ),
    'price_series', (
      select coalesce(jsonb_agg(jsonb_build_object('at', at, 'slug', slug, 'price_cents', price_cents) order by at), '[]')
      from public.price_ticks where at > now() - interval '5 minutes'
    ),
    'profit_board', (
      select coalesce(jsonb_agg(p), '[]') from (
        select c.name, c.kind, sum(l.cents) filter (where l.reason <> 'allowance' and l.reason <> 'stimulus')::int profit_cents
        from public.ledger l join public.cooks c on c.id = l.cook_id
        group by c.id, c.name, c.kind
        order by 3 desc nulls last
        limit 10
      ) p
    )
  );
$$;

-- Print money. Everyone gets the same amount:
--   npx supabase db query "select stimulus(500)"
create or replace function public.stimulus(p_cents int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  update public.wallets set cash_cents = cash_cents + p_cents, updated_at = now();
  get diagnostics n = row_count;
  insert into public.ledger (cook_id, cents, reason) select cook_id, p_cents, 'stimulus' from public.wallets;
  perform public.log_event('stimulus', null, null, jsonb_build_object('cents', p_cents, 'wallets', n));
  return n;
end;
$$;

revoke execute on function public.open_wallet() from anon, authenticated, public;
revoke execute on function public.place_orders(int) from anon, authenticated, public;
revoke execute on function public.finish_ticket(uuid, bigint, boolean, int, int, text, text[], jsonb) from anon, authenticated, public;
revoke execute on function public.kitchen_tick() from anon, authenticated, public;
revoke execute on function public.stimulus(int) from anon, authenticated, public;
revoke execute on function public.economy_stats() from anon, public;
revoke execute on function public.plate_cost_cents(text, text[]) from anon, public;

grant execute on function public.finish_ticket(uuid, bigint, boolean, int, int, text, text[], jsonb) to service_role;
grant execute on function public.economy_stats() to authenticated;
grant execute on function public.plate_cost_cents(text, text[]) to authenticated;

-- prices change on every phone the moment they move
alter publication supabase_realtime add table public.toppings;

-- price history grows by eight rows every ten seconds; keep a day of it
select cron.schedule('trim-prices', '23 * * * *', $$ delete from public.price_ticks where at < now() - interval '1 day' $$);
