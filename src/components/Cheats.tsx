import { useState } from "react";
import { supabase, type Cook } from "../lib/supabase";

// Every one of these is a real request with your real session. None of them
// work, and each one fails in a different way. That's the lesson:
//
//   no grant      -> 42501 permission denied
//   no policy     -> 42501 new row violates row-level security policy
//   policy filter -> 200 OK, but only the rows you're allowed to see

type Outcome = { code: string; message: string };

export function Cheats({ me }: { me: Cook }) {
  const [results, setResults] = useState<Record<string, Outcome>>({});

  const attacks: { id: string; label: string; how: string; run: () => Promise<Outcome> }[] = [
    {
      id: "fake-score",
      label: "Give myself 999 points",
      how: `supabase.from("serves").insert({ score: 999, ... })`,
      run: async () => {
        const { error } = await supabase
          .from("serves")
          .insert({ ticket_id: 1, cook_id: me.id, score: 999, correct: true, seconds: 0.1 });
        return error ? { code: error.code, message: error.message } : { code: "200", message: "it worked?!" };
      },
    },
    {
      id: "stop-orders",
      label: "Stop new orders coming in",
      how: `supabase.from("shift").update({ tickets_per_tick: 0 })`,
      run: async () => {
        const { error } = await supabase.from("shift").update({ tickets_per_tick: 0 }).eq("id", true);
        return error ? { code: error.code, message: error.message } : { code: "200", message: "it worked?!" };
      },
    },
    {
      id: "read-tips",
      label: "Read everyone's tips",
      how: `supabase.from("tips").select("*")`,
      run: async () => {
        const { data, error } = await supabase.from("tips").select("cook_id, cents");
        if (error) return { code: error.code, message: error.message };
        const others = (data ?? []).filter((t) => t.cook_id !== me.id).length;
        return {
          code: "filtered",
          message: `200 OK with ${data?.length ?? 0} rows, ${others} of them someone else's. The policy quietly dropped the rest.`,
        };
      },
    },
    {
      id: "skip-cooking",
      label: "Finish a ticket without cooking it",
      how: `supabase.rpc("finish_ticket", { ... })`,
      run: async () => {
        const { error } = await supabase.rpc("finish_ticket", {
          p_cook: me.id,
          p_ticket: 1,
          p_correct: true,
          p_score: 15,
          p_tip_cents: 1000,
        });
        return error ? { code: error.code, message: error.message } : { code: "200", message: "it worked?!" };
      },
    },
    {
      id: "impersonate",
      label: "Join as somebody else",
      how: `supabase.from("cooks").insert({ id: someoneElse, ... })`,
      run: async () => {
        const { error } = await supabase.from("cooks").insert({ id: crypto.randomUUID(), name: "Definitely Ana" });
        return error ? { code: error.code, message: error.message } : { code: "200", message: "it worked?!" };
      },
    },
  ];

  async function attempt(a: (typeof attacks)[number]) {
    const outcome = await a.run();
    setResults((r) => ({ ...r, [a.id]: outcome }));
    // Tell the pass screen. This insert is allowed, but only for kind = 'blocked'
    // and only with your own cook_id.
    await supabase.from("events").insert({
      kind: "blocked",
      cook_id: me.id,
      detail: { attack: a.id, code: outcome.code, message: outcome.message },
    });
  }

  return (
    <section className="cheats">
      <p className="small muted">
        These are real requests from your browser with your real session, the same thing anyone
        could type into devtools. Watch the pass screen when you try them.
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
