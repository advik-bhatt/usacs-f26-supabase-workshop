-- The game, as functions. Every change to a run happens here, checked, in
-- one transaction. Refusals come back as { "error": "..." } instead of
-- exceptions, so the event that records them isn't rolled back, and every
-- message is friendly: this game never tells you you're bad at it.

create or replace function public.log_event(p_kind text, p_player uuid default null, p_detail jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.events (kind, player_id, detail) values (p_kind, p_player, coalesce(p_detail, '{}'));
$$;

-- New players get a row on the live dashboard straight away.
create or replace function public.open_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.player_state (player_id) values (new.id);
  perform public.log_event('joined', new.id, jsonb_build_object('name', new.name));
  return new;
end;
$$;

create trigger players_open_player
  after insert on public.players
  for each row execute function public.open_player();

-- What a menu costs if you buy exactly what the recipes need.
create or replace function public.menu_cost_cents(p_recipes text[])
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(i.price_cents), 0)::int
  from unnest(p_recipes) as r(slug)
  join public.recipe_ingredients ri on ri.recipe = r.slug
  join public.ingredients i on i.slug = ri.ingredient;
$$;

-- Pick your dishes and go. The timer starts now.
create or replace function public.start_run(p_recipes text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  g public.game;
  picked text[];
  cost int;
  new_id bigint;
begin
  if me is null then raise exception 'sign in first' using errcode = '28000'; end if;
  if not exists (select 1 from public.players where id = me) then
    return jsonb_build_object('error', 'Pick a name first!');
  end if;
  select * into g from public.game;
  if not g.open then
    return jsonb_build_object('error', 'The store opens in a minute. Hang tight!');
  end if;

  select array_agg(distinct r) into picked from unnest(p_recipes) r where r in (select slug from public.recipes);
  if picked is null then
    return jsonb_build_object('error', 'Pick at least one dish!');
  end if;

  cost := public.menu_cost_cents(picked);
  if cost > g.allowance_cents then
    return jsonb_build_object('error', format('That menu costs about $%s and your allowance is $%s. Swap one dish!',
      to_char(cost / 100.0, 'FM990.00'), to_char(g.allowance_cents / 100.0, 'FM990.00')));
  end if;

  -- one trip at a time
  update public.runs set status = 'abandoned' where player_id = me and status in ('shopping', 'cooking');

  insert into public.runs (player_id, recipes, budget_cents) values (me, picked, g.allowance_cents)
  returning id into new_id;

  update public.player_state
  set run_id = new_id, phase = 'shopping', location = 'Front of store', updated_at = now()
  where player_id = me;

  perform public.log_event('started', me, jsonb_build_object('run_id', new_id, 'recipes', picked, 'cost_cents', cost));
  return jsonb_build_object('run_id', new_id, 'budget_cents', g.allowance_cents, 'started_at', now());
end;
$$;

-- Put something in your basket.
create or replace function public.buy(p_run bigint, p_ingredient text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r public.runs;
  price int;
begin
  select * into r from public.runs where id = p_run and player_id = me for update;
  if not found or r.status <> 'shopping' then
    return jsonb_build_object('error', 'This trip is over. Start a new one from the menu!');
  end if;
  select price_cents into price from public.ingredients where slug = p_ingredient;
  if price is null then
    return jsonb_build_object('error', 'Hmm, the store doesn''t sell that.');
  end if;
  if r.spent_cents + price > r.budget_cents then
    return jsonb_build_object('error', 'Your wallet''s empty! That''s OK: head home and cook what you''ve got.');
  end if;

  insert into public.purchases (run_id, player_id, ingredient, price_cents) values (p_run, me, p_ingredient, price);
  update public.runs set spent_cents = spent_cents + price where id = p_run returning * into r;

  return jsonb_build_object('spent_cents', r.spent_cents, 'left_cents', r.budget_cents - r.spent_cents);
end;
$$;

-- Leave the store. Shopping's over, cooking starts.
create or replace function public.head_home(p_run bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r public.runs;
begin
  update public.runs set status = 'cooking', checkout_at = now()
  where id = p_run and player_id = me and status = 'shopping'
  returning * into r;
  if not found then
    return jsonb_build_object('error', 'This trip is over. Start a new one from the menu!');
  end if;
  update public.player_state set phase = 'cooking', location = 'Kitchen', updated_at = now() where player_id = me;
  perform public.log_event('home', me, jsonb_build_object('run_id', p_run, 'spent_cents', r.spent_cents));
  return jsonb_build_object('ok', true);
end;
$$;

-- Which dishes can you actually make from what's in your basket? Each
-- ingredient you bought can go into one dish. Shared by finish_run and the
-- kitchen screen.
create or replace function public.cookable(p_run bigint)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.runs;
  have jsonb;
  dish text;
  need text[];
  ok boolean;
  i text;
  out text[] := '{}';
begin
  select * into r from public.runs where id = p_run;
  if not found or r.player_id is distinct from auth.uid() then return '{}'; end if;

  select coalesce(jsonb_object_agg(ingredient, n), '{}') into have
  from (select ingredient, count(*) n from public.purchases where run_id = p_run group by ingredient) b;

  foreach dish in array r.recipes loop
    select array_agg(ingredient) into need from public.recipe_ingredients where recipe = dish;
    ok := true;
    foreach i in array need loop
      if coalesce((have ->> i)::int, 0) < 1 then ok := false; end if;
    end loop;
    if ok then
      foreach i in array need loop
        have := jsonb_set(have, array[i], to_jsonb((have ->> i)::int - 1));
      end loop;
      out := out || dish;
    end if;
  end loop;
  return out;
end;
$$;

-- Done cooking. The server works out the score:
--   points per dish = base points x (0.5 + 0.5 x how accurately you cooked it)
--   x a speed bonus from 0.6 (slow) to 1.5 (fast), against a par time that
--   grows with how much you set out to make.
-- The cooking accuracy comes from your browser, so it's clamped, and the
-- server checks you actually spent long enough in the kitchen.
create or replace function public.finish_run(p_run bigint, p_accuracy jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r public.runs;
  g public.game;
  dishes text[];
  dish text;
  rec public.recipes;
  acc numeric;
  steps_cooked int := 0;
  items int;
  steps_planned int;
  par numeric;
  secs numeric;
  speed numeric;
  points numeric := 0;
  acc_sum numeric := 0;
  v_dishes jsonb := '[]';
  total int;
  avg_acc numeric;
  v_rating text;
begin
  select * into r from public.runs where id = p_run and player_id = me for update;
  if not found or r.status <> 'cooking' then
    return jsonb_build_object('error', 'This trip is over. Start a new one from the menu!');
  end if;
  select * into g from public.game;

  dishes := public.cookable(p_run);
  select coalesce(sum(array_length(steps, 1)), 0) into steps_cooked from public.recipes where slug = any (dishes);

  -- clock_timestamp(), not now(): now() is frozen for the whole transaction
  if extract(epoch from clock_timestamp() - r.checkout_at) < steps_cooked * 0.6 then
    perform public.log_event('too_fast', me, jsonb_build_object('run_id', p_run));
    return jsonb_build_object('error', 'Whoa, faster than any oven! Give the food a moment to cook.');
  end if;

  select count(*) into items from unnest(r.recipes) d join public.recipe_ingredients ri on ri.recipe = d;
  select coalesce(sum(array_length(steps, 1)), 0) into steps_planned from public.recipes where slug = any (r.recipes);
  par := g.par_base_s + g.par_per_item_s * items + g.par_per_step_s * steps_planned;
  secs := extract(epoch from clock_timestamp() - r.started_at);
  -- beat par and you earn up to double; take your time and you still keep 60%
  speed := least(2.0, greatest(0.6, par / greatest(secs, 1)));

  foreach dish in array dishes loop
    select * into rec from public.recipes where slug = dish;
    acc := least(1, greatest(0.45, coalesce((p_accuracy ->> dish)::numeric, 0.45)));
    points := points + rec.base_points * (0.5 + 0.5 * acc);
    acc_sum := acc_sum + acc;
    v_dishes := v_dishes || jsonb_build_object(
      'recipe', dish, 'name', rec.name, 'accuracy', round(acc, 2),
      'points', round(rec.base_points * (0.5 + 0.5 * acc) * speed),
      'grade', case when acc >= 0.9 then 'Super!' when acc >= 0.75 then 'Great!' when acc >= 0.58 then 'Good' else 'OK' end);
  end loop;

  total := round(points * speed);
  avg_acc := case when array_length(dishes, 1) > 0 then acc_sum / array_length(dishes, 1) else 0 end;
  v_rating := case
    when array_length(dishes, 1) is null then 'OK'
    when avg_acc >= 0.9 and speed >= 1.1 then 'Super!'
    when avg_acc >= 0.75 then 'Great!'
    when avg_acc >= 0.58 then 'Good'
    else 'OK' end;

  update public.runs
  set status = 'done', finished_at = clock_timestamp(), score = total, rating = v_rating,
      result = jsonb_build_object('dishes', v_dishes, 'speed', round(speed, 2), 'seconds', round(secs),
                                  'par', round(par), 'missed', (select coalesce(array_agg(x), '{}') from unnest(r.recipes) x where x <> all (dishes)))
  where id = p_run
  returning * into r;

  update public.players set xp = xp + total where id = me;
  update public.player_state set phase = 'done', location = 'Done!', updated_at = now() where player_id = me;
  perform public.log_event('finished', me, jsonb_build_object(
    'run_id', p_run, 'score', total, 'rating', v_rating, 'dishes', array_length(dishes, 1), 'seconds', round(secs)));

  return jsonb_build_object('score', total, 'rating', v_rating, 'result', r.result, 'spent_cents', r.spent_cents,
                            'budget_cents', r.budget_cents);
end;
$$;

-- Back to the menu after a trip.
create or replace function public.back_to_menu()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.player_state set phase = 'menu', location = 'Menu', run_id = null, updated_at = now()
  where player_id = auth.uid();
$$;

-- Everything the live dashboard needs, in one round trip.
create or replace function public.dashboard()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'game', (select to_jsonb(g) from public.game g),
    'players', (
      select coalesce(jsonb_agg(p order by p.phase_order, p.started_at nulls last), '[]') from (
        select pl.id, pl.name, pl.sprite, pl.kind, pl.xp, pl.avatar_path,
               1 + floor(sqrt(pl.xp / 150.0))::int as level,
               s.phase, s.location, s.updated_at,
               r.started_at, r.checkout_at, r.finished_at, r.recipes, r.spent_cents, r.budget_cents,
               r.score, r.rating,
               case s.phase when 'shopping' then 1 when 'cooking' then 2 when 'done' then 3 when 'menu' then 4 else 5 end as phase_order
        from public.players pl
        join public.player_state s on s.player_id = pl.id
        left join public.runs r on r.id = s.run_id
        where s.updated_at > now() - interval '30 minutes'
      ) p
    ),
    'leaderboard', (
      -- best run per person (distinct on), then ranked by score
      select coalesce(jsonb_agg(b order by b.score desc), '[]') from (
        select distinct on (pl.id) pl.name, pl.sprite, pl.kind, r.score, r.rating,
               jsonb_array_length(r.result -> 'dishes') as dishes, round(extract(epoch from r.finished_at - r.started_at)) as seconds,
               1 + floor(sqrt(pl.xp / 150.0))::int as level
        from public.runs r join public.players pl on pl.id = r.player_id
        where r.status = 'done'
        order by pl.id, r.score desc
      ) b
    ),
    'feed', (
      select coalesce(jsonb_agg(f order by f.id desc), '[]') from (
        select e.id, e.at, e.kind, e.detail, pl.name, pl.sprite
        from public.events e left join public.players pl on pl.id = e.player_id
        order by e.id desc limit 25
      ) f
    ),
    'blocked', (
      select coalesce(jsonb_agg(b), '[]') from (
        select detail ->> 'attack' attack, detail ->> 'code' code, count(*) n
        from public.events where kind = 'blocked' group by 1, 2 order by 3 desc
      ) b
    )
  );
$$;

-- Runs every minute: trips nobody has touched in 20 minutes are abandoned,
-- and players who wandered off show as "away".
create or replace function public.tidy_up()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.runs set status = 'abandoned'
  where status in ('shopping', 'cooking') and started_at < now() - interval '20 minutes';
  update public.player_state set phase = 'away', location = 'Away'
  where phase in ('shopping', 'cooking') and updated_at < now() - interval '10 minutes';
$$;

-- Say something to every screen:
--   npx supabase db query "select announce('Pie is the secret weapon tonight')"
create or replace function public.announce(p_text text)
returns void
language sql
security definer
set search_path = ''
as $$
  select realtime.send(jsonb_build_object('text', p_text), 'announce', 'potluck', false);
$$;

revoke execute on function public.log_event(text, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.open_player() from anon, authenticated, public;
revoke execute on function public.tidy_up() from anon, authenticated, public;
revoke execute on function public.announce(text) from anon, authenticated, public;
revoke execute on function public.menu_cost_cents(text[]) from anon, public;
revoke execute on function public.start_run(text[]) from anon, public;
revoke execute on function public.buy(bigint, text) from anon, public;
revoke execute on function public.head_home(bigint) from anon, public;
revoke execute on function public.cookable(bigint) from anon, public;
revoke execute on function public.finish_run(bigint, jsonb) from anon, public;
revoke execute on function public.back_to_menu() from anon, public;
revoke execute on function public.dashboard() from anon, public;

grant execute on function public.menu_cost_cents(text[]) to authenticated;
grant execute on function public.start_run(text[]) to authenticated;
grant execute on function public.buy(bigint, text) to authenticated;
grant execute on function public.head_home(bigint) to authenticated;
grant execute on function public.cookable(bigint) to authenticated;
grant execute on function public.finish_run(bigint, jsonb) to authenticated;
grant execute on function public.back_to_menu() to authenticated;
grant execute on function public.dashboard() to authenticated;
