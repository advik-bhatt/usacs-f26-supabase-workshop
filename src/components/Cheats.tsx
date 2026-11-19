import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { Me, Run } from "../pages/Play";

// Real requests with your real session, the same thing anyone could type into
// devtools. None of them work, and each one fails in its own way:
//   no grant      -> 42501 permission denied
//   policy filter -> 200 OK, but only your own rows
//   the game      -> start_run / buy / finish_run check it and say no (kindly)

type Outcome = { code: string; message: string };
const fail = (e: { code: string; message: string } | null): Outcome =>
  e ? { code: e.code, message: e.message } : { code: "200", message: "it worked?!" };

export function Cheats({ me, run }: { me: Me; run: Run | null }) {
  const [results, setResults] = useState<Record<string, Outcome>>({});

  const attacks: { id: string; label: string; how: string; run: () => Promise<Outcome> }[] = [
    {
      id: "more-money",
      label: "Give myself $1,000 to spend",
      how: `supabase.from("runs").update({ budget_cents: 100000 })`,
      run: async () => fail((await supabase.from("runs").update({ budget_cents: 100000 }).eq("player_id", me.id)).error),
    },
    {
      id: "free-turkey",
      label: "Put a free turkey in my basket",
      how: `supabase.from("purchases").insert({ ingredient: "turkey", price_cents: 0 })`,
      run: async () =>
        fail(
          (await supabase.from("purchases").insert({ run_id: run?.id ?? 1, player_id: me.id, ingredient: "turkey", price_cents: 0 }))
            .error,
        ),
    },
    {
      id: "set-score",
      label: "Set my score to 99,999",
      how: `supabase.from("runs").update({ score: 99999 })`,
      run: async () => fail((await supabase.from("runs").update({ score: 99999 }).eq("player_id", me.id)).error),
    },
    {
      id: "skip-to-done",
      label: "Jump straight to 'done' on the dashboard",
      how: `supabase.from("player_state").update({ phase: "done" })`,
      run: async () => fail((await supabase.from("player_state").update({ phase: "done" }).eq("player_id", me.id)).error),
    },
    {
      id: "peek",
      label: "Peek in everyone's basket",
      how: `supabase.from("purchases").select("*")`,
      run: async () => {
        const { data, error } = await supabase.from("purchases").select("player_id");
        if (error) return { code: error.code, message: error.message };
        const others = (data ?? []).filter((p) => p.player_id !== me.id).length;
        return { code: "filtered", message: `200 OK with ${data?.length ?? 0} rows, ${others} of them someone else's.` };
      },
    },
    {
      id: "instant-cook",
      label: "Finish cooking instantly, perfectly",
      how: `supabase.rpc("finish_run", { p_accuracy: { everything: 1 } })`,
      run: async () => {
        const { data } = await supabase.rpc("finish_run", { p_run: run?.id ?? 0, p_accuracy: { "roast-turkey": 1 } });
        const r = data as { error?: string } | null;
        return r?.error ? { code: "refused", message: r.error } : { code: "200", message: "That counted. Was it really you?" };
      },
    },
  ];

  async function attempt(a: (typeof attacks)[number]) {
    const outcome = await a.run();
    setResults((r) => ({ ...r, [a.id]: outcome }));
    await supabase.from("events").insert({ kind: "blocked", player_id: me.id, detail: { attack: a.id, code: outcome.code } });
  }

  return (
    <section className="panel cheats">
      <p className="small">
        These are real requests with your real login, like typing into devtools. Watch the live dashboard when you try them.
      </p>
      {attacks.map((a) => (
        <div key={a.id} className="cheat">
          <button className="pixel-btn" onClick={() => attempt(a)}>{a.label}</button>
          <code>{a.how}</code>
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
