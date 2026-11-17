-- Trading Floor: the tables.
--
-- A stock exchange that runs inside Postgres. Everyone in the room is a
-- trader. You start with cash and some shares, and the only thing that moves
-- a price is a trade: somebody willing to buy meeting somebody willing to sell.
-- The matching engine is one SQL function (place_order, next migration).

create extension if not exists pg_cron with schema pg_catalog;

-- One row per person (or bot). id is your auth user id.
create table public.traders (
  id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name      text not null check (char_length(trim(name)) between 1 and 24),
  kind      text not null default 'human' check (kind in ('human', 'bot')),
  joined_at timestamptz not null default now()
);

-- The knobs. One row. The host turns these from the terminal:
--   npx supabase db query "update market set open = true"
create table public.market (
  id              boolean primary key default true check (id),
  open            boolean not null default false,
  allowance_cents bigint not null default 1000000 check (allowance_cents >= 0),  -- $10,000
  starting_shares int not null default 20 check (starting_shares >= 0),
  breaker_pct     numeric not null default 0.20 check (breaker_pct > 0),          -- halt after a 20% move
  halt_seconds    int not null default 60 check (halt_seconds between 5 and 3600),
  updated_at      timestamptz not null default now()
);

insert into public.market default values;

-- The listed companies. All made up. Filled by supabase/seed.sql.
create table public.stocks (
  symbol       text primary key check (symbol ~ '^[A-Z]{2,6}$'),
  name         text not null,
  blurb        text not null,
  open_cents   int not null check (open_cents > 0),  -- where today's session started
  last_cents   int not null check (last_cents > 0),  -- the last trade. This IS the price.
  volume       bigint not null default 0,
  halted_until timestamptz,
  updated_at   timestamptz not null default now()
);

-- Your cash. reserved_cents is money promised to buy orders still on the book.
create table public.accounts (
  trader_id      uuid primary key references public.traders (id) on delete cascade,
  cash_cents     bigint not null check (cash_cents >= 0),
  reserved_cents bigint not null default 0 check (reserved_cents >= 0 and reserved_cents <= cash_cents)
);

-- Your shares. reserved is shares promised to sell orders still on the book.
create table public.positions (
  trader_id uuid not null references public.traders (id) on delete cascade,
  symbol    text not null references public.stocks (symbol) on delete cascade,
  qty       int not null check (qty >= 0),
  reserved  int not null default 0 check (reserved >= 0 and reserved <= qty),
  primary key (trader_id, symbol)
);

create index positions_symbol_idx on public.positions (symbol);

-- Every order ever placed.
--   limit:  "buy 10 at $42.00 or better". Whatever doesn't fill waits on the book.
--   market: "buy 10 at whatever it costs right now". Whatever doesn't fill is cancelled.
create table public.orders (
  id          bigint generated always as identity primary key,
  trader_id   uuid not null references public.traders (id) on delete cascade,
  symbol      text not null references public.stocks (symbol) on delete cascade,
  side        text not null check (side in ('buy', 'sell')),
  kind        text not null check (kind in ('limit', 'market')),
  qty         int not null check (qty > 0),
  filled      int not null default 0 check (filled >= 0 and filled <= qty),
  limit_cents int check (limit_cents > 0),
  status      text not null default 'open' check (status in ('open', 'filled', 'cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check ((kind = 'limit') = (limit_cents is not null))
);

-- the book: open orders for a symbol, best price first, oldest first
create index orders_book_idx on public.orders (symbol, side, limit_cents, id) where status = 'open';
create index orders_trader_idx on public.orders (trader_id);

-- The tape: every trade, public, anonymous. Who traded is not on it.
create table public.trades (
  id          bigint generated always as identity primary key,
  symbol      text not null references public.stocks (symbol) on delete cascade,
  price_cents int not null,
  qty         int not null,
  at          timestamptz not null default now()
);

create index trades_symbol_at_idx on public.trades (symbol, at desc);

-- Your side of each trade. Private.
create table public.fills (
  id          bigint generated always as identity primary key,
  trade_id    bigint not null references public.trades (id) on delete cascade,
  order_id    bigint not null references public.orders (id) on delete cascade,
  trader_id   uuid not null references public.traders (id) on delete cascade,
  symbol      text not null,
  side        text not null,
  price_cents int not null,
  qty         int not null,
  at          timestamptz not null default now()
);

create index fills_trader_idx on public.fills (trader_id);
create index fills_trade_idx on public.fills (trade_id);
create index fills_order_idx on public.fills (order_id);

-- Headlines the host drops on the market.
create table public.news (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  symbol   text references public.stocks (symbol) on delete cascade,  -- null = the whole market
  headline text not null,
  mood     text not null default 'neutral' check (mood in ('good', 'bad', 'neutral'))
);

create index news_symbol_idx on public.news (symbol);

-- Every stock's price every 10 seconds, for the charts.
create table public.price_samples (
  at         timestamptz not null default now(),
  symbol     text not null references public.stocks (symbol) on delete cascade,
  last_cents int not null,
  primary key (at, symbol)
);

create index price_samples_symbol_idx on public.price_samples (symbol);

-- The event log. Append only: orders, fills, halts, news, and 'blocked'
-- rows when somebody tries to cheat and Postgres says no.
create table public.events (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  kind      text not null,
  trader_id uuid,
  symbol    text,
  detail    jsonb not null default '{}'
);

create index events_at_idx on public.events (at desc);
