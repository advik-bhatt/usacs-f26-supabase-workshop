import { useEffect, useRef, useState } from "react";
import { supabase, ensureSession, type KitchenEvent, type Shift } from "../lib/supabase";
import { Avatar } from "../components/Avatar";
import { DepthChart, FlowChart, PriceChart, priceColor, type DepthPoint, type FlowPoint, type PricePoint } from "../components/Charts";

const money = (cents: number | null | undefined) => (cents == null ? "-" : `$${(cents / 100).toFixed(2)}`);

type Economy = {
  money_supply_cents: number;
  median_cents: number | null;
  broke: number;
  wallets: number;
  gini: number;
  prices: { slug: string; emoji: string; label: string; price_cents: number; base_cents: number }[];
  price_series: PricePoint[];
  profit_board: { name: string; kind: string; profit_cents: number | null }[];
};

// The pass is where finished plates wait for a server. Here it's the big
// screen: everything the kitchen is doing, live, straight out of Postgres.

type Stats = {
  shift: Shift;
  queue: { queue_length: number; oldest_msg_age_sec: number | null; total_messages: number } | null;
  waiting: number;
  cooking: number;
  cooks: number;
  last_minute: Record<string, number> | null;
  ticket_seconds: { p50: number | null; p95: number | null; n: number };
  series: FlowPoint[];
  depth: DepthPoint[];
  leaderboard: { name: string; kind: string; score: number; good: number; plates: number; avg_seconds: number }[];
  blocked: { code: string; attack: string; n: number }[];
};

type Cheer = { id: number; emoji: string; name: string; left: number };

const VERB: Record<string, string> = {
  placed: "ordered",
  claimed: "grabbed",
  served: "served",
  botched: "botched",
  dropped: "dropped",
  walked_out: "walked out",
  late: "was too late with",
  blocked: "got blocked trying",
  broke: "couldn't afford the ingredients for",
};

