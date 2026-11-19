import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FunctionsHttpError, type RealtimeChannel } from "@supabase/supabase-js";
import {
  supabase,
  ensureSession,
  type AsteroidRow,
  type Crew,
  type Mission,
  type Target,
} from "../lib/supabase";
import { simulate, asteroidMassKg, jdNow, type Direction, type Outcome } from "../../supabase/functions/_shared/orbit.ts";
import { OrbitView, BPlane } from "../components/OrbitView";
import { Cheats } from "../components/Cheats";
import { AuthGate, NewPassword } from "../components/AuthGate";
import { Account } from "../components/Account";
import { Avatar } from "../components/Avatar";
import type { Session } from "@supabase/supabase-js";
import { days, kg, km, lunar, size, speed, AU_KM } from "../lib/format";

type Note = { tone: "good" | "bad" | "info"; text: string };

const MIN_MASS = 100;
const MAX_MASS = 1_000_000;
const MAX_LEAD = 3650;

export function Console() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Crew | null>(null);
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
    supabase.from("crew").select("*").eq("id", uid).maybeSingle().then(({ data }) => {
      setMe(data);
      setLoadingMe(false);
    });
  }, [uid]);

  if (session === undefined || (uid && loadingMe)) return <div className="center muted">Connecting…</div>;
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />;
  if (!session) return <AuthGate title="☄️ Deflect" blurb="Real asteroids, real orbits, from NASA/JPL. Each one is a drill: assume it's going to hit Earth, and design a mission that pushes it clear." />;
  if (!me) return <SignUp onDone={setMe} />;
  return <Desk me={me} onMe={setMe} onLeave={() => setMe(null)} />;
}

function SignUp({ onDone }: { onDone: (c: Crew) => void }) {
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
      let { data, error } = await supabase.from("crew").insert({ id, name: name.trim() }).select().single();
      if (error?.code === "23505") {
        ({ data, error } = await supabase.from("crew").update({ name: name.trim() }).eq("id", id).select().single());
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
      <h1>☄️ Deflect</h1>
      <p className="muted">
        Real asteroids, real orbits, from NASA/JPL. Each one is a drill: assume it's going to hit Earth. Design a
        kinetic impactor mission, like DART, that pushes it clear.
      </p>
      <form onSubmit={join}>
        <input autoFocus maxLength={24} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={busy || !name.trim()}>{busy ? "Joining…" : "Join the team"}</button>
      </form>
      {error && <p className="bad">{error}</p>}
      <p className="small muted">
        This is the name everyone sees on the big screen. You can change it, and add a picture, any time.
      </p>
    </main>
  );
}

