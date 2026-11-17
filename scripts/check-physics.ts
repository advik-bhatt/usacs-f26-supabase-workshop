// How good is our physics? Run with: npm run check:physics
//
// 1. Accuracy. For every asteroid in the database, propagate its orbit to its
//    close approach with our two-body model and measure the distance to
//    Earth, then compare with the distance JPL publishes (which accounts for
//    every planet's pull). Earth's position comes from JPL's approximate
//    planetary elements (Standish).
// 2. Sanity. With no push, the drill asteroid has to hit. Pushing along the
//    orbit should beat pushing sideways, and roughly follow the rule of thumb
//    that an along-track nudge drifts about 3 x dv x time.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { stateAt, simulate, DAY_S, type Asteroid } from "../supabase/functions/_shared/orbit.ts";

const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
await sb.auth.signInAnonymously();
const { data: rocks, error } = await sb.from("asteroids").select("*");
if (error || !rocks?.length) {
  console.error("No asteroids. Is the stack running and seeded? (npx supabase start)", error?.message ?? "");
  process.exit(1);
}

// Earth-Moon barycenter, JPL approximate elements at J2000 plus rates per century
function earth(jd: number) {
  const T = (jd - 2451545.0) / 36525;
  const L = 100.46457166 + 35999.37244981 * T;
  const varpi = 102.93768193 + 0.32327364 * T;
  return stateAt(
    {
      a: 1.00000261 + 0.00000562 * T,
      e: 0.01671123 - 0.00004392 * T,
      i: -0.00001531 - 0.01294668 * T,
      om: 0,
      w: varpi,
      ma: L - varpi,
      epoch: jd,
    },
    jd,
  ).r;
}

const rows = rocks.map((a) => {
  const r = stateAt(a, a.ca_jd).r;
  const e = earth(a.ca_jd);
  const ours = Math.hypot(r[0] - e[0], r[1] - e[1], r[2] - e[2]);
  return { name: a.name, years: (a.ca_jd - a.epoch) / 365.25, err: Math.abs(ours - a.ca_dist_au) / a.ca_dist_au };
});
rows.sort((x, y) => x.err - y.err);
const pct = (q: number) => (rows[Math.min(rows.length - 1, Math.floor(rows.length * q))].err * 100).toFixed(1);
console.log(`\nAccuracy: our close-approach distance vs JPL's, ${rows.length} asteroids`);
console.log(`  median error ${pct(0.5)}%, 75th percentile ${pct(0.75)}%, 90th ${pct(0.9)}%`);
// Two reasons for the bad ones: very close passes turn small absolute errors
// into big percentages, and the planets (Earth most of all) pull hardest on
// exactly the asteroids that come closest. Our model leaves them out.
console.log("  worst five (very close passes, or orbits the planets bend that we ignore):");
for (const r of rows.slice(-5)) console.log(`    ${r.name.padEnd(28)} ${(r.err * 100).toFixed(0).padStart(6)}%  (${r.years.toFixed(1)} years from epoch)`);

const big = [...rocks].sort((a, b) => b.diameter_km - a.diameter_km)[0] as Asteroid & { name: string };
console.log(`\nSanity, on ${big.name} (${big.diameter_km.toFixed(2)} km):`);
const none = simulate(big, { leadDays: 365, massKg: 1e-6, direction: "prograde" });
console.log(`  no push: misses Earth's center by ${none.missKm.toFixed(1)} km -> ${none.saved ? "SAVED (wrong!)" : "hits, as it should"}`);
for (const direction of ["prograde", "radial", "normal"] as const) {
  const o = simulate(big, { leadDays: 1000, massKg: 1_000_000, direction });
  const thumb = 3 * (o.dvMs / 1000) * 1000 * DAY_S;
  console.log(`  ${direction.padEnd(9)} 1000 days ahead: moved ${o.missKm.toFixed(0).padStart(6)} km  (rule of thumb for along-track: ${thumb.toFixed(0)} km)`);
}
