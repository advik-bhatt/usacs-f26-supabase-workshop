-- Push changes to screens, and keep things tidy.

-- Postgres Changes: phones hear the moment the host opens the store or changes
-- the allowance (game). events and player_state are published too, so you can
-- subscribe to them in a lab instead of polling dashboard().
-- Positions in the store are NOT here: they change several times a second, so
-- they go over Realtime Broadcast instead (never stored, see StoreView.tsx).
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.player_state;
alter publication supabase_realtime add table public.game;

select cron.schedule('tidy-up', '* * * * *', $$ select public.tidy_up() $$);

select cron.schedule('trim-events', '17 * * * *', $$
  delete from public.events where at < now() - interval '2 days';
$$);
