-- Who can do what.
--
--   1. Grants: can this role touch the table at all? No grant -> 42501.
--   2. Row Level Security: which rows? Reads no policy allows come back as [];
--      writes no policy allows -> "new row violates row-level security policy".
--
-- The menu, the store and everyone's progress are public (it's a party).
-- Your basket is yours. And nobody writes a score: every change to a run goes
-- through start_run(), buy(), head_home() and finish_run(), which check it.

alter table public.players            enable row level security;
alter table public.game               enable row level security;
alter table public.recipes            enable row level security;
alter table public.ingredients        enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.runs               enable row level security;
alter table public.purchases          enable row level security;
alter table public.player_state       enable row level security;
alter table public.events             enable row level security;

revoke all on public.players, public.game, public.recipes, public.ingredients, public.recipe_ingredients,
              public.runs, public.purchases, public.player_state, public.events
  from anon, authenticated;

grant select on public.players, public.game, public.recipes, public.ingredients, public.recipe_ingredients,
                public.runs, public.purchases, public.player_state, public.events
  to authenticated;

grant insert on public.players to authenticated;
grant update (name, sprite) on public.players to authenticated;
grant update (location) on public.player_state to authenticated;  -- where you're standing, nothing else
grant insert on public.events to authenticated;

create policy "everyone can see who's here" on public.players for select to authenticated using (true);
create policy "you can only join as yourself" on public.players for insert to authenticated
  with check ((select auth.uid()) = id and xp = 0);
create policy "you can only change yourself" on public.players for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "the rules are public" on public.game for select to authenticated using (true);
create policy "the menu is public" on public.recipes for select to authenticated using (true);
create policy "the store is public" on public.ingredients for select to authenticated using (true);
create policy "recipes are public" on public.recipe_ingredients for select to authenticated using (true);

create policy "everyone can watch the race" on public.runs for select to authenticated using (true);
create policy "your basket is yours" on public.purchases for select to authenticated
  using ((select auth.uid()) = player_id);

create policy "everyone can see where everyone is" on public.player_state for select to authenticated using (true);
create policy "you can only move yourself" on public.player_state for update to authenticated
  using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);

create policy "everyone can read the event log" on public.events for select to authenticated using (true);
create policy "you can report your own blocked attempts, nothing else" on public.events
  for insert to authenticated
  with check (kind = 'blocked' and player_id = (select auth.uid()));
