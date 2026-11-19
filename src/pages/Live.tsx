import { useEffect, useRef, useState } from "react";
import { supabase, ensureSession } from "../lib/supabase";
import { AISLES, H, W, aisleColor, tileAt } from "../game/store";
import { characterGrid, drawGrid, spriteUrl } from "../game/sprites";
import { jukebox } from "../game/music";
import { Avatar } from "../components/Avatar";

// The big screen: where everyone is in the store, live, and how they're doing.
// It's driven by three Realtime features on one channel, and the "Under the
// hood" panel shows every message as it arrives so the room can watch Supabase
// work:
//   Broadcast         positions in the store, ~8 a second per shopper, never stored
//   Postgres Changes  a row changed (an event logged, someone moved aisles, the
//                     store opened), so re-run dashboard() for fresh numbers
//   Presence          who has the game open right now
// dashboard() also runs every 5 seconds as a safety net in case a message is missed.

type Player = {
  id: string; name: string; sprite: number; kind: string; xp: number; level: number; avatar_path: string | null;
  phase: string; location: string; started_at: string | null; checkout_at: string | null; finished_at: string | null;
  recipes: string[] | null; spent_cents: number | null; budget_cents: number | null; score: number | null; rating: string | null;
};
type Board = {
  game: { open: boolean; allowance_cents: number; par_base_s: number };
  players: Player[];
  leaderboard: { name: string; sprite: number; kind: string; score: number; rating: string; dishes: number; seconds: number; level: number }[];
  feed: { id: number; at: string; kind: string; detail: Record<string, unknown>; name: string | null; sprite: number | null }[];
  blocked: { attack: string; code: string; n: number }[];
};
type Pos = Record<string, { name: string; sprite: number; x: number; y: number; f: number; seen: number }>;

type Wire = { id: number; at: number; kind: "broadcast" | "changes" | "presence" | "rpc"; what: string; detail: string };
const WIRE_LABEL: Record<Wire["kind"], string> = {
  broadcast: "Broadcast",
  changes: "Postgres Changes",
  presence: "Presence",
  rpc: "RPC",
};

const T = 16;
const money = (c: number | null) => (c == null ? "-" : `$${(c / 100).toFixed(2)}`);
const PHASE: Record<string, string> = { menu: "picking dishes", shopping: "shopping", cooking: "cooking", done: "done!", away: "away" };

function say(e: Board["feed"][number]) {
  const who = e.name ?? "Someone";
  const d = e.detail ?? {};
  switch (e.kind) {
    case "joined": return `${who} joined the party`;
    case "started": return `${who} is shopping for ${(d.recipes as string[])?.length ?? "some"} dish${(d.recipes as string[])?.length === 1 ? "" : "es"}`;
    case "home": return `${who} headed home with ${money(Number(d.spent_cents))} of groceries`;
    case "finished": return `${who} made ${d.dishes ?? 0} dish${d.dishes === 1 ? "" : "es"}: ${d.rating} ${Number(d.score).toLocaleString()} pts`;
    case "too_fast": return `${who} tried to cook faster than an oven`;
    case "blocked": return `${who} tried to cheat (${d.attack}) and Postgres said no`;
    default: return `${who}: ${e.kind}`;
  }
}