export function Pass() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [feed, setFeed] = useState<KitchenEvent[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  // the leaderboard comes back with names only, so look pictures up by name
  const [pictures, setPictures] = useState<Record<string, string | null>>({});
  const [online, setOnline] = useState<{ name: string; kind: string; avatar_path?: string | null }[]>([]);
  const [shout, setShout] = useState<string | null>(null);
  const [cheers, setCheers] = useState<Cheer[]>([]);
  const [trace, setTrace] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    let stop = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function loadNames() {
      const { data } = await supabase.from("cooks").select("id, name, avatar_path");
      setNames(Object.fromEntries((data ?? []).map((c) => [c.id, c.name])));
      setPictures(Object.fromEntries((data ?? []).map((c) => [c.name, c.avatar_path])));
    }

    async function poll() {
      supabase.rpc("economy_stats").then(({ data }) => !stop && data && setEconomy(data as unknown as Economy));
      const { data, error } = await supabase.rpc("pass_stats");
      if (stop) return;
      if (error) setError(error.message);
      else {
        setError(null);
        setStats(data as unknown as Stats);
        setNow(Date.now());
      }
    }

    (async () => {
      try {
        await ensureSession();
      } catch (err) {
        setError(`Couldn't sign in: ${err instanceof Error ? err.message : err}. Are anonymous sign-ins on?`);
        return;
      }

      await loadNames();
      const { data: recent } = await supabase
        .from("events")
        .select("*")
        .order("id", { ascending: false })
        .limit(40);
      setFeed(recent ?? []);
      poll();
      if (stop) return; // unmounted while we were loading

      channel = supabase
        .channel("kitchen")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (p) => {
          const e = p.new as KitchenEvent;
          if (e.cook_id && !namesRef.current[e.cook_id]) loadNames();
          setFeed((f) => [e, ...f].slice(0, 40));
        })
        .on("broadcast", { event: "shout" }, ({ payload }) => {
          setShout(payload.text);
          setTimeout(() => setShout(null), 8000);
        })
        .on("broadcast", { event: "cheer" }, ({ payload }) => {
          const c = { id: Math.random(), emoji: payload.emoji, name: payload.name, left: 5 + Math.random() * 90 };
          setCheers((cs) => [...cs.slice(-30), c]);
          setTimeout(() => setCheers((cs) => cs.filter((x) => x.id !== c.id)), 3000);
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<{ name: string; kind: string; avatar_path?: string | null }>();
          setOnline(Object.values(state).map((metas) => metas[0]));
        })
        .subscribe();
    })();

    const timer = setInterval(poll, 2000);
    return () => {
      stop = true;
      clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  if (error && !stats) return <div className="center bad">{error}</div>;
  if (!stats) return <div className="center muted">Connecting to the kitchen…</div>;

  const lm = stats.last_minute ?? {};
  const s = stats.shift;
  const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(1));
  const who = (e: KitchenEvent) => (e.cook_id ? names[e.cook_id] ?? "someone" : "a customer");

  return (
    <main className="pass">
      {shout && <div className="shout big">📣 {shout}</div>}
      {cheers.map((c) => (
        <span key={c.id} className="cheer" style={{ left: `${c.left}%` }} title={c.name}>
          {c.emoji}
        </span>
      ))}

      <header>
        <h1>🍕 Dinner Rush <span className="muted">· the pass</span></h1>
        <div className={`badge ${s.open ? "good" : "bad"}`}>{s.open ? "OPEN" : "CLOSED"}</div>
      </header>

      <section className="kpis">
        <Kpi label="on the rail" value={stats.waiting} hint={`oldest ${stats.queue?.oldest_msg_age_sec ?? 0}s`} />
        <Kpi label="cooking" value={stats.cooking} />
        <Kpi label="served / min" value={lm.served ?? 0} tone="good" />
        <Kpi label="botched / min" value={lm.botched ?? 0} tone="bad" />
        <Kpi label="walked out / min" value={lm.walked_out ?? 0} tone="bad" />
        <Kpi label="ticket time p50 / p95" value={`${fmt(stats.ticket_seconds?.p50)} / ${fmt(stats.ticket_seconds?.p95)}s`} />
        <Kpi label="cooks online" value={online.length} hint={`${stats.cooks} ever`} />
      </section>

      <section className="grid2">
        <div className="panel">
          <h2>How full is the rail</h2>
          <DepthChart points={stats.depth} now={now} />
        </div>
        <div className="panel">
          <h2>Orders in vs. out, every 10s</h2>
          <FlowChart points={stats.series} now={now} />
        </div>
      </section>

      {economy && (
        <section className="grid3">
          <div className="panel">
            <h2>The pantry: prices right now</h2>
            <table>
              <tbody>
                {economy.prices.map((p) => {
                  const up = (p.price_cents / p.base_cents - 1) * 100;
                  const slugs = economy.prices.map((x) => x.slug);
                  return (
                    <tr key={p.slug}>
                      <td><span className="swatch" style={{ background: priceColor(p.slug, slugs) }} /> {p.emoji} {p.label}</td>
                      <td>{money(p.price_cents)}</td>
                      <td className={up > 0.5 ? "bad" : "muted"}>{up > 0.5 ? `+${up.toFixed(0)}%` : "base"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="panel">
            <h2>Prices vs. base, last 5 minutes</h2>
            <PriceChart
              points={economy.price_series}
              bases={Object.fromEntries(economy.prices.map((p) => [p.slug, p.base_cents]))}
              now={now}
            />
            <p className="small muted">
              Every topping used bumps its price {Math.round(Number(stats.shift.demand_bump ?? 0) * 100)}%. Every tick the
              pantry restocks {Math.round(Number(stats.shift.restock_rate ?? 0) * 100)}% of the way back to base.
            </p>
          </div>
          <div className="panel">
            <h2>The economy</h2>
            <dl className="knobs">
              <dt>money in wallets</dt><dd>{money(economy.money_supply_cents)}</dd>
              <dt>median wallet</dt><dd>{money(economy.median_cents)}</dd>
              <dt>inequality (Gini)</dt><dd>{economy.gini} <span className="muted small">0 = equal, 1 = one cook has it all</span></dd>
              <dt>nearly broke</dt><dd>{economy.broke} of {economy.wallets} cooks</dd>
            </dl>
            <h2>Most profitable</h2>
            <table>
              <tbody>
                {economy.profit_board.map((p, i) => (
                  <tr key={p.name + i}>
                    <td>{p.kind === "bot" ? "🤖 " : ""}{p.name}</td>
                    <td className={(p.profit_cents ?? 0) >= 0 ? "good" : "bad"}>{money(p.profit_cents ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">Totals only. Nobody's wallet leaves the database; RLS hides them, and this view only sums them.</p>
          </div>
        </section>
      )}

      <section className="grid3">
        <div className="panel">
          <h2>Leaderboard</h2>
          <table>
            <thead>
              <tr><th>cook</th><th>pts</th><th>good</th><th>avg</th></tr>
            </thead>
            <tbody>
              {stats.leaderboard.map((l, i) => (
                <tr key={l.name + i}>
                  <td><Avatar name={l.name} path={pictures[l.name]} size={20} /> {l.kind === "bot" ? "🤖 " : ""}{l.name}</td>
                  <td>{l.score}</td>
                  <td>{l.good}/{l.plates}</td>
                  <td>{l.avg_seconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.leaderboard.length === 0 && <p className="muted small">Nobody's served anything yet.</p>}
        </div>

        <div className="panel feed">
          <h2>Live from <code>public.events</code></h2>
          <ul>
            {feed.map((e) => (
              <li key={e.id} className={e.kind} onClick={() => e.ticket_id && setTrace(e.ticket_id)}>
                <time>{new Date(e.at).toLocaleTimeString()}</time>{" "}
                {e.kind === "placed" ? (
                  <>new ticket <b>#{e.ticket_id}</b></>
                ) : e.kind === "stimulus" ? (
                  <>💸 stimulus: every cook got <b>{money(Number((e.detail as Record<string, unknown>)?.cents))}</b></>
                ) : e.kind === "blocked" ? (
                  <><b>{who(e)}</b> {VERB.blocked} <i>{String((e.detail as Record<string, unknown>)?.attack)}</i>{" "}
                    <span className="code">{String((e.detail as Record<string, unknown>)?.code)}</span></>
                ) : (
                  <><b>{who(e)}</b> {VERB[e.kind] ?? e.kind} <b>#{e.ticket_id}</b></>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Blocked by Postgres</h2>
          {stats.blocked.length === 0 ? (
            <p className="muted small">Nobody's tried to cheat yet. Give it a minute.</p>
          ) : (
            <table>
              <tbody>
                {stats.blocked.map((b) => (
                  <tr key={b.attack + b.code}>
                    <td>{b.attack}</td>
                    <td><span className="code">{b.code}</span></td>
                    <td>×{b.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Shift settings</h2>
          <dl className="knobs">
            <dt>tickets_per_tick</dt><dd>{s.tickets_per_tick} every 10s</dd>
            <dt>cook_seconds</dt><dd>{s.cook_seconds}s</dd>
            <dt>patience_seconds</dt><dd>{s.patience_seconds}s</dd>
            <dt>demand_bump</dt><dd>+{Math.round(Number(s.demand_bump) * 100)}% per use</dd>
            <dt>restock_rate</dt><dd>{Math.round(Number(s.restock_rate) * 100)}% back per tick</dd>
            <dt>allowance_cents</dt><dd>{money(s.allowance_cents)} for new cooks</dd>
          </dl>
          <p className="small muted">Change them from a terminal:</p>
          <code className="small block">npx supabase db query "update shift set tickets_per_tick = 5"</code>
          <code className="small block">npx supabase db query "select stimulus(500)"</code>

          <h2>On shift</h2>
          <p className="small">
            {online.map((o, i) => (
              <span key={i} className="pill"><Avatar name={o.name} path={o.avatar_path} size={18} /> {o.kind === "bot" ? "🤖 " : ""}{o.name}</span>
            ))}
          </p>
        </div>
      </section>

      {trace != null && <Trace ticketId={trace} names={names} onClose={() => setTrace(null)} />}
    </main>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: string }) {
  return (
    <div className={`kpi ${tone ?? ""}`}>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

// One ticket's whole life, from the event log. In December this is what a
// trace looks like: the same idea, with spans instead of rows.
function Trace({ ticketId, names, onClose }: { ticketId: number; names: Record<string, string>; onClose: () => void }) {
  const [events, setEvents] = useState<KitchenEvent[]>([]);

  useEffect(() => {
    supabase
      .from("events")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("at")
      .then(({ data }) => setEvents(data ?? []));
  }, [ticketId]);

  const start = events[0] ? new Date(events[0].at).getTime() : 0;

  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>Ticket #{ticketId}, start to finish</h2>
        <ol className="trace">
          {events.map((e) => (
            <li key={e.id} className={e.kind}>
              <span className="offset">+{((new Date(e.at).getTime() - start) / 1000).toFixed(1)}s</span>
              <b>{e.kind}</b> {e.cook_id ? `by ${names[e.cook_id] ?? e.cook_id.slice(0, 8)}` : ""}
              <code className="small">{JSON.stringify(e.detail)}</code>
            </li>
          ))}
        </ol>
        <code className="small block">
          npx supabase db query "select at, kind, detail from events where ticket_id = {ticketId} order by at"
        </code>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
