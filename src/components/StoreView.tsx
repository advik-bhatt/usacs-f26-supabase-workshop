import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AISLES, H, SPAWN, W, aisleColor, atExit, reachableShelves, tileAt, walkable, zoneName } from "../game/store";
import { characterGrid, drawGrid } from "../game/sprites";
import { jukebox } from "../game/music";
import type { Ingredient, Me, Run } from "../pages/Play";

const T = 24; // pixels per tile on the canvas
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export type Others = Record<string, { name: string; sprite: number; x: number; y: number; f: number; seen: number }>;

export function StoreView({
  me,
  run,
  ingredients,
  need,
  channel,
  others,
  onSpent,
  onHome,
}: {
  me: Me;
  run: Run;
  ingredients: Ingredient[];
  need: Record<string, number>; // ingredient slug -> how many the menu needs
  channel: RealtimeChannel | null;
  others: Others;
  onSpent: (cents: number) => void;
  onHome: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pos, setPos] = useState({ ...SPAWN, f: 0 });
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;
  const lastZone = useRef("");
  const lastSent = useRef(0);

  const bySpot = useMemo(() => new Map(ingredients.map((i) => [`${i.x},${i.y}`, i])), [ingredients]);

  // what's already in the basket (if you refreshed mid-trip)
  useEffect(() => {
    supabase
      .from("purchases")
      .select("ingredient")
      .eq("run_id", run.id)
      .then(({ data }) => {
        const b: Record<string, number> = {};
        for (const p of data ?? []) b[p.ingredient] = (b[p.ingredient] ?? 0) + 1;
        setBasket(b);
      });
  }, [run.id]);

  // tell everyone where you are: Broadcast for the dot (fast, not stored),
  // the database for the aisle name (slow, shows on the dashboard)
  const announce = useCallback(
    (p: { x: number; y: number; f: number }, force = false) => {
      const now = Date.now();
      if (channel && (force || now - lastSent.current > 120)) {
        lastSent.current = now;
        channel.send({ type: "broadcast", event: "pos", payload: { id: me.id, name: me.name, sprite: me.sprite, ...p } });
      }
      const zone = zoneName(p.x, p.y);
      if (zone !== lastZone.current) {
        lastZone.current = zone;
        supabase.from("player_state").update({ location: zone }).eq("player_id", me.id).then(() => {});
      }
    },
    [channel, me],
  );

  useEffect(() => {
    announce(posRef.current, true);
    const beat = setInterval(() => announce(posRef.current, true), 3000); // keep your dot alive
    return () => clearInterval(beat);
  }, [announce]);

  const move = useCallback(
    (dx: number, dy: number) => {
      const p = posRef.current;
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!walkable(nx, ny)) return;
      const next = { x: nx, y: ny, f: 1 - p.f };
      setPos(next);
      announce(next);
      jukebox.sfx("step");
    },
    [announce],
  );

  const reach = reachableShelves(pos.x, pos.y)
    .map((s) => bySpot.get(`${s.x},${s.y}`))
    .filter((i): i is Ingredient => !!i);

  async function grab(item: Ingredient) {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("buy", { p_run: run.id, p_ingredient: item.slug });
    setBusy(false);
    const r = data as { error?: string; spent_cents?: number } | null;
    if (error || r?.error) {
      jukebox.sfx("nope");
      setToast(r?.error ?? error?.message ?? "Hmm, that didn't work.");
      return;
    }
    jukebox.sfx("buy");
    setBasket((b) => ({ ...b, [item.slug]: (b[item.slug] ?? 0) + 1 }));
    onSpent(r!.spent_cents!);
    const wanted = (need[item.slug] ?? 0) > (basket[item.slug] ?? 0);
    setToast(wanted ? `Got ${item.name}! Great!` : `${item.name}: not on your list, but extra snacks never hurt!`);
  }

  async function goHome() {
    setBusy(true);
    jukebox.sfx("door");
    await onHome();
    setBusy(false);
  }

  // the key handler is registered once, so it reads the latest versions through refs
  const grabRef = useRef(grab);
  grabRef.current = grab;
  const homeRef = useRef(goHome);
  homeRef.current = goHome;

  // keyboard: arrows or WASD to walk, space/enter to grab
  useEffect(() => {
    const keys: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    };
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      jukebox.unlock();
      const k = keys[e.key] ?? keys[e.key.toLowerCase()];
      if (k) {
        e.preventDefault();
        if (Date.now() - last < 95) return;
        last = Date.now();
        move(k[0], k[1]);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const first = reachableShelves(posRef.current.x, posRef.current.y)
          .map((s) => bySpot.get(`${s.x},${s.y}`))
          .find(Boolean);
        if (first) grabRef.current(first);
        else if (atExit(posRef.current.x, posRef.current.y)) homeRef.current();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [move, bySpot]);

  // draw
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = tileAt(x, y);
        const px = x * T;
        const py = y * T;
        if (t === "wall") {
          ctx.fillStyle = "#4a2f22";
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = "#6b4530";
          ctx.fillRect(px, py, T, 4);
        } else if (t === "door") {
          ctx.fillStyle = "#2a1a12";
          ctx.fillRect(px, py, T, T);
        } else if (t === "shelf") {
          ctx.fillStyle = "#3b2a20";
          ctx.fillRect(px, py, T, T);
          ctx.fillStyle = aisleColor(x);
          ctx.fillRect(px + 2, py + 2, T - 4, T - 4);
          const item = bySpot.get(`${x},${y}`);
          if (item) {
            const wanted = (need[item.slug] ?? 0) > (basket[item.slug] ?? 0);
            ctx.fillStyle = "#fff8e8";
            ctx.fillRect(px + 6, py + 6, T - 12, T - 12);
            ctx.fillStyle = wanted ? "#e05a3a" : "#8a7a6a";
            ctx.fillRect(px + 9, py + 9, T - 18, T - 18);
            if (wanted) {
              ctx.strokeStyle = "#ffe066";
              ctx.lineWidth = 2;
              ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);
            }
          }
        } else {
          ctx.fillStyle = (x + y) % 2 ? "#e9dcc3" : "#f3e8d2";
          ctx.fillRect(px, py, T, T);
          if (t === "mat") {
            ctx.fillStyle = "#b53a2a";
            ctx.fillRect(px + 2, py + 6, T - 4, T - 12);
          }
        }
      }
    }
    // aisle signs
    ctx.font = "bold 8px monospace";
    ctx.textAlign = "center";
    for (const a of AISLES) {
      ctx.fillStyle = a.color;
      ctx.fillRect(a.x * T - 22, 1 * T + 6, T + 44, 12);
      ctx.fillStyle = "#1a1a1a";
      ctx.fillText(a.name.toUpperCase(), a.x * T + T / 2, 1 * T + 15);
    }
    ctx.fillStyle = "#fff";
    ctx.fillText("HOME →", 12 * T, (H - 1) * T + 15);

    // everyone else, then you on top
    const fresh = Date.now() - 10_000;
    for (const [id, o] of Object.entries(others)) {
      if (id === me.id || o.seen < fresh) continue;
      const { grid, palette } = characterGrid(o.sprite, o.f);
      drawGrid(ctx, grid, palette, o.x * T + 3, o.y * T - 6, 1.5);
      ctx.fillStyle = "#1a1a1a";
      ctx.font = "7px monospace";
      ctx.fillText(o.name.slice(0, 8), o.x * T + T / 2, o.y * T - 8);
    }
    const { grid, palette } = characterGrid(me.sprite, pos.f);
    drawGrid(ctx, grid, palette, pos.x * T, pos.y * T - 12, 2);
  }, [pos, others, basket, need, bySpot, me]);

  // shopping list: what the menu needs, what's in the basket
  const list = Object.entries(need).map(([slug, n]) => {
    const item = ingredients.find((i) => i.slug === slug)!;
    const aisle = AISLES.find((a) => a.x === item?.x)?.name ?? "";
    return { slug, name: item?.name ?? slug, n, have: basket[slug] ?? 0, aisle };
  });
  const done = list.every((l) => l.have >= l.n);

  return (
    <section className="store">
      <canvas ref={canvas} width={W * T} height={H * T} className="store-canvas" />

      <div className="store-controls">
        <div className="dpad" onPointerDown={() => jukebox.unlock()}>
          <Hold label="▲" onStep={() => move(0, -1)} className="up" />
          <Hold label="◀" onStep={() => move(-1, 0)} className="left" />
          <Hold label="▶" onStep={() => move(1, 0)} className="right" />
          <Hold label="▼" onStep={() => move(0, 1)} className="down" />
        </div>
        <div className="actions">
          {reach.length ? (
            reach.map((item) => (
              <button key={item.slug} className="pixel-btn grab" disabled={busy} onClick={() => grab(item)}>
                Grab {item.name} <span>{money(item.price_cents)}</span>
              </button>
            ))
          ) : atExit(pos.x, pos.y) ? (
            <button className="pixel-btn go" disabled={busy} onClick={goHome}>
              Head home and cook!
            </button>
          ) : (
            <div className="hint">
              {done ? "Got everything! Head for the red mat by the door." : "Walk next to a shelf to grab things. Glowing ones are on your list."}
            </div>
          )}
        </div>
      </div>

      {toast && <div className="toast" onAnimationEnd={() => setToast(null)}>{toast}</div>}

      <div className="list">
        <div className="list-head">
          <b>Shopping list</b>
          <span>{money(run.budget_cents - run.spent_cents)} left</span>
        </div>
        {list.map((l) => (
          <div key={l.slug} className={l.have >= l.n ? "got" : ""}>
            {l.have >= l.n ? "✔" : "□"} {l.name}
            {l.n > 1 ? ` ×${l.n}` : ""} <span className="muted">{l.aisle}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// a D-pad button that keeps stepping while you hold it
function Hold({ label, onStep, className }: { label: string; onStep: () => void; className: string }) {
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <button
      className={`pad ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onStep();
        stop();
        timer.current = window.setInterval(onStep, 150);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}
