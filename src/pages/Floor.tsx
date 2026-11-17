import { useEffect, useRef, useState } from "react";
import { supabase, ensureSession, usd, pct, isHalted, type Book, type Market, type Stock, type FloorEvent } from "../lib/supabase";
import { BookView, MarketChart, Sparkline, COLORS } from "../components/Charts";

// The big screen: every price, the book, the tape, the leaderboard, live.

type Stats = {
  market: Market;
  stocks: Stock[];
  series: { at: string; symbol: string; last_cents: number }[];
  tape: { id: number; symbol: string; price_cents: number; qty: number; at: string }[];
  last_minute: { trades: number; shares: number; dollars_cents: number };
  open_orders: number;
  traders: number;
  leaderboard: { name: string; kind: string; net_cents: number; return_pct: number }[];
  gini: number;
  news: { id: number; at: string; symbol: string | null; headline: string; mood: string }[];
  blocked: { code: string; attack: string; n: number }[];
};

export function Floor() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [focus, setFocus] = useState("SLICE");
  const [book, setBook] = useState<Book | null>(null);
  const [online, setOnline] = useState<{ name: string; kind: string }[]>([]);
  const [headline, setHeadline] = useState<{ headline: string; mood: string; symbol: string | null } | null>(null);
  const [alerts, setAlerts] = useState<FloorEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const focusRef = useRef(focus);
  focusRef.current = focus;

  useEffect(() => {
    let stop = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function poll() {
      const [{ data, error }, { data: b }] = await Promise.all([
        supabase.rpc("floor_stats"),
        supabase.rpc("order_book", { p_symbol: focusRef.current, p_depth: 8 }),
      ]);
      if (stop) return;
      if (error) return setError(error.message);
      setError(null);
      setStats(data as unknown as Stats);
      setBook(b as unknown as Book);
      setNow(Date.now());
    }

    (async () => {
      try {
        await ensureSession();
      } catch (err) {
        setError(`Couldn't sign in: ${err instanceof Error ? err.message : err}. Are anonymous sign-ins on?`);
        return;
      }
      const { data: recent } = await supabase
        .from("events")
        .select("*")
        .in("kind", ["halt", "resume", "news", "session", "blocked"])
        .order("id", { ascending: false })
        .limit(12);
      setAlerts(recent ?? []);
      poll();
      if (stop) return; // unmounted while we were loading

      channel = supabase
        .channel("floor")
        .on("broadcast", { event: "news" }, ({ payload }) => {
          setHeadline(payload);
          setTimeout(() => setHeadline(null), 12000);
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<{ name: string; kind: string }>();
          setOnline(Object.values(state).map((metas) => metas[0]));
        })
        .subscribe();
    })();

    const timer = setInterval(poll, 1500);
    const alertTimer = setInterval(async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .in("kind", ["halt", "resume", "news", "session", "blocked"])
        .order("id", { ascending: false })
        .limit(12);
      if (!stop) setAlerts(data ?? []);
    }, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
      clearInterval(alertTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  if (error && !stats) return <div className="center bad">{error}</div>;
  if (!stats) return <div className="center muted">Ringing the bell…</div>;

  const m = stats.market;
  const opens = Object.fromEntries(stats.stocks.map((s) => [s.symbol, s.open_cents]));
  const sparks = (sym: string) => stats.series.filter((p) => p.symbol === sym).map((p) => p.last_cents);

  return (
    <main className="floor">
      {headline && (
        <div className={`announce big ${headline.mood}`}>
          📰 {headline.symbol ? `${headline.symbol}: ` : ""}{headline.headline}
        </div>
      )}

      <header>
        <h1>📈 Trading Floor</h1>
        <div className={`badge ${m.open ? "good" : "bad"}`}>{m.open ? "MARKET OPEN" : "MARKET CLOSED"}</div>
      </header>

      <section className="board">
        {stats.stocks.map((s) => (
          <button
            key={s.symbol}
            className={`board-card ${s.symbol === focus ? "on" : ""} ${isHalted(s) ? "halted" : ""}`}
            onClick={() => setFocus(s.symbol)}
            style={{ borderTopColor: COLORS[s.symbol] }}
          >
            <div className="sym">{s.symbol} {isHalted(s) && <span className="halt-badge">HALTED</span>}</div>
            <div className="last">{usd(s.last_cents)}</div>
            <div className={s.last_cents >= s.open_cents ? "good" : "bad"}>{pct(s.last_cents, s.open_cents)}</div>
            <Sparkline values={[...sparks(s.symbol), s.last_cents]} up={s.last_cents >= s.open_cents} width={150} height={34} />
            <div className="muted small">vol {s.volume.toLocaleString()}</div>
          </button>
        ))}
      </section>

      <section className="kpis">
        <Kpi label="trades / min" value={stats.last_minute.trades} />
        <Kpi label="shares / min" value={stats.last_minute.shares} />
        <Kpi label="dollars / min" value={usd(stats.last_minute.dollars_cents)} />
        <Kpi label="orders on the book" value={stats.open_orders} />
        <Kpi label="on the floor" value={online.length} hint={`${stats.traders} joined`} />
        <Kpi label="inequality (Gini)" value={stats.gini} hint="0 = everyone equal" />
      </section>

      <section className="grid3">
        <div className="panel">
          <h2>Every stock since the open</h2>
          <MarketChart series={stats.series} opens={opens} now={now} />
          <h2>News</h2>
          {stats.news.length === 0 ? (
            <p className="muted small">Quiet day.</p>
          ) : (
            <ul className="newslist">
              {stats.news.map((n) => (
                <li key={n.id} className={n.mood}>
                  <time>{new Date(n.at).toLocaleTimeString()}</time> {n.symbol ? <b>{n.symbol}</b> : <b>MARKET</b>} {n.headline}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2>{focus} order book <span className="muted small">(tap a stock above to switch)</span></h2>
          <BookView book={book} />
          <h2>The tape</h2>
          <ul className="tape">
            {stats.tape.slice(0, 14).map((t) => (
              <li key={t.id}>
                <time>{new Date(t.at).toLocaleTimeString()}</time>
                <b style={{ color: COLORS[t.symbol] }}>{t.symbol}</b>
                <span>{t.qty} @ {usd(t.price_cents)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2>Leaderboard <span className="muted small">net worth at last prices</span></h2>
          <table>
            <tbody>
              {stats.leaderboard.map((l, i) => (
                <tr key={l.name + i}>
                  <td>{l.kind === "bot" ? "🤖 " : ""}{l.name}</td>
                  <td>{usd(l.net_cents)}</td>
                  <td className={l.return_pct >= 0 ? "good" : "bad"}>{l.return_pct >= 0 ? "+" : ""}{l.return_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Halts, news, cheaters</h2>
          <ul className="alerts">
            {alerts.map((e) => (
              <li key={e.id} className={e.kind}>
                <time>{new Date(e.at).toLocaleTimeString()}</time>{" "}
                {e.kind === "halt" && <>⛔ <b>{e.symbol}</b> halted: moved too far, too fast</>}
                {e.kind === "resume" && <>✅ <b>{e.symbol}</b> trading again</>}
                {e.kind === "news" && <>📰 {e.symbol ?? "market"} news</>}
                {e.kind === "session" && <>🔔 new session</>}
                {e.kind === "blocked" && <>😈 blocked: {String((e.detail as Record<string, unknown>)?.attack)}</>}
              </li>
            ))}
          </ul>

          <h2>Market settings</h2>
          <dl className="knobs">
            <dt>allowance</dt><dd>{usd(m.allowance_cents)} + {m.starting_shares} of each</dd>
            <dt>breaker_pct</dt><dd>halt after a {Math.round(Number(m.breaker_pct) * 100)}% move</dd>
            <dt>halt_seconds</dt><dd>{m.halt_seconds}s</dd>
          </dl>
          <code className="small block">npx supabase db query "select news('ORBIT', 'Asteroid confirmed: it is mostly platinum', 'good')"</code>
        </div>
      </section>
    </main>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="kpi">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
