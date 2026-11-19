-- Pixel Potluck: the tables.
--
-- A Friendsgiving cooking race. Pick dishes from the menu, walk the grocery
-- store buying ingredients with your allowance, go home, cook. Faster and
-- more accurate means more points; bigger, harder menus mean more points too,
-- if you can pull them off.

create extension if not exists pg_cron with schema pg_catalog;

-- One row per person (or bot). id is your auth user id.
create table public.players (
  id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name      text not null check (char_length(trim(name)) between 1 and 24),
  sprite    int not null default 0 check (sprite between 0 and 7),  -- which pixel character
  kind      text not null default 'human' check (kind in ('human', 'bot')),
  xp        int not null default 0,                                  -- every point you've ever scored
  joined_at timestamptz not null default now()
);

-- The knobs. One row. The host turns these from the terminal:
--   npx supabase db query "update game set open = true"
create table public.game (
  id              boolean primary key default true check (id),
  open            boolean not null default false,
  allowance_cents int not null default 4000 check (allowance_cents between 0 and 100000),
  par_base_s      int not null default 15,   -- par time = base + per ingredient + per cooking step
  par_per_item_s  int not null default 2,
  par_per_step_s  int not null default 2,
  updated_at      timestamptz not null default now()
);

insert into public.game default values;

-- What you can make. stars = difficulty: more stars, more points, more steps.
create table public.recipes (
  slug        text primary key,
  name        text not null,
  stars       int not null check (stars between 1 and 4),
  base_points int not null,
  steps       text[] not null  -- the cooking steps, in order
);

-- What the store sells, and which shelf tile it's on (see src/game/store.ts).
create table public.ingredients (
  slug        text primary key,
  name        text not null,
  price_cents int not null check (price_cents > 0),
  x           int not null,
  y           int not null,
  unique (x, y)
);

create table public.recipe_ingredients (
  recipe     text not null references public.recipes (slug) on delete cascade,
  ingredient text not null references public.ingredients (slug) on delete cascade,
  primary key (recipe, ingredient)
);

create index recipe_ingredients_ingredient_idx on public.recipe_ingredients (ingredient);

-- One trip: menu -> store -> kitchen -> done.
create table public.runs (
  id           bigint generated always as identity primary key,
  player_id    uuid not null references public.players (id) on delete cascade,
  status       text not null default 'shopping' check (status in ('shopping', 'cooking', 'done', 'abandoned')),
  recipes      text[] not null,
  budget_cents int not null,
  spent_cents  int not null default 0 check (spent_cents >= 0),
  started_at   timestamptz not null default now(),
  checkout_at  timestamptz,
  finished_at  timestamptz,
  score        int,
  rating       text,
  result       jsonb
);

create index runs_player_idx on public.runs (player_id);
create index runs_status_idx on public.runs (status);

-- Every item you put in your basket. Yours only.
create table public.purchases (
  id          bigint generated always as identity primary key,
  run_id      bigint not null references public.runs (id) on delete cascade,
  player_id   uuid not null references public.players (id) on delete cascade,
  ingredient  text not null references public.ingredients (slug),
  price_cents int not null,
  at          timestamptz not null default now()
);

create index purchases_run_idx on public.purchases (run_id);
create index purchases_player_idx on public.purchases (player_id);
create index purchases_ingredient_idx on public.purchases (ingredient);

-- What the live dashboard shows about each player right now.
create table public.player_state (
  player_id  uuid primary key references public.players (id) on delete cascade,
  run_id     bigint references public.runs (id) on delete set null,
  phase      text not null default 'menu' check (phase in ('menu', 'shopping', 'cooking', 'done', 'away')),
  location   text not null default 'Menu' check (char_length(location) <= 40),
  updated_at timestamptz not null default now()
);

create index player_state_run_idx on public.player_state (run_id);

-- The event log. Append only.
create table public.events (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  kind      text not null,
  player_id uuid,
  detail    jsonb not null default '{}'
);

create index events_at_idx on public.events (at desc);
