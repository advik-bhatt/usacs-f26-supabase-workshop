# Running the room

Notes for whoever is presenting. The room plays on a hosted free project, you drive it from your laptop with the CLI, and the projector shows the live dashboard.

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

4. Put the project URL and publishable key in `.env.local`, run `npm run build`, and deploy `dist/` (Vercel, Netlify, GitHub Pages, anything static). Make a QR code for the URL.
5. Smoke test: open the site on your phone and join, then

   ```bash
   npx supabase db query --remote "update game set open = true"
   npm run bots -- 2
   ```

   Within a few seconds you should see the bots walking the store on the dashboard, and a dinner on the leaderboard within a minute. Shop and cook one dinner yourself on the phone. Then close it again:

   ```bash
   npx supabase db query --remote "update game set open = false"
   ```

6. `config push` raised the anonymous sign-in limit to 300 an hour per IP, because the whole room shares one campus IP. If you skip it, the 31st person can't join.
7. Check the projector has sound if you want the music on the dashboard (🎷 button, top right). It's quiet, it loops, and it's fine to leave off.

## On stage

A rough order. Every command is something the room can watch happen.

| Minute | Say | Type |
| --- | --- | --- |
| 0 | "Scan the QR, make an account or play as a guest, pick a cook. Then pick what you're bringing to dinner." | (nothing, let them join) |
| 2 | "You've got $40. Big dishes are worth a lot more and they're harder. The store's closed. Let's open it." | `npx supabase db query --remote "update game set open = true"` |
| 3 | "Every phone just heard that. Nobody refreshed." | point at the buttons lighting up |
| 6 | "Look at the store. You're seeing each other walk, live. None of those positions are saved anywhere." | point at the map, explain Broadcast vs. a table |
| 9 | "Someone's about to finish. Score is base points, times how well you cooked, times how fast." | point at the leaderboard |
| 11 | "Feeling rich?" | `... "update game set allowance_cents = 6000"` |
| 13 | "Some of you are trying to cheat. Let's see how that's going." | point at **Blocked by Postgres** |
| 15 | Explain grants vs. RLS vs. a function that checks, using the error codes on screen | open `supabase/migrations/*_who_can_do_what.sql` |
| 20 | "Pie is the secret weapon tonight." | `... "select announce('Pie is the secret weapon tonight!')"` |
| 22 | "Is the big menu actually worth it? Let's ask the database." | lab 15's first query, with `--remote` |
| 24 | "Here come some guests." | `npm run bots -- 6` |
| 26 | "These bots play through the same rules you do. In December, they'll be AI agents, and we'll grade them against you." | point at the 🤖 rows |
| 28 | Close the store, switch to labs on their own laptops | `... "update game set open = false"` |

## After

```bash
npx supabase db query --remote "update game set open = false"
npx supabase db dump --remote --data-only -f friendsgiving-night.sql
```

The dump is everyone's dinners, with every tap's accuracy and every trip's timing. It makes a good real dataset for the December observability workshop. The project pauses itself after a quiet week on the free plan; restore it from the dashboard when you need it.

## If something goes wrong

- **Magic links or reset emails don't arrive.** The hosted project's built-in email sender only sends a handful an hour. Tell people to play as a guest or use email and password; set up `[auth.email.smtp]` if you need more.
- **Nobody can join.** Anonymous sign-ins are off on the hosted project. Run `npx supabase config push`, or turn them on under Authentication → Sign In / Providers.
- **"Let's go shopping!" stays grey.** The store is closed (`select open from game`), or the menu costs more than the allowance (the bar turns red).
- **Nobody shows up walking on the map.** Positions go over Realtime Broadcast on the `potluck` channel. A refresh on the dashboard reconnects it. The free plan allows 200 Realtime connections; a big room plus bots can get close.
- **The dashboard is frozen.** It polls `dashboard()` every 1.5 seconds, so a refresh fixes it.
- **No music.** Browsers only play sound after a tap. Tap anything once.
