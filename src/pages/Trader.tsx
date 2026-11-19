import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  supabase,
  ensureSession,
  usd,
  pct,
  isHalted,
  type Book,
  type Market,
  type Order,
  type OrderResult,
  type Stock,
  type Trader,
} from "../lib/supabase";
import { BookView, Sparkline } from "../components/Charts";
import { Cheats } from "../components/Cheats";
import { AuthGate, NewPassword } from "../components/AuthGate";
import { Account } from "../components/Account";
import { Avatar } from "../components/Avatar";
import type { Session } from "@supabase/supabase-js";
import { Intro, SimpleBoard, type Quotes } from "../components/Simple";

// Small conveniences remembered per device. Storage can be blocked (private
// windows), so every read and write is allowed to fail.
const remember = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* fine, just won't be remembered */
    }
  },
};

type Note = { tone: "good" | "bad" | "info"; text: string };

export function TraderApp() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Trader | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [recovering, setRecovering] = useState(false);

  // Follow the session: sign-in, sign-out, magic links and reset links all
  // land here. Keep this callback to setState only; calling Supabase from
  // inside it can deadlock the auth client.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Signed in? Then find your player row (or pick a name to make one).
  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) {
      setMe(null);
      setLoadingMe(false);
      return;
    }
    setLoadingMe(true);
    supabase.from("traders").select("*").eq("id", uid).maybeSingle().then(({ data }) => {
      setMe(data);
      setLoadingMe(false);
    });
  }, [uid]);

  if (session === undefined || (uid && loadingMe)) return <div className="center muted">Connecting…</div>;
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />;
  if (!session) return <AuthGate title="📈 Trading Floor" blurb="You get $10,000 and 20 shares of five made-up companies. Prices only move when somebody trades. Everyone here is the market." />;
  if (!me) return <Join onDone={setMe} />;
  return <Desk me={me} onMe={setMe} onLeave={() => setMe(null)} />;
}

function Join({ onDone }: { onDone: (t: Trader) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await ensureSession();
      const id = session.user.id;
      let { data, error } = await supabase.from("traders").insert({ id, name: name.trim() }).select().single();
      if (error?.code === "23505") {
        ({ data, error } = await supabase.from("traders").update({ name: name.trim() }).eq("id", id).select().single());
      }
      if (error) throw error;
      onDone(data!);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="signup">
      <h1>📈 Trading Floor</h1>
      <p className="muted">
        You get $10,000 and 20 shares of five made-up companies. Prices only move when somebody trades. Everyone here
        is the market.
      </p>
      <form onSubmit={join}>
        <input autoFocus maxLength={24} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={busy || !name.trim()}>{busy ? "Joining…" : "Step onto the floor"}</button>
      </form>
      {error && <p className="bad">{error}</p>}
      <p className="small muted">
        This is the name everyone sees on the big screen. You can change it, and add a picture, any time.
      </p>
    </main>
  );
}