function Desk({ me, onMe, onLeave }: { me: Crew; onMe: (m: Crew) => void; onLeave: () => void }) {
  const [showAccount, setShowAccount] = useState(false);
  const [mission, setMission] = useState<Mission | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [rock, setRock] = useState<AsteroidRow | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [lead, setLead] = useState(365);
  const [mass, setMass] = useState(580);
  const [direction, setDirection] = useState<Direction>("prograde");
  const [preview, setPreview] = useState<Outcome | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState({ score: 0, saves: 0, credits: 0 });
  const [online, setOnline] = useState(0);
  const [showCheats, setShowCheats] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refreshMine = useCallback(async () => {
    // deflections are public (it's the leaderboard), credits only to you
    const [{ data: flown }, { data: credits }] = await Promise.all([
      supabase.from("deflections").select("score, saved").eq("crew_id", me.id),
      supabase.from("credits").select("amount"),
    ]);
    setMine({
      score: (flown ?? []).reduce((a, d) => a + d.score, 0),
      saves: (flown ?? []).filter((d) => d.saved).length,
      credits: (credits ?? []).reduce((a, c) => a + c.amount, 0),
    });
  }, [me.id]);

  useEffect(() => {
    supabase.from("mission").select("*").single().then(({ data }) => setMission(data));
    refreshMine();

    const channel = supabase
      .channel("mission")
      // the host changes the mission from the terminal; we hear about it here
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mission" }, (p) => setMission(p.new as Mission))
      // `select announce('...')` in SQL lands here via realtime.send()
      .on("broadcast", { event: "announce" }, ({ payload }) => {
        setAnnouncement(payload.text);
        setTimeout(() => setAnnouncement(null), 10000);
      })
      .on("presence", { event: "sync" }, () => setOnline(Object.keys(channel.presenceState()).length))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ name: me.name, kind: me.kind, avatar_path: me.avatar_path });
      });
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, refreshMine]);

  // countdown
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [target]);

  const left = target ? Math.max(0, deadline - now) : 0;

  useEffect(() => {
    if (target && left === 0) {
      setNote({ tone: "bad", text: `Out of time. Target #${target.id} went back on the board for someone else.` });
      setTarget(null);
    }
  }, [left, target]);

  // leave half a day of slack so the server's clock doesn't call it "too late"
  const maxLead = rock ? Math.max(1, Math.min(MAX_LEAD, rock.ca_jd - jdNow() - 0.5)) : MAX_LEAD;

  // Re-run the physics whenever the plan changes. This is only a preview;
  // the Edge Function runs it again and that's the result that counts.
  useEffect(() => {
    if (!rock) return;
    const id = setTimeout(() => {
      setPreview(simulate(rock, { leadDays: Math.min(lead, maxLead), massKg: mass, direction }));
    }, 120);
    return () => clearTimeout(id);
  }, [rock, lead, mass, direction, maxLead]);

  async function claim() {
    setBusy(true);
    setNote(null);
    const { data, error } = await supabase.rpc("claim_target");
    if (error) {
      setBusy(false);
      return setNote({ tone: "bad", text: error.message });
    }
    const t = data?.[0];
    if (!t) {
      setBusy(false);
      return setNote({ tone: "info", text: "The board is empty. New targets come up every 10 seconds." });
    }
    const { data: a } = await supabase.from("asteroids").select("*").eq("des", t.des).single();
    setBusy(false);

    const workMs = (mission?.work_seconds ?? 90) * 1000;
    const elapsed = Math.min(workMs, Math.max(0, Date.now() - new Date(t.claimed_at!).getTime()));
    setTarget(t);
    setRock(a);
    setDeadline(Date.now() + workMs - elapsed);
    setLead(Math.min(365, Math.max(1, (a?.ca_jd ?? 0) - jdNow())));
    setMass(580);
    setDirection("prograde");
    setPreview(null);
  }

  async function launch() {
    if (!target) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("deflect", {
      body: { target_id: target.id, lead_days: Math.min(lead, maxLead), mass_kg: mass, direction },
    });
    setBusy(false);
    setTarget(null);

    if (error) {
      const body = error instanceof FunctionsHttpError ? await error.context.json() : null;
      return setNote({ tone: "bad", text: body?.error ?? error.message });
    }
    if (data.status === "saved") {
      setNote({ tone: "good", text: `Saved. It now misses Earth by ${km(data.missKm)}. +${data.score} points.` });
    } else {
      setNote({ tone: "bad", text: `Impact. It still passes ${km(data.missKm)} from Earth's center, inside the ${km(data.captureKm)} capture radius.` });
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

  const orbit = useMemo(() => (rock ? [{ ...rock, key: rock.des }] : []), [rock]);
  const rockMass = rock ? asteroidMassKg(rock.diameter_km) : 0;
  // sliders are logarithmic: 0..1000 maps to min..max
  const toLog = (v: number, lo: number, hi: number) => (1000 * Math.log(v / lo)) / Math.log(hi / lo);
  const fromLog = (p: number, lo: number, hi: number) => lo * (hi / lo) ** (p / 1000);

  return (
    <main className="console">
      <header>
        <div>
          <button className="me" onClick={() => setShowAccount((v) => !v)} title="Your account">
            <Avatar name={me.name} path={me.avatar_path} size={26} /> <strong>{me.name}</strong>
          </button>
          <span className="muted"> · {online} on the team</span>
        </div>
        <div className="stats">
          <span>{mine.score} pts</span>
          <span>{mine.saves} saves</span>
          <span title="Only you can see this. RLS.">{(mine.credits / 1000).toLocaleString()}k credits 🔒</span>
        </div>
      </header>

      {showAccount && (
        <Account
          me={me}
          onRename={async (name) => {
            const { data, error } = await supabase.from("crew").update({ name }).eq("id", me.id).select().single();
            if (data) onMe(data);
            return error?.message ?? null;
          }}
          onAvatar={async (avatar_path) => {
            const { data, error } = await supabase.from("crew").update({ avatar_path }).eq("id", me.id).select().single();
            if (data) onMe(data);
            return error?.message ?? null;
          }}
          onSignedOut={onLeave}
        />
      )}

      {announcement && <div className="announce">📡 {announcement}</div>}
      {mission && !mission.open && <div className="note info">Mission control hasn't opened the board yet.</div>}

      {target && rock ? (
        <section className="target">
          <div className="target-head">
            <span>
              #{target.id} · {rock.name} {rock.pha && <span className="badge-sm">PHA</span>}
            </span>
            <span className={left < 15000 ? "bad" : ""}>{Math.ceil(left / 1000)}s</span>
          </div>
          <div className="timer">
            <div style={{ width: `${(left / ((mission?.work_seconds ?? 90) * 1000)) * 100}%` }} />
          </div>

          <dl className="facts">
            <dt>size</dt>
            <dd>{size(rock.diameter_km)} {rock.diameter_measured ? "" : <span className="muted">(estimated)</span>}</dd>
            <dt>mass</dt>
            <dd>{kg(rockMass)}</dd>
            <dt>arrives</dt>
            <dd>{rock.ca_date} UTC, in {days(rock.ca_jd - jdNow())}</dd>
            <dt>really passes</dt>
            <dd>{km(rock.ca_dist_au * AU_KM)} ({lunar(rock.ca_dist_au * AU_KM)})</dd>
            <dt>speed vs Earth</dt>
            <dd>{rock.v_inf_kms.toFixed(1)} km/s</dd>
          </dl>

          <OrbitView
            orbits={orbit}
            marks={[
              { el: rock, jd: jdNow(), label: "now", className: "mark-now" },
              { el: rock, jd: rock.ca_jd - Math.min(lead, maxLead), label: "impactor hits", className: "mark-hit" },
              { el: rock, jd: rock.ca_jd, label: "Earth (drill)", className: "mark-earth" },
            ]}
          />

          <label className="slider">
            <span>Hit it <b>{days(Math.min(lead, maxLead))}</b> before arrival</span>
            <input
              type="range" min={0} max={1000}
              value={toLog(Math.min(lead, maxLead), 1, maxLead)}
              onChange={(e) => setLead(fromLog(Number(e.target.value), 1, maxLead))}
            />
          </label>

          <label className="slider">
            <span>Spacecraft mass <b>{kg(mass)}</b> <span className="muted small">(DART was 580 kg)</span></span>
            <input
              type="range" min={0} max={1000}
              value={toLog(mass, MIN_MASS, MAX_MASS)}
              onChange={(e) => setMass(Math.round(fromLog(Number(e.target.value), MIN_MASS, MAX_MASS)))}
            />
          </label>

          <div className="directions">
            {(["prograde", "retrograde", "radial", "normal"] as const).map((d) => (
              <button key={d} className={direction === d ? "on" : ""} onClick={() => setDirection(d)}>
                {d}
              </button>
            ))}
          </div>
          <p className="small muted">
            Prograde pushes it faster along its orbit, retrograde slows it, radial pushes it away from the Sun, normal
            pushes it out of its orbital plane.
          </p>

          {preview && (
            <div className={`preview ${preview.saved ? "safe" : "hit"}`}>
              <BPlane b={preview.bPlaneKm} captureKm={preview.captureKm} />
              <div>
                <div className="verdict">{preview.saved ? "Clears Earth" : "Still hits"}</div>
                <div className="small">velocity change: {speed(preview.dvMs)}</div>
                <div className="small">misses Earth's center by {km(preview.missKm)}</div>
                <div className="small muted">needs more than {km(preview.captureKm)}</div>
              </div>
            </div>
          )}

          <button className="primary" disabled={busy} onClick={launch}>
            {busy ? "Flying…" : "Launch"}
          </button>
        </section>
      ) : (
        <section className="idle">
          <button className="primary big" disabled={busy} onClick={claim}>
            {busy ? "…" : "Take the next target"}
          </button>
        </section>
      )}

      {note && <div className={`note ${note.tone}`}>{note.text}</div>}

      <div className="cheers">
        {["🚀", "👏", "😱", "☄️"].map((e) => (
          <button key={e} onClick={() => cheer(e)}>{e}</button>
        ))}
      </div>

      <button className="link" onClick={() => setShowCheats((s) => !s)}>
        {showCheats ? "Back to the mission" : "😈 Try to cheat"}
      </button>
      {showCheats && <Cheats me={me} target={target} />}

      <footer>
        <button className="link small" onClick={leave}>Sign out</button>
        <button className="link small" onClick={() => setShowAccount((v) => !v)}>Account</button>
        <a className="small muted" href="#/control">Mission control →</a>
      </footer>
    </main>
  );
}
