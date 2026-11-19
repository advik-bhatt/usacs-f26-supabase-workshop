# Trading Floor (for first-timers)

A stock exchange that runs on Supabase, where the people in the room are the market. Built for the USACS Supabase workshop (Fall 2026).

This branch is for rooms where most people have never traded. The phone opens with a three-sentence explainer, then a simple screen: every company, its price, how many shares you own, and two buttons, **Buy 1** ("costs about $42.19") and **Sell 1** ("get about $41.78"). A line at the top says whether you're up or down since the opening bell. The order book, limit orders and the full order form are one tap away under **Pro**, for when you're ready to explain them on the big screen. The exchange underneath is identical to the `trading-floor` branch.

Everyone joins from their phone and gets $10,000 and 20 shares each of five made-up companies. Nobody sets the prices. The only thing that moves a stock is a trade: someone willing to buy meeting someone willing to sell. Put in a limit order and it waits on the order book until somebody takes it. Put in a market order and it takes whatever's on the book right now. Push a stock 20% from the open and the circuit breaker halts it for a minute.

The projector shows the floor: every price, the live order book, the tape of every trade, a leaderboard by net worth, how unequal the room has become, the news the host just dropped, and everyone who tried to cheat and got stopped by Postgres.

The whole exchange is a Supabase project, and you drive it from the Supabase CLI.

| What you see | What's doing it |
| --- | --- |
| Create an account, sign in, magic link, forgot password | Supabase Auth: `signUp`, `signInWithPassword`, `signInWithOtp`, `resetPasswordForEmail` |
| Play as a guest, then save it with an email later | `signInAnonymously()`, then `updateUser({ email, password })` on the same user |
| Your profile picture | Supabase Storage: an `avatars` bucket, one folder per user, RLS on `storage.objects` |
| Delete my account | an Edge Function calling `auth.admin.deleteUser()` with the secret key |
| "Buy 1: costs about $42.19" | `quotes()`: the best ask and best bid for every stock, prices only |
| Matching buyers and sellers | `place_order()`, one plpgsql function with price-time priority |
| Your cash, shares, orders and fills (only yours) | Row Level Security |
| Nobody can trade money they've already promised | `reserved_cents` and `reserved` set aside by open orders |
| The order book and the tape (public, anonymous) | `order_book()` returns price levels only; `trades` has no names on it |
| Prices updating on every phone | Realtime: Postgres Changes on `stocks` |
| "Filled: bought 3 SLICE" on your phone only | Postgres Changes on `fills`, filtered by RLS per subscriber |
| The host's headline on every screen | `news()` calls `realtime.send()` from SQL |
| Halted stocks reopening by themselves | `pg_cron` running `market_tick()` every 10 seconds |
| $10,000 and 20 shares when you join | a trigger on `traders` |
| Leaderboard and inequality score | a `security definer` function that only returns totals |
| Market makers, noise traders, momentum traders | a Node script using the same publishable key as everyone else |

Everything here runs on the free tier, and all of it runs on your laptop with the CLI.

## How the exchange works

This is a real continuous double auction, the mechanism every major stock exchange uses, minus the speed.

- **Limit order**: "buy 10 SLICE at $42.00 or less." If someone is already selling at $42.00 or less, you trade. Whatever's left waits on the book.
- **Market order**: "buy 10 SLICE at whatever it costs." It takes the cheapest asks on the book until it's done or the book runs dry, then cancels the rest.
- **Price-time priority**: the best price goes first; at the same price, whoever got there first goes first.
- **The resting order sets the price.** Bid $45 into an ask at $43 and you pay $43.
- **No short selling, no borrowing.** You can only sell shares you have and only bid with money you have. Open orders set that money and those shares aside so you can't promise them twice.
- **Circuit breaker**: if a stock trades 20% or more from the session open, it's halted for 60 seconds. The cron tick reopens it.

The pgTAP tests check the economics, not just the permissions: trades happen at the resting price, reserved cash can't be spent twice, cancelling releases it, and after every test no money or shares have been created or destroyed.

## Other programs in this repo

Each branch is a different game built on the same Supabase ideas. Same setup, just check out the branch first.

| Branch | What it is |
| --- | --- |
| `main` | **Deflect**: planetary defense drill with real NASA/JPL asteroids and an orbital mechanics simulator |
| `dinner-rush-market` | **Dinner Rush, market edition**: a multiplayer pizza kitchen where every cook has a wallet and ingredient prices rise with demand |
| `trading-floor` | **Trading Floor**: a stock exchange with a real order book and matching engine, where the room is the market |
| `trading-floor-simple` | **Trading Floor for first-timers**: the same exchange, with one-tap Buy 1 / Sell 1 as the default and the order book behind a Pro switch |
| `friendsgiving` | **Pixel Potluck**: a retro Friendsgiving cooking race with a walkable grocery store, an allowance, and a jazz soundtrack |

```bash
git checkout trading-floor     # then: npx supabase db reset && npx supabase stop && npx supabase start
```

Switching branches changes the migrations, so reset the database, and restart the stack so it picks up that branch's Edge Functions.

## Run it on your laptop

You need Node 22+, git, and Docker (Docker Desktop on Mac/Windows).

```bash
git clone https://github.com/advik-bhatt/usacs-f26-supabase-workshop
cd usacs-f26-supabase-workshop
git checkout trading-floor-simple
npm install
npx supabase start          # first run pulls images, give it a few minutes
npm run env:local           # writes .env.local from `supabase status`
npm run dev
```

