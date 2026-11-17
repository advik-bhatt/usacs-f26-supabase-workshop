# Dinner Rush: market edition

A multiplayer pizza kitchen with a real economy, running on Supabase. Built for the USACS Supabase workshop (Fall 2026).

Everyone in the room joins from their phone and works the line. Orders come in every ten seconds. You grab a ticket, build the pizza, and serve it before the timer runs out. If you're too slow, the ticket goes back on the rail and someone else gets it.

And it costs money. Every cook starts with a $20 allowance. The customer's price is fixed when they order, but you pay for ingredients at today's prices when you cook, and prices move with demand: every topping that goes on a plate gets 6% more expensive for everyone, and drifts back as the pantry restocks. If the whole room piles onto pepperoni, pepperoni orders stop being profitable. Botch a pizza and you eat the cost. Run out of cash and you can't cook until prices come down.

The projector shows the whole kitchen live: how full the rail is, live ingredient prices and their history, the money supply, the median wallet, how unequal the room has become, who's most profitable, and who just tried to cheat and got stopped by Postgres.

The point isn't the pizza. Every part of the game is a Supabase feature doing its actual job, and you drive the whole thing from the Supabase CLI.

| What you see in the game | What's doing it |
| --- | --- |
| New orders every 10 seconds | `pg_cron` calling `kitchen_tick()` |
| Grabbing a ticket so nobody else can | a `pgmq` queue and its visibility timeout |
| "Too slow, it went back on the rail" | the same visibility timeout running out |
| Clocking in with just a name | anonymous sign-in |
| Your wallet and ledger (only you can see them) | Row Level Security |
| Prices that rise with demand and fall as the pantry restocks | `finish_ticket()` and the cron tick |
| A new cook's $20 allowance | a trigger on `cooks` |
| Money supply, median wallet, Gini coefficient | a `security definer` function that only returns totals |
| The cheat menu failing three different ways | grants vs. RLS policies |
| Grading your pizza | an Edge Function using the secret key |
| The pass screen updating by itself | Realtime: Postgres Changes, Broadcast, Presence |
| The host yelling "86 the mushrooms" from a terminal | `realtime.send()` called from SQL |
| Robot cooks | a Node script using the same publishable key as everyone else |

Everything here runs on the free tier, and all of it runs on your laptop with the CLI.

## Other programs in this repo

Each branch is a different game built on the same Supabase ideas. Same setup, just check out the branch first.

| Branch | What it is |
| --- | --- |
| `main` | **Deflect**: planetary defense drill with real NASA/JPL asteroids and an orbital mechanics simulator |
| `dinner-rush-market` | **Dinner Rush, market edition**: a multiplayer pizza kitchen where every cook has a wallet and ingredient prices rise with demand |
| `trading-floor` | **Trading Floor**: a stock exchange with a real order book and matching engine, where the room is the market |
| `trading-floor-simple` | **Trading Floor for first-timers**: the same exchange, with one-tap Buy 1 / Sell 1 as the default and the order book behind a Pro switch |

```bash
git checkout trading-floor     # then: npx supabase db reset && npx supabase stop && npx supabase start
```

Switching branches changes the migrations, so reset the database, and restart the stack so it picks up that branch's Edge Functions.

## Run it on your laptop

You need Node 22+, git, and Docker (Docker Desktop on Mac/Windows).

```bash
git clone https://github.com/advik-bhatt/usacs-f26-supabase-workshop
cd usacs-f26-supabase-workshop
git checkout dinner-rush-market
npm install
npx supabase start          # first run pulls images, give it a few minutes
npm run env:local           # writes .env.local from `supabase status`
npm run dev
```

Then open the kitchen at http://localhost:5173 and the pass screen at http://localhost:5173/#/pass.

The kitchen starts closed. Open it:

```bash
npx supabase db query "update shift set open = true"
```

No one else in the room? Hire some help:

```bash
npm run bots -- 4
```

`supabase start` also gives you Studio at http://127.0.0.1:54323 (a local copy of the dashboard) and Mailpit at http://127.0.0.1:54324, which catches every email Auth sends locally.

## Running it for a room

