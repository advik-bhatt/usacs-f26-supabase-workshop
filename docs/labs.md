# Labs

Each of these is a command or two in your terminal, then something you can watch change. Keep the pass screen (`http://localhost:5173/#/pass`) open next to your terminal the whole time.

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

That's a whole Supabase project on your laptop: Postgres, the REST API, Auth, Realtime, Storage, Edge Functions, a local copy of the dashboard (Studio) and a fake inbox (Mailpit). Open Studio at http://127.0.0.1:54323 and find the `tickets` table.

Nothing here costs anything or needs an account.

## 2. Open the kitchen

```bash
npx supabase db query "update shift set open = true"
```

The badge on the pass screen flips to OPEN and new tickets start landing every ten seconds. You just changed a row and every connected screen found out about it. The phones heard it through Realtime (Postgres Changes on the `shift` table).

## 3. Make it a rush

```bash
npx supabase db query "update shift set tickets_per_tick = 6"
```

Watch "on the rail" climb. Once tickets wait longer than `patience_seconds`, customers start walking out and the red bars show up. Now squeeze the cooks:

```bash
npx supabase db query "update shift set cook_seconds = 8"
```

Bots that take longer than 8 seconds start getting "too slow". Put it back when you've seen enough:

```bash
npx supabase db query "update shift set tickets_per_tick = 1, cook_seconds = 30"
```

## 4. Look inside the queue

The rail is a `pgmq` queue. It's just Postgres tables, so you can look at it:

```bash
npx supabase db query "select * from pgmq.metrics('tickets')"
npx supabase db query "select msg_id, read_ct, vt, message from pgmq.q_tickets order by msg_id"
```

`vt` is the visibility timeout. When a cook grabs a ticket, `vt` jumps forward by `cook_seconds` and nobody else can read that message until then. `read_ct` above 1 means somebody dropped it and it came back. Finished tickets get moved to the archive table:

```bash
npx supabase db query "select count(*) from pgmq.a_tickets"
```

## 5. The cron job that runs the restaurant

```bash
npx supabase db query "select jobid, jobname, schedule, command from cron.job"
npx supabase db query "select status, count(*) from cron.job_run_details group by status"
```

`kitchen-tick` runs every 10 seconds, inside the database. No server is awake to do it. Stop it and the orders stop:

```bash
npx supabase db query "select cron.unschedule('kitchen-tick')"
```

Bring it back:

```bash
npx supabase db query "select cron.schedule('kitchen-tick', '10 seconds', 'select public.kitchen_tick()')"
```

## 6. Talk to every screen from SQL

```bash
npx supabase db query "select shout('86 the pineapple')"
```

That's Realtime Broadcast, sent from inside Postgres with `realtime.send()`. It shows up on every phone and the projector.

## 7. Try to cheat

On your phone, tap **Try to cheat** and hit every button. Each one is a real request with your real session. They fail three different ways:

- `42501 permission denied for table shift`: there's no grant. The request didn't even get as far as looking at rows.
- `42501 new row violates row-level security policy`: the grant is there, but no policy says yes.
- `200 OK` with only your own rows: a policy filtered the rest out. No error at all.

Now read the rules that did it:

```bash
npx supabase db query "select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public'"
```

Or open `supabase/migrations/*_who_can_do_what.sql`.

## 8. Prove the rules with tests

```bash
npx supabase test db
```

Twelve pgTAP tests pretend to be two different cooks and check that each one can only do what they should. Now break something on purpose:

```bash
npx supabase db query 'drop policy "your tips are yours" on tips'
npx supabase db query 'create policy "oops" on tips for select to authenticated using (true)'
npx supabase test db
```

Two tests fail, and the failure tells you exactly which rule leaked. Undo it by rebuilding the database from the migrations:

```bash
npx supabase db reset
```

`db reset` drops everything and replays `supabase/migrations/` and `seed.sql`. Your game data goes with it, which is the point: the migrations are the source of truth, not whatever's in the database right now.

## 9. The leak, and the advisor that catches it

Make a table the quick way:

```bash
npx supabase db query "create table public.secret_recipes (id int primary key, recipe text)"
npx supabase db query "insert into secret_recipes values (1, 'the sauce is just ketchup')"
```

Now read it with nothing but the publishable key, which is what anyone on the internet has:

```bash
curl "http://127.0.0.1:54321/rest/v1/secret_recipes?select=*" -H "apikey: $(grep PUBLISHABLE .env.local | cut -d= -f2)"
```

You get the recipe. Ask the advisor:

```bash
npx supabase db advisors
```

`rls_disabled_in_public`, level ERROR. Fix it and curl again:

```bash
npx supabase db query "alter table secret_recipes enable row level security"
```

Now you get `[]`. RLS with no policies lets nothing through.

## 10. Turn a change into a migration

Make a change by hand (or click around in Studio), then ask the CLI what's different from your migration files:

```bash
npx supabase db diff
```

You'll see `secret_recipes` from the last lab, including the grants to `anon` you never asked for. That's what you'd have shipped. Save it as a real migration if you want to keep it:

```bash
npx supabase db diff -f secret_recipes
```

Or throw it away with `npx supabase db reset`.

## 11. Add something to the menu

```bash
npx supabase migration new add_anchovies
```

Open the new file in `supabase/migrations/` and put this in it:

```sql
insert into public.toppings (slug, label, emoji) values ('anchovy', 'Anchovies', '🐟');
```

Apply just the new migration, without resetting anything:

```bash
npx supabase migration up
npx supabase migration list
```

Refresh your phone. Anchovies are on the menu and will start showing up on tickets.

## 12. Types from the schema

```bash
npm run types
```

This regenerates `src/lib/database.types.ts` from the live database. If you kept a schema change from lab 10, it's in there now, and TypeScript will tell you if the app is using a column that doesn't exist.

## 13. Where is the time going?

```bash
npx supabase inspect db table-stats
npx supabase inspect db calls
npx supabase inspect db outliers
```

`table-stats` shows row counts and how often each table gets scanned start to finish (`Seq scans`). `tickets` will have a lot. Before you add an index, check the row count: on a table this small Postgres reads the whole thing on purpose because it's faster than using an index.

`calls` and `outliers` show which queries run the most and which take the longest, across the whole database. The top of the list is Supabase's own services talking to Postgres (`BEGIN`, migrations, Realtime's job queue), not the game. To see just the game, ask the same source those commands read from:

```bash
npx supabase db query "select calls, round(mean_exec_time::numeric, 2) as avg_ms, left(query, 80) as query from extensions.pg_stat_statements where query ~* 'grab_ticket|kitchen_tick|pass_stats' order by calls desc"
```

The `WITH pgrst_source AS ...` rows are what your `supabase.rpc("grab_ticket")` calls turn into once PostgREST gets hold of them.

## 14. Read the event log like a detective

Every ticket's whole life is in `public.events`. Click a line on the pass screen to see one as a timeline, or query it:

```bash
npx supabase db query "select kind, count(*) from events group by kind order by 2 desc"
npx supabase db query "select ticket_id, count(*) from events where kind = 'dropped' group by 1 order by 2 desc limit 5"
```

Who's fastest, counting only correct plates?

```bash
npx supabase db query "select c.name, round(avg(s.seconds), 1) as avg_s, count(*) from serves s join cooks c on c.id = s.cook_id where s.correct group by c.name order by avg_s limit 5"
```

This is the bridge to December: logs you can query are the start of observability.

## 15. Watch the Edge Function

Every serve goes through `supabase/functions/serve`. It logs one JSON line per plate:

```bash
docker logs -f supabase_edge_runtime_usacs-f26-supabase-workshop
```

On a hosted project the same thing is `npx supabase logs --remote` (it opens an interactive viewer; `npx supabase logs sources --remote` lists what you can filter by).

## 16. Keep your data

The free plan doesn't give you downloadable backups. The CLI does:

```bash
npx supabase db dump --data-only -f backup.sql
```

Add `--remote` to dump a hosted project.

## 17. Ship it

Everything you just did locally goes to a free hosted project with five commands:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed
npx supabase functions deploy serve
npx supabase config push
```

`db push` runs your migrations there, `functions deploy` uploads the Edge Function, `config push` copies the auth settings from `supabase/config.toml` (anonymous sign-ins on, higher rate limit). Change `site_url` in `config.toml` to wherever you deploy the frontend before you push it.

When you're done for the night:

```bash
npx supabase db query --remote "update shift set open = false"
npx supabase stop
```
