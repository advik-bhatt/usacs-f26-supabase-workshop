// Robot dinner guests, so the dashboard has a crowd before the room does.
//
//   npm run bots              # 4 guests
//   npm run bots -- 10        # 10 of them
//
// Each bot is its own signed-in (anonymous) user holding only the publishable
// key, so it goes through exactly the same gates as a person on a phone:
// start_run() to pick a menu, buy() per item, head_home(), finish_run().
// It walks the real store grid and broadcasts its position on the same
// Realtime channel, so it shows up walking the aisles on the big screen.
//
// For December: chooseMenu() and howWellICook() are the bot's brain. Today
// they're a coin flip on how greedy to be. Swap in a model and you have agents
// playing against people, every move already logged in public.events.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { DOOR, SPAWN, path, standingSpotFor, zoneName } from "../src/game/store.ts";

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

const count = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 4);
const NAMES = ["Gravy Bot", "Robo Yam", "Pie-o-tron", "Cran-Droid", "Sir Stuffing", "Biscuit 3000", "Turkey.exe", "Mash Unit", "Cobbler", "Sprout"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Bold bots fill the whole allowance; careful ones bring one or two easy dishes.
function chooseMenu(recipes, costOf, allowance, bold) {
  const pool = [...recipes].sort(() => Math.random() - 0.5);
  if (bold) pool.sort((a, b) => b.base_points * (0.6 + Math.random()) - a.base_points * (0.6 + Math.random()));
  const menu = [];
  let spent = 0;
  for (const r of pool) {
    const c = costOf(r.slug);
    if (spent + c > allowance) continue;
    if (!bold && (r.stars > 2 || menu.length >= 2)) continue;
    menu.push(r.slug);
    spent += c;
  }
  return menu.length ? menu : [recipes.sort((a, b) => costOf(a.slug) - costOf(b.slug))[0].slug];
}

// 0.45 is the floor (the worst grade is "OK"), 1 is a perfect tap every step.
const howWellICook = (skill) => Math.min(1, Math.max(0.45, skill + (Math.random() - 0.5) * 0.3));

async function guest(i) {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: auth, error } = await db.auth.signInAnonymously();
  if (error) throw error;
  const me = { id: auth.user.id, name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i}` : ""), sprite: i % 8 };
  await db.from("players").insert({ ...me, kind: "bot" });
  const log = (...a) => console.log(`[${me.name}]`, ...a);

  const [{ data: recipes }, { data: ingredients }, { data: uses }] = await Promise.all([
    db.from("recipes").select("*"),
    db.from("ingredients").select("*"),
    db.from("recipe_ingredients").select("*"),
  ]);
  const item = Object.fromEntries(ingredients.map((x) => [x.slug, x]));
  const costOf = (slug) => uses.filter((u) => u.recipe === slug).reduce((a, u) => a + item[u.ingredient].price_cents, 0);

  const channel = db.channel("potluck");
  await new Promise((ok) => channel.subscribe((s) => s === "SUBSCRIBED" && ok()));

  const bold = Math.random() < 0.6;
  const skill = 0.55 + Math.random() * 0.4;
  const pace = 140 + Math.random() * 160; // ms per step: some bots dawdle
  log(bold ? "is feeling bold" : "is playing it safe", `(skill ${skill.toFixed(2)})`);

  for (;;) {
    const { data: game } = await db.from("game").select("*").single();
    if (!game.open) {
      await sleep(3000);
      continue;
    }

    const menu = chooseMenu(recipes, costOf, game.allowance_cents, bold);
    const { data: started } = await db.rpc("start_run", { p_recipes: menu });
    if (started?.error) {
      log(started.error);
      await sleep(4000);
      continue;
    }
    const run = started.run_id;
    log("is shopping for", menu.join(", "));

    // walk the store: nearest shelf first, one tile at a time
    let at = { ...SPAWN };
    let zone = "";
    const walkTo = async (to) => {
      for (const step of path(at, to)) {
        at = step;
        channel.send({ type: "broadcast", event: "pos", payload: { ...me, x: at.x, y: at.y, f: (at.x + at.y) % 2 } });
        const z = zoneName(at.x, at.y);
        if (z !== zone) {
          zone = z;
          await db.from("player_state").update({ location: z }).eq("player_id", me.id);
        }
        await sleep(pace);
      }
    };
    const list = uses.filter((u) => menu.includes(u.recipe)).map((u) => item[u.ingredient]);
    while (list.length) {
      list.sort((a, b) => path(at, standingSpotFor(a)).length - path(at, standingSpotFor(b)).length);
      const next = list.shift();
      await walkTo(standingSpotFor(next));
      const { data: bought } = await db.rpc("buy", { p_run: run, p_ingredient: next.slug });
      if (bought?.error) log(bought.error);
      await sleep(250);
    }
    await walkTo(DOOR);
    await db.rpc("head_home", { p_run: run });

    // cook: every step takes a moment, like a person tapping
    const { data: cookable } = await db.rpc("cookable", { p_run: run });
    const accuracy = {};
    for (const slug of cookable ?? []) {
      const r = recipes.find((x) => x.slug === slug);
      await sleep(r.steps.length * (900 + Math.random() * 900));
      accuracy[slug] = howWellICook(skill);
    }
    const { data: done } = await db.rpc("finish_run", { p_run: run, p_accuracy: accuracy });
    if (done?.error) log(done.error);
    else log(`${done.rating} ${done.score} pts`);

    await sleep(5000 + Math.random() * 5000);
    await db.rpc("back_to_menu");
    await sleep(2000 + Math.random() * 4000);
  }
}

console.log(`Sending ${count} robot guests to the potluck. Ctrl-C to send them home.`);
for (let i = 0; i < count; i++) {
  guest(i).catch((e) => console.error(`guest ${i}:`, e.message ?? e));
  await sleep(700);
}
