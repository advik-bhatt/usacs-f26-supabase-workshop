import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase, ensureSession, type Cook, type Shift, type Ticket, type Topping } from "../lib/supabase";
import { Cheats } from "../components/Cheats";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type Note = { tone: "good" | "bad" | "info"; text: string };

export function Kitchen() {
  const [me, setMe] = useState<Cook | null>(null);
  const [checking, setChecking] = useState(true);

  // Already clocked in on this device? Then skip the name screen.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const { data: cook } = await supabase
          .from("cooks")
          .select("*")
          .eq("id", data.session.user.id)
          .maybeSingle();
        setMe(cook);
      }
      setChecking(false);
    })();
  }, []);

  if (checking) return <div className="center muted">Warming up the oven…</div>;
  if (!me) return <ClockIn onDone={setMe} />;
  return <Line me={me} onLeave={() => setMe(null)} />;
}

function ClockIn({ onDone }: { onDone: (c: Cook) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function clockIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await ensureSession();
      const id = session.user.id;
      let { data, error } = await supabase.from("cooks").insert({ id, name: name.trim() }).select().single();
      if (error?.code === "23505") {
        // already a cook on this device, just take the new name
        ({ data, error } = await supabase.from("cooks").update({ name: name.trim() }).eq("id", id).select().single());
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
    <main className="clockin">
      <h1>🍕 Dinner Rush</h1>
      <p className="muted">
        Orders are coming in. Grab a ticket, build the pizza, serve it before the timer runs out.
      </p>
      <form onSubmit={clockIn}>
        <input
          autoFocus
          maxLength={24}
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button disabled={busy || !name.trim()}>{busy ? "Clocking in…" : "Clock in"}</button>
      </form>
      {error && <p className="bad">{error}</p>}
      <p className="small muted">
        You'll be signed in as a guest (<code>signInAnonymously()</code>). No email needed.
      </p>
    </main>
  );
}

function Line({ me, onLeave }: { me: Cook; onLeave: () => void }) {
  const [menu, setMenu] = useState<Topping[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [size, setSize] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [shout, setShout] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState({ score: 0, plates: 0, tips: 0, cash: 0 });
  const [online, setOnline] = useState(0);
  const [showCheats, setShowCheats] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const emoji = useMemo(() => Object.fromEntries(menu.map((t) => [t.slug, t.emoji])), [menu]);

  const refreshMine = useCallback(async () => {
    // serves is readable by everyone (it's the leaderboard), tips only by you
    const [{ data: serves }, { data: tips }, { data: wallet }] = await Promise.all([
      supabase.from("serves").select("score").eq("cook_id", me.id),
      supabase.from("tips").select("cents"),
      supabase.from("wallets").select("cash_cents").maybeSingle(),
    ]);
    setMine({
      score: (serves ?? []).reduce((a, s) => a + s.score, 0),
      plates: serves?.length ?? 0,
      tips: (tips ?? []).reduce((a, t) => a + t.cents, 0),
      cash: wallet?.cash_cents ?? 0,
    });
  }, [me.id]);

  useEffect(() => {
    supabase.from("toppings").select("*").order("label").then(({ data }) => setMenu(data ?? []));
    supabase.from("shift").select("*").single().then(({ data }) => setShift(data));
    refreshMine();

    const channel = supabase
      .channel("kitchen")
      // prices move every time anyone serves, and every tick as the pantry restocks
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "toppings" }, (p) => {
        const t = p.new as Topping;
        setMenu((m) => m.map((x) => (x.slug === t.slug ? t : x)));
      })
      // the host can change the shift from the terminal; we hear about it here
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shift" }, (p) =>
        setShift(p.new as Shift),
      )
      // `select shout('...')` in SQL lands here via realtime.send()
      .on("broadcast", { event: "shout" }, ({ payload }) => {
        setShout(payload.text);
        setTimeout(() => setShout(null), 8000);
      })
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.keys(channel.presenceState()).length);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ name: me.name, kind: me.kind });
      });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, refreshMine]);

  // tick the countdown
  useEffect(() => {
    if (!ticket) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [ticket]);

  const left = ticket ? Math.max(0, deadline - now) : 0;

  useEffect(() => {
    if (ticket && left === 0) {
      setNote({ tone: "bad", text: `Too slow. Ticket #${ticket.id} went back on the rail for someone else.` });
      setTicket(null);
    }
  }, [left, ticket]);

  async function grab() {
    setBusy(true);
    setNote(null);
    const { data, error } = await supabase.rpc("grab_ticket");
    setBusy(false);
    if (error) return setNote({ tone: "bad", text: error.message });
    const t = data?.[0];
    if (!t) return setNote({ tone: "info", text: "The rail is empty. Hang tight." });

    const cookMs = (shift?.cook_seconds ?? 30) * 1000;
    const elapsed = Math.min(cookMs, Math.max(0, Date.now() - new Date(t.claimed_at!).getTime()));
    setTicket(t);
    setDeadline(Date.now() + cookMs - elapsed);
    setSize(null);
    setPicked([]);
  }

  async function serve() {
    if (!ticket || !size) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("serve", {
      body: { ticket_id: ticket.id, size, toppings: picked },
    });
    setBusy(false);
    setTicket(null);

    if (error) {
      const body = error instanceof FunctionsHttpError ? await error.context.json() : null;
      return setNote({ tone: "bad", text: body?.error ?? error.message });
    }

    if (data.status === "served") {
      setNote({
        tone: data.profit_cents >= 0 ? "good" : "bad",
        text: `Perfect. Paid ${money(data.revenue_cents)}, ingredients cost ${money(data.cost_cents)}: ${data.profit_cents >= 0 ? "profit" : "loss"} of ${money(Math.abs(data.profit_cents))}. +${data.score} points.`,
      });
    } else {
      const wrong = [
        data.missing.length && `forgot ${data.missing.map((t: string) => emoji[t] ?? t).join(" ")}`,
        data.extra.length && `added ${data.extra.map((t: string) => emoji[t] ?? t).join(" ")}`,
      ].filter(Boolean);
      setNote({ tone: "bad", text: `Sent back: ${wrong.join(", ") || "wrong size"}. No pay, and the ingredients cost you ${money(data.cost_cents)}.` });
    }
    refreshMine();
  }

  function cheer(e: string) {
    channelRef.current?.send({ type: "broadcast", event: "cheer", payload: { emoji: e, name: me.name } });
  }

  async function leave() {
    await supabase.auth.signOut();
    onLeave();
  }

  // what this plate would cost right now: dough by size plus today's topping prices
  const dough = size === "L" ? 200 : size === "M" ? 150 : 100;
  const plateCost = dough + picked.reduce((a, slug) => a + (menu.find((t) => t.slug === slug)?.price_cents ?? 0), 0);
  const profit = (ticket?.pays_cents ?? 0) - plateCost;

  const toggle = (slug: string) =>
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  return (
    <main className="kitchen">
      <header>
        <div>
          <strong>{me.name}</strong>
          <span className="muted"> · {online} on shift</span>
        </div>
        <div className="stats">
          <span>{mine.score} pts</span>
          <span>{mine.plates} plates</span>
          <span title="Only you can see this. RLS." className={mine.cash < 400 ? "bad" : ""}>{money(mine.cash)} cash 🔒</span>
        </div>
      </header>

      {shout && <div className="shout">📣 {shout}</div>}
      {shift && !shift.open && <div className="note info">Kitchen's closed. Waiting for the host to open it.</div>}

      {ticket ? (
        <section className="ticket">
          <div className="ticket-head">
            <span>Ticket #{ticket.id}</span>
            <span className={left < 8000 ? "bad" : ""}>{Math.ceil(left / 1000)}s</span>
          </div>
          <div className="timer">
            <div style={{ width: `${(left / ((shift?.cook_seconds ?? 30) * 1000)) * 100}%` }} />
          </div>
          <div className="money-line">
            <span>customer pays <b>{money(ticket.pays_cents ?? 0)}</b></span>
            <span>
              plate costs <b>{money(plateCost)}</b> right now:{" "}
              <b className={profit >= 0 ? "good-dark" : "bad"}>{profit >= 0 ? "+" : "-"}{money(Math.abs(profit))}</b>
            </span>
          </div>
          <div className="order">
            <span className="size">{ticket.size}</span>
            {ticket.toppings.map((t) => (
              <span key={t} title={t}>{emoji[t] ?? t}</span>
            ))}
          </div>

          <div className="sizes">
            {["S", "M", "L"].map((s) => (
              <button key={s} className={size === s ? "on" : ""} onClick={() => setSize(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="toppings">
            {menu.map((t) => (
              <button key={t.slug} className={picked.includes(t.slug) ? "on" : ""} onClick={() => toggle(t.slug)}>
                <span>{t.emoji}</span>
                <small>{t.label}</small>
                <small className={t.price_cents > t.base_cents ? "pricey" : "price"}>{money(t.price_cents)}</small>
              </button>
            ))}
          </div>
          <button className="primary" disabled={busy || !size} onClick={serve}>
            {busy ? "Serving…" : "Serve it"}
          </button>
        </section>
      ) : (
        <section className="idle">
          <button className="primary big" disabled={busy} onClick={grab}>
            {busy ? "…" : "Grab a ticket"}
          </button>
        </section>
      )}

      {note && <div className={`note ${note.tone}`}>{note.text}</div>}

      <div className="cheers">
        {["🔥", "👏", "😱", "🍕"].map((e) => (
          <button key={e} onClick={() => cheer(e)}>{e}</button>
        ))}
      </div>

      <button className="link" onClick={() => setShowCheats((s) => !s)}>
        {showCheats ? "Back to cooking" : "😈 Try to cheat"}
      </button>
      {showCheats && <Cheats me={me} />}

      <footer>
        <button className="link small" onClick={leave}>Clock out</button>
        <a className="small muted" href="#/pass">Pass screen →</a>
      </footer>
    </main>
  );
}
