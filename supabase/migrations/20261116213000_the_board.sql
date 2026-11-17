-- The board: a pgmq queue plus the functions that move targets along it.
--
-- pgmq gives us the one thing a mission team (or a pool of AI agents) needs
-- from a queue: when you read a message it becomes invisible to everyone else
-- for a while (the "visibility timeout"). Finish in time and it's archived.
-- Take too long and it quietly reappears for someone else. Nobody works the
-- same asteroid twice, and nothing gets lost.

select pgmq.create('targets');

create or replace function public.jd_now()
returns double precision
language sql
stable
set search_path = ''
as $$
  select extract(epoch from now()) / 86400.0 + 2440587.5;
$$;

create or replace function public.log_event(
  p_kind text,
  p_target bigint default null,
  p_crew uuid default null,
  p_detail jsonb default '{}'
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.events (kind, target_id, crew_id, detail)
  values (p_kind, p_target, p_crew, coalesce(p_detail, '{}'));
$$;

-- Post new targets to the board. Called by the cron tick, or by hand:
--   npx supabase db query "select post_targets(5)"
-- Only asteroids whose close approach is still at least two days away.
create or replace function public.post_targets(p_count int default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.mission;
  n int;
  pick public.asteroids;
  new_id bigint;
  new_msg bigint;
  posted int := 0;
begin
  select * into m from public.mission;
  n := coalesce(p_count, case when m.open then m.targets_per_tick else 0 end);

  for k in 1..n loop
    select * into pick from public.asteroids a
    where a.ca_jd > public.jd_now() + 2
      and not exists (
        select 1 from public.targets t
        where t.des = a.des and t.status in ('waiting', 'working')
      )
    order by random()
    limit 1;

    if not found then
      exit;  -- everything is already on the board
    end if;

    insert into public.targets (des) values (pick.des) returning id into new_id;
    select * into new_msg from pgmq.send('targets', jsonb_build_object('target_id', new_id));
    update public.targets set msg_id = new_msg where id = new_id;

    perform public.log_event('posted', new_id, null,
      jsonb_build_object('des', pick.des, 'name', pick.name, 'diameter_km', pick.diameter_km));
    posted := posted + 1;
  end loop;

  return posted;
end;
$$;

-- Take the next target off the board. If you already have one going, you get
-- that one back instead of a second one.
create or replace function public.claim_target()
returns setof public.targets
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  m public.mission;
  msg record;
  t public.targets;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '28000';
  end if;
  if not exists (select 1 from public.crew where id = me) then
    raise exception 'join the team first';
  end if;

  select * into m from public.mission;

  return query
    select * from public.targets
    where crew_id = me
      and status = 'working'
      and claimed_at > now() - make_interval(secs => m.work_seconds)
    limit 1;
  if found then
    return;
  end if;

  -- read one message and hide it from everyone else for work_seconds
  select * into msg from pgmq.read('targets', m.work_seconds, 1);
  if not found then
    return;  -- empty board
  end if;

  select * into t from public.targets
  where id = (msg.message ->> 'target_id')::bigint
  for update;

  if t.status not in ('waiting', 'working') then
    -- stale message for a target that's already finished; tidy up
    perform pgmq.archive('targets', msg.msg_id);
    return;
  end if;

  if t.status = 'working' and t.crew_id is distinct from me then
    -- the last person ran out of time and the queue handed it to us
    perform public.log_event('dropped', t.id, t.crew_id, '{"why": "visibility timeout"}');
  end if;

  update public.targets
  set status = 'working', crew_id = me, claimed_at = now(), attempts = msg.read_ct
  where id = t.id
  returning * into t;

  perform public.log_event('claimed', t.id, me, jsonb_build_object(
    'attempt', msg.read_ct,
    'waited_seconds', round(extract(epoch from now() - t.posted_at)::numeric, 1)
  ));

  return next t;
end;
$$;

-- Record a flown mission. Only the `deflect` Edge Function calls this, with the
-- secret key, after it has run the physics itself. Browsers can't call it.
create or replace function public.finish_target(
  p_crew uuid,
  p_target bigint,
  p_lead_days double precision,
  p_mass_kg double precision,
  p_direction text,
  p_dv_ms double precision,
  p_miss_km double precision,
  p_capture_km double precision,
  p_saved boolean,
  p_score int
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.targets;
  m public.mission;
  secs numeric;
  outcome text := case when p_saved then 'saved' else 'impact' end;
begin
  select * into m from public.mission;
  select * into t from public.targets where id = p_target for update;

  if not found then
    raise exception 'target % does not exist', p_target using errcode = 'P0002';
  end if;

  if t.status in ('saved', 'impact', 'expired') then
    raise exception 'target #% is already done (%)', p_target, t.status using errcode = 'P0001';
  end if;

  if t.status <> 'working'
     or t.crew_id is distinct from p_crew
     or t.claimed_at < now() - make_interval(secs => m.work_seconds) then
    perform public.log_event('late', t.id, p_crew, jsonb_build_object('status_now', t.status));
    raise exception 'too slow, target #% went back on the board', p_target
      using errcode = 'P0001',
            hint = 'you have mission.work_seconds before the queue hands it to someone else';
  end if;

  secs := round(extract(epoch from now() - t.claimed_at)::numeric, 1);

  perform pgmq.archive('targets', t.msg_id);

  update public.targets set status = outcome, done_at = now() where id = t.id;

  insert into public.deflections
    (target_id, crew_id, lead_days, mass_kg, direction, dv_ms, miss_km, capture_km, saved, score, seconds)
  values
    (t.id, p_crew, p_lead_days, p_mass_kg, p_direction, p_dv_ms, p_miss_km, p_capture_km, p_saved, p_score, secs);

  if p_score > 0 then
    insert into public.credits (crew_id, target_id, amount) values (p_crew, t.id, p_score * 1000);
  end if;

  perform public.log_event(outcome, t.id, p_crew, jsonb_build_object(
    'des', t.des, 'seconds', secs, 'score', p_score, 'miss_km', round(p_miss_km::numeric),
    'mass_kg', round(p_mass_kg::numeric), 'lead_days', round(p_lead_days::numeric), 'direction', p_direction
  ));

  return jsonb_build_object('status', outcome, 'seconds', secs, 'score', p_score);
end;
$$;

-- Runs every 10 seconds (see the cron migration). Sweeps up after slow crew
-- and closed windows, takes a sample of how busy the board is, then posts
-- new targets.
create or replace function public.mission_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.mission;
  r record;
begin
  select * into m from public.mission;

  -- pgmq has already made these visible again; mirror that in the table
  for r in
    select id, crew_id from public.targets
    where status = 'working'
      and claimed_at < now() - make_interval(secs => m.work_seconds)
    for update skip locked
  loop
    update public.targets set status = 'waiting', crew_id = null, claimed_at = null where id = r.id;
    perform public.log_event('dropped', r.id, r.crew_id, '{"why": "visibility timeout"}');
  end loop;

  -- nobody took it in time
  for r in
    select id, msg_id from public.targets
    where status = 'waiting'
      and posted_at < now() - make_interval(secs => m.window_seconds)
    for update skip locked
  loop
    perform pgmq.delete('targets', r.msg_id);
    update public.targets set status = 'expired', done_at = now() where id = r.id;
    perform public.log_event('expired', r.id, null, '{}');
  end loop;

  insert into public.queue_samples (waiting, working, oldest_seconds)
  select
    count(*) filter (where status = 'waiting'),
    count(*) filter (where status = 'working'),
    extract(epoch from now() - min(posted_at) filter (where status = 'waiting'))::int
  from public.targets
  where status in ('waiting', 'working');

  perform public.post_targets();
end;
$$;

-- Everything mission control needs in one round trip.
create or replace function public.control_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'mission', (select to_jsonb(m) from public.mission m),
    'queue', (select to_jsonb(q) from pgmq.metrics('targets') q),
    'waiting', (select count(*) from public.targets where status = 'waiting'),
    'working', (select count(*) from public.targets where status = 'working'),
    'crew', (select count(*) from public.crew),
    'last_minute', (
      select jsonb_object_agg(kind, n) from (
        select kind, count(*) n from public.events
        where at > now() - interval '1 minute'
        group by kind
      ) k
    ),
    'design_seconds', (
      select jsonb_build_object(
        'p50', percentile_cont(0.5) within group (order by seconds),
        'p95', percentile_cont(0.95) within group (order by seconds),
        'n', count(*)
      )
      from public.deflections where flown_at > now() - interval '5 minutes'
    ),
    'series', (
      select coalesce(jsonb_agg(x order by x.t), '[]') from (
        select date_bin('10 seconds', at, timestamptz '2000-01-01') t,
               count(*) filter (where kind = 'posted') posted,
               count(*) filter (where kind = 'saved') saved,
               count(*) filter (where kind = 'impact') impact,
               count(*) filter (where kind = 'expired') expired
        from public.events
        where at > now() - interval '5 minutes'
        group by 1
      ) x
    ),
    'depth', (
      select coalesce(jsonb_agg(q order by q.at), '[]') from (
        select at, waiting, working from public.queue_samples
        where at > now() - interval '5 minutes'
      ) q
    ),
    'leaderboard', (
      select coalesce(jsonb_agg(l), '[]') from (
        select c.name, c.kind, sum(d.score)::int score,
               count(*) filter (where d.saved) saves,
               count(*) missions,
               min(d.mass_kg) filter (where d.saved) lightest_save_kg
        from public.deflections d join public.crew c on c.id = d.crew_id
        group by c.id, c.name, c.kind
        order by score desc
        limit 10
      ) l
    ),
    'biggest_saves', (
      select coalesce(jsonb_agg(b), '[]') from (
        select a.name, a.diameter_km, d.mass_kg, d.lead_days, d.direction, c.name crew
        from public.deflections d
        join public.targets t on t.id = d.target_id
        join public.asteroids a on a.des = t.des
        join public.crew c on c.id = d.crew_id
        where d.saved
        order by a.diameter_km desc
        limit 5
      ) b
    ),
    'active', (
      select coalesce(jsonb_agg(x), '[]') from (
        select t.id, t.status, a.des, a.name, a.a, a.e, a.i, a.om, a.w, a.ma, a.epoch
        from public.targets t join public.asteroids a on a.des = t.des
        where t.status in ('waiting', 'working')
      ) x
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
--   npx supabase db query "select announce('Apophis is on the board. Good luck.')"
-- Uses Realtime broadcast straight from the database.
create or replace function public.announce(p_text text)
returns void
language sql
security definer
set search_path = ''
as $$
  select realtime.send(jsonb_build_object('text', p_text), 'announce', 'mission', false);
$$;

-- Supabase lets anon and authenticated execute new functions by default.
-- Take that away and hand it back one function at a time.
revoke execute on function public.log_event(text, bigint, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.post_targets(int) from anon, authenticated, public;
revoke execute on function public.finish_target(uuid, bigint, double precision, double precision, text,
  double precision, double precision, double precision, boolean, int) from anon, authenticated, public;
revoke execute on function public.mission_tick() from anon, authenticated, public;
revoke execute on function public.announce(text) from anon, authenticated, public;
revoke execute on function public.claim_target() from anon, public;
revoke execute on function public.control_stats() from anon, public;
revoke execute on function public.jd_now() from anon, public;

grant execute on function public.claim_target() to authenticated;
grant execute on function public.control_stats() to authenticated;
grant execute on function public.jd_now() to authenticated;
grant execute on function public.finish_target(uuid, bigint, double precision, double precision, text,
  double precision, double precision, double precision, boolean, int) to service_role;
