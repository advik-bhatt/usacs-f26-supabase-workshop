-- Push changes to screens, and keep the kitchen ticking.

-- Postgres Changes: anything inserted into these tables gets pushed to every
-- subscribed browser (RLS is checked per subscriber).
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.shift;

-- pg_cron can run every N seconds, not just every minute.
select cron.schedule('kitchen-tick', '10 seconds', $$ select public.kitchen_tick() $$);

-- The event log grows fast with a full room. Keep a day of it.
select cron.schedule('trim-events', '17 * * * *', $$
  delete from public.events where at < now() - interval '1 day';
  delete from public.queue_samples where at < now() - interval '1 day';
$$);
