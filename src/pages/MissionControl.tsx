import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, ensureSession, type Mission, type MissionEvent } from "../lib/supabase";
import { DepthChart, FlowChart, type DepthPoint, type FlowPoint } from "../components/Charts";
import { OrbitView } from "../components/OrbitView";
import { jdNow, type Elements } from "../../supabase/functions/_shared/orbit.ts";
import { days, kg, km, size } from "../lib/format";

// The big screen: everything the team is doing, live, straight out of Postgres.

type Stats = {
  mission: Mission;
  queue: { queue_length: number; oldest_msg_age_sec: number | null } | null;
  waiting: number;
  working: number;
  crew: number;
  last_minute: Record<string, number> | null;
  design_seconds: { p50: number | null; p95: number | null; n: number };
  series: FlowPoint[];
  depth: DepthPoint[];
  leaderboard: { name: string; kind: string; score: number; saves: number; missions: number; lightest_save_kg: number | null }[];
  biggest_saves: { name: string; diameter_km: number; mass_kg: number; lead_days: number; direction: string; crew: string }[];
  active: (Elements & { id: number; status: string; des: string; name: string })[];
  blocked: { code: string; attack: string; n: number }[];
};

type Cheer = { id: number; emoji: string; left: number };

const VERB: Record<string, string> = {
  posted: "on the board:",
  claimed: "took",
  saved: "saved Earth from",
  impact: "didn't stop",
  dropped: "ran out of time on",
  expired: "window closed on",
  late: "was too late with",
};

