// Robot line cooks.
//
//   npm run bots                 # 3 bots
//   npm run bots -- 8            # 8 bots
//   npm run bots -- 5 --sloppy   # 5 bots that get orders wrong a lot
//   npm run bots -- 5 --slow     # 5 bots that sometimes blow past the timer
//
// Each bot is its own signed-in user, using only the publishable key, so it
// goes through exactly the same gates as a person on a phone: grab_ticket()
// to take work off the queue, the `serve` Edge Function to hand it back.
//
// That's the point for December. Swap decide() for a call to a model and you
// have a pool of agents pulling jobs off a Postgres queue, with every step
// already logged to public.events.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("No URL/key. Run `npm run env:local` first (or set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY).");
  process.exit(1);
}

const args = process.argv.slice(2);
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 3);
const sloppy = args.includes("--sloppy");
const slow = args.includes("--slow");

const NAMES = ["Rivet", "Sprocket", "Dough-9", "Crusty", "Ladle", "Basil-E", "Mozz", "Turbo", "Pepper", "Oven-T", "Gizmo", "Knead"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

let menu = [];

// The bot's "brain". Today: read the ticket and copy it, with some mistakes.
// In December: ask a model.
function decide(ticket) {
  const plate = { size: ticket.size, toppings: [...ticket.toppings] };
  if (Math.random() < (sloppy ? 0.4 : 0.1)) {
    // forget one, or add something nobody asked for
    if (plate.toppings.length > 1 && Math.random() < 0.5) plate.toppings.pop();
    else plate.toppings.push(menu[Math.floor(Math.random() * menu.length)]);
  }
  return plate;
}

async function runBot(i) {
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: auth, error } = await sb.auth.signInAnonymously();
  if (error) return console.log(`bot ${i} couldn't sign in:`, error.message);

  // every run makes new users, so tag the name with a bit of the user id
  const name = `${NAMES[i % NAMES.length]}-${auth.user.id.slice(0, 3)}`;
  const log = (...m) => console.log(`[${name.padEnd(12)}]`, ...m);
  const { error: joinError } = await sb.from("cooks").insert({ id: auth.user.id, name, kind: "bot" });
  if (joinError) return log("couldn't join:", joinError.message);

  if (!menu.length) menu = ((await sb.from("toppings").select("slug")).data ?? []).map((t) => t.slug);
  const { data: shift } = await sb.from("shift").select("cook_seconds").single();
  const cookSeconds = shift?.cook_seconds ?? 30;

  const channel = sb.channel("kitchen");
  channel.subscribe((s) => s === "SUBSCRIBED" && channel.track({ name, kind: "bot" }));
  log("clocked in");

  while (true) {
    const { data, error } = await sb.rpc("grab_ticket");
    if (error) {
      log("grab failed:", error.message);
      await sleep(3000);
      continue;
    }
    const ticket = data?.[0];
    if (!ticket) {
      await sleep(rand(1500, 3000));
      continue;
    }

    // "cooking". Slow bots occasionally take longer than they're allowed.
    const think = slow && Math.random() < 0.3 ? (cookSeconds + 3) * 1000 : rand(2000, 9000);
    await sleep(think);

    const plate = decide(ticket);
    const { data: result, error: serveError } = await sb.functions.invoke("serve", {
      body: { ticket_id: ticket.id, ...plate, by: "bot" },
    });

    if (serveError) {
      const body = await serveError.context?.json?.().catch(() => null);
      log(`#${ticket.id}`, "✗", body?.error ?? serveError.message);
    } else {
      log(`#${ticket.id}`, result.status === "served" ? "✓" : "✗", result.status, `${result.seconds}s`, `+${result.score}`);
    }
  }
}

console.log(`starting ${count} bot${count === 1 ? "" : "s"} against ${url}${sloppy ? " (sloppy)" : ""}${slow ? " (slow)" : ""}`);
for (let i = 0; i < count; i++) {
  runBot(i);
  await sleep(300);
}
