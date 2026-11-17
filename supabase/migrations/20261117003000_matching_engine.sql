-- The matching engine.
--
-- This is how a real exchange works, minus the speed:
--
--   * The order book holds every open limit order. Bids (buy orders) are
--     sorted highest price first, asks (sell orders) lowest price first, and
--     at the same price, whoever got there first goes first. That's called
--     price-time priority.
--   * A new order trades against the best orders on the other side for as
--     long as the prices cross. Each trade happens at the price of the order
--     that was already waiting on the book.
--   * Whatever's left of a limit order waits on the book. Whatever's left of
--     a market order is cancelled.
--   * The last trade price is the stock price. Nothing else moves it.
--
-- Everything for one order happens in one transaction, behind one lock, so
-- two orders can never match against the same shares. Real exchanges do the
-- same thing: a single-threaded matcher, just much faster.

create or replace function public.log_event(
  p_kind text,
  p_trader uuid default null,
  p_symbol text default null,
  p_detail jsonb default '{}'
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.events (kind, trader_id, symbol, detail)
  values (p_kind, p_trader, p_symbol, coalesce(p_detail, '{}'));
$$;

-- New traders get their cash and their starting shares. A trigger, so nobody
-- can join without an account and nobody can give themselves a bigger one.
create or replace function public.open_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.market;
begin
  select * into m from public.market;
  insert into public.accounts (trader_id, cash_cents) values (new.id, m.allowance_cents);
  insert into public.positions (trader_id, symbol, qty)
  select new.id, symbol, m.starting_shares from public.stocks;
  return new;
end;
$$;

create trigger traders_open_account
  after insert on public.traders
  for each row execute function public.open_account();

-- Refusals come back as { "error": ... } instead of exceptions, so the
-- event that records them isn't rolled back with them.
create or replace function public.reject(p_trader uuid, p_symbol text, p_reason text, p_detail jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.log_event('rejected', p_trader, p_symbol, p_detail || jsonb_build_object('reason', p_reason));
  return jsonb_build_object('error', p_reason);
end;
$$;

create or replace function public.place_order(
  p_symbol text,
  p_side text,
  p_kind text,
  p_qty int,
  p_limit_cents int default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  sym text := upper(trim(p_symbol));
  mkt public.market;
  st public.stocks;
  o public.orders;
  rest public.orders;
  free_cash bigint;
  free_shares int;
  remaining int := p_qty;
  px int;
  q int;
  buyer uuid;
  seller uuid;
  buyer_limit int;
  trade_id bigint;
  spent bigint := 0;
  done int := 0;
  detail jsonb;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;

  -- one matcher at a time, across the whole exchange
  perform pg_advisory_xact_lock(hashtext('matching-engine'));

  detail := jsonb_build_object('side', p_side, 'kind', p_kind, 'qty', p_qty, 'limit_cents', p_limit_cents);

  if not exists (select 1 from public.traders where id = me) then
    return public.reject(me, sym, 'join the floor first', detail);
  end if;

  select * into mkt from public.market;
  if not mkt.open then
    return public.reject(me, sym, 'the market is closed', detail);
  end if;
  if p_side not in ('buy', 'sell') or p_kind not in ('limit', 'market') then
    return public.reject(me, sym, 'side must be buy or sell, kind must be limit or market', detail);
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 100000 then
    return public.reject(me, sym, 'quantity must be between 1 and 100,000 shares', detail);
  end if;
  if p_kind = 'limit' and (p_limit_cents is null or p_limit_cents < 1) then
    return public.reject(me, sym, 'a limit order needs a price', detail);
  end if;

  select * into st from public.stocks where symbol = sym for update;
  if not found then
    return public.reject(me, sym, format('no stock called %s', sym), detail);
  end if;
  if st.halted_until > now() then
    return public.reject(me, sym, format('%s is halted by the circuit breaker for another %s seconds',
      sym, ceil(extract(epoch from st.halted_until - now()))), detail);
  end if;

  -- can you cover it?
  select cash_cents - reserved_cents into free_cash from public.accounts where trader_id = me for update;
  insert into public.positions (trader_id, symbol, qty) values (me, sym, 0) on conflict do nothing;
  select qty - reserved into free_shares from public.positions where trader_id = me and symbol = sym for update;

  if p_side = 'buy' and p_kind = 'limit' and free_cash < p_limit_cents::bigint * p_qty then
    return public.reject(me, sym, format('not enough cash: that order needs $%s, you have $%s free',
      to_char(p_limit_cents::bigint * p_qty / 100.0, 'FM999999990.00'), to_char(free_cash / 100.0, 'FM999999990.00')), detail);
  end if;
  if p_side = 'sell' and free_shares < p_qty then
    return public.reject(me, sym, format('you only have %s %s shares free to sell (no short selling here)', free_shares, sym), detail);
  end if;

  insert into public.orders (trader_id, symbol, side, kind, qty, limit_cents)
  values (me, sym, p_side, p_kind, p_qty, case when p_kind = 'limit' then p_limit_cents end)
  returning * into o;

  -- set aside what the order promises, so you can't spend it twice
  if p_side = 'buy' and p_kind = 'limit' then
    update public.accounts set reserved_cents = reserved_cents + p_limit_cents::bigint * p_qty where trader_id = me;
  elsif p_side = 'sell' then
    update public.positions set reserved = reserved + p_qty where trader_id = me and symbol = sym;
  end if;

  -- match against the best resting orders on the other side
  while remaining > 0 loop
    if p_side = 'buy' then
      select * into rest from public.orders
      where symbol = sym and side = 'sell' and status = 'open' and trader_id <> me
        and (p_kind = 'market' or limit_cents <= p_limit_cents)
      order by limit_cents asc, id asc
      limit 1
      for update;
    else
      select * into rest from public.orders
      where symbol = sym and side = 'buy' and status = 'open' and trader_id <> me
        and (p_kind = 'market' or limit_cents >= p_limit_cents)
      order by limit_cents desc, id asc
      limit 1
      for update;
    end if;
    exit when not found;

    px := rest.limit_cents;  -- the resting order sets the price
    q := least(remaining, rest.qty - rest.filled);

    if p_side = 'buy' and p_kind = 'market' then
      -- a market buy spends what you have, and no more
      select cash_cents - reserved_cents into free_cash from public.accounts where trader_id = me;
      q := least(q, (free_cash / px)::int);
      exit when q = 0;
    end if;

    if p_side = 'buy' then
      buyer := me; seller := rest.trader_id; buyer_limit := p_limit_cents;
    else
      buyer := rest.trader_id; seller := me; buyer_limit := rest.limit_cents;
    end if;

    -- money: the buyer pays the trade price and releases what their limit had set aside
    update public.accounts
    set cash_cents = cash_cents - px::bigint * q,
        reserved_cents = reserved_cents - coalesce(buyer_limit, 0)::bigint * q
    where trader_id = buyer;
    update public.accounts set cash_cents = cash_cents + px::bigint * q where trader_id = seller;

    -- shares
    update public.positions set qty = qty - q, reserved = reserved - q where trader_id = seller and symbol = sym;
    insert into public.positions (trader_id, symbol, qty) values (buyer, sym, q)
    on conflict (trader_id, symbol) do update set qty = public.positions.qty + excluded.qty;

    insert into public.trades (symbol, price_cents, qty) values (sym, px, q) returning id into trade_id;
    insert into public.fills (trade_id, order_id, trader_id, symbol, side, price_cents, qty) values
      (trade_id, o.id, me, sym, p_side, px, q),
      (trade_id, rest.id, rest.trader_id, sym, rest.side, px, q);

    update public.orders
    set filled = filled + q,
        status = case when filled + q = qty then 'filled' else 'open' end,
        updated_at = now()
    where id = rest.id;

    remaining := remaining - q;
    done := done + q;
    spent := spent + px::bigint * q;
    st.last_cents := px;
  end loop;

  -- what's left: a limit order rests on the book, a market order is cancelled
  update public.orders
  set filled = done,
      status = case when remaining = 0 then 'filled' when p_kind = 'market' then 'cancelled' else 'open' end,
      updated_at = now()
  where id = o.id
  returning * into o;

  if p_kind = 'market' and p_side = 'sell' and remaining > 0 then
    update public.positions set reserved = reserved - remaining where trader_id = me and symbol = sym;
  end if;

  if done > 0 then
    update public.stocks
    set last_cents = st.last_cents, volume = volume + done, updated_at = now()
    where symbol = sym;

    -- circuit breaker: too far from the open, too fast? stop trading for a minute
    if abs(st.last_cents - st.open_cents)::numeric / st.open_cents >= mkt.breaker_pct
       and (st.halted_until is null or st.halted_until < now()) then
      update public.stocks set halted_until = now() + make_interval(secs => mkt.halt_seconds) where symbol = sym;
      perform public.log_event('halt', null, sym, jsonb_build_object(
        'last_cents', st.last_cents, 'open_cents', st.open_cents, 'seconds', mkt.halt_seconds));
    end if;
  end if;

  perform public.log_event('order', me, sym, detail || jsonb_build_object(
    'order_id', o.id, 'filled', done, 'status', o.status,
    'avg_cents', case when done > 0 then round(spent::numeric / done) end));

  return jsonb_build_object(
    'order', to_jsonb(o),
    'filled', done,
    'avg_cents', case when done > 0 then round(spent::numeric / done) end,
    'spent_cents', spent
  );
end;
$$;

create or replace function public.cancel_order(p_order bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  o public.orders;
  left_qty int;
begin
  perform pg_advisory_xact_lock(hashtext('matching-engine'));

  select * into o from public.orders where id = p_order for update;
  if not found or o.trader_id is distinct from me then
    -- same answer whether it doesn't exist or isn't yours: don't leak which
    return public.reject(me, null, format('no open order #%s of yours', p_order));
  end if;
  if o.status <> 'open' then
    return public.reject(me, o.symbol, format('order #%s is already %s', p_order, o.status));
  end if;

  left_qty := o.qty - o.filled;
  if o.side = 'buy' then
    update public.accounts set reserved_cents = reserved_cents - o.limit_cents::bigint * left_qty where trader_id = me;
  else
    update public.positions set reserved = reserved - left_qty where trader_id = me and symbol = o.symbol;
  end if;

  update public.orders set status = 'cancelled', updated_at = now() where id = p_order returning * into o;
  perform public.log_event('cancel', me, o.symbol, jsonb_build_object('order_id', o.id, 'unfilled', left_qty));
  return jsonb_build_object('order', to_jsonb(o));
end;
$$;

-- The book for one stock, the way a real exchange publishes it: price levels
-- and how many shares wait at each. No names, no order ids.
create or replace function public.order_book(p_symbol text, p_depth int default 8)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bids', coalesce((
      select jsonb_agg(l order by l.price_cents desc) from (
        select limit_cents price_cents, sum(qty - filled)::int qty, count(*)::int orders
        from public.orders
        where symbol = upper(p_symbol) and side = 'buy' and status = 'open'
        group by limit_cents order by limit_cents desc limit p_depth
      ) l), '[]'),
    'asks', coalesce((
      select jsonb_agg(l order by l.price_cents asc) from (
        select limit_cents price_cents, sum(qty - filled)::int qty, count(*)::int orders
        from public.orders
        where symbol = upper(p_symbol) and side = 'sell' and status = 'open'
        group by limit_cents order by limit_cents asc limit p_depth
      ) l), '[]')
  );
$$;

-- Runs every 10 seconds: write down every price for the charts, and let
-- halted stocks trade again once their time is up.
create or replace function public.market_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  insert into public.price_samples (symbol, last_cents) select symbol, last_cents from public.stocks;

  for r in
    select symbol from public.stocks where halted_until is not null and halted_until <= now()
  loop
    update public.stocks set halted_until = null where symbol = r.symbol;
    perform public.log_event('resume', null, r.symbol, '{}');
  end loop;
end;
$$;

-- Start a new trading day: today's prices become the new open (the circuit
-- breaker and the % change are measured from here).
--   npx supabase db query "select new_session()"
create or replace function public.new_session()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.stocks set open_cents = last_cents, volume = 0, halted_until = null;
  select public.log_event('session', null, null, '{}');