export function Live() {
  const [board, setBoard] = useState<Board | null>(null);
  const [pos, setPos] = useState<Pos>({});
  const [now, setNow] = useState(Date.now());
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [music, setMusic] = useState(false);
  const [wire, setWire] = useState<Wire[]>([]);
  const [online, setOnline] = useState(0);
  const counts = useRef<{ kind: Wire["kind"]; at: number }[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let stop = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let seq = 0;
    let lastPosShown = 0;

    // every message counts toward the per-second numbers; the list shows a sample
    // of positions (there are a lot) and everything else
    const log = (kind: Wire["kind"], what: string, detail: string) => {
      const at = Date.now();
      counts.current.push({ kind, at });
      if (counts.current.length > 2000) counts.current = counts.current.filter((c) => at - c.at < 10_000);
      if (kind === "broadcast" && what === "pos") {
        if (at - lastPosShown < 700) return;
        lastPosShown = at;
      }
      setWire((w) => [{ id: ++seq, at, kind, what, detail }, ...w].slice(0, 14));
    };

    const poll = async (why: string) => {
      const t0 = performance.now();
      const { data, error } = await supabase.rpc("dashboard");
      if (stop) return;
      if (error) return setError(error.message);
      setBoard(data as unknown as Board);
      log("rpc", "dashboard()", `${why}, ${Math.round(performance.now() - t0)} ms`);
    };
    // a burst of changes (a bot buying five things) becomes one refresh
    let pending: number | null = null;
    const refresh = () => {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = null;
        poll("a row changed");
      }, 400);
    };

    (async () => {
      try {
        await ensureSession();
      } catch (e) {
        setError(`Couldn't sign in: ${e instanceof Error ? e.message : e}`);
        return;
      }
      await poll("first load");
      if (stop) return;
      channel = supabase
        .channel("potluck")
        .on("broadcast", { event: "pos" }, ({ payload }) => {
          setPos((p) => ({ ...p, [payload.id]: { ...payload, seen: Date.now() } }));
          log("broadcast", "pos", `${payload.name} at (${payload.x}, ${payload.y})`);
        })
        .on("broadcast", { event: "announce" }, ({ payload }) => {
          setAnnouncement(payload.text);
          setTimeout(() => setAnnouncement(null), 9000);
          log("broadcast", "announce", payload.text);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, ({ new: e }) => {
          log("changes", "INSERT events", String((e as { kind: string }).kind));
          refresh();
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "player_state" }, ({ new: s }) => {
          const st = s as { phase: string; location: string };
          log("changes", "UPDATE player_state", `${st.phase} · ${st.location}`);
          refresh();
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game" }, ({ new: g }) => {
          const game = g as { open: boolean; allowance_cents: number };
          log("changes", "UPDATE game", `open = ${game.open}, allowance = ${money(game.allowance_cents)}`);
          refresh();
        })
        .on("presence", { event: "sync" }, () => {
          const n = Object.keys(channel!.presenceState()).length;
          setOnline(n);
          log("presence", "sync", `${n} with the game open`);
        })
        .subscribe();
    })();
    const t1 = setInterval(() => poll("every 5 s, just in case"), 5000);
    const t2 = setInterval(() => setNow(Date.now()), 500);
    return () => {
      stop = true;
      clearInterval(t1);
      clearInterval(t2);
      if (pending) clearTimeout(pending);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // the mini map
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const t = tileAt(x, y);
        ctx.fillStyle = t === "wall" ? "#4a2f22" : t === "door" ? "#2a1a12" : t === "shelf" ? aisleColor(x) : t === "mat" ? "#b53a2a" : (x + y) % 2 ? "#e9dcc3" : "#f3e8d2";
        ctx.fillRect(x * T, y * T, T, T);
      }
    ctx.font = "bold 7px monospace";
    ctx.textAlign = "center";
    for (const a of AISLES) {
      ctx.fillStyle = "#1a1a1a";
      ctx.fillText(a.name.split(" ")[0].toUpperCase(), a.x * T + T / 2, 1 * T + 11);
    }
    const shopping = new Set(board?.players.filter((p) => p.phase === "shopping").map((p) => p.id));
    for (const [id, p] of Object.entries(pos)) {
      if (Date.now() - p.seen > 10_000 || (board && !shopping.has(id))) continue;
      const { grid, palette } = characterGrid(p.sprite, p.f);
      drawGrid(ctx, grid, palette, p.x * T + 2, p.y * T - 6, 1);
      ctx.fillStyle = "#111";
      ctx.font = "7px monospace";
      ctx.fillText(p.name.slice(0, 10), p.x * T + T / 2, p.y * T - 8);
    }
  }, [pos, board, now]);

  if (error && !board) return <div className="center">{error}</div>;
  if (!board) return <div className="center">Setting the table…</div>;

  const secs = (p: Player) => {
    if (!p.started_at) return null;
    const end = p.finished_at ? new Date(p.finished_at).getTime() : p.phase === "away" ? null : now;
    return end ? Math.max(0, Math.round((end - new Date(p.started_at).getTime()) / 1000)) : null;
  };

  const perSec = (kind: Wire["kind"]) => counts.current.filter((c) => c.kind === kind && now - c.at < 5000).length / 5;

  return (
    <main className="live">
      {announcement && <div className="banner big">📣 {announcement}</div>}
      <header className="live-head">
        <h1>🦃 Pixel Potluck <span className="muted">· live</span></h1>
        <div className="live-right">
          <button
            className="mute"
            onClick={() => {
              jukebox.unlock();
              jukebox.play(music ? null : "lounge");
              setMusic(!music);
            }}
          >
            {music ? "🎷 on" : "🎷 off"}
          </button>
          <span className={`badge ${board.game.open ? "open" : "closed"}`}>{board.game.open ? "STORE OPEN" : "STORE CLOSED"}</span>
        </div>
      </header>

      <section className="live-grid three">
        <div className="panel">
          <h2>In the store right now</h2>
          <canvas ref={canvas} width={W * T} height={H * T} className="mini-map" />
        </div>
        <div className="panel hood">
          <h2>Under the hood</h2>
          <div className="rates">
            <div className="rate broadcast"><b>{perSec("broadcast").toFixed(1)}/s</b><span>Broadcast</span><small>where everyone is walking</small></div>
            <div className="rate changes"><b>{perSec("changes").toFixed(1)}/s</b><span>Postgres Changes</span><small>rows changing in the database</small></div>
            <div className="rate presence"><b>{online}</b><span>Presence</span><small>phones with the game open</small></div>
            <div className="rate rpc"><b>{perSec("rpc").toFixed(1)}/s</b><span>RPC</span><small>dashboard() re-runs</small></div>
          </div>
          <ul className="wire">
            {wire.map((w) => (
              <li key={w.id}>
                <span className={`tag ${w.kind}`}>{WIRE_LABEL[w.kind]}</span> <b>{w.what}</b> <span className="muted">{w.detail}</span>
              </li>
            ))}
          </ul>
          {wire.length === 0 && <p className="muted small">Waiting for the first message…</p>}
        </div>
        <div className="panel feed">
          <h2>What's cooking</h2>
          <ul>
            {board.feed.map((e) => (
              <li key={e.id} className={e.kind}>
                <time>{new Date(e.at).toLocaleTimeString()}</time> {say(e)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="live-grid wide">
        <div className="panel players">
          <h2>Everyone ({board.players.length})</h2>
          <table>
            <thead>
              <tr><th /><th>cook</th><th>lv</th><th>where</th><th>time</th><th>dishes</th><th>spent</th><th>score</th></tr>
            </thead>
            <tbody>
              {board.players.map((p) => (
                <tr key={p.id} className={`phase-${p.phase}`}>
                  <td><img src={spriteUrl("character", p.sprite, 2)} alt="" className="pixel" /></td>
                  <td>{p.avatar_path && <Avatar name={p.name} path={p.avatar_path} size={22} />} {p.kind === "bot" ? "🤖 " : ""}{p.name}<div className="tiny muted">{PHASE[p.phase] ?? p.phase}</div></td>
                  <td>{p.level}</td>
                  <td>{p.location}</td>
                  <td>{secs(p) == null ? "-" : `${secs(p)}s`}</td>
                  <td>{p.recipes?.length ?? "-"}</td>
                  <td>{p.budget_cents ? `${money(p.spent_cents)} / ${money(p.budget_cents)}` : "-"}</td>
                  <td>{p.score != null ? <><b>{p.score.toLocaleString()}</b> <span className="tiny">{p.rating}</span></> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {board.players.length === 0 && <p className="muted small">Nobody here yet. Scan the code and pick a cook!</p>}
        </div>
        <div className="stack">
        <div className="panel">
          <h2>Best dinners</h2>
          <table>
            <tbody>
              {board.leaderboard.slice(0, 10).map((l, i) => (
                <tr key={l.name + i}>
                  <td>{i + 1}</td>
                  <td><img src={spriteUrl("character", l.sprite, 2)} alt="" className="pixel" /> {l.kind === "bot" ? "🤖 " : ""}{l.name}</td>
                  <td><b>{l.score.toLocaleString()}</b></td>
                  <td className="tiny">{l.rating} · {l.dishes} dishes · {l.seconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
          {board.leaderboard.length === 0 && <p className="muted small">First dinner gets served soon…</p>}
        </div>
        <div className="panel">
          <h2>Blocked by Postgres</h2>
          {board.blocked.length === 0 ? (
            <p className="muted small">Nobody's tried to cheat yet.</p>
          ) : (
            <table>
              <tbody>
                {board.blocked.map((b) => (
                  <tr key={b.attack + b.code}><td>{b.attack}</td><td><span className="code">{b.code}</span></td><td>×{b.n}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <h2>Host controls</h2>
          <code className="block">npx supabase db query "update game set open = true"</code>
          <code className="block">npx supabase db query "update game set allowance_cents = 6000"</code>
          <code className="block">npx supabase db query "select announce('Pie is worth a lot tonight!')"</code>
        </div>
        </div>
      </section>
    </main>
  );
}
