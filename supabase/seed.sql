-- Runs after the migrations on `supabase start` (first time) and every
-- `supabase db reset`. Data only, no schema.

insert into public.toppings (slug, label, emoji) values
  ('cheese',    'Extra cheese', '🧀'),
  ('pepperoni', 'Pepperoni',    '🍕'),
  ('mushroom',  'Mushrooms',    '🍄'),
  ('pepper',    'Peppers',      '🫑'),
  ('olive',     'Olives',       '🫒'),
  ('onion',     'Onions',       '🧅'),
  ('pineapple', 'Pineapple',    '🍍'),
  ('basil',     'Basil',        '🌿');

-- The kitchen starts closed. Opening it is the first thing you do on stage:
--   npx supabase db query "update shift set open = true"
