# Labs

Each of these is a command or two in your terminal, then something you can watch change. Keep the live dashboard (`http://localhost:5173/#/live`) open next to your terminal the whole time, and the game itself on your phone or in another tab.

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

That's a whole Supabase project on your laptop: Postgres, the REST API, Auth, Realtime, Storage, Edge Functions, a local copy of the dashboard (Studio) and a fake inbox (Mailpit). Open Studio at http://127.0.0.1:54323 and look at the `ingredients` table. The `x` and `y` columns are where each one sits on the store's shelves.

Nothing here costs anything or needs an account.

## 2. Open the store

```bash
npx supabase db reset
```

`db reset` drops everything and replays `supabase/migrations/` and `seed.sql`. Everyone's dinners go with it, which is the point: the migrations are the source of truth, not whatever's in the database right now.

The store starts closed. Watch the dashboard's badge and the **Let's go shopping!** button on your phone while you run:

```bash
npx supabase db query "update game set open = true"
```

Both flip at once, with no refresh. The phone is subscribed to changes on the `game` table (Realtime Postgres Changes), so the moment the row changes, every screen hears about it.

## 3. Change the economy while people are playing

```bash
npx supabase db query "update game set allowance_cents = 6000"
```

Everyone's allowance on the menu screen goes to $60. Turkey, pie, stuffing *and* mac & cheese is now affordable. Make the room tighter instead:

```bash
npx supabase db query "update game set allowance_cents = 2000"
```

The allowance is enforced in `start_run()`, so a phone can't pretend it has more. Put it back with `4000`.

## 4. Make the clock stricter

Par time is `par_base_s + par_per_item_s × items + par_per_step_s × steps`. Squeeze it:

```bash
npx supabase db query "update game set par_base_s = 5, par_per_item_s = 1"
```

The next dinners score lower on speed. Every knob in the game is a column you can change from the terminal.

## 5. Talk to every screen from SQL

```bash
npx supabase db query "select announce('Pie is worth a lot tonight!')"
```

`announce()` calls `realtime.send()`, which puts a message on the same Realtime channel the phones and the dashboard listen on. No server code in between.

## 6. Positions are never stored

Walk around the store on your phone. Then:

```bash
npx supabase db query "select p.name, s.phase, s.location from player_state s join players p on p.id = s.player_id"
```

The database knows which aisle you're in, not which tile. On the dashboard's **Under the hood** panel, the **Broadcast** counter is your steps per second, and only the aisle changes show up as **Postgres Changes** (`UPDATE player_state`). Your exact position goes out several times a second on Realtime **Broadcast**, straight from your phone to everyone else's, and is never written anywhere. Rule of thumb: if it changes many times a second and you won't need it tomorrow, broadcast it; if it matters later, store it.

## 7. The cron job that keeps the store tidy

```bash
npx supabase db query "select jobname, schedule, command from cron.job"
npx supabase db query "select jobid, status, start_time from cron.job_run_details order by start_time desc limit 5"
```

`tidy_up()` runs every minute: trips nobody has touched in 20 minutes are abandoned, and players idle for 10 show as away. Stop the bots with Ctrl-C mid-trip and, within ten minutes, they go grey as "away" on the dashboard.

## 8. Try to cheat

On your phone, tap **😈 try to cheat** and try all six. Each one is a real request with your real login. Watch **Blocked by Postgres** on the dashboard. They fail in three different ways:

- **No grant** (`42501 permission denied`): you can't update `runs` at all, so no free money and no made-up score.
- **A policy filter** (200 OK, but only your rows): reading `purchases` "works", it just only returns your own basket.
- **The game says no**: `finish_run()` checks your trip. If you haven't shopped and headed home, or you finish faster than any oven could, it tells you so, kindly, and nothing is scored.

Read the rules that do this in `supabase/migrations/*_who_can_do_what.sql`.

## 9. Prove the rules with tests

```bash
npx supabase test db
```

`supabase/tests/potluck.test.sql` signs in as two players, Ana and Ben, and checks the rules and the scoring: Ana can't overspend, can't change her score, can't see Ben's basket, gets the score the formula says, and the leaderboard puts the best dinner first. Break a policy on purpose (delete one from the migration, `db reset`) and run it again.

## 10. The leak, and the advisor that catches it

Make a table the quick way:

```bash
npx supabase db query "create table public.secret_recipes (id int primary key, recipe text)"
npx supabase db query "insert into secret_recipes values (1, 'Grandma puts maple syrup in the stuffing')"
```

Now read it with nothing but the publishable key, which is what anyone on the internet has:

```bash
curl "http://127.0.0.1:54321/rest/v1/secret_recipes?select=*" -H "apikey: $(grep PUBLISHABLE .env.local | cut -d= -f2)"
```

You get Grandma's secret. Ask the advisor:

```bash
npx supabase db advisors
```

`rls_disabled_in_public`, level ERROR. Fix it and curl again:

```bash
npx supabase db query "alter table secret_recipes enable row level security"
```

Now you get `[]`. RLS with no policies lets nothing through.

## 11. Turn a change into a migration

Make a change by hand (or click around in Studio), then ask the CLI what's different from your migration files:

```bash
npx supabase db diff
```

You'll see `secret_recipes` from the last lab, including the grants to `anon` you never asked for. That's what you'd have shipped. Save it as a real migration if you want to keep it:

```bash
npx supabase db diff -f secret_recipes
```

Or throw it away with `npx supabase db reset`.

## 12. Add a dish to the store

```bash
npx supabase migration new sweet_potatoes
```

Open the new file in `supabase/migrations/` and put this in it:

