import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AuthGate, NewPassword } from "../components/AuthGate";
import { Account } from "../components/Account";
import { StoreView, type Others } from "../components/StoreView";
import { Kitchen, type Finished } from "../components/Kitchen";
import { Cheats } from "../components/Cheats";
import { CHARACTERS, spriteUrl } from "../game/sprites";
import { jukebox } from "../game/music";

export type Me = { id: string; name: string; sprite: number; xp: number; avatar_path: string | null; kind: string };
export type Run = { id: number; recipes: string[]; budget_cents: number; spent_cents: number; started_at: string; status: string };
export type Ingredient = { slug: string; name: string; price_cents: number; x: number; y: number };
export type Recipe = { slug: string; name: string; stars: number; base_points: number; steps: string[] };

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
export const levelFor = (xp: number) => 1 + Math.floor(Math.sqrt(xp / 150));

type Screen = "menu" | "store" | "kitchen" | "results";

export function Play() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [recovering, setRecovering] = useState(false);

  // Follow the session. Keep this callback to setState only: calling
  // Supabase from inside it can deadlock the auth client.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) {
      setMe(null);
      setLoadingMe(false);
      return;
    }
    setLoadingMe(true);
    supabase.from("players").select("*").eq("id", uid).maybeSingle().then(({ data }) => {
      setMe(data);
      setLoadingMe(false);
    });
  }, [uid]);

  useEffect(() => {
    if (!me) jukebox.play("lounge");
  }, [me]);

  if (session === undefined || (uid && loadingMe)) return <div className="center">Preheating the oven…</div>;
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />;
  if (!session)
    return (
      <AuthGate
        title="🦃 Pixel Potluck"
        blurb="A Friendsgiving cooking race. Pick your dishes, shop the store with your allowance, then cook it all as fast and as well as you can."
      />
    );
  if (!me) return <PickCharacter onDone={setMe} />;
  return <Game me={me} setMe={setMe} />;
}