$$;

-- Drop a headline on the market:
--   npx supabase db query "select news('SLICE', 'Slice Labs robots pass health inspection', 'good')"
-- It lands in the news table (Postgres Changes) and is broadcast to every
-- screen (Realtime Broadcast). The bots read the mood and trade on it.
create or replace function public.news(p_symbol text, p_headline text, p_mood text default 'neutral')
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  insert into public.news (symbol, headline, mood) values (upper(p_symbol), p_headline, p_mood) returning news.id into new_id;
  perform realtime.send(
    jsonb_build_object('symbol', upper(p_symbol), 'headline', p_headline, 'mood', p_mood),
    'news', 'floor', false);
  perform public.log_event('news', null, upper(p_symbol), jsonb_build_object('headline', p_headline, 'mood', p_mood));
  return new_id;
end;
$$;

-- Everything the big screen needs in one round trip. Net worth is marked to
-- the last trade price. Individual holdings never leave this function; only
-- each trader's total does, for the leaderboard.
create or replace function public.floor_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with worth as (
    select t.id, t.name, t.kind,
           a.cash_cents + coalesce((
             select sum(p.qty::bigint * s.last_cents) from public.positions p
             join public.stocks s on s.symbol = p.symbol where p.trader_id = t.id
           ), 0) as net_cents
    from public.traders t join public.accounts a on a.trader_id = t.id
  ),
  start as (
    select m.allowance_cents + m.starting_shares * (select sum(open_cents) from public.stocks) as cents
    from public.market m
  ),
  ranked as (
    select net_cents, row_number() over (order by net_cents) i, count(*) over () n from worth
  )
  select jsonb_build_object(
    'market', (select to_jsonb(m) from public.market m),
    'stocks', (select jsonb_agg(to_jsonb(s) order by s.symbol) from public.stocks s),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object('at', at, 'symbol', symbol, 'last_cents', last_cents) order by at), '[]')
      from public.price_samples where at > now() - interval '10 minutes'
    ),
    'tape', (
      select coalesce(jsonb_agg(t order by t.id desc), '[]') from (
        select id, symbol, price_cents, qty, at from public.trades order by id desc limit 30
      ) t
    ),
    'last_minute', (
      select jsonb_build_object('trades', count(*), 'shares', coalesce(sum(qty), 0),
                                'dollars_cents', coalesce(sum(qty::bigint * price_cents), 0))
      from public.trades where at > now() - interval '1 minute'
    ),
    'open_orders', (select count(*) from public.orders where status = 'open'),
    'traders', (select count(*) from public.traders),
    'leaderboard', (
      select coalesce(jsonb_agg(l), '[]') from (
        select w.name, w.kind, w.net_cents,
               round((w.net_cents - st.cents) * 100.0 / nullif(st.cents, 0), 1) as return_pct
        from worth w, start st
        order by w.net_cents desc limit 10
      ) l
    ),
    'gini', (
      select case when sum(net_cents) > 0
        then round(((2.0 * sum(i * net_cents)) / (max(n) * sum(net_cents)) - (max(n) + 1.0) / max(n))::numeric, 3)
        else 0 end
      from ranked
    ),
    'news', (
      select coalesce(jsonb_agg(x order by x.id desc), '[]') from (
        select id, at, symbol, headline, mood from public.news order by id desc limit 6
      ) x
    ),
    'blocked', (
      select coalesce(jsonb_agg(b), '[]') from (
        select detail ->> 'code' code, detail ->> 'attack' attack, count(*) n
        from public.events where kind = 'blocked'
        group by 1, 2 order by n desc
      ) b
    )
  );
$$;

-- Supabase lets anon and authenticated execute new functions by default.
-- Take that away and hand it back one function at a time.
revoke execute on function public.log_event(text, uuid, text, jsonb) from anon, authenticated, public;
revoke execute on function public.open_account() from anon, authenticated, public;
revoke execute on function public.reject(uuid, text, text, jsonb) from anon, authenticated, public;
revoke execute on function public.market_tick() from anon, authenticated, public;
revoke execute on function public.new_session() from anon, authenticated, public;
revoke execute on function public.news(text, text, text) from anon, authenticated, public;
revoke execute on function public.place_order(text, text, text, int, int) from anon, public;
revoke execute on function public.cancel_order(bigint) from anon, public;
revoke execute on function public.order_book(text, int) from anon, public;
revoke execute on function public.floor_stats() from anon, public;

grant execute on function public.place_order(text, text, text, int, int) to authenticated;
grant execute on function public.cancel_order(bigint) to authenticated;
grant execute on function public.order_book(text, int) to authenticated;
grant execute on function public.floor_stats() to authenticated;
