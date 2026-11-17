-- The rail: a pgmq queue plus the functions that move tickets along it.
--
-- pgmq gives us the one thing a kitchen (or a pool of AI agents) needs from a
-- queue: when you read a message it becomes invisible to everyone else for a
-- while (the "visibility timeout"). Finish in time and you delete it. Take too
-- long and it quietly reappears for the next person. Nobody double-cooks.

select pgmq.create('tickets');

create or replace function public.log_event(
  p_kind text,
  p_ticket bigint default null,
  p_cook uuid default null,
  p_detail jsonb default '{}'
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.events (kind, ticket_id, cook_id, detail)
  values (p_kind, p_ticket, p_cook, coalesce(p_detail, '{}'));
$$;

-- Put new orders on the rail. Called by the cron tick, or by hand:
--   npx supabase db query "select place_orders(10)"
create or replace function public.place_orders(p_count int default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.shift;
  n int;
  picked text[];
  new_id bigint;
  new_msg bigint;
  new_size text;
begin
  select * into s from public.shift;
  n := coalesce(p_count, case when s.open then s.tickets_per_tick else 0 end);

  for i in 1..n loop
    select array_agg(slug order by slug) into picked
    from (
      select slug from public.toppings order by random() limit 1 + floor(random() * 3)::int
    ) t;

    if picked is null then
      raise exception 'no toppings on the menu. Did you run the seed? (npx supabase db reset)';
    end if;

    new_size := (array['S', 'M', 'L'])[1 + floor(random() * 3)::int];

    insert into public.tickets (size, toppings)
    values (new_size, picked)
    returning id into new_id;

    select * into new_msg from pgmq.send('tickets', jsonb_build_object('ticket_id', new_id));
    update public.tickets set msg_id = new_msg where id = new_id;

    perform public.log_event('placed', new_id, null,
      jsonb_build_object('size', new_size, 'toppings', picked));
  end loop;

  return n;
end;
$$;

-- Grab the next ticket off the rail. If you already have one going, you get
-- that one back instead of a second one.
create or replace function public.grab_ticket()
returns setof public.tickets
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.shift;
  m record;
  t public.tickets;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if not exists (select 1 from public.cooks where id = me) then
    raise exception 'join the kitchen first';
  end if;

  select * into s from public.shift;

  return query
    select * from public.tickets
    where cook_id = me
      and status = 'cooking'
      and claimed_at > now() - make_interval(secs => s.cook_seconds)
    limit 1;
  if found then
    return;
  end if;

  -- read one message and hide it from everyone else for cook_seconds
  select * into m from pgmq.read('tickets', s.cook_seconds, 1);
  if not found then
    return;  -- empty rail
  end if;

  select * into t from public.tickets
  where id = (m.message ->> 'ticket_id')::bigint
  for update;

  if t.status not in ('waiting', 'cooking') then
    -- stale message for a ticket that's already finished; tidy up
    perform pgmq.archive('tickets', m.msg_id);
    return;
  end if;

  if t.status = 'cooking' and t.cook_id is distinct from me then
    -- the last cook ran out of time and the queue handed it to us
    perform public.log_event('dropped', t.id, t.cook_id, '{"why": "visibility timeout"}');
  end if;

  update public.tickets
  set status = 'cooking', cook_id = me, claimed_at = now(), attempts = m.read_ct
  where id = t.id
  returning * into t;

  perform public.log_event('claimed', t.id, me, jsonb_build_object(
    'attempt', m.read_ct,
    'waited_seconds', round(extract(epoch from now() - t.placed_at)::numeric, 1)
  ));

  return next t;
end;
$$;

-- Finish a ticket. Only the `serve` Edge Function calls this, with the secret
-- key, after it has graded the pizza. The browser can't call it directly.
create or replace function public.finish_ticket(
  p_cook uuid,
  p_ticket bigint,
  p_correct boolean,
  p_score int,
  p_tip_cents int,
  p_detail jsonb default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tickets;
  s public.shift;
  secs numeric;
  outcome text := case when p_correct then 'served' else 'botched' end;
begin
  select * into s from public.shift;
  select * into t from public.tickets where id = p_ticket for update;

  if not found then
    raise exception 'ticket % does not exist', p_ticket using errcode = 'P0002';
  end if;

  if t.status in ('served', 'botched', 'walked_out') then
    raise exception 'ticket #% is already done (%)', p_ticket, t.status using errcode = 'P0001';
  end if;

  if t.status <> 'cooking'
     or t.cook_id is distinct from p_cook
     or t.claimed_at < now() - make_interval(secs => s.cook_seconds) then
    perform public.log_event('late', t.id, p_cook, jsonb_build_object('status_now', t.status));
    raise exception 'too slow, ticket #% went back on the rail', p_ticket
      using errcode = 'P0001',
            hint = 'you have shift.cook_seconds to finish before the queue gives it to someone else';
  end if;

  secs := round(extract(epoch from now() - t.claimed_at)::numeric, 1);

  perform pgmq.archive('tickets', t.msg_id);

  update public.tickets set status = outcome, done_at = now() where id = t.id;

  insert into public.serves (ticket_id, cook_id, score, correct, seconds)
  values (t.id, p_cook, p_score, p_correct, secs);

  if p_tip_cents > 0 then
    insert into public.tips (cook_id, ticket_id, cents) values (p_cook, t.id, p_tip_cents);
  end if;

  perform public.log_event(outcome, t.id, p_cook,
    coalesce(p_detail, '{}') || jsonb_build_object('seconds', secs, 'score', p_score));

  return jsonb_build_object('status', outcome, 'seconds', secs, 'score', p_score, 'tip_cents', p_tip_cents);
end;
$$;

-- Runs every 10 seconds (see the cron migration). Sweeps up after slow cooks
-- and impatient customers, takes a sample of how busy the rail is, then
-- places new orders.
create or replace function public.kitchen_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.shift;
  r record;
begin
  select * into s from public.shift;

  -- pgmq has already made these visible again; mirror that in the table
  for r in
    select id, cook_id from public.tickets
    where status = 'cooking'
      and claimed_at < now() - make_interval(secs => s.cook_seconds)
    for update skip locked
  loop
    update public.tickets set status = 'waiting', cook_id = null, claimed_at = null where id = r.id;
    perform public.log_event('dropped', r.id, r.cook_id, '{"why": "visibility timeout"}');
  end loop;

  -- customers who waited too long leave
  for r in
    select id, msg_id from public.tickets
    where status = 'waiting'
      and placed_at < now() - make_interval(secs => s.patience_seconds)
    for update skip locked
  loop
    perform pgmq.delete('tickets', r.msg_id);
    update public.tickets set status = 'walked_out', done_at = now() where id = r.id;
    perform public.log_event('walked_out', r.id, null, '{}');
  end loop;

  insert into public.queue_samples (waiting, cooking, oldest_seconds)
  select
    count(*) filter (where status = 'waiting'),
    count(*) filter (where status = 'cooking'),
    extract(epoch from now() - min(placed_at) filter (where status = 'waiting'))::int
  from public.tickets
  where status in ('waiting', 'cooking');

  perform public.place_orders();
end;
$$;

-- Everything the pass screen needs in one round trip.
create or replace function public.pass_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shift', (select to_jsonb(s) from public.shift s),
    'queue', (select to_jsonb(m) from pgmq.metrics('tickets') m),
    'waiting', (select count(*) from public.tickets where status = 'waiting'),
    'cooking', (select count(*) from public.tickets where status = 'cooking'),
    'cooks', (select count(*) from public.cooks),
    'last_minute', (
      select jsonb_object_agg(kind, n) from (
        select kind, count(*) n from public.events
        where at > now() - interval '1 minute'
        group by kind
      ) k
    ),
    'ticket_seconds', (
      select jsonb_build_object(
        'p50', percentile_cont(0.5) within group (order by seconds),
        'p95', percentile_cont(0.95) within group (order by seconds),
        'n', count(*)
      )
      from public.serves where served_at > now() - interval '5 minutes'
    ),
    'series', (
      select coalesce(jsonb_agg(x order by x.t), '[]') from (
        select date_bin('10 seconds', at, timestamptz '2000-01-01') t,
               count(*) filter (where kind = 'placed') placed,
               count(*) filter (where kind = 'served') served,
               count(*) filter (where kind = 'botched') botched,
               count(*) filter (where kind = 'walked_out') walked_out
        from public.events
        where at > now() - interval '5 minutes'
        group by 1
      ) x
    ),
    'depth', (
      select coalesce(jsonb_agg(q order by q.at), '[]') from (
        select at, waiting, cooking from public.queue_samples
        where at > now() - interval '5 minutes'
      ) q
    ),
    'leaderboard', (
      select coalesce(jsonb_agg(l), '[]') from (
        select c.name, c.kind, sum(sv.score)::int score,
               count(*) filter (where sv.correct) good,
               count(*) plates,
               round(avg(sv.seconds), 1) avg_seconds
        from public.serves sv join public.cooks c on c.id = sv.cook_id
        group by c.id, c.name, c.kind
        order by score desc
        limit 10
      ) l
    ),
    'blocked', (
      select coalesce(jsonb_agg(b), '[]') from (
        select detail ->> 'code' code, detail ->> 'attack' attack, count(*) n
        from public.events where kind = 'blocked'
        group by 1, 2 order by n desc
      ) b
    )
  );
$$;

-- Send a message to every screen from the terminal:
--   npx supabase db query "select shout('86 the mushrooms')"
-- Uses Realtime broadcast straight from the database.
create or replace function public.shout(p_text text)
returns void
language sql
security definer
set search_path = ''
as $$
  select realtime.send(jsonb_build_object('text', p_text), 'shout', 'kitchen', false);
$$;

-- Supabase lets anon and authenticated execute new functions by default.
-- Take that away and hand it back one function at a time.
revoke execute on function public.log_event(text, bigint, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.place_orders(int) from anon, authenticated, public;
revoke execute on function public.finish_ticket(uuid, bigint, boolean, int, int, jsonb) from anon, authenticated, public;
revoke execute on function public.kitchen_tick() from anon, authenticated, public;
revoke execute on function public.shout(text) from anon, authenticated, public;
revoke execute on function public.grab_ticket() from anon, public;
revoke execute on function public.pass_stats() from anon, public;

grant execute on function public.grab_ticket() to authenticated;
grant execute on function public.pass_stats() to authenticated;
grant execute on function public.finish_ticket(uuid, bigint, boolean, int, int, jsonb) to service_role;