function PickCharacter({ onDone }: { onDone: (m: Me) => void }) {
  const [name, setName] = useState("");
  const [sprite, setSprite] = useState(Math.floor(Math.random() * 8));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    jukebox.unlock();
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("players")
      .insert({ id: auth.user!.id, name: name.trim(), sprite })
      .select()
      .single();
    setBusy(false);
    if (error) setError(error.message);
    else onDone(data as Me);
  }

  return (
    <main className="screen">
      <h1>Pick your cook</h1>
      <div className="characters">
        {CHARACTERS.map((c, i) => (
          <button key={c.name} type="button" className={`character ${i === sprite ? "on" : ""}`} onClick={() => setSprite(i)}>
            <img src={spriteUrl("character", i, 5)} alt="" className="pixel" />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
      <form onSubmit={go} className="name-form">
        <input autoFocus maxLength={24} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="pixel-btn go" disabled={busy || !name.trim()}>Let's cook!</button>
      </form>
      {error && <p className="soft-error">{error}</p>}
    </main>
  );
}

function Game({ me, setMe }: { me: Me; setMe: (m: Me) => void }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [uses, setUses] = useState<{ recipe: string; ingredient: string }[]>([]);
  const [allowance, setAllowance] = useState(4000);
  const [open, setOpen] = useState(true);
  const [screen, setScreen] = useState<Screen>("menu");
  const [run, setRun] = useState<Run | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [others, setOthers] = useState<Others>({});
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [muted, setMuted] = useState(jukebox.muted);
  const [panel, setPanel] = useState<"none" | "account" | "cheats">("none");
  const channelRef = useRef<RealtimeChannel | null>(null);

  // the menu and the store, once
  useEffect(() => {
    supabase.from("recipes").select("*").order("stars").order("base_points").then(({ data }) => setRecipes(data ?? []));
    supabase.from("ingredients").select("*").then(({ data }) => setIngredients(data ?? []));
    supabase.from("recipe_ingredients").select("*").then(({ data }) => setUses(data ?? []));
    supabase.from("game").select("*").single().then(({ data }) => {
      if (data) {
        setAllowance(data.allowance_cents);
        setOpen(data.open);
      }
    });
  }, []);

  // pick up where you left off if you refreshed mid-trip
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("player_state").select("phase, run_id").eq("player_id", me.id).maybeSingle();
      if (!s?.run_id || (s.phase !== "shopping" && s.phase !== "cooking")) return;
      const { data: r } = await supabase.from("runs").select("*").eq("id", s.run_id).single();
      if (r && (r.status === "shopping" || r.status === "cooking")) {
        setRun(r);
        setScreen(r.status === "shopping" ? "store" : "kitchen");
      }
    })();
  }, [me.id]);

  // one Realtime channel for the whole party
  useEffect(() => {
    const channel = supabase
      .channel("potluck")
      .on("broadcast", { event: "pos" }, ({ payload }) =>
        setOthers((o) => ({ ...o, [payload.id]: { ...payload, seen: Date.now() } })),
      )
      .on("broadcast", { event: "announce" }, ({ payload }) => {
        setAnnouncement(payload.text);
        setTimeout(() => setAnnouncement(null), 9000);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game" }, ({ new: g }) => {
        setAllowance((g as { allowance_cents: number }).allowance_cents);
        setOpen((g as { open: boolean }).open);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ id: me.id, name: me.name, sprite: me.sprite });
      });
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me.id, me.name, me.sprite]);

  // music follows the screen
  useEffect(() => {
    jukebox.play(({ menu: "lounge", store: "shopping", kitchen: "cooking", results: "celebrate" } as const)[screen]);
  }, [screen]);

  // the clock
  useEffect(() => {
    if (screen !== "store" && screen !== "kitchen") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [screen]);

  const cost = useCallback(
    (slugs: string[]) =>
      uses.filter((u) => slugs.includes(u.recipe)).reduce((a, u) => a + (ingredients.find((i) => i.slug === u.ingredient)?.price_cents ?? 0), 0),
    [uses, ingredients],
  );

  const need = useMemo(() => {
    const n: Record<string, number> = {};
    for (const u of uses) if (run?.recipes.includes(u.recipe)) n[u.ingredient] = (n[u.ingredient] ?? 0) + 1;
    return n;
  }, [uses, run]);

  async function start(picked: string[]) {
    const { data, error } = await supabase.rpc("start_run", { p_recipes: picked });
    const r = data as { error?: string; run_id?: number } | null;
    if (error || r?.error) return r?.error ?? error!.message;
    const { data: fresh } = await supabase.from("runs").select("*").eq("id", r!.run_id!).single();
    setRun(fresh);
    setScreen("store");
    return null;
  }

  async function home() {
    if (!run) return;
    const { data } = await supabase.rpc("head_home", { p_run: run.id });
    if ((data as { error?: string })?.error) return;
    setScreen("kitchen");
  }

  async function again() {
    await supabase.rpc("back_to_menu");
    const { data } = await supabase.from("players").select("*").eq("id", me.id).single();
    if (data) setMe(data as Me);
    setRun(null);
    setFinished(null);
    setScreen("menu");
  }

  const elapsed = run ? Math.max(0, (now - new Date(run.started_at).getTime()) / 1000) : 0;

  return (
    <main className="screen game" onPointerDown={() => jukebox.unlock()}>
      <header className="hud">
        <button className="me" onClick={() => setPanel(panel === "account" ? "none" : "account")}>
          <img src={spriteUrl("character", me.sprite, 3)} alt="" className="pixel" />
          <span>
            <strong>{me.name}</strong>
            <small>Lv {levelFor(me.xp)} · {me.xp.toLocaleString()} xp</small>
          </span>
        </button>
        {(screen === "store" || screen === "kitchen") && <div className="clock">⏱ {elapsed.toFixed(0)}s</div>}
        <button
          className="mute"
          onClick={() => {
            jukebox.setMuted(!muted);
            setMuted(!muted);
          }}
          title="Music"
        >
          {muted ? "🔇" : "🎷"}
        </button>
      </header>

      {announcement && <div className="banner">📣 {announcement}</div>}

      {panel === "account" && (
        <Account
          me={{ id: me.id, name: me.name, avatar_path: me.avatar_path }}
          onRename={async (name) => {
            const { data, error } = await supabase.from("players").update({ name }).eq("id", me.id).select().single();
            if (data) setMe(data as Me);
            return error?.message ?? null;
          }}
          onAvatar={async (avatar_path) => {
            const { data, error } = await supabase.from("players").update({ avatar_path }).eq("id", me.id).select().single();
            if (data) setMe(data as Me);
            return error?.message ?? null;
          }}
          onSignedOut={() => location.reload()}
        />
      )}
      {panel === "account" && (
        <div className="panel">
          <div className="small">Change your cook</div>
          <div className="characters small-chars">
            {CHARACTERS.map((c, i) => (
              <button
                key={c.name}
                className={`character ${i === me.sprite ? "on" : ""}`}
                onClick={async () => {
                  const { data } = await supabase.from("players").update({ sprite: i }).eq("id", me.id).select().single();
                  if (data) setMe(data as Me);
                }}
              >
                <img src={spriteUrl("character", i, 3)} alt="" className="pixel" />
              </button>
            ))}
          </div>
        </div>
      )}

      {screen === "menu" && <Menu recipes={recipes} allowance={allowance} open={open} cost={cost} uses={uses} onStart={start} />}

      {screen === "store" && run && (
        <StoreView
          me={me}
          run={run}
          ingredients={ingredients}
          need={need}
          channel={channelRef.current}
          others={others}
          onSpent={(c) => setRun({ ...run, spent_cents: c })}
          onHome={home}
        />
      )}

      {screen === "kitchen" && run && (
        <Kitchen
          run={run}
          recipes={recipes}
          onFinished={(f) => {
            setFinished(f);
            setScreen("results");
          }}
        />
      )}

      {screen === "results" && finished && <Results f={finished} onAgain={again} />}

      <footer className="foot">
        <button className="link" onClick={() => setPanel(panel === "account" ? "none" : "account")}>Account</button>
        <button className="link" onClick={() => setPanel(panel === "cheats" ? "none" : "cheats")}>😈 try to cheat</button>
        <a href="#/live" className="link">live dashboard →</a>
      </footer>
      {panel === "cheats" && <Cheats me={me} run={run} />}
    </main>
  );
}

