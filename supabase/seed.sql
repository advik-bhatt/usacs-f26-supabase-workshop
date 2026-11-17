-- Runs after the migrations on `supabase start` (first time) and every
-- `supabase db reset`. Data only, no schema.

-- base_cents is where a price settles when nobody's buying
insert into public.toppings (slug, label, emoji, base_cents, price_cents) values
  ('cheese',    'Extra cheese', '🧀', 40, 40),
  ('pepperoni', 'Pepperoni',    '🍕', 80, 80),
  ('mushroom',  'Mushrooms',    '🍄', 60, 60),
  ('pepper',    'Peppers',      '🫑', 50, 50),
  ('olive',     'Olives',       '🫒', 70, 70),
  ('onion',     'Onions',       '🧅', 30, 30),
  ('pineapple', 'Pineapple',    '🍍', 90, 90),
  ('basil',     'Basil',        '🌿', 60, 60);

-- The kitchen starts closed. Opening it is the first thing you do on stage:
--   npx supabase db query "update shift set open = true"
