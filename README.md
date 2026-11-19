# Pixel Potluck

A retro Friendsgiving cooking race that runs on Supabase. Built for the USACS Supabase workshop (Fall 2026).

Everyone in the room joins from their phone, makes an account and picks a pixel cook. You get an allowance, choose what you're bringing to dinner, walk the grocery store aisle by aisle grabbing ingredients, then head home and cook each dish with a few well-timed taps. The clock runs the whole time. The game is never mean about it: every tap and every dinner is graded **Super!**, **Great!**, **Good** or **OK**, and the worst you can get is OK.

The projector shows the live dashboard: everyone walking the store in real time, who's shopping or cooking or done, how long they've been at it, their level, what they spent, their score, the best dinners of the night, and everyone who just tried to cheat and got stopped by Postgres.

There's a little lo-fi jazz band in the browser too. The menu is a slow lounge tune, the store swings, the kitchen picks up the tempo, and the results screen celebrates. Every note is generated with the Web Audio API, so there are no audio files and nothing to license. 🎷 mutes it.

Every part of it is a Supabase feature doing its actual job, and you drive the whole thing from the Supabase CLI.

| What you see | What's doing it |
| --- | --- |
| Create an account, sign in, magic link, forgot password | Supabase Auth: `signUp`, `signInWithPassword`, `signInWithOtp`, `resetPasswordForEmail` |
| Play as a guest, then save it with an email later | `signInAnonymously()`, then `updateUser({ email, password })` on the same user |
| Your profile picture | Supabase Storage: an `avatars` bucket, one folder per user, RLS on `storage.objects` |
| Delete my account | an Edge Function calling `auth.admin.deleteUser()` with the secret key |
| Your allowance, your basket, your score | Postgres functions (`start_run`, `buy`, `finish_run`) that check every move |
| Seeing everyone's score but only your own basket | Row Level Security |
| The cheat menu failing in different ways | grants vs. RLS policies vs. a server that checks |
| Other cooks walking the aisles on your screen | Realtime Broadcast (positions are never stored) |
| "The store is open!" reaching every phone at once | Realtime Postgres Changes on the `game` table |
| The host announcing "Pie is worth a lot tonight" from a terminal | `realtime.send()` called from SQL |
| People who wander off showing as "away" | `pg_cron` running `tidy_up()` every minute |
| Robot dinner guests | a Node script using the same publishable key as everyone else |

Everything here runs on the free tier, and all of it runs on your laptop with the CLI.

## How scoring works

Bigger menus are worth more, and they're harder. That's the whole game.

| Dish | Difficulty | Ingredients cost | Items | Cooking steps | Base points |
| --- | --- | --- | --- | --- | --- |
| Cranberry Sauce | ★ | $5.00 | 3 | 2 | 100 |
| Mashed Potatoes | ★ | $6.50 | 3 | 2 | 100 |
| Cornbread | ★ | $6.50 | 3 | 2 | 110 |
| Green Bean Casserole | ★★ | $7.50 | 4 | 3 | 220 |
| Mac & Cheese | ★★ | $9.50 | 4 | 3 | 230 |
| Stuffing | ★★ | $8.50 | 5 | 3 | 240 |
| Pumpkin Pie | ★★★ | $11.50 | 5 | 4 | 380 |
| Roast Turkey | ★★★★ | $19.00 | 6 | 5 | 620 |

You start with $40. Spend it all on turkey, pie and stuffing and you're playing for a lot of points, but you have 16 things to find and 12 cooking steps where the sweet spot is smaller and the marker moves faster. Bring cranberry sauce alone and you'll be done in no time with a fraction of the points.

For each dish you cook: **base points × (0.5 + 0.5 × accuracy) × speed**.

- **Accuracy** is how close your taps land to the middle of the green zone, from 0.45 (all OK) to 1 (all Super!).
- **Speed** is par time divided by your time, kept between 0.6 and 2.0. Par is 15 seconds plus 2 per ingredient plus 2 per cooking step on your menu, so a big menu gets more time. Beat par and you earn up to double; take it slow and you still keep 60%.
- Forget an ingredient and that dish is skipped (gently). Everything you did buy for it was spent anyway.

Every point you score goes into your XP, and your level is 1 + √(XP ÷ 150), rounded down. All of it is computed in `finish_run()` in the database, not on your phone, which is why the cheat menu can't help you.

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
git checkout friendsgiving
npm install
npx supabase start          # first run pulls images, give it a few minutes
npm run env:local           # writes .env.local from `supabase status`
npm run dev
```

The game is at http://localhost:5173 and the live dashboard at http://localhost:5173/#/live.

The store starts closed, so you can pick dishes but not shop yet. Open it:

```bash
npx supabase db query "update game set open = true"
```

No one else in the room? Invite some guests:

```bash
npm run bots -- 4
```

`supabase start` also gives you Studio at http://127.0.0.1:54323 (a local copy of the dashboard) and Mailpit at http://127.0.0.1:54324, which catches every email Auth sends locally.

Controls: arrow keys or WASD to walk, space to grab or to tap while cooking. On a phone, the D-pad (hold it to keep walking) and the big buttons.

## Running it for a room

For the workshop the game runs on a free hosted project so everyone's phone can reach it. The CLI ships the whole thing from your laptop: schema, the store and the recipes, the Edge Function and the auth settings.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed
npx supabase functions deploy
npx supabase config push      # turns on anonymous sign-ins, raises the rate limit
```

