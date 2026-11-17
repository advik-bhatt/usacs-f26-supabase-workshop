# Labs

Each of these is a command or two in your terminal, then something you can watch change. Keep mission control (`http://localhost:5173/#/control`) open next to your terminal the whole time.

All of these run against your local stack. Add `--remote` to most `supabase` commands to point them at a linked hosted project instead.

Before you start:

```bash
npx supabase start
npm run env:local
npm run dev
npm run bots -- 3        # in another terminal, so there's something to watch
```

---

## 1. What did `supabase start` just give me?

```bash
npx supabase status
```

That's a whole Supabase project on your laptop: Postgres, the REST API, Auth, Realtime, Storage, Edge Functions, a local copy of the dashboard (Studio) and a fake inbox (Mailpit). Open Studio at http://127.0.0.1:54323 and find the `asteroids` table. Those are real orbits from NASA/JPL.

Nothing here costs anything or needs an account.

## 2. Open the board

```bash
npx supabase db query "update mission set open = true"
```

Mission control flips to BOARD OPEN and new targets start appearing every ten seconds. You changed one row and every connected screen found out. The phones heard it through Realtime (Postgres Changes on the `mission` table).

## 3. Make it a crisis

```bash
npx supabase db query "update mission set targets_per_tick = 5"
```

Watch "on the board" climb. Targets nobody takes within `window_seconds` expire, and the dark red bars show up. Now squeeze the team:

```bash
npx supabase db query "update mission set work_seconds = 20"
```

Twenty seconds to design a mission. People start getting "too slow, it went back on the board." Put it back when you've seen enough:

```bash
npx supabase db query "update mission set targets_per_tick = 1, work_seconds = 90"
```

## 4. Look inside the queue

The board is a `pgmq` queue. It's just Postgres tables, so you can look at it:

```bash
npx supabase db query "select * from pgmq.metrics('targets')"
npx supabase db query "select msg_id, read_ct, vt, message from pgmq.q_targets order by msg_id"
```

`vt` is the visibility timeout. When someone takes a target, `vt` jumps forward by `work_seconds` and nobody else can read that message until then. `read_ct` above 1 means somebody ran out of time and it came back. Finished targets move to the archive:

```bash
npx supabase db query "select count(*) from pgmq.a_targets"
```

## 5. The cron job that runs the mission

```bash
npx supabase db query "select jobid, jobname, schedule, command from cron.job"
npx supabase db query "select status, count(*) from cron.job_run_details group by status"
```

`mission-tick` runs every 10 seconds, inside the database. No server is awake to do it. Stop it and the board goes quiet:

```bash
npx supabase db query "select cron.unschedule('mission-tick')"
```

Bring it back:

```bash
npx supabase db query "select cron.schedule('mission-tick', '10 seconds', 'select public.mission_tick()')"
```

## 6. Talk to every screen from SQL

```bash
npx supabase db query "select announce('Apophis is on the board. Good luck.')"
```

That's Realtime Broadcast, sent from inside Postgres with `realtime.send()`. It shows up on every phone and the projector.

## 7. Try to cheat

On your phone, tap **Try to cheat** and hit every button. Each one is a real request with your real session. They fail in different ways:

- `42501 permission denied for table mission`: there's no grant. The request never got as far as looking at rows.
- `42501 new row violates row-level security policy`: the grant is there, but no policy says yes.
- `200 OK` with only your own rows: a policy filtered the rest out, with no error at all.
- **Tell the server it missed by a mile**: the Edge Function ignores the numbers you send and runs the physics itself. This is the one that matters most for anything with a score, a price or a balance in it.

Now read the rules that did it:

```bash
npx supabase db query "select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public'"
```

Or open `supabase/migrations/*_who_can_do_what.sql`.

## 8. Prove the rules with tests

```bash
npx supabase test db
```

Thirteen pgTAP tests pretend to be two people, Ana and Ben, and check that each can only do what they should. Now break something on purpose:

```bash
npx supabase db query 'drop policy "your credits are yours" on credits'
npx supabase db query 'create policy "oops" on credits for select to authenticated using (true)'
npx supabase test db
```

Two tests fail, and the failure says exactly what leaked: Ana sees 2 rows instead of 1. Undo it by rebuilding the database from the migrations:

```bash
npx supabase db reset
```

`db reset` drops everything and replays `supabase/migrations/` and `seed.sql`. The game data goes with it, which is the point: the migrations are the source of truth, not whatever's in the database right now.

## 9. The leak, and the advisor that catches it

Make a table the quick way:

```bash
npx supabase db query "create table public.launch_codes (id int primary key, code text)"
npx supabase db query "insert into launch_codes values (1, '00000000')"
```

Now read it with nothing but the publishable key, which is what anyone on the internet has:

