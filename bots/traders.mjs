// Robot traders. Without them a room of 30 people is a thin market; with them
// there's always someone to trade with.
//
//   npm run bots                                   # 2 market makers + 3 noise traders
//   npm run bots -- --makers 3 --noise 5 --momentum 4
//
// Three kinds, three classic strategies:
//
//   market maker  Always quotes a bid and an ask around what it thinks the
//                 stock is worth, and earns the spread. Nudges its idea of
//                 "worth" toward wherever people actually trade, and leans its
//                 quotes against its own inventory. This is where liquidity
//                 comes from.
//   noise trader  Buys and sells small amounts at random. Real markets are
//                 full of trades that carry no information.
//   momentum      Buys what went up in the last minute, sells what went down.
//                 Run a few of these and you'll get bubbles, crashes and
//                 circuit-breaker halts.
//
// Every bot is its own signed-in user with only the publishable key. They go
// through place_order() like everyone else, and they read the host's news
// headlines from Realtime and trade on the mood.
//
// For December: each strategy is one function. Swap one for a model.

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
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const counts = { maker: flag("makers", 2), noise: flag("noise", 3), momentum: flag("momentum", 0) };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const usd = (c) => `$${(c / 100).toFixed(2)}`;

async function join(kind, i) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: auth, error } = await sb.auth.signInAnonymously();
  if (error) throw new Error(`sign in: ${error.message}`);
  const label = { maker: "MM", noise: "Noise", momentum: "Mo" }[kind];
  const name = `${label}-${i + 1}-${auth.user.id.slice(0, 3)}`;
  const { error: joinError } = await sb.from("traders").insert({ id: auth.user.id, name, kind: "bot" });
  if (joinError) throw new Error(`join: ${joinError.message}`);

  const news = [];
  const channel = sb
    .channel("floor")
    .on("broadcast", { event: "news" }, ({ payload }) => news.push(payload))
    .subscribe((s) => s === "SUBSCRIBED" && channel.track({ name, kind: "bot" }));

  const log = (...m) => console.log(`[${name.padEnd(14)}]`, ...m);
  return { sb, me: auth.user.id, name, log, news };
}

async function stocks(sb) {
  const { data } = await sb.from("stocks").select("symbol, last_cents, halted_until");
  return data ?? [];
}

// ---------------------------------------------------------------- market maker

async function marketMaker(bot) {
  const { sb, me, log, news } = bot;
  const fair = Object.fromEntries((await stocks(sb)).map((s) => [s.symbol, s.last_cents]));
  const SPREAD = 0.012; // 1.2% between bid and ask
  const SIZE = 5;
  log("quoting", Object.keys(fair).join(" "));

  while (true) {
    for (const s of await stocks(sb)) {
      // learn from where people actually trade, and wander a little
      fair[s.symbol] = 0.7 * fair[s.symbol] + 0.3 * s.last_cents;
      fair[s.symbol] *= 1 + rand(-0.003, 0.003);
    }
    // react to headlines: good news, worth more; bad news, worth less
    while (news.length) {
      const n = news.shift();
      const move = n.mood === "good" ? 1.08 : n.mood === "bad" ? 0.92 : 1;
      for (const sym of Object.keys(fair)) if (!n.symbol || n.symbol === sym) fair[sym] *= move;
      log("news:", n.headline, n.mood);
    }

    const { data: mine } = await sb.from("orders").select("id, symbol").eq("status", "open");
    const { data: pos } = await sb.from("positions").select("symbol, qty");
    const held = Object.fromEntries((pos ?? []).map((p) => [p.symbol, p.qty]));

    for (const sym of Object.keys(fair)) {
      // pull the old quotes, put up new ones
      for (const o of (mine ?? []).filter((o) => o.symbol === sym)) await sb.rpc("cancel_order", { p_order: o.id });
      // lean against inventory: holding a lot? quote lower so you sell more
      const lean = 1 - Math.max(-0.01, Math.min(0.01, ((held[sym] ?? 0) - 20) * 0.0005));
      const mid = fair[sym] * lean;
      const bid = Math.max(1, Math.floor(mid * (1 - SPREAD / 2)));
      const ask = Math.max(bid + 1, Math.ceil(mid * (1 + SPREAD / 2)));
      await sb.rpc("place_order", { p_symbol: sym, p_side: "buy", p_kind: "limit", p_qty: SIZE, p_limit_cents: bid });
      if ((held[sym] ?? 0) >= SIZE) {
        await sb.rpc("place_order", { p_symbol: sym, p_side: "sell", p_kind: "limit", p_qty: SIZE, p_limit_cents: ask });
      }
    }
    await sleep(rand(2500, 4500));
  }
}

// ---------------------------------------------------------------- noise trader

async function noiseTrader(bot) {
  const { sb, log } = bot;
  log("trading at random");
  while (true) {
    await sleep(rand(3000, 8000));
    const s = pick(await stocks(sb));
    const side = Math.random() < 0.5 ? "buy" : "sell";
    const qty = 1 + Math.floor(Math.random() * 5);
    const { data } = await sb.rpc("place_order", { p_symbol: s.symbol, p_side: side, p_kind: "market", p_qty: qty });
    if (data?.filled > 0) log(side, data.filled, s.symbol, "@", usd(data.avg_cents));
  }
}

// ---------------------------------------------------------------- momentum

async function momentum(bot) {
  const { sb, log } = bot;
  log("chasing trends");
  while (true) {
    await sleep(rand(4000, 7000));
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: samples } = await sb.from("price_samples").select("symbol, last_cents, at").gte("at", since).order("at");
    for (const s of await stocks(sb)) {
      const first = samples?.find((x) => x.symbol === s.symbol);
      if (!first) continue;
      const change = (s.last_cents - first.last_cents) / first.last_cents;
      if (Math.abs(change) < 0.02) continue;
      const side = change > 0 ? "buy" : "sell";
      const { data } = await sb.rpc("place_order", { p_symbol: s.symbol, p_side: side, p_kind: "market", p_qty: 4 });
      if (data?.filled > 0) log(`${s.symbol} ${change > 0 ? "up" : "down"} ${(change * 100).toFixed(1)}%:`, side, data.filled, "@", usd(data.avg_cents));
    }
  }
}

const strategies = { maker: marketMaker, noise: noiseTrader, momentum };
console.log(`starting ${counts.maker} market makers, ${counts.noise} noise traders, ${counts.momentum} momentum traders against ${url}`);
for (const [kind, n] of Object.entries(counts)) {
  for (let i = 0; i < n; i++) {
    join(kind, i)
      .then((bot) => strategies[kind](bot))
      .catch((e) => console.error(kind, i, e.message));
    await sleep(300);
  }
}
