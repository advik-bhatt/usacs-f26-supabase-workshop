# Deflect

A multiplayer planetary defense drill that runs on Supabase. Built for the USACS Supabase workshop (Fall 2026).

The asteroids are real: 60 near-Earth objects pulled from NASA/JPL's Small-Body Database, with their real orbits and real close approaches over the next ten years, Apophis's April 2029 flyby included. The drill assumes each one is going to hit Earth. Everyone in the room joins from their phone, takes a target off the board, and designs a kinetic impactor mission (the same idea as NASA's DART): how far ahead to hit it, how heavy a spacecraft, which way to push. A real orbital mechanics simulation previews the result in the browser. Launch, and an Edge Function re-runs the same simulation on the server to decide whether Earth was saved.

The projector shows mission control: the targets' orbits, how full the board is, saves and impacts per minute, the leaderboard, and everyone who just tried to cheat and got stopped by Postgres.

Every part of it is a Supabase feature doing its actual job, and you drive the whole thing from the Supabase CLI.

| What you see | What's doing it |
| --- | --- |
| New asteroids on the board every 10 seconds | `pg_cron` calling `mission_tick()` |
| Taking a target so nobody else can | a `pgmq` queue and its visibility timeout |
| "Too slow, it went back on the board" | the same visibility timeout running out |
| Joining with just a name | anonymous sign-in |
| Your credits (only you can see them) | Row Level Security |
| The cheat menu failing in different ways | grants vs. RLS policies vs. a server that checks |
| Deciding whether you saved Earth | an Edge Function running the physics with the secret key |
| Mission control updating by itself | Realtime: Postgres Changes, Broadcast, Presence |
| The host announcing "Apophis is on the board" from a terminal | `realtime.send()` called from SQL |
| Robot flight dynamics officers | a Node script using the same publishable key as everyone else |

Everything here runs on the free tier, and all of it runs on your laptop with the CLI.

## The physics

`supabase/functions/_shared/orbit.ts` is one file that runs in the browser (the preview), in the Edge Function (the grade that counts), and in the bots.

- Kepler's equation turns JPL's orbital elements into the asteroid's position and velocity at the moment the impactor hits. From there a fourth-order Runge-Kutta integration of the Sun's gravity flies it twice, once untouched and once pushed, and compares the two.
- The drill puts Earth where the asteroid really will be at its close approach, moving at Earth's orbital speed.
- The push is a kinetic impactor: velocity change = β × spacecraft mass × impact speed ÷ asteroid mass, with β = 3.6 and 6.1 km/s, both measured by DART. Asteroid mass comes from JPL's diameter (or its brightness when there's no measured size) at an assumed 2,000 kg/m³.
- It's a save if the asteroid now passes Earth's center by more than the capture radius: Earth's radius, widened for the way Earth's gravity bends an incoming rock toward it.

What it leaves out: every planet's pull except the Sun's, and the constraint that a real impactor can only push in the direction it arrives from. `npm run check:physics` compares our model to JPL's own close-approach distances for all 60 asteroids. The median error is about 6%. A handful are far off, mostly very close passes that the planets bend in ways we ignore. That's fine for a drill, and it's an honest thing to show people.

## Run it on your laptop

You need Node 22+, git, and Docker (Docker Desktop on Mac/Windows).

```bash
git clone https://github.com/advik-bhatt/usacs-f26-supabase-workshop
cd usacs-f26-supabase-workshop
npm install
npx supabase start          # first run pulls images, give it a few minutes
npm run env:local           # writes .env.local from `supabase status`
npm run dev
```

The phone console is at http://localhost:5173 and mission control at http://localhost:5173/#/control.

The board starts closed. Open it:

```bash
npx supabase db query "update mission set open = true"
```

No one else in the room? Bring in some help:

```bash
npm run bots -- 4
```

`supabase start` also gives you Studio at http://127.0.0.1:54323 (a local copy of the dashboard) and Mailpit at http://127.0.0.1:54324, which catches every email Auth sends locally.

## Running it for a room