```bash
curl "http://127.0.0.1:54321/rest/v1/launch_codes?select=*" -H "apikey: $(grep PUBLISHABLE .env.local | cut -d= -f2)"
```

You get the code. Ask the advisor:

```bash
npx supabase db advisors
```

`rls_disabled_in_public`, level ERROR. Fix it and curl again:

```bash
npx supabase db query "alter table launch_codes enable row level security"
```

Now you get `[]`. RLS with no policies lets nothing through.

## 10. Turn a change into a migration

Make a change by hand (or click around in Studio), then ask the CLI what's different from your migration files:

```bash
npx supabase db diff
```

You'll see `launch_codes` from the last lab, including the grants to `anon` you never asked for. That's what you'd have shipped. Save it as a real migration if you want to keep it:

```bash
npx supabase db diff -f launch_codes
```

Or throw it away with `npx supabase db reset`.

## 11. Write a migration

JPL gives close approach distances in AU. Add a column in kilometers that Postgres keeps up to date by itself:

```bash
npx supabase migration new add_distance_in_km
```

Open the new file in `supabase/migrations/` and put this in it:

```sql
alter table public.asteroids
  add column ca_dist_km double precision
  generated always as (ca_dist_au * 149597870.7) stored;
```

Apply just the new migration, without resetting anything:

```bash
npx supabase migration up
npx supabase migration list
npx supabase db query "select name, round(ca_dist_km) as km from asteroids order by ca_dist_km limit 5"
```

Apophis comes out on top at about 38,000 km, closer than the satellites that carry your TV signal.

## 12. Types from the schema

```bash
npm run types
```

This regenerates `src/lib/database.types.ts` from the live database. Search it for `ca_dist_km`: the column from the last lab is there now, and TypeScript will tell you if the app uses a column that doesn't exist.

## 13. Where is the time going?

```bash
npx supabase inspect db table-stats
npx supabase inspect db outliers
```

`table-stats` shows row counts and how often each table gets scanned start to finish (`Seq scans`). Before you add an index, check the row count: on a table this small Postgres reads the whole thing on purpose because it's faster than using an index.

`outliers` and `calls` cover the whole database, and the top of those lists is Supabase's own services talking to Postgres, not the game. To see just the game, ask the same source they read from:

```bash
npx supabase db query "select calls, round(mean_exec_time::numeric, 2) as avg_ms, left(query, 80) as query from extensions.pg_stat_statements where query ~* 'claim_target|mission_tick|control_stats' order by calls desc"
```

The `WITH pgrst_source AS ...` rows are what your `supabase.rpc("claim_target")` calls turn into once PostgREST gets hold of them.

## 14. Read the event log like a flight director

Every target's whole life is in `public.events`. Click a line on mission control to see one as a timeline, or query it:

```bash
npx supabase db query "select kind, count(*) from events group by kind order by 2 desc"
```

Which direction works best? The answer is real orbital mechanics:

```bash
npx supabase db query "select detail->>'direction' as direction, count(*) filter (where kind = 'saved') as saves, count(*) filter (where kind = 'impact') as impacts from events where kind in ('saved', 'impact') group by 1"
```

Pushing along the orbit (prograde or retrograde) wins, because changing an asteroid's speed changes its orbital period, and the timing error keeps growing every lap. A sideways push mostly doesn't.

## 15. How good is the physics?

```bash
npm run check:physics
```

It propagates every asteroid in the database with our model and compares the distance to Earth at close approach against the number JPL publishes. JPL's model includes every planet; ours only has the Sun. The median error is about 6%. Look at the worst ones: they're very close passes, where a small error becomes a big percentage and Earth's own pull, which we ignore, matters most. A model you can't check is a model you shouldn't trust.

## 16. Watch the Edge Function

Every launch goes through `supabase/functions/deflect`, which logs one JSON line per mission, including how long the simulation took:

```bash
docker logs -f supabase_edge_runtime_usacs-f26-supabase-workshop
```

On a hosted project the same thing is `npx supabase logs --remote` (it opens an interactive viewer; `npx supabase logs sources --remote` lists what you can filter by).

## 17. Keep your data

The free plan doesn't give you downloadable backups. The CLI does:

```bash
npx supabase db dump --data-only -f backup.sql
```

Add `--remote` to dump a hosted project.

## 18. Ship it

Everything you just did locally goes to a free hosted project with five commands:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed
npx supabase functions deploy deflect
npx supabase config push
```

`db push` runs your migrations there, `--include-seed` loads the asteroid catalog, `functions deploy` uploads the Edge Function (and the shared physics with it), `config push` copies the auth settings from `supabase/config.toml` (anonymous sign-ins on, higher rate limit). Change `site_url` in `config.toml` to wherever you deploy the frontend before you push it.

When you're done for the night:

```bash
npx supabase db query --remote "update mission set open = false"
npx supabase stop
```
