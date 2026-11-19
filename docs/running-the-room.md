# Running the room

Notes for whoever is presenting. The room trades on a hosted free project, you run the market from your laptop with the CLI, and the projector shows the floor.

## The day before

1. Create a free project in the dashboard. Write down the project ref.
2. Set `site_url` in `supabase/config.toml` to wherever the frontend will live.
3. Ship the backend:

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push --include-seed
   npx supabase functions deploy
npx supabase functions deploy
   npx supabase config push
   ```

4. Put the project URL and publishable key in `.env.local`, run `npm run build`, and deploy `dist/` (Vercel, Netlify, GitHub Pages, anything static). Make a QR code for the URL.
5. Smoke test: open the site on your phone and join, then

   ```bash
   npx supabase db query --remote "update market set open = true"
   npm run bots
   ```

   You should see quotes on the book and trades on the tape within 10 seconds. Close it again:

   ```bash
   npx supabase db query --remote "update market set open = false"
   ```

6. `config push` raised the anonymous sign-in limit to 300 an hour per IP, because the whole room shares one campus IP.

## On stage

A rough order. Every command is something the room can watch happen.

| Minute | Say | Type |
| --- | --- | --- |
| 0 | "Scan the QR, pick a name. You've got $10,000 and some shares." | (nothing, let them join) |
| 2 | "Nobody sets these prices. You do. Opening bell." | `npx supabase db query --remote "update market set open = true"` and `npm run bots` |
| 3 | "Everybody: pick a company you like and tap Buy 1. Watch the big screen." | point at the tape and the prices moving |
| 5 | "Buy 1 cost you $42.19. Sell 1 right now only gets $41.78. Where did 41 cents go?" | point at the SLICE book on the floor: that gap is the spread, and it's how the market makers get paid |
| 7 | "Want to name your own price? Tap Pro." Explain limit vs. market orders with the book on screen | point at the book on the floor |
| 9 | "Breaking news." | `... "select news('ORBIT', 'Asteroid confirmed: it is mostly platinum', 'good')"` |
| 11 | "Who got there first? The bots, or you?" | point at the tape and the leaderboard |
| 13 | "Some of you are trying to cheat." | point at the halts/cheaters panel |
| 15 | Explain grants vs. RLS vs. the engine saying no, using the cheat results | open `supabase/migrations/*_who_can_do_what.sql` |
| 20 | "Let's add some momentum traders and a hair trigger." | `npm run bots -- --momentum 5` and `... "update market set breaker_pct = 0.05"` |
| 22 | "Interest rates." | `... "select news(null, 'Interest rates up half a point', 'bad')"`, wait for a halt |
| 25 | "In December these bots become AI agents, trading against you." | point at the leaderboard |
| 27 | Closing bell, switch to labs on laptops | `... "update market set open = false"` |

## After

```bash
npx supabase db query --remote "update market set open = false"
npx supabase db dump --remote --data-only -f trading-night.sql
```

The dump is every order and trade from the night, a good real dataset for the December observability workshop.

## If something goes wrong

- **Magic links or reset emails don't arrive.** The hosted project's built-in email sender only sends a handful an hour. Tell people to play as a guest or use email and password; set up `[auth.email.smtp]` if you need more.

- **Nobody can join.** Anonymous sign-ins are off on the hosted project. Run `npx supabase config push`, or turn them on under Authentication → Sign In / Providers.
- **Orders bounce with "the market is closed".** `select open from market`, then open it.
- **The book is empty.** Start the bots (`npm run bots`); a room of humans alone rarely keeps both sides of the book filled.
- **A stock won't un-halt.** The cron job is gone: `select * from cron.job`. Lab 7 has the command to bring it back.
- **The floor is frozen.** It polls every 1.5 seconds; refresh. Realtime allows 200 connections on the free plan.