For the workshop the game runs on a free hosted project so everyone's phone can reach it. The CLI ships the whole thing from your laptop: schema, asteroid catalog, the Edge Function and the auth settings.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --include-seed
npx supabase functions deploy deflect
npx supabase config push      # turns on anonymous sign-ins, raises the rate limit
```

Then put the project URL and publishable key in `.env.local` (Dashboard → Project Settings → API Keys), `npm run build`, and deploy `dist/` anywhere static.

The run of show, with the commands to type on stage, is in [docs/running-the-room.md](docs/running-the-room.md).

You can play the local stack over Wi-Fi instead (`npm run dev` already listens on your network), but be careful: the local stack has no password on Studio and uses the default Postgres password, and both listen on every network interface. Anyone on the same Wi-Fi can open them. That's fine at home and a bad idea on campus Wi-Fi.

## Labs

[docs/labs.md](docs/labs.md) has the hands-on part: short exercises, each a CLI command or two that changes something you can watch on mission control. They cover migrations, `db diff`, `db reset`, type generation, `test db`, `db advisors`, `inspect db`, cron, queues, Realtime, and checking the physics.

## What's in here

```
supabase/
  config.toml                 local stack + auth settings (pushed with `config push`)
  migrations/
    ..._mission.sql           the tables
    ..._who_can_do_what.sql   grants and RLS policies
    ..._the_board.sql         the pgmq queue and the functions that move targets
    ..._realtime_and_cron.sql publication + the 10 second cron job
  seed.sql                    60 real asteroids from JPL (`npm run nasa:fetch` regenerates it)
  functions/_shared/orbit.ts  the orbital mechanics, shared by browser, server and bots
  functions/deflect/          Edge Function that flies the mission and records the result
  tests/                      pgTAP tests for the security rules (`npx supabase test db`)
src/
  pages/Console.tsx           the phone screen
  pages/MissionControl.tsx    the projector screen
  components/OrbitView.tsx    orbit diagram and the miss-distance plot
  components/Cheats.tsx       six ways to try to cheat, none of which work
  lib/database.types.ts       generated by `npm run types`
bots/crew.mjs                 robot flight dynamics officers
scripts/
  fetch-asteroids.mjs         pulls the catalog from JPL's public APIs
  check-physics.ts            compares our model with JPL's numbers
```

## Scripts

| | |
| --- | --- |
| `npm run dev` | Vite dev server, listening on your network |
| `npm run env:local` | write `.env.local` from the running local stack |
| `npm run types` | regenerate `src/lib/database.types.ts` from the local database |
| `npm run bots -- 5 [--sloppy]` | start robot crew (careful ones simulate; sloppy ones guess) |
| `npm run nasa:fetch` | refresh `supabase/seed.sql` from JPL (no API key needed) |
| `npm run check:physics` | how close our physics gets to JPL's |
| `npm run build` | typecheck and build to `dist/` |

## December: observability and agents

This repo is set up for the next workshop on purpose.

- `public.events` is a structured event log. Every target's life (posted, claimed, dropped, saved or impact) is in it with timings and the mission parameters. Click any line on mission control to see one target as a timeline. That's a trace, stored as rows.
- `public.queue_samples` is a metric: how deep the queue was every ten seconds.
- `bots/crew.mjs` is a pool of workers pulling jobs off a Postgres queue with timeouts and retries. Its `planCarefully()` is a physics-in-the-loop optimizer, `planSloppily()` is a rule of thumb. Put a model in their place and you have agents, a baseline to grade them against, and a server that checks their work instead of trusting it.
- `supabase start` also runs a local MCP server (`npx supabase status` shows `MCP_URL`), so an agent can read this database without touching a real project.

## Good to know

- Not affiliated with NASA or JPL. The data comes from JPL's public Small-Body Database and Close Approach Data APIs. The impacts are a drill: every close approach in the data is a real miss, and the game shows how far.
- Free plan: two active projects, paused after a week of inactivity, 500 MB database, 200 concurrent Realtime connections. Plenty for a room.
- The board keeps posting until you close it: `npx supabase db query "update mission set open = false"`, or `npx supabase stop` locally.
- The secret key never leaves `supabase/functions/`. The browser and the bots only ever use the publishable key.