function Desk({ me, onMe, onLeave }: { me: Trader; onMe: (m: Trader) => void; onLeave: () => void }) {
  const [showAccount, setShowAccount] = useState(false);
  const [market, setMarket] = useState<Market | null>(null);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [samples, setSamples] = useState<Record<string, number[]>>({});
  const [symbol, setSymbol] = useState("SLICE");
  const [book, setBook] = useState<Book | null>(null);
  const [cash, setCash] = useState({ cash: 0, reserved: 0 });
  const [positions, setPositions] = useState<Record<string, { qty: number; reserved: number }>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [kind, setKind] = useState<"market" | "limit">("limit");
  const [qty, setQty] = useState(5);
  const [limit, setLimit] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [headline, setHeadline] = useState<{ headline: string; mood: string; symbol: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(0);
  const [showCheats, setShowCheats] = useState(false);
  const [intro, setIntro] = useState(() => remember.get("tf-intro-seen") !== "1");
  const [mode, setMode] = useState<"simple" | "pro">(() => (remember.get("tf-mode") === "pro" ? "pro" : "simple"));
  const [quotes, setQuotes] = useState<Quotes>({});
  const [trading, setTrading] = useState<string | null>(null);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;
  const channelRef = useRef<RealtimeChannel | null>(null);

  const stock = stocks.find((s) => s.symbol === symbol);

  const refreshMine = useCallback(async () => {
    const [{ data: acct }, { data: pos }, { data: open }] = await Promise.all([
      supabase.from("accounts").select("cash_cents, reserved_cents").maybeSingle(),
      supabase.from("positions").select("symbol, qty, reserved"),
      supabase.from("orders").select("*").eq("status", "open").order("id", { ascending: false }),
    ]);
    setCash({ cash: acct?.cash_cents ?? 0, reserved: acct?.reserved_cents ?? 0 });
    setPositions(Object.fromEntries((pos ?? []).map((p) => [p.symbol, { qty: p.qty, reserved: p.reserved }])));
    setOrders(open ?? []);
  }, []);

  const refreshBook = useCallback(async () => {
    const { data } = await supabase.rpc("order_book", { p_symbol: symbolRef.current, p_depth: 6 });
    setBook(data as unknown as Book);
  }, []);

  const refreshQuotes = useCallback(async () => {
    const { data } = await supabase.rpc("quotes");
    if (data) setQuotes(data as unknown as Quotes);
  }, []);

  const refreshSamples = useCallback(async () => {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data } = await supabase.from("price_samples").select("symbol, last_cents").gte("at", since).order("at");
    const out: Record<string, number[]> = {};
    for (const s of data ?? []) (out[s.symbol] ??= []).push(s.last_cents);
    setSamples(out);
  }, []);

  useEffect(() => {
    supabase.from("market").select("*").single().then(({ data }) => setMarket(data));
    supabase.from("stocks").select("*").order("symbol").then(({ data }) => setStocks(data ?? []));
    refreshMine();
    refreshSamples();

    const channel = supabase
      .channel("floor")
      // prices: the stocks row changes on every trade
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "stocks" }, (p) => {
        const s = p.new as Stock;
        setStocks((all) => all.map((x) => (x.symbol === s.symbol ? s : x)));
        if (s.symbol === symbolRef.current) refreshBook();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "market" }, (p) => setMarket(p.new as Market))
      // your fills. RLS applies to Realtime too: you only ever receive your own.
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "fills" }, (p) => {
        const f = p.new as { side: string; qty: number; symbol: string; price_cents: number };
        setNote({ tone: "good", text: `Filled: ${f.side === "buy" ? "bought" : "sold"} ${f.qty} ${f.symbol} at ${usd(f.price_cents)}` });
        refreshMine();
      })
      .on("broadcast", { event: "news" }, ({ payload }) => {
        setHeadline(payload);
        setTimeout(() => setHeadline(null), 12000);
      })
      .on("presence", { event: "sync" }, () => setOnline(Object.keys(channel.presenceState()).length))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ name: me.name, kind: me.kind, avatar_path: me.avatar_path });
      });
    channelRef.current = channel;

    refreshQuotes();
    const quoteTimer = setInterval(refreshQuotes, 2000);
    const book = setInterval(refreshBook, 2000);
    const spark = setInterval(refreshSamples, 10000);
    return () => {
      clearInterval(book);
      clearInterval(quoteTimer);
      clearInterval(spark);
      supabase.removeChannel(channel);
    };
  }, [me, refreshMine, refreshBook, refreshSamples, refreshQuotes]);

  // switching stocks: load its book and start the limit price at the last trade
  useEffect(() => {
    setBook(null);
    refreshBook();
    const s = stocks.find((x) => x.symbol === symbol);
    if (s) setLimit((s.last_cents / 100).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const limitCents = Math.round(Number(limit) * 100);

  // what this order would cost, walking the book for a market order
  const estimate = useMemo(() => {
    if (kind === "limit") return Number.isFinite(limitCents) ? limitCents * qty : 0;
    const levels = side === "buy" ? book?.asks ?? [] : book?.bids ?? [];
    let left = qty;
    let total = 0;
    for (const l of levels) {
      const q = Math.min(left, l.qty);
      total += q * l.price_cents;
      left -= q;
      if (!left) break;
    }
    return left ? null : total; // null: not enough on the book
  }, [kind, side, qty, limitCents, book]);

  async function submit() {
    setBusy(true);
    setNote(null);
    const { data, error } = await supabase.rpc("place_order", {
      p_symbol: symbol,
      p_side: side,
      p_kind: kind,
      p_qty: qty,
      p_limit_cents: kind === "limit" ? limitCents : undefined,
    });
    setBusy(false);
    const r = data as unknown as OrderResult;
    if (error) return setNote({ tone: "bad", text: error.message });
    if (r.error) return setNote({ tone: "bad", text: r.error });

    const verb = side === "buy" ? "Bought" : "Sold";
    if (r.filled && r.filled === qty) {
      setNote({ tone: "good", text: `${verb} ${r.filled} ${symbol} at an average of ${usd(r.avg_cents)}.` });
    } else if (r.filled) {
      setNote({
        tone: "info",
        text: `${verb} ${r.filled} of ${qty} at ${usd(r.avg_cents)}. ${kind === "limit" ? "The rest waits on the book." : "Nothing left on the book for the rest, so it was cancelled."}`,
      });
    } else {
      setNote({
        tone: "info",
        text: kind === "limit" ? `Nobody matched yet. Your order waits on the book at ${usd(limitCents)}.` : "Nobody on the other side. Nothing traded.",
      });
    }
    refreshMine();
    refreshBook();
  }

  async function cancel(id: number) {
    const { data } = await supabase.rpc("cancel_order", { p_order: id });
    const r = data as unknown as OrderResult;
    setNote(r?.error ? { tone: "bad", text: r.error } : { tone: "info", text: `Cancelled order #${id}.` });
    refreshMine();
    refreshBook();
  }

  // Simple mode: one share, at whatever the market is asking right now.
  async function quickTrade(sym: string, tradeSide: "buy" | "sell") {
    setTrading(sym);
    setNote(null);
    const { data, error } = await supabase.rpc("place_order", {
      p_symbol: sym,
      p_side: tradeSide,
      p_kind: "market",
      p_qty: 1,
    });
    setTrading(null);
    const r = data as unknown as OrderResult;
    const name = stocks.find((s) => s.symbol === sym)?.name ?? sym;
    if (error) setNote({ tone: "bad", text: error.message });
    else if (r.error) setNote({ tone: "bad", text: r.error });
    else if (r.filled) {
      setNote({
        tone: "good",
        text: tradeSide === "buy" ? `You bought 1 share of ${name} for ${usd(r.avg_cents)}.` : `You sold 1 share of ${name} for ${usd(r.avg_cents)}.`,
      });
    } else {
      setNote({ tone: "info", text: `Nobody was ${tradeSide === "buy" ? "selling" : "buying"} ${name} just then. Try again in a few seconds.` });
    }
    refreshMine();
    refreshQuotes();
  }

  function switchMode(m: "simple" | "pro") {
    setMode(m);
    remember.set("tf-mode", m);
  }

  async function leave() {
    await supabase.auth.signOut();
    onLeave();
  }

  const holdings = stocks.reduce((a, s) => a + (positions[s.symbol]?.qty ?? 0) * s.last_cents, 0);
  const net = cash.cash + holdings;
  // what you were worth at the opening bell: the same yardstick as the leaderboard
  const start = market ? market.allowance_cents + market.starting_shares * stocks.reduce((a, s) => a + s.open_cents, 0) : net;
  const up = net - start;

  if (intro) {
    return (
      <Intro
        onDone={() => {
          remember.set("tf-intro-seen", "1");
          setIntro(false);
        }}
      />
    );
  }

  return (
    <main className="desk">
      <header>
        <div>
          <button className="me" onClick={() => setShowAccount((v) => !v)} title="Your account">
            <Avatar name={me.name} path={me.avatar_path} size={26} /> <strong>{me.name}</strong>
          </button>
          <span className="muted"> · {online} on the floor</span>
        </div>
        <div className="stats">
          <span title="Only you can see this. RLS.">worth {usd(net)} 🔒</span>
        </div>
      </header>

      {showAccount && (
        <Account
          me={me}
          onRename={async (name) => {
            const { data, error } = await supabase.from("traders").update({ name }).eq("id", me.id).select().single();
            if (data) onMe(data);
            return error?.message ?? null;
          }}
          onAvatar={async (avatar_path) => {
            const { data, error } = await supabase.from("traders").update({ avatar_path }).eq("id", me.id).select().single();
            if (data) onMe(data);
            return error?.message ?? null;
          }}
          onSignedOut={onLeave}
        />
      )}

      <div className={`scoreline ${up >= 0 ? "good" : "bad"}`}>
        {Math.abs(up) < 1 ? "You're even so far." : `You're ${up > 0 ? "up" : "down"} ${usd(Math.abs(up))} since the opening bell.`}
      </div>

      <div className="seg mode">
        <button className={mode === "simple" ? "on" : ""} onClick={() => switchMode("simple")}>Simple</button>
        <button className={mode === "pro" ? "on" : ""} onClick={() => switchMode("pro")}>Pro: order book</button>
      </div>

      {headline && (
        <div className={`announce ${headline.mood}`}>
          📰 {headline.symbol ? `${headline.symbol}: ` : ""}{headline.headline}
        </div>
      )}
      {market && !market.open && <div className="note info">The market is closed. Waiting for the opening bell.</div>}

      {mode === "simple" && (
        <>
          {note && <div className={`note ${note.tone}`}>{note.text}</div>}
          <SimpleBoard
            stocks={stocks}
            quotes={quotes}
            owned={Object.fromEntries(Object.entries(positions).map(([k, v]) => [k, v.qty]))}
            samples={samples}
            busy={trading}
            onTrade={quickTrade}
          />
          <p className="small muted">
            Buy 1 and Sell 1 trade a single share right away, at the best price anyone is offering. Want to name your own
            price? Switch to Pro.
          </p>
        </>
      )}

      {mode === "pro" && (
      <>
      <p className="small muted pro-help">
        <b>Market</b> order: trade now at whatever people are asking. <b>Limit</b> order: name your price and wait for
        someone to take it. The book shows everyone waiting: sellers in red, buyers in green.
      </p>
      <section className="tickers">
        {stocks.map((s) => (
          <button key={s.symbol} className={`ticker ${s.symbol === symbol ? "on" : ""}`} onClick={() => setSymbol(s.symbol)}>
            <div className="sym">{s.symbol}{isHalted(s) && <span className="halt-badge">HALT</span>}</div>
            <div className="last">{usd(s.last_cents)}</div>
            <div className={s.last_cents >= s.open_cents ? "good" : "bad"}>{pct(s.last_cents, s.open_cents)}</div>
            <Sparkline values={[...(samples[s.symbol] ?? []), s.last_cents]} up={s.last_cents >= s.open_cents} width={80} height={24} />
          </button>
        ))}
      </section>

      {stock && (
        <section className="panel">
          <div className="stock-head">
            <div>
              <h2 className="sym-big">{stock.symbol} <span className="muted small">{stock.name}</span></h2>
              <div className="muted small">{stock.blurb}</div>
            </div>
            <div className="price-big">
              {usd(stock.last_cents)}
              <div className={`small ${stock.last_cents >= stock.open_cents ? "good" : "bad"}`}>{pct(stock.last_cents, stock.open_cents)} today</div>
            </div>
          </div>
          {isHalted(stock) && <div className="note bad">Trading halted by the circuit breaker. It resumes on its own.</div>}

          <BookView book={book} onPick={(c) => { setKind("limit"); setLimit((c / 100).toFixed(2)); }} />
          <p className="small muted">Tap a price in the book to use it for a limit order.</p>

          <div className="ticket">
            <div className="seg">
              <button className={side === "buy" ? "on buy" : ""} onClick={() => setSide("buy")}>Buy</button>
              <button className={side === "sell" ? "on sell" : ""} onClick={() => setSide("sell")}>Sell</button>
            </div>
            <div className="seg">
              <button className={kind === "limit" ? "on" : ""} onClick={() => setKind("limit")}>Limit</button>
              <button className={kind === "market" ? "on" : ""} onClick={() => setKind("market")}>Market</button>
            </div>
            <label className="field">
              <span>shares</span>
              <div className="stepper">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <input inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100000, Number(e.target.value) || 1)))} />
                <button onClick={() => setQty((q) => q + 1)}>+</button>
              </div>
            </label>
            {kind === "limit" && (
              <label className="field">
                <span>{side === "buy" ? "pay at most" : "accept at least"}</span>
                <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </label>
            )}
            <div className="small muted">
              {kind === "limit"
                ? `${side === "buy" ? "Sets aside" : "Would bring in"} ${usd(estimate)} if it all fills at your price.`
                : estimate == null
                  ? "Not enough on the book to fill all of it right now."
                  : `About ${usd(estimate)} at today's book.`}
            </div>
            <button className={`primary ${side}`} disabled={busy || !market?.open} onClick={submit}>
              {busy ? "…" : `${side === "buy" ? "Buy" : "Sell"} ${qty} ${symbol}`}
            </button>
          </div>
        </section>
      )}

      {note && <div className={`note ${note.tone}`}>{note.text}</div>}
      </>
      )}

      <section className="panel">
        <h2>Your money <span className="muted small">🔒 only you can see this</span></h2>
        <table>
          <tbody>
            <tr><td>cash</td><td>{usd(cash.cash)}</td><td className="muted small">{cash.reserved ? `${usd(cash.reserved)} set aside for bids` : ""}</td></tr>
            {stocks.map((s) => {
              const p = positions[s.symbol];
              if (!p?.qty) return null;
              return (
                <tr key={s.symbol}>
                  <td>{p.qty} {s.symbol}</td>
                  <td>{usd(p.qty * s.last_cents)}</td>
                  <td className="muted small">{p.reserved ? `${p.reserved} on offer` : ""}</td>
                </tr>
              );
            })}
            <tr className="total"><td>net worth</td><td>{usd(net)}</td><td /></tr>
          </tbody>
        </table>
      </section>

      {orders.length > 0 && (
        <section className="panel">
          <h2>Your open orders</h2>
          {orders.map((o) => (
            <div key={o.id} className="open-order">
              <span>
                #{o.id} {o.side} {o.qty - o.filled} {o.symbol} @ {usd(o.limit_cents)}
                {o.filled ? <span className="muted small"> ({o.filled} filled)</span> : null}
              </span>
              <button className="link" onClick={() => cancel(o.id)}>cancel</button>
            </div>
          ))}
        </section>
      )}

      <button className="link" onClick={() => setShowCheats((s) => !s)}>
        {showCheats ? "Back to trading" : "😈 Try to cheat"}
      </button>
      {showCheats && <Cheats me={me} />}

      <footer>
        <button className="link small" onClick={leave}>Leave</button>
        <button className="link small" onClick={() => setShowAccount((v) => !v)}>Account</button>
        <a className="small muted" href="#/floor">The floor →</a>
      </footer>
    </main>
  );
}