```sql
insert into public.ingredients (slug, name, price_cents, x, y)
values ('sweet-potatoes', 'Sweet Potatoes', 250, 3, 8);

insert into public.recipes (slug, name, stars, base_points, steps)
values ('sweet-potato-casserole', 'Sweet Potato Casserole', 2, 250, '{Peel, Mash, Bake}');

insert into public.recipe_ingredients (recipe, ingredient) values
  ('sweet-potato-casserole', 'sweet-potatoes'),
  ('sweet-potato-casserole', 'butter'),
  ('sweet-potato-casserole', 'sugar'),
  ('sweet-potato-casserole', 'cinnamon');
```

Apply just the new migration, without resetting anything:

```bash
npx supabase migration up
npx supabase migration list
```

Refresh the game. Sweet Potato Casserole is on the menu, and sweet potatoes are on the Produce shelf (`x = 3`, `y = 8`). The bots will start buying them too. The cost, the shelf and the scoring all came from rows; no app code changed.

## 13. Types from the schema

```bash
npm run types
```

This regenerates `src/lib/database.types.ts` from the live database. Every table, column and function is in there, so if the app calls `supabase.rpc("buy")` with the wrong arguments, TypeScript says so before anyone plays.

## 14. Where is the time going?

```bash
npx supabase inspect db table-stats
npx supabase inspect db outliers
```

`table-stats` shows row counts and how often each table gets scanned start to finish (`Seq scans`). Before you add an index, check the row count: on a table this small Postgres reads the whole thing on purpose because it's faster than using an index.

`outliers` and `calls` cover the whole database, and the top of those lists is Supabase's own services talking to Postgres, not the game. To see just the game, ask the same source they read from:

```bash
npx supabase db query "select calls, round(mean_exec_time::numeric, 2) as avg_ms, left(query, 80) as query from extensions.pg_stat_statements where query ~* 'start_run|buy|finish_run|dashboard' order by calls desc"
```

`dashboard()` runs whenever a dashboard hears a row change (several changes within 400 ms become one call), plus once every 5 seconds as a safety net, so it usually has the most calls. The **RPC** counter in the dashboard's Under the hood panel is the same number, live.

## 15. Is the big menu worth it?

Every dinner keeps its breakdown in `runs.result`. Let the data answer the question the game asks:

```bash
npx supabase db query "select array_length(recipes, 1) as dishes, count(*) as dinners, round(avg(score)) as avg_score, round(avg((result->>'speed')::numeric), 2) as avg_speed from runs where status = 'done' group by 1 order by 1"
```

And the accuracy for each dish, which tells you which ones are hardest to cook:

```bash
npx supabase db query "select d->>'name' as dish, count(*), round(avg((d->>'accuracy')::numeric), 2) as avg_accuracy from runs, jsonb_array_elements(result->'dishes') d group by 1 order by 3"
```

## 16. Read the event log

```bash
npx supabase db query "select kind, count(*) from events group by kind order by 2 desc"
npx supabase db query "select at, kind, detail from events order by id desc limit 10"
```

Each trip leaves `started`, `home` and `finished` with the details of that step. Line them up by `detail->>'run_id'` and you have a trace of one dinner from menu to table.

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
npx supabase functions deploy
npx supabase config push
```

`db push` runs your migrations there, `--include-seed` loads the store and the recipes, `functions deploy` uploads the `delete-account` Edge Function, `config push` copies the auth settings from `supabase/config.toml` (anonymous sign-ins on, higher rate limit). Change `site_url` in `config.toml` to wherever you deploy the frontend before you push it.

When you're done for the night:

```bash
npx supabase db query --remote "update game set open = false"
npx supabase stop
```

---

# Account labs

## A1. Every account is a row

Sign up on your phone (or play as a guest), then:

```bash
npx supabase db query "select id, email, is_anonymous, created_at from auth.users order by created_at desc limit 5"
```

Guests have no email and `is_anonymous = true`. Your cook is a separate row in `public.players` with the same `id`.

## A2. Emails without an inbox

Tap **Email link** on the sign-in screen, then open Mailpit at http://127.0.0.1:54324. The sign-in link is there. Click it and you're in. **Forgot your password?** works the same way and brings you to a "Set a new password" screen.

## A3. Turn a guest into an account

Play as a guest, open **Account**, and fill in **Save your progress**. Run the query from A1 again: same `id`, now with an email, and `is_anonymous` is `false`. Nothing moved, so your cook, level and dinners were never at risk.

## A4. Pictures are files and rows

Add a picture in **Account**, then:

```bash
npx supabase storage ls ss:///avatars/ --experimental
npx supabase db query "select name, metadata->>'size' as bytes, created_at from storage.objects where bucket_id = 'avatars'"
```

The first is the CLI's view of the bucket; the second shows that every file is a row in `storage.objects`. Your picture shows up next to your name on the dashboard. Who can write where is just RLS:

```bash
npx supabase db query "select policyname, cmd from pg_policies where tablename = 'objects'"
```

## A5. Delete an account

In **Account**, tap **Delete my account**. Then check that the user, their player and their picture are all gone:

```bash
npx supabase db query "select count(*) from auth.users"
npx supabase storage ls ss:///avatars/ --experimental
docker logs supabase_edge_runtime_usacs-f26-supabase-workshop 2>&1 | grep account_deleted
```

## A6. Test it

`supabase/tests/accounts.test.sql` checks the Storage rules the same way the game's tests check the tables: Ana can upload into her own folder, not Ben's, and can't point her profile at Ben's picture.

```bash
npx supabase test db
```