export function MissionControl() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [feed, setFeed] = useState<MissionEvent[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [online, setOnline] = useState<{ name: string; kind: string }[]>([]);
  const [announcement, setAnnouncement] = useState<string | null>(null);
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
      const { data } = await supabase.from("crew").select("id, name");
      setNames(Object.fromEntries((data ?? []).map((c) => [c.id, c.name])));
    }

    async function poll() {
      const { data, error } = await supabase.rpc("control_stats");
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
      const { data: recent } = await supabase.from("events").select("*").order("id", { ascending: false }).limit(40);
      setFeed(recent ?? []);
      poll();
      if (stop) return; // unmounted while we were loading

      channel = supabase
        .channel("mission")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (p) => {
          const e = p.new as MissionEvent;
          if (e.crew_id && !namesRef.current[e.crew_id]) loadNames();
          setFeed((f) => [e, ...f].slice(0, 40));
        })
        .on("broadcast", { event: "announce" }, ({ payload }) => {
          setAnnouncement(payload.text);
          setTimeout(() => setAnnouncement(null), 10000);
        })
        .on("broadcast", { event: "cheer" }, ({ payload }) => {
          const c = { id: Math.random(), emoji: payload.emoji, left: 5 + Math.random() * 90 };
          setCheers((cs) => [...cs.slice(-30), c]);
          setTimeout(() => setCheers((cs) => cs.filter((x) => x.id !== c.id)), 3000);
        })
        .on("presence", { event: "sync" }, () => {
          const state = channel!.presenceState<{ name: string; kind: string }>();
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

  // only rebuild orbit paths when the set of targets changes, not every poll
  const activeKey = stats?.active.map((a) => a.id).join(",") ?? "";
  const orbits = useMemo(
    () => (stats?.active ?? []).map((a) => ({ ...a, key: a.id })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeKey],
  );

  if (error && !stats) return <div className="center bad">{error}</div>;
  if (!stats) return <div className="center muted">Connecting to mission control…</div>;

  const lm = stats.last_minute ?? {};
  const m = stats.mission;
  const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toFixed(0));
  const who = (e: MissionEvent) => (e.crew_id ? names[e.crew_id] ?? "someone" : "");
  const detail = (e: MissionEvent) => (e.detail ?? {}) as Record<string, string | number>;

  return (
    <main className="control">
      {announcement && <div className="announce big">📡 {announcement}</div>}
      {cheers.map((c) => (
        <span key={c.id} className="cheer" style={{ left: `${c.left}%` }}>{c.emoji}</span>
      ))}

      <header>
        <h1>☄️ Deflect <span className="muted">· mission control</span></h1>
        <div className={`badge ${m.open ? "good" : "bad"}`}>{m.open ? "BOARD OPEN" : "STANDING BY"}</div>
      </header>

      <section className="kpis">
        <Kpi label="on the board" value={stats.waiting} hint={`oldest ${stats.queue?.oldest_msg_age_sec ?? 0}s`} />
        <Kpi label="being worked" value={stats.working} />
        <Kpi label="saves / min" value={lm.saved ?? 0} tone="good" />
        <Kpi label="impacts / min" value={lm.impact ?? 0} tone="bad" />
        <Kpi label="windows closed / min" value={lm.expired ?? 0} tone="bad" />
        <Kpi label="design time p50 / p95" value={`${fmt(stats.design_seconds?.p50)} / ${fmt(stats.design_seconds?.p95)}s`} />
        <Kpi label="team online" value={online.length} hint={`${stats.crew} signed up`} />
      </section>

      <section className="grid3">
        <div className="panel">
          <h2>Targets on the board right now</h2>
          <OrbitView
            orbits={orbits}
            marks={stats.active.slice(0, 12).map((a) => ({
              el: a, jd: jdNow(), label: `#${a.id}`,
              className: a.status === "working" ? "mark-hit" : "mark-now",
            }))}
            size={360}
          />
        </div>
        <div className="panel">
          <h2>How full is the board</h2>
          <DepthChart points={stats.depth} now={now} />
          <h2>Targets in vs. out, every 10s</h2>
          <FlowChart points={stats.series} now={now} />
        </div>
        <div className="panel">
          <h2>Leaderboard</h2>
          <table>
            <thead>
              <tr><th>crew</th><th>pts</th><th>saves</th><th>lightest save</th></tr>
            </thead>
            <tbody>
              {stats.leaderboard.map((l, i) => (
                <tr key={l.name + i}>
                  <td>{l.kind === "bot" ? "🤖 " : ""}{l.name}</td>
                  <td>{l.score}</td>
                  <td>{l.saves}/{l.missions}</td>
                  <td>{l.lightest_save_kg ? kg(l.lightest_save_kg) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.leaderboard.length === 0 && <p className="muted small">No missions flown yet.</p>}

          <h2>Biggest rocks moved</h2>
          {stats.biggest_saves.length === 0 ? (
            <p className="muted small">Nothing yet.</p>
          ) : (
            <ul className="saves">
              {stats.biggest_saves.map((b, i) => (
                <li key={i}>
                  <b>{b.name}</b> ({size(b.diameter_km)}) by {b.crew}: {kg(b.mass_kg)} {b.direction}, {days(b.lead_days)} ahead
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid3">
        <div className="panel feed">
          <h2>Live from <code>public.events</code></h2>
          <ul>
            {feed.map((e) => (
              <li key={e.id} className={e.kind} onClick={() => e.target_id && setTrace(e.target_id)}>
                <time>{new Date(e.at).toLocaleTimeString()}</time>{" "}
                {e.kind === "blocked" ? (
                  <><b>{who(e)}</b> got blocked trying <i>{String(detail(e).attack)}</i>{" "}
                    <span className="code">{String(detail(e).code)}</span></>
                ) : e.kind === "posted" ? (
                  <>{VERB.posted} <b>#{e.target_id}</b> {String(detail(e).name ?? "")}</>
                ) : (
                  <><b>{who(e)}</b> {VERB[e.kind] ?? e.kind} <b>#{e.target_id}</b>
                    {e.kind === "saved" || e.kind === "impact" ? ` · misses by ${km(Number(detail(e).miss_km))}` : ""}</>
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
        </div>

        <div className="panel">
          <h2>Mission settings</h2>
          <dl className="knobs">
            <dt>targets_per_tick</dt><dd>{m.targets_per_tick} every 10s</dd>
            <dt>work_seconds</dt><dd>{m.work_seconds}s to design a mission</dd>
            <dt>window_seconds</dt><dd>{m.window_seconds}s before an untaken target expires</dd>
          </dl>
          <p className="small muted">Change them from a terminal:</p>
          <code className="small block">npx supabase db query "update mission set targets_per_tick = 3"</code>

          <h2>On the team</h2>
          <p className="small">
            {online.map((o, i) => (
              <span key={i} className="pill">{o.kind === "bot" ? "🤖 " : ""}{o.name}</span>
            ))}
          </p>
          <p className="small muted">
            Orbits and close approaches: NASA/JPL Small-Body Database. The impacts are a drill.
          </p>
        </div>
      </section>

      {trace != null && <Trace targetId={trace} names={names} onClose={() => setTrace(null)} />}
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

// One target's whole life, from the event log. In December this is what a
// trace looks like: the same idea, with spans instead of rows.
function Trace({ targetId, names, onClose }: { targetId: number; names: Record<string, string>; onClose: () => void }) {
  const [events, setEvents] = useState<MissionEvent[]>([]);

  useEffect(() => {
    supabase.from("events").select("*").eq("target_id", targetId).order("at").then(({ data }) => setEvents(data ?? []));
  }, [targetId]);

  const start = events[0] ? new Date(events[0].at).getTime() : 0;

  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2>Target #{targetId}, start to finish</h2>
        <ol className="trace">
          {events.map((e) => (
            <li key={e.id} className={e.kind}>
              <span className="offset">+{((new Date(e.at).getTime() - start) / 1000).toFixed(1)}s</span>
              <b>{e.kind}</b> {e.crew_id ? `by ${names[e.crew_id] ?? e.crew_id.slice(0, 8)}` : ""}
              <code className="small">{JSON.stringify(e.detail)}</code>
            </li>
          ))}
        </ol>
        <code className="small block">
          npx supabase db query "select at, kind, detail from events where target_id = {targetId} order by at"
        </code>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
