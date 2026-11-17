-- Runs after the migrations on the first `supabase start` and every
-- `supabase db reset`. Data only, no schema.
--
-- Every company here is made up.

insert into public.stocks (symbol, name, blurb, open_cents, last_cents) values
  ('SLICE', 'Slice Labs',    'Pizza delivered by sidewalk robots',     4200,  4200),
  ('ORBIT', 'Orbit Freight', 'Mining near-Earth asteroids, eventually', 11800, 11800),
  ('BYTE',  'Bytewise',      'Cloud servers in a dorm basement',       7600,  7600),
  ('BREW',  'Midnight Brew', 'Coffee for finals week',                 2350,  2350),
  ('VOLT',  'Volt Scooters', 'E-scooters that are usually charged',     980,   980);

-- The market starts closed. Opening it is the first thing you do on stage:
--   npx supabase db query "update market set open = true"
