-- Runs after the migrations on the first `supabase start` and every
-- `supabase db reset`. Data only, no schema.

-- The store. x/y is the shelf tile (see src/game/store.ts for the room).
insert into public.ingredients (slug, name, price_cents, x, y) values
  -- Produce (x = 3)
  ('cranberries',  'Cranberries',     250, 3, 2),
  ('orange',       'Orange',          100, 3, 3),
  ('potatoes',     'Potatoes',        200, 3, 4),
  ('green-beans',  'Green beans',     200, 3, 5),
  ('onions',       'Onions',          100, 3, 6),
  ('celery',       'Celery',          150, 3, 7),
  ('pumpkin',      'Pumpkin',         300, 3, 9),
  -- Dairy & Eggs (x = 7)
  ('butter',       'Butter',          250, 7, 3),
  ('milk',         'Milk',            200, 7, 5),
  ('eggs',         'Eggs',            250, 7, 7),
  ('cheese',       'Cheese',          350, 7, 9),
  -- Bakery (x = 11)
  ('cornmeal',     'Cornmeal',        200, 11, 3),
  ('bread',        'Bread',           200, 11, 6),
  ('pie-crust',    'Pie crust',       300, 11, 9),
  -- Pantry (x = 15)
  ('sugar',        'Sugar',           150, 15, 3),
  ('mushroom-soup','Mushroom soup',   150, 15, 5),
  ('fried-onions', 'Crispy onions',   200, 15, 7),
  ('pasta',        'Macaroni',        150, 15, 9),
  -- Meat & Spices (x = 19)
  ('turkey',       'Turkey',         1200, 19, 3),
  ('sage',         'Sage',            150, 19, 5),
  ('cinnamon',     'Cinnamon',        150, 19, 7),
  ('salt',         'Salt',             50, 19, 9);

-- The menu. More stars: more ingredients to find, more cooking steps, more points.
insert into public.recipes (slug, name, stars, base_points, steps) values
  ('cranberry-sauce',  'Cranberry Sauce',      1, 100, '{Rinse, Simmer}'),
  ('mashed-potatoes',  'Mashed Potatoes',      1, 100, '{Boil, Mash}'),
  ('cornbread',        'Cornbread',            1, 110, '{Mix, Bake}'),
  ('green-bean-bake',  'Green Bean Casserole', 2, 220, '{Snap, Mix, Bake}'),
  ('mac-and-cheese',   'Mac & Cheese',         2, 230, '{Boil, Melt, Stir}'),
  ('stuffing',         'Stuffing',             2, 240, '{Chop, Toss, Bake}'),
  ('pumpkin-pie',      'Pumpkin Pie',          3, 380, '{Whisk, Pour, Crimp, Bake}'),
  ('roast-turkey',     'Roast Turkey',         4, 620, '{Season, Stuff, Baste, Roast, Carve}');

insert into public.recipe_ingredients (recipe, ingredient) values
  ('cranberry-sauce', 'cranberries'), ('cranberry-sauce', 'sugar'), ('cranberry-sauce', 'orange'),
  ('mashed-potatoes', 'potatoes'), ('mashed-potatoes', 'butter'), ('mashed-potatoes', 'milk'),
  ('cornbread', 'cornmeal'), ('cornbread', 'eggs'), ('cornbread', 'milk'),
  ('green-bean-bake', 'green-beans'), ('green-bean-bake', 'mushroom-soup'), ('green-bean-bake', 'fried-onions'), ('green-bean-bake', 'milk'),
  ('mac-and-cheese', 'pasta'), ('mac-and-cheese', 'cheese'), ('mac-and-cheese', 'milk'), ('mac-and-cheese', 'butter'),
  ('stuffing', 'bread'), ('stuffing', 'celery'), ('stuffing', 'onions'), ('stuffing', 'butter'), ('stuffing', 'sage'),
  ('pumpkin-pie', 'pumpkin'), ('pumpkin-pie', 'pie-crust'), ('pumpkin-pie', 'eggs'), ('pumpkin-pie', 'sugar'), ('pumpkin-pie', 'cinnamon'),
  ('roast-turkey', 'turkey'), ('roast-turkey', 'butter'), ('roast-turkey', 'sage'), ('roast-turkey', 'onions'), ('roast-turkey', 'celery'), ('roast-turkey', 'salt');

-- The store starts closed. Opening it is the first thing you do on stage:
--   npx supabase db query "update game set open = true"
