-- Push changes to screens, and keep the floor ticking.

-- Postgres Changes. RLS is checked per subscriber, so when you subscribe to
-- orders and fills you only ever hear about your own.
alter publication supabase_realtime add table public.stocks;
alter publication supabase_realtime add table public.trades;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.fills;
alter publication supabase_realtime add table public.news;
alter publication supabase_realtime add table public.market;

select cron.schedule('market-tick', '10 seconds', $$ select public.market_tick() $$);

select cron.schedule('trim-history', '17 * * * *', $$
  delete from public.events where at < now() - interval '1 day';
  delete from public.price_samples where at < now() - interval '1 day';
$$);
