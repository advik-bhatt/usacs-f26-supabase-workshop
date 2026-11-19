# Running the room

Notes for whoever is presenting. The room plays on a hosted free project; you drive it from your laptop with the CLI and the projector shows the pass screen.

## The day before

1. Create a free project in the dashboard. Write down the project ref.
2. Set `site_url` in `supabase/config.toml` to wherever the frontend will live.
3. Ship the backend:

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push --include-seed
   npx supabase functions deploy
   npx supabase config push
   ```

4. Put the project URL and publishable key in `.env.local`, `npm run build`, and deploy `dist/` (Vercel, Netlify, GitHub Pages, anything static). Make a QR code for the URL.
5. Smoke test: open the site on your phone, clock in, then

   ```bash
   npx supabase db query --remote "update shift set open = true"
   npm run bots -- 2
   ```

   You should see tickets and bot serves on the pass screen within 20 seconds. Then close it again:

   ```bash
   npx supabase db query --remote "update shift set open = false"
   ```

6. `config push` raised the anonymous sign-in limit to 300 an hour per IP, because the whole room shares one campus IP. If you skipped it, the 31st person can't join.

## On stage

Rough order. Every command is something the room can watch happen.

| Minute | Say | Type |
| --- | --- | --- |
| 0 | "Scan the QR, pick a name." | (nothing, let them join) |
| 2 | "The kitchen's closed. Let's open it." | `npx supabase db query --remote "update shift set open = true"` |
| 5 | "That was easy. Let's make it hard." | `... "update shift set tickets_per_tick = 4"` |
| 8 | "Who's walking out? Let's look inside the queue." | `... "select * from pgmq.metrics('tickets')"` |
| 10 | "Some of you are trying to cheat. Let's see how that's going." | point at **Blocked by Postgres** |
| 12 | Explain grants vs. RLS using the three error shapes on screen | open `supabase/migrations/*_who_can_do_what.sql` |
| 18 | "86 the pineapple." | `... "select shout('86 the pineapple')"` |
| 19 | "Pepperoni's getting expensive. Who's broke?" | point at the pantry and the economy panel |
| 20 | "Let's print some money." | `... "select stimulus(500)"`, then watch prices climb |
| 20 | "You're too slow. Let me help." | `npm run bots -- 6` |
| 22 | "Robots are beating you. In December, they'll be AI." | point at the leaderboard |
| 25 | Close the kitchen, switch to labs on their own laptops | `... "update shift set open = false"` |

Click any line in the live feed to pop open that ticket's timeline. It's a good way to explain the event log and visibility timeouts with a real example from the room.

## After

```bash
npx supabase db query --remote "update shift set open = false"
npx supabase db dump --remote --data-only -f workshop-night.sql
```

The dump is the room's game data. It's useful in December as a real dataset for the observability workshop. The project pauses itself after a quiet week on the free plan; restore it from the dashboard when you need it.

## If something goes wrong

- **Magic links or reset emails don't arrive.** The hosted project's built-in email sender only sends a handful an hour. Tell people to play as a guest or use email and password; set up `[auth.email.smtp]` if you need more.

- **Nobody can join.** Anonymous sign-ins are off on the hosted project. Run `npx supabase config push`, or turn them on under Authentication → Sign In / Providers.
- **Serving fails for everyone.** The Edge Function isn't deployed: `npx supabase functions deploy`.
- **No tickets are coming in.** Either the shift is closed (`select open from shift`) or the cron job is gone (`select * from cron.job`).
- **The pass screen is frozen.** It polls every 2 seconds, so a refresh fixes it. Realtime allows 200 connections on the free plan; a big room plus bots can get close.