Your phone screen is at http://localhost:5173 and the big screen at http://localhost:5173/#/floor.

The market starts closed. Ring the bell:

```bash
npx supabase db query "update market set open = true"
```

Then bring in some liquidity, so there's always somebody to trade with:

```bash
npm run bots
```

That's two market makers and three noise traders. Add momentum traders to get bubbles, crashes and circuit-breaker halts: `npm run bots -- --makers 2 --noise 3 --momentum 4`.

## Running the market

All from the terminal, all on the big screen within seconds:

```bash
npx supabase db query "select news('ORBIT', 'Asteroid confirmed: it is mostly platinum', 'good')"
npx supabase db query "select news(null, 'Interest rates up half a point', 'bad')"     # the whole market
npx supabase db query "update market set breaker_pct = 0.05"                          # a hair trigger
npx supabase db query "select new_session()"                                         # today's prices become the new open
npx supabase db query "select order_book('SLICE')"                                   # the book, from SQL
npx supabase db query "update market set open = false"                               # closing bell
```

The bots read every headline and trade on its mood. The people in the room read it too, and the interesting part is who gets there first.

## Running it for a room

For the workshop the exchange runs on a free hosted project so everyone's phone can reach it:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed
npx supabase functions deploy
npx supabase config push      # turns on anonymous sign-ins, raises the rate limit
```

There's no Edge Function on this branch: every trade goes through `place_order()` in the database. Put the project URL and publishable key in `.env.local`, `npm run build`, and deploy `dist/` anywhere static. Run the bots from your laptop against the hosted project (they read the same `.env.local`).

The run of show is in [docs/running-the-room.md](docs/running-the-room.md), and the hands-on exercises are in [docs/labs.md](docs/labs.md).

You can run the local stack over Wi-Fi instead (`npm run dev` already listens on your network), but the local stack has no password on Studio and uses the default Postgres password, and both listen on every network interface. Fine at home, a bad idea on campus Wi-Fi.

## What's in here

```
supabase/
  config.toml                  local stack + auth settings (pushed with `config push`)
  migrations/
    ..._exchange.sql           the tables
    ..._who_can_do_what.sql    grants and RLS policies
    ..._matching_engine.sql    place_order, cancel_order, order_book, the circuit breaker, news
    ..._realtime_and_cron.sql  publication + the 10 second tick
    ..._quotes.sql             best bid and ask for every stock, for simple mode
  seed.sql                     five made-up companies
  functions/delete-account/   Edge Function that deletes your user (needs the secret key)
  tests/exchange.test.sql      rules and economics (`npx supabase test db`)
src/
  pages/Trader.tsx             the phone screen
  pages/Floor.tsx              the big screen
  components/Simple.tsx        the first-run explainer and the one-tap Buy 1 / Sell 1 screen
  components/Charts.tsx        sparklines, the market chart, the order book
  components/AuthGate.tsx      sign up, sign in, magic link, forgot password
  components/Account.tsx       picture, name, save a guest, change password, delete account
  components/Cheats.tsx        six ways to try to cheat, none of which work
  lib/database.types.ts        generated by `npm run types`
bots/traders.mjs               market makers, noise traders, momentum traders
```

## Scripts

| | |
| --- | --- |
| `npm run dev` | Vite dev server, listening on your network |
| `npm run env:local` | write `.env.local` from the running local stack |
| `npm run types` | regenerate `src/lib/database.types.ts` from the local database |
| `npm run bots -- [--makers N] [--noise N] [--momentum N]` | start robot traders |
| `npm run build` | typecheck and build to `dist/` |

## December: observability and agents

- `public.events` logs every order, rejection, cancel, halt, resume and headline. `trades` and `price_samples` are a time series you can query.
- `bots/traders.mjs` has three strategies, each one function. Replace one with a model and you have trading agents, competing on the same book as humans and the other bots, with every decision on the record.
- `supabase start` runs a local MCP server (`npx supabase status` shows `MCP_URL`), so an agent can read the market without touching a real project.

## Accounts

Everything most apps need, on top of the game:

- **Sign in however you like.** Play as a guest, create an account with email and password, sign in with a one-time link, or reset a forgotten password. Locally, every email lands in Mailpit (http://127.0.0.1:54324), not a real inbox.
- **Save a guest account.** A guest who adds an email and password keeps the same user id, so everything they've done stays theirs.
- **Profile pictures.** Uploaded to Storage under `avatars/<your user id>/`. The bucket is public so leaderboards can show everyone's picture, but RLS on `storage.objects` means you can only write to your own folder. The picture is shrunk to 256px in the browser before it's uploaded.
- **Edit your name, change your password, sign out, delete your account.** Deleting goes through the `delete-account` Edge Function, because removing a user needs the secret key. It deletes your picture, then your user, and `on delete cascade` takes your profile and everything hanging off it. The event log keeps its history.

On a hosted project, sign-up doesn't wait for a confirmation email (`config push` sends `enable_confirmations = false`), but Supabase's built-in email sender only allows a handful of emails an hour. For a full room, have people play as guests or use email and password. Magic links and password resets for 30 people need your own SMTP server (`[auth.email.smtp]` in `config.toml`).

## Good to know

- Every company is made up. This is a teaching market, not investment advice.
- Free plan: two active projects, paused after a week of inactivity, 500 MB database, 200 concurrent Realtime connections.
- `place_order()` serializes every order behind one lock. That's plenty for a room. A real exchange does the same thing with a single-threaded matcher per symbol, in microseconds.
