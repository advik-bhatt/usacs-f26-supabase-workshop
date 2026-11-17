-- Planetary defense: the tables.
--
-- Real near-Earth asteroids from NASA/JPL go up on a board (a pgmq queue),
-- a few at a time, on a schedule (pg_cron). Each one is a drill: assume it's
-- going to hit Earth at its real close approach, and design a kinetic
-- impactor mission that pushes it off course. The physics runs in the
-- browser to preview and in an Edge Function to grade.
--
-- Everything that happens is written to public.events, so mission control can
-- show it and you can query it with `supabase db query`.

create extension if not exists pgmq;
create extension if not exists pg_cron with schema pg_catalog;

-- Asteroids and their orbits, from JPL. Filled by supabase/seed.sql
-- (regenerate with `npm run nasa:fetch`).
create table public.asteroids (
  des               text primary key,         -- JPL designation, e.g. 99942
  name              text not null,
  ca_jd             double precision not null, -- close approach, Julian date
  ca_date           text not null,             -- same, as JPL writes it
  ca_dist_au        double precision not null, -- how close it really passes
  v_inf_kms         double precision not null, -- speed relative to Earth
  h                 double precision not null, -- absolute magnitude (brightness)
  diameter_km       double precision not null,
  diameter_measured boolean not null default false,
  pha               boolean not null default false, -- "potentially hazardous"
  -- osculating orbital elements at epoch
  epoch double precision not null,
  a     double precision not null,
  e     double precision not null,
  i     double precision not null,
  om    double precision not null,
  w     double precision not null,
  ma    double precision not null,
  fetched_at timestamptz not null default now()
);

-- One row per person (or bot) on the team. id is your auth user id.
create table public.crew (
  id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name      text not null check (char_length(trim(name)) between 1 and 24),
  kind      text not null default 'human' check (kind in ('human', 'bot')),
  joined_at timestamptz not null default now()
);

-- The knobs. One row. The host turns these from the terminal:
--   npx supabase db query "update mission set targets_per_tick = 3"
create table public.mission (
  id               boolean primary key default true check (id),
  open             boolean not null default false,
  targets_per_tick int not null default 1 check (targets_per_tick between 0 and 50),
  work_seconds     int not null default 90 check (work_seconds between 10 and 1800),
  window_seconds   int not null default 300 check (window_seconds between 30 and 7200),
  updated_at       timestamptz not null default now()
);

insert into public.mission default values;

-- Every drill posted to the board.
--   waiting  -> on the board, anyone can take it
--   working  -> someone has it (the queue hides it from everyone else)
--   saved    -> the impactor pushed it clear of Earth
--   impact   -> it didn't
--   expired  -> nobody took it before the window closed
create table public.targets (
  id         bigint generated always as identity primary key,
  des        text not null references public.asteroids (des) on delete cascade,
  status     text not null default 'waiting'
             check (status in ('waiting', 'working', 'saved', 'impact', 'expired')),
  msg_id     bigint,
  crew_id    uuid references public.crew (id) on delete set null,
  attempts   int not null default 0,
  posted_at  timestamptz not null default now(),
  claimed_at timestamptz,
  done_at    timestamptz
);

create index targets_status_idx on public.targets (status);
create index targets_crew_id_idx on public.targets (crew_id);
create index targets_des_idx on public.targets (des);

-- One row per mission flown. This is the leaderboard.
create table public.deflections (
  id         bigint generated always as identity primary key,
  target_id  bigint not null unique references public.targets (id) on delete cascade,
  crew_id    uuid not null references public.crew (id) on delete cascade,
  lead_days  double precision not null,
  mass_kg    double precision not null,
  direction  text not null,
  dv_ms      double precision not null,  -- velocity change delivered, m/s
  miss_km    double precision not null,  -- closest approach to Earth's center
  capture_km double precision not null,  -- inside this, it hits
  saved      boolean not null,
  score      int not null,
  seconds    numeric(7, 1) not null,     -- how long the design took
  flown_at   timestamptz not null default now()
);

create index deflections_crew_id_idx on public.deflections (crew_id);
create index deflections_flown_at_idx on public.deflections (flown_at);

-- Mission credits. Yours and nobody else's; RLS makes sure of it.
create table public.credits (
  id         bigint generated always as identity primary key,
  crew_id    uuid not null references public.crew (id) on delete cascade,
  target_id  bigint references public.targets (id) on delete cascade,
  amount     int not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index credits_crew_id_idx on public.credits (crew_id);
create index credits_target_id_idx on public.credits (target_id);

-- The event log. Append only. Every target's life is here in order:
-- posted -> claimed -> (dropped -> claimed ...) -> saved | impact | expired
-- plus 'blocked' rows when somebody tries to cheat and Postgres says no.
create table public.events (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  kind      text not null,
  target_id bigint,
  crew_id   uuid,
  detail    jsonb not null default '{}'
);

create index events_at_idx on public.events (at desc);
create index events_target_id_idx on public.events (target_id);

-- How full the board was, every tick. Events say what happened; samples say
-- how busy it was. You want both.
create table public.queue_samples (
  at             timestamptz primary key default now(),
  waiting        int not null,
  working        int not null,
  oldest_seconds int
);
