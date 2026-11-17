# Labs

Each of these is a command or two in your terminal, then something you can watch change. Keep the floor (`http://localhost:5173/#/floor`) open next to your terminal the whole time.

All of these run against your local stack. Add `--remote` to most `supabase` commands to point them at a linked hosted project instead.

Before you start:

```bash
npx supabase start
npm run env:local
npm run dev
npx supabase db query "update market set open = true"
npm run bots        # in another terminal, so there's a market to watch
```

---

## 1. What did `supabase start` just give me?

```bash
npx supabase status
```

That's a whole Supabase project on your laptop: Postgres, the REST API, Auth, Realtime, Storage, Edge Functions, a local copy of the dashboard (Studio) and a fake inbox (Mailpit). Open Studio at http://127.0.0.1:54323 and look at the `stocks` and `orders` tables.

## 2. Ring the bell

```bash
npx supabase db query "update market set open = true"
```

Every phone's "market is closed" banner disappears. One row changed, and every screen heard about it through Realtime (Postgres Changes on `market`).

## 3. Read the order book from SQL

```bash
npx supabase db query "select order_book('SLICE')"
```

Bids (people waiting to buy) and asks (people waiting to sell), grouped by price. The gap between the best bid and the best ask is the spread; the market makers earn it. Now look at the raw orders underneath:

```bash
npx supabase db query "select id, side, kind, qty, filled, limit_cents, status from orders where symbol = 'SLICE' and status = 'open' order by side, limit_cents"
```