Then put the project URL and publishable key in `.env.local` (Dashboard → Project Settings → API Keys), `npm run build`, and deploy `dist/` anywhere static.

The run of show, with the commands to type on stage, is in [docs/running-the-room.md](docs/running-the-room.md).

You can play the local stack over Wi-Fi instead (`npm run dev` already listens on your network), but be careful: the local stack has no password on Studio and uses the default Postgres password, and both listen on every network interface. Anyone on the same Wi-Fi can open them. That's fine at home and a bad idea on campus Wi-Fi.

## Labs

[docs/labs.md](docs/labs.md) has the hands-on part: short exercises, each a CLI command or two that changes something you can watch on the dashboard. They cover migrations (including adding a new dish to the store), `db diff`, `db reset`, type generation, `test db`, `db advisors`, `inspect db`, cron, Realtime, and reading the event log to find out whether the big menus are really worth it.

## What's in here

```
supabase/
  config.toml                  local stack + auth settings (pushed with `config push`)
  migrations/
    ..._potluck.sql            the tables
    ..._who_can_do_what.sql    grants and RLS policies
    ..._accounts.sql           profile pictures: the avatars bucket and its policies
    ..._the_game.sql           start_run, buy, head_home, finish_run, dashboard, announce
    ..._realtime_and_cron.sql  publication + the cron jobs
  seed.sql                     the store (22 ingredients on their shelves) and 8 recipes
  functions/delete-account/    Edge Function that deletes your user (needs the secret key)
  tests/                       pgTAP tests for the rules and the scoring (`npx supabase test db`)
src/
  pages/Play.tsx               the phone: pick a cook, the menu, results
  pages/Live.tsx               the projector dashboard
  components/StoreView.tsx     the walkable store
  components/Kitchen.tsx       the timing-tap cooking
  components/Cheats.tsx        six ways to try to cheat, none of which work
  components/AuthGate.tsx      sign up, sign in, magic link, forgot password
  components/Account.tsx       picture, name, save a guest, change password, delete account
  game/store.ts                the store's floor plan, walking, path finding, tap grading
  game/sprites.ts              every cook and dish, drawn as text grids
  game/music.ts                the jazz band
  lib/database.types.ts        generated by `npm run types`
bots/guests.mjs                robot dinner guests
```

## Scripts

| | |
| --- | --- |
| `npm run dev` | Vite dev server, listening on your network |
| `npm run env:local` | write `.env.local` from the running local stack |
| `npm run types` | regenerate `src/lib/database.types.ts` from the local database |
| `npm run bots -- 5` | send robot guests to the potluck (some bold, some careful) |
| `npm run build` | typecheck and build to `dist/` |

## December: observability and agents

This repo is set up for the next workshop on purpose.

- `public.events` is a structured event log: joined, started (with the menu), home (with what was spent), finished (with score and time), too_fast, blocked. Every trip through the store is a trace, stored as rows.
- `public.runs.result` keeps the breakdown of every dinner: accuracy and points per dish, seconds, par, speed. That's a dataset for asking "is the big menu actually worth it?" with real numbers from the room.
- `bots/guests.mjs` is a pool of agents playing the same game as the people, through the same gates. Their brain is two small functions, `chooseMenu()` and `howWellICook()`. Swap in a model and you have AI guests competing with the room, graded by a server that checks their work instead of trusting it.
- `supabase start` also runs a local MCP server (`npx supabase status` shows `MCP_URL`), so an agent can read this database without touching a real project.

## Accounts

Everything most apps need, on top of the game:

- **Sign in however you like.** Play as a guest, create an account with email and password, sign in with a one-time link, or reset a forgotten password. Locally, every email lands in Mailpit (http://127.0.0.1:54324), not a real inbox.
- **Save a guest account.** A guest who adds an email and password keeps the same user id, so their cook, level and dinners stay theirs.
- **Profile pictures.** Uploaded to Storage under `avatars/<your user id>/` and shown next to your name on the dashboard. The bucket is public so the dashboard can show everyone's picture, but RLS on `storage.objects` means you can only write to your own folder. The picture is shrunk to 256px in the browser before it's uploaded.
- **Edit your name, change your cook, change your password, sign out, delete your account.** Deleting goes through the `delete-account` Edge Function, because removing a user needs the secret key. It deletes your picture, then your user, and `on delete cascade` takes your player and everything hanging off it. The event log keeps its history.

On a hosted project, sign-up doesn't wait for a confirmation email (`config push` sends `enable_confirmations = false`), but Supabase's built-in email sender only allows a handful of emails an hour. For a full room, have people play as guests or use email and password. Magic links and password resets for 30 people need your own SMTP server (`[auth.email.smtp]` in `config.toml`).

## Good to know

- The pixel fonts (Press Start 2P and VT323) load from Google Fonts. Offline, the game falls back to your system's monospace font and still works.
- Browsers don't play sound until you tap something, so the music starts on your first tap or key press.
- Free plan: two active projects, paused after a week of inactivity, 500 MB database, 200 concurrent Realtime connections. Plenty for a room.
- Trips nobody touches for 20 minutes are abandoned, and players idle for 10 show as away (`tidy_up()`, every minute). Events older than two days are trimmed every hour.
- Close the store when you're done: `npx supabase db query "update game set open = false"`, or `npx supabase stop` locally.
- The secret key never leaves `supabase/functions/`. The browser and the bots only ever use the publishable key.
