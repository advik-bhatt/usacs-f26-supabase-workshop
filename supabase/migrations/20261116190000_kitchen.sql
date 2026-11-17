-- Dinner Rush: the tables.
--
-- A restaurant that runs entirely inside Postgres. Orders come in on a schedule
-- (pg_cron), wait on a rail (pgmq), and get cooked by whoever grabs them first.
-- Everything that happens is written to public.events so the pass screen can
-- show it, and so you can query it yourself with `supabase db query`.

create extension if not exists pgmq;
create extension if not exists pg_cron with schema pg_catalog;

-- What can go on a pizza. Filled in by supabase/seed.sql.
create table public.toppings (
  slug  text primary key,
  label text not null,
  emoji text not null
);

-- One row per person (or bot) in the kitchen. id is your auth user id.
create table public.cooks (
  id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name      text not null check (char_length(trim(name)) between 1 and 24),
  kind      text not null default 'human' check (kind in ('human', 'bot')),
  joined_at timestamptz not null default now()
);

-- The knobs. There is only ever one row, and the host turns these from the
-- terminal during the workshop:
--   npx supabase db query "update shift set tickets_per_tick = 4"
create table public.shift (
  id               boolean primary key default true check (id),
  open             boolean not null default false,
  tickets_per_tick int not null default 1 check (tickets_per_tick between 0 and 50),
  cook_seconds     int not null default 30 check (cook_seconds between 5 and 600),
  patience_seconds int not null default 120 check (patience_seconds between 10 and 3600),
  updated_at       timestamptz not null default now()
);

insert into public.shift default values;

-- Every order the restaurant has ever taken.
--   waiting    -> on the rail, anyone can grab it
--   cooking    -> someone has it (the queue hides it from everyone else)
--   served     -> made right
--   botched    -> made wrong
--   walked_out -> nobody got to it before the customer gave up
create table public.tickets (
  id         bigint generated always as identity primary key,
  size       text not null check (size in ('S', 'M', 'L')),
  toppings   text[] not null,
  status     text not null default 'waiting'
             check (status in ('waiting', 'cooking', 'served', 'botched', 'walked_out')),
  msg_id     bigint,
  cook_id    uuid references public.cooks (id) on delete set null,
  attempts   int not null default 0,
  placed_at  timestamptz not null default now(),
  claimed_at timestamptz,
  done_at    timestamptz
);

create index tickets_status_idx on public.tickets (status);
create index tickets_cook_id_idx on public.tickets (cook_id);

-- One row per plate that left the kitchen. This is the leaderboard.
create table public.serves (
  id        bigint generated always as identity primary key,
  ticket_id bigint not null unique references public.tickets (id) on delete cascade,
  cook_id   uuid not null references public.cooks (id) on delete cascade,
  score     int not null,
  correct   boolean not null,
  seconds   numeric(6, 1) not null,
  served_at timestamptz not null default now()
);

create index serves_cook_id_idx on public.serves (cook_id);
create index serves_served_at_idx on public.serves (served_at);

-- Tips are yours and nobody else's. RLS makes sure of it.
create table public.tips (
  id         bigint generated always as identity primary key,
  cook_id    uuid not null references public.cooks (id) on delete cascade,
  ticket_id  bigint references public.tickets (id) on delete cascade,
  cents      int not null check (cents >= 0),
  created_at timestamptz not null default now()
);

create index tips_cook_id_idx on public.tips (cook_id);
create index tips_ticket_id_idx on public.tips (ticket_id);

-- The event log. Append only. Every ticket's life is here in order:
-- placed -> claimed -> (dropped -> claimed ...) -> served | botched | walked_out
-- plus 'blocked' rows when somebody tries to cheat and Postgres says no.
create table public.events (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  kind      text not null,
  ticket_id bigint,
  cook_id   uuid,
  detail    jsonb not null default '{}'
);

create index events_at_idx on public.events (at desc);
create index events_ticket_id_idx on public.events (ticket_id);

-- How deep the rail was, every tick. Events tell you what happened; samples
-- tell you how full things were. You want both.
create table public.queue_samples (
  at      timestamptz primary key default now(),
  waiting int not null,
  cooking int not null,
  oldest_seconds int
);