From the CLI you see every order (you're connected as `postgres`, which skips RLS). From a phone, the same table only shows you your own. `order_book()` is a `security definer` function, so it can read everyone's orders, but it only hands back price levels: no names, no order ids. That's how real exchanges publish their books.

## 4. Make a trade happen

On your phone, buy 5 SLICE with a market order. Then:

```bash
npx supabase db query "select * from trades order by id desc limit 5"
npx supabase db query "select symbol, last_cents, volume from stocks"
```

The trade is on the tape, and `last_cents` moved. Nothing else in the system sets a price. Try a limit order far from the market and watch it sit on the book (and in the phone's open orders) until you cancel it.

## 5. Drop some news

```bash
npx supabase db query "select news('ORBIT', 'Asteroid confirmed: it is mostly platinum', 'good')"
```

The headline lands on every screen (Realtime Broadcast, sent from SQL), the market makers raise their idea of what ORBIT is worth, and the price follows. Who in the room reacted first? Try one that hits everything:

```bash
npx supabase db query "select news(null, 'Interest rates up half a point', 'bad')"
```

## 6. Trip the circuit breaker

Start some momentum traders, which buy what's going up and sell what's going down:

```bash
npm run bots -- --makers 2 --noise 3 --momentum 5
```

Then lower the bar:

```bash
npx supabase db query "update market set breaker_pct = 0.05"
```

Drop a couple of headlines. When a stock moves 5% from the open, it halts: the card turns red, orders bounce with "halted by the circuit breaker", and a minute later the cron tick reopens it. Watch the halts panel on the floor. Put it back with `breaker_pct = 0.20`.

## 7. The cron job that keeps the floor running

```bash
npx supabase db query "select jobname, schedule, command from cron.job"
npx supabase db query "select status, count(*) from cron.job_run_details group by status"
```

`market-tick` samples every price for the charts and reopens halted stocks. Stop it and halted stocks stay halted:

```bash
npx supabase db query "select cron.unschedule('market-tick')"
npx supabase db query "select cron.schedule('market-tick', '10 seconds', 'select public.market_tick()')"
```

## 8. Try to cheat

On your phone, tap **Try to cheat** and hit every button. Each is a real request with your real session:

- `42501 permission denied for table accounts`: no grant. You can't even attempt to update your cash.
- `42501 new row violates row-level security policy for table "orders"`: the grant is there (on purpose), but no policy lets you insert an order directly.
- `200 OK` with only your own rows: a policy quietly filtered everyone else's positions.
- `refused`: the request reached `place_order()` or `cancel_order()`, and the engine said no. Selling shares you don't have, cancelling someone else's order.

Read the rules:

```bash
npx supabase db query "select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename"
```

## 9. Prove the rules, and the money, with tests

```bash
npx supabase test db
```

Twenty-four pgTAP tests. Some check who can see what. The rest check the economics: trades happen at the resting order's price, reserved cash can't be spent twice, cancelling releases it, and at the end no money or shares have been created or destroyed. Break something:

```bash
npx supabase db query 'drop policy "your shares are yours" on positions'
npx supabase db query 'create policy "oops" on positions for select to authenticated using (true)'
npx supabase test db
```

The failure tells you exactly what leaked. Rebuild from the migrations:

```bash
npx supabase db reset
```

## 10. Check the books balance

Conservation is the first thing an exchange has to get right. With bots trading, run this a few times:

```bash
npx supabase db query "select (select sum(cash_cents) from accounts) as cash, (select sum(qty) from positions) as shares, (select count(*) from traders) as traders"
```

Cash should always be traders × $10,000, and shares traders × 5 × 20, no matter how many trades happen. If they ever drift, `place_order()` has a bug.

## 11. List a new company

```bash
npx supabase migration new ipo_comet
```

Put this in the new file:

```sql
insert into public.stocks (symbol, name, blurb, open_cents, last_cents)
values ('COMET', 'Comet Coffee', 'Espresso by drone', 1500, 1500);

-- every trader gets 10 shares, so there's someone to sell
insert into public.positions (trader_id, symbol, qty)
select id, 'COMET', 10 from public.traders;
```

Apply it without resetting anything:

```bash
npx supabase migration up
npx supabase migration list
```

Refresh your phone: COMET is trading. (The bots only learn about it when you restart them.) Run lab 10 again: the share count went up by exactly the shares you issued. That's what an IPO does.

## 12. The leak, and the advisor that catches it

```bash
npx supabase db query "create table public.insider_tips (id int primary key, tip text)"
npx supabase db query "insert into insider_tips values (1, 'buy ORBIT before the news')"
curl "http://127.0.0.1:54321/rest/v1/insider_tips?select=*" -H "apikey: $(grep PUBLISHABLE .env.local | cut -d= -f2)"
npx supabase db advisors
```

Anyone with the publishable key can read it, and the advisor flags `rls_disabled_in_public` as an ERROR. Fix it and curl again:

```bash
npx supabase db query "alter table insider_tips enable row level security"
```

Then see what you would have shipped with `npx supabase db diff`, and throw it away with `npx supabase db reset`.

## 13. Types from the schema

```bash
npm run types
```

Regenerates `src/lib/database.types.ts`. `place_order`'s arguments are typed from the SQL function signature, so the app can't call it wrong.

## 14. Who's making money?

The leaderboard (net worth at last prices) comes from `floor_stats()`:

```bash
npx supabase db query "select jsonb_pretty(floor_stats() -> 'leaderboard')"
```

Which strategy is winning: the market makers, the noise traders, the momentum traders, or the humans? Over a long session, market makers usually grind out the spread while noise traders pay it. Momentum traders do great in a trend and terribly when it reverses. Check after a few headlines.

## 15. Where is the time going?

```bash
npx supabase inspect db table-stats
npx supabase db query "select calls, round(mean_exec_time::numeric, 2) as avg_ms, left(query, 80) as query from extensions.pg_stat_statements where query ~* 'place_order|order_book|floor_stats' order by calls desc"
```

`place_order` holds one lock for the whole exchange while it matches. How long does each call take? That number times the orders per second is how busy the lock is. Real exchanges live and die by that number.

## 16. Keep your data

```bash
npx supabase db dump --data-only -f backup.sql
```

Add `--remote` to dump a hosted project. The free plan doesn't give you downloadable backups; the CLI does.

## 17. Ship it

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed
npx supabase config push
```

`db push` runs your migrations there and `--include-seed` lists the five companies. `config push` copies the auth settings (anonymous sign-ins on, higher rate limit). Change `site_url` in `config.toml` to wherever you deploy the frontend first.

Closing bell:

```bash
npx supabase db query --remote "update market set open = false"
npx supabase stop
```