function Menu({
  recipes,
  allowance,
  open,
  cost,
  uses,
  onStart,
}: {
  recipes: Recipe[];
  allowance: number;
  open: boolean;
  cost: (s: string[]) => number;
  uses: { recipe: string; ingredient: string }[];
  onStart: (picked: string[]) => Promise<string | null>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = cost(picked);
  const over = total > allowance;
  const points = recipes.filter((r) => picked.includes(r.slug)).reduce((a, r) => a + r.base_points, 0);

  const toggle = (slug: string) =>
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  async function go() {
    setBusy(true);
    setMsg(await onStart(picked));
    setBusy(false);
  }

  return (
    <section className="menu">
      <h2>What are you bringing?</h2>
      <p className="small">
        You have <b>{money(allowance)}</b>. Bigger, harder dishes are worth way more points, but they take longer to shop
        for and cook. Spend it well!
      </p>
      <div className="recipes">
        {recipes.map((r) => {
          const c = cost([r.slug]);
          const on = picked.includes(r.slug);
          return (
            <button key={r.slug} className={`recipe ${on ? "on" : ""}`} onClick={() => toggle(r.slug)}>
              <img src={spriteUrl("dish", r.slug, 4)} alt="" className="pixel" />
              <div className="recipe-name">{r.name}</div>
              <div className="stars">{"★".repeat(r.stars)}{"☆".repeat(4 - r.stars)}</div>
              <div className="small">{money(c)} · up to {r.base_points * 2} pts</div>
              <div className="tiny muted">{uses.filter((u) => u.recipe === r.slug).length} items · {r.steps.length} steps</div>
            </button>
          );
        })}
      </div>
      <div className="budget">
        <div className="budget-bar">
          <div style={{ width: `${Math.min(100, (total / allowance) * 100)}%` }} className={over ? "over" : ""} />
        </div>
        <div className="small">
          {money(total)} of {money(allowance)}
          {over ? " · a bit too much, swap one dish!" : picked.length ? ` · worth up to ${points * 2} pts` : ""}
        </div>
      </div>
      {!open && <p className="soft-error">The store opens in a minute. Pick your dishes!</p>}
      {msg && <p className="soft-error">{msg}</p>}
      <button className="pixel-btn go big" disabled={busy || !picked.length || over || !open} onClick={go}>
        Let's go shopping!
      </button>
    </section>
  );
}

function Results({ f, onAgain }: { f: Finished; onAgain: () => void }) {
  const r = f.result;
  const spentShare = f.spent_cents / f.budget_cents;
  return (
    <section className="results panel">
      <div className={`big-grade grade-${f.rating.replace("!", "").toLowerCase()}`}>{f.rating}</div>
      <div className="score">{f.score.toLocaleString()} pts</div>
      <div className="dishes">
        {r.dishes.map((d) => (
          <div key={d.recipe} className="dish-row">
            <img src={spriteUrl("dish", d.recipe, 3)} alt="" className="pixel" />
            <span>{d.name}</span>
            <b>{d.grade}</b>
            <span>{d.points} pts</span>
          </div>
        ))}
      </div>
      <p className="small">
        {r.seconds}s total (par {r.par}s) · speed bonus ×{r.speed}
        {r.speed >= 1.5 ? ". Speedy!" : r.speed < 0.9 ? ". Nice and relaxed." : "."}
      </p>
      <p className="small">
        Spent {money(f.spent_cents)} of {money(f.budget_cents)}.
        {spentShare < 0.6 ? " Next time try a bigger menu: more dishes, more points!" : " Great use of your allowance!"}
      </p>
      {r.missed.length > 0 && <p className="small muted">Skipped {r.missed.length} dish(es) with missing ingredients. Next time!</p>}
      <button className="pixel-btn go big" onClick={onAgain}>Cook again!</button>
    </section>
  );
}
