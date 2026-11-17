// Robot flight dynamics officers.
//
//   npm run bots                 # 3 bots that search for the lightest mission that works
//   npm run bots -- 8            # 8 of them
//   npm run bots -- 5 --sloppy   # 5 that guess from a rule of thumb instead of simulating
//
// Each bot is its own signed-in user with only the publishable key, so it
// goes through the same gates as a person on a phone: claim_target() to take
// work off the queue, the `deflect` Edge Function to fly it.
//
// The point for December: plan() is the bot's brain. Today it's a binary
// search over the physics (or a rough guess). Replace it with a model and you
// have agents working a Postgres queue, every step already logged to
// public.events, and a ready-made baseline to grade them against.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import {
  simulate,
  asteroidMassKg,
  jdNow,
  captureRadiusKm,
  BETA,
  IMPACT_SPEED_KMS,
  DAY_S,
} from "../supabase/functions/_shared/orbit.ts";

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

const NAMES = ["Kepler", "Lagrange", "Hohmann", "Tsiolkovsky", "Gauss", "Euler", "Laplace", "Halley", "Newton", "Lambert", "Jacobi", "Noether"];
const MIN_MASS = 100;
const MAX_MASS = 1_000_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The careful bot: hit as early as possible, push along the orbit (that's the
// direction where a nudge keeps growing), then binary-search the spacecraft
// mass for the lightest one that still clears Earth.
function planCarefully(ast) {
  const leadDays = Math.min(3650, ast.ca_jd - jdNow() - 0.5);
  for (const direction of ["prograde", "retrograde", "radial"]) {
    if (!simulate(ast, { leadDays, massKg: MAX_MASS, direction }).saved) continue;
    let lo = Math.log10(MIN_MASS);
    let hi = Math.log10(MAX_MASS);
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      if (simulate(ast, { leadDays, massKg: 10 ** mid, direction }).saved) hi = mid;
      else lo = mid;
    }
    return { leadDays, massKg: Math.min(MAX_MASS, Math.ceil(10 ** hi * 1.05)), direction }; // 5% margin
  }
  return { leadDays, massKg: MAX_MASS, direction: "prograde" }; // nothing works; go down swinging
}

// The sloppy bot: no simulation. Uses the textbook rule of thumb that an
// along-track push drifts about 3 x dv x time, picks a random direction half
// the time, and hopes.
function planSloppily(ast) {
  const leadDays = Math.min(3650, ast.ca_jd - jdNow() - 0.5) * (0.3 + Math.random() * 0.7);
  const needKm = captureRadiusKm(ast.v_inf_kms) * 1.5;
  const dvMs = (needKm * 1000) / (3 * leadDays * DAY_S);
  const massKg = Math.min(
    MAX_MASS,
    Math.max(MIN_MASS, (dvMs * asteroidMassKg(ast.diameter_km)) / (BETA * IMPACT_SPEED_KMS * 1000)),
  );
  const direction = Math.random() < 0.5 ? "prograde" : ["retrograde", "radial", "normal"][Math.floor(Math.random() * 3)];
  return { leadDays, massKg, direction };
}

async function runBot(i) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInAnonymously();
  if (error) return console.log(`bot ${i} couldn't sign in:`, error.message);

  // every run makes new users, so tag the name with a bit of the user id
  const name = `${NAMES[i % NAMES.length]}-${auth.user.id.slice(0, 3)}`;
  const log = (...m) => console.log(`[${name.padEnd(15)}]`, ...m);
  const { error: joinError } = await sb.from("crew").insert({ id: auth.user.id, name, kind: "bot" });
  if (joinError) return log("couldn't join:", joinError.message);

  const channel = sb.channel("mission");
  channel.subscribe((s) => s === "SUBSCRIBED" && channel.track({ name, kind: "bot" }));
  log("on the team", sloppy ? "(sloppy)" : "");

  while (true) {
    const { data, error } = await sb.rpc("claim_target");
    if (error) {
      log("claim failed:", error.message);
      await sleep(3000);
      continue;
    }
    const target = data?.[0];
    if (!target) {
      await sleep(2000 + Math.random() * 2000);
      continue;
    }

    const { data: ast } = await sb.from("asteroids").select("*").eq("des", target.des).single();
    const started = Date.now();
    const plan = sloppy ? planSloppily(ast) : planCarefully(ast);
    // look like we're thinking, so humans have a chance
    await sleep(Math.max(0, 4000 + Math.random() * 8000 - (Date.now() - started)));

    const { data: res, error: flyError } = await sb.functions.invoke("deflect", {
      body: { target_id: target.id, lead_days: plan.leadDays, mass_kg: plan.massKg, direction: plan.direction },
    });
    if (flyError) {
      const body = await flyError.context?.json?.().catch(() => null);
      log(`#${target.id}`, "✗", body?.error ?? flyError.message);
    } else {
      log(
        `#${target.id}`,
        res.status === "saved" ? "✓ saved " : "✗ impact",
        ast.name,
        `| ${Math.round(plan.massKg).toLocaleString()} kg ${plan.direction}, ${Math.round(plan.leadDays)} days ahead`,
        `| miss ${Math.round(res.missKm).toLocaleString()} km | +${res.score}`,
      );
    }
  }
}

console.log(`starting ${count} bot${count === 1 ? "" : "s"} against ${url}`);
for (let i = 0; i < count; i++) {
  runBot(i);
  await sleep(300);
}
