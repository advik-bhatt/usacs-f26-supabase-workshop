import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase, type Crew, type Target } from "../lib/supabase";

// Every one of these is a real request with your real session. None of them
// work, and they fail in different ways. That's the lesson:
//
//   no grant      -> 42501 permission denied
//   no policy     -> 42501 new row violates row-level security policy
//   policy filter -> 200 OK, but only the rows you're allowed to see
//   server check  -> the Edge Function ignores what you claim and does the math itself

type Outcome = { code: string; message: string };

const fail = (error: { code: string; message: string } | null): Outcome =>
  error ? { code: error.code, message: error.message } : { code: "200", message: "it worked?!" };

export function Cheats({ me, target }: { me: Crew; target: Target | null }) {
  const [results, setResults] = useState<Record<string, Outcome>>({});

  const attacks: { id: string; label: string; how: string; run: () => Promise<Outcome> }[] = [
    {
      id: "fake-save",
      label: "Record a save without flying",
      how: `supabase.from("deflections").insert({ saved: true, score: 9999, ... })`,
      run: async () =>
        fail(
          (
            await supabase.from("deflections").insert({
              target_id: target?.id ?? 1, crew_id: me.id, lead_days: 1, mass_kg: 1, direction: "prograde",
              dv_ms: 1, miss_km: 1e9, capture_km: 1, saved: true, score: 9999, seconds: 0.1,
            })
          ).error,
        ),
    },
    {
      id: "lie-to-the-server",
      label: "Tell the server it missed by a mile",
      how: `functions.invoke("deflect", { body: { ..., miss_km: 99999999, saved: true } })`,
      run: async () => {
        if (!target) return { code: "-", message: "Take a target first, then try this one." };
        const { data, error } = await supabase.functions.invoke("deflect", {
          body: { target_id: target.id, lead_days: 1, mass_kg: 100, direction: "radial", miss_km: 99999999, saved: true },
        });
        if (error) {
          const body = error instanceof FunctionsHttpError ? await error.context.json() : null;
          return { code: String(error instanceof FunctionsHttpError ? error.context.status : "?"), message: body?.error ?? error.message };
        }
        return {
          code: "ignored",
          message: `The server ran the physics itself: ${data.status}, missed by ${Math.round(data.missKm).toLocaleString()} km. Your numbers were thrown away (and you just used up this target).`,
        };
      },
    },
    {
      id: "stop-targets",
      label: "Stop new asteroids coming in",
      how: `supabase.from("mission").update({ targets_per_tick: 0 })`,
      run: async () => fail((await supabase.from("mission").update({ targets_per_tick: 0 }).eq("id", true)).error),
    },
    {
      id: "read-credits",
      label: "Read everyone's credits",
      how: `supabase.from("credits").select("*")`,
      run: async () => {
        const { data, error } = await supabase.from("credits").select("crew_id, amount");
        if (error) return { code: error.code, message: error.message };
        const others = (data ?? []).filter((c) => c.crew_id !== me.id).length;
        return {
          code: "filtered",
          message: `200 OK with ${data?.length ?? 0} rows, ${others} of them someone else's. The policy quietly dropped the rest.`,
        };
      },
    },
    {
      id: "skip-the-physics",
      label: "Finish a target without flying",
      how: `supabase.rpc("finish_target", { ... })`,
      run: async () =>
        fail(
          (
            await supabase.rpc("finish_target", {
              p_crew: me.id, p_target: target?.id ?? 1, p_lead_days: 1, p_mass_kg: 1, p_direction: "prograde",
              p_dv_ms: 1, p_miss_km: 1e9, p_capture_km: 1, p_saved: true, p_score: 999,
            })
          ).error,
        ),
    },
    {
      id: "impersonate",
      label: "Join as somebody else",
      how: `supabase.from("crew").insert({ id: someoneElse, ... })`,
      run: async () => fail((await supabase.from("crew").insert({ id: crypto.randomUUID(), name: "Definitely Ana" })).error),
    },
  ];

  async function attempt(a: (typeof attacks)[number]) {
    const outcome = await a.run();
    setResults((r) => ({ ...r, [a.id]: outcome }));
    // Tell mission control. This insert is allowed, but only for kind = 'blocked'
    // and only with your own crew_id.
    await supabase.from("events").insert({
      kind: "blocked",
      crew_id: me.id,
      detail: { attack: a.id, code: outcome.code, message: outcome.message },
    });
  }

  return (
    <section className="cheats">
      <p className="small muted">
        These are real requests from your browser with your real session, the same thing anyone could type into
        devtools. Watch mission control when you try them.
      </p>
      {attacks.map((a) => (
        <div key={a.id} className="cheat">
          <button onClick={() => attempt(a)}>{a.label}</button>
          <code className="small">{a.how}</code>
          {results[a.id] && (
            <div className="small">
              <span className="code">{results[a.id].code}</span> {results[a.id].message}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