For the workshop, the game runs on a free hosted project so everyone's phone can reach it. The CLI ships the whole thing from your laptop: schema, seed data, the Edge Function and the auth settings.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed
npx supabase functions deploy serve
npx supabase config push      # turns on anonymous sign-ins, raises the rate limit
```

Then point the app at it. Put the project URL and publishable key in `.env.local` (Dashboard → Project Settings → API Keys) and deploy the frontend anywhere static (`npm run build` makes `dist/`).

The full run of show, with the commands to type on stage and what to point at, is in [docs/running-the-room.md](docs/running-the-room.md).

You can play the local stack over Wi-Fi instead (`npm run dev` already listens on your network), but be careful: the local stack has no password on Studio and uses the default Postgres password, and both listen on every network interface. Anyone on the same Wi-Fi can open them. That's fine at home and a bad idea on campus Wi-Fi.

## Labs

[docs/labs.md](docs/labs.md) has the hands-on part: twelve short exercises, each one a CLI command or two that changes something you can watch happen on the pass screen. They cover migrations, `db diff`, `db reset`, type generation, `test db`, `db advisors`, `inspect db`, cron, queues and Realtime.

## What's in here

```
supabase/
  config.toml                 local stack + auth settings (pushed with `config push`)
  migrations/
    ..._kitchen.sql           the tables
    ..._who_can_do_what.sql   grants and RLS policies
    ..._the_rail.sql          the pgmq queue and the functions that move tickets
    ..._realtime_and_cron.sql publication + the 10 second cron job
    ..._market.sql            wallets, ledger, demand pricing, economy stats, stimulus
  seed.sql                    the toppings
  functions/serve/            Edge Function that grades a pizza and records it
  tests/                      pgTAP tests for the security rules (`npx supabase test db`)
src/
  pages/Kitchen.tsx           the phone screen
  pages/Pass.tsx              the projector screen
  components/Cheats.tsx       five ways to try to cheat, none of which work
  lib/database.types.ts       generated by `npm run types`
bots/cooks.mjs                robot cooks
```

## Scripts

| | |
| --- | --- |
| `npm run dev` | Vite dev server, listening on your network |
| `npm run env:local` | write `.env.local` from the running local stack |
| `npm run types` | regenerate `src/lib/database.types.ts` from the local database |
| `npm run bots -- 5 [--sloppy] [--slow]` | start robot cooks |
| `npm run build` | typecheck and build to `dist/` |

## December: observability and agents

This repo is set up for the next workshop on purpose.

- `public.events` is a structured event log. Every ticket's life (placed, claimed, dropped, served) is in it with timings. Click any line on the pass screen to see one ticket as a timeline. That's a trace, just stored as rows.
- `public.queue_samples` is a metric: how deep the queue was every ten seconds. Events tell you what happened, metrics tell you how busy it was.
- `bots/cooks.mjs` is a pool of workers pulling jobs off a Postgres queue with a timeout and retries. Replace the `decide()` function with a call to a model and it's a pool of agents. Everything they do is already logged and already on the dashboard.
- `supabase start` also runs a local MCP server (`npx supabase status` shows `MCP_URL`), so an agent can read this database without touching a real project.

## Running the economy

All from the terminal, all visible on the pass screen within ten seconds:

```bash
npx supabase db query "select stimulus(500)"                      # print money: everyone gets $5
npx supabase db query "update shift set demand_bump = 0.20"       # every purchase moves prices 20%
npx supabase db query "update shift set restock_rate = 0.01"      # the pantry barely restocks
npx supabase db query "update shift set allowance_cents = 500"    # newcomers start poor
```

Try `stimulus` while prices are high and watch what happens to them. Try a high `demand_bump` with a slow `restock_rate` and watch the Gini coefficient.

## Good to know

- Free plan: two active projects, paused after a week of inactivity, 500 MB database, 200 concurrent Realtime connections. Plenty for a room.
- The kitchen keeps running until you stop it. When you're done: `npx supabase db query "update shift set open = false"`, or `npx supabase stop` locally.
- The secret key never leaves `supabase/functions/`. The browser and the bots only ever use the publishable key.
