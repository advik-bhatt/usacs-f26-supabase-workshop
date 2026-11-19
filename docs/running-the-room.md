# Running the room

Notes for whoever is presenting. The room plays on a hosted free project, you drive it from your laptop with the CLI, and the projector shows mission control.

## The day before

1. Create a free project in the dashboard. Write down the project ref.
2. Optional: refresh the asteroid catalog so the close approaches are current (`npm run nasa:fetch`, no API key needed).
3. Set `site_url` in `supabase/config.toml` to wherever the frontend will live.
4. Ship the backend:

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push --include-seed
   npx supabase functions deploy
   npx supabase config push
   ```

5. Put the project URL and publishable key in `.env.local`, run `npm run build`, and deploy `dist/` (Vercel, Netlify, GitHub Pages, anything static). Make a QR code for the URL.
6. Smoke test: open the site on your phone and join, then

   ```bash
   npx supabase db query --remote "update mission set open = true"
   npm run bots -- 2
   ```

   Within 20 seconds you should see targets and bot missions on mission control. Then close it again:

   ```bash
   npx supabase db query --remote "update mission set open = false"
   ```

7. `config push` raised the anonymous sign-in limit to 300 an hour per IP, because the whole room shares one campus IP. If you skip it, the 31st person can't join.

## On stage

A rough order. Every command is something the room can watch happen.

| Minute | Say | Type |
| --- | --- | --- |
| 0 | "Scan the QR, pick a name. These are real asteroids from NASA's catalog." | (nothing, let them join) |
| 2 | "The board's closed. Let's open it." | `npx supabase db query --remote "update mission set open = true"` |
| 4 | "DART hit Dimorphos at 6 km/s and moved it. You've got the same physics on your phone." | point at a phone's orbit view |
| 8 | "Which way should you push? Look at the saves." | `... "select detail->>'direction', count(*) from events where kind = 'saved' group by 1"` |
| 10 | "It's getting busy." | `... "update mission set targets_per_tick = 3"` |
| 12 | "What's in the queue right now?" | `... "select * from pgmq.metrics('targets')"` |
| 14 | "Some of you are trying to cheat. Let's see how that's going." | point at **Blocked by Postgres** |
| 16 | Explain grants vs. RLS vs. the server re-running the physics, using the error shapes on screen | open `supabase/migrations/*_who_can_do_what.sql` |
| 22 | "Apophis is on the board." | `... "select announce('Apophis is on the board. Good luck.')"` |
| 24 | "You're too slow. Let me get help." | `npm run bots -- 6` |
| 26 | "These bots run a physics optimizer. In December, they'll be AI agents, and we'll grade them against these." | point at the leaderboard |
| 28 | Close the board, switch to labs on their own laptops | `... "update mission set open = false"` |

Click any line in the live feed to open that target's timeline. It's the easiest way to explain the event log and visibility timeouts with a real example from the room.

## After

```bash
npx supabase db query --remote "update mission set open = false"
npx supabase db dump --remote --data-only -f workshop-night.sql
```

The dump is everyone's missions. It makes a good real dataset for the December observability workshop. The project pauses itself after a quiet week on the free plan; restore it from the dashboard when you need it.

## If something goes wrong

- **Magic links or reset emails don't arrive.** The hosted project's built-in email sender only sends a handful an hour. Tell people to play as a guest or use email and password; set up `[auth.email.smtp]` if you need more.

- **Nobody can join.** Anonymous sign-ins are off on the hosted project. Run `npx supabase config push`, or turn them on under Authentication → Sign In / Providers.
- **Launch fails for everyone.** The Edge Function isn't deployed: `npx supabase functions deploy`.
- **The board stays empty.** Either the mission is closed (`select open from mission`), the cron job is gone (`select * from cron.job`), or every asteroid's close approach has passed (`npm run nasa:fetch`, then `db push --include-seed`).
- **Mission control is frozen.** It polls every 2 seconds, so a refresh fixes it. Realtime allows 200 connections on the free plan; a big room plus bots can get close.
