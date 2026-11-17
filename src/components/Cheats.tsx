import { useState } from "react";
import { supabase, type Trader, type OrderResult } from "../lib/supabase";

// Every one of these is a real request with your real session. None of them
// work, and they fail in different ways:
//
//   no grant      -> 42501 permission denied
//   no policy     -> 42501 new row violates row-level security policy
//   policy filter -> 200 OK, but only the rows you're allowed to see
//   the engine    -> place_order() / cancel_order() check it and say no

type Outcome = { code: string; message: string };

const fail = (error: { code: string; message: string } | null): Outcome =>
  error ? { code: error.code, message: error.message } : { code: "200", message: "it worked?!" };

const refused = (data: unknown): Outcome => {
  const r = data as OrderResult | null;
  return r?.error ? { code: "refused", message: r.error } : { code: "200", message: "it worked?!" };
};

export function Cheats({ me }: { me: Trader }) {
  const [results, setResults] = useState<Record<string, Outcome>>({});

  const attacks: { id: string; label: string; how: string; run: () => Promise<Outcome> }[] = [
    {
      id: "free-money",
      label: "Give myself a million dollars",
      how: `supabase.from("accounts").update({ cash_cents: 100000000 })`,
      run: async () => fail((await supabase.from("accounts").update({ cash_cents: 100_000_000 }).eq("trader_id", me.id)).error),
    },
    {
      id: "set-price",
      label: "Pump SLICE to $1,000",
      how: `supabase.from("stocks").update({ last_cents: 100000 })`,
      run: async () => fail((await supabase.from("stocks").update({ last_cents: 100_000 }).eq("symbol", "SLICE")).error),
    },
    {
      id: "fake-order",
      label: "Write an order straight into the book",
      how: `supabase.from("orders").insert({ side: "sell", limit_cents: 1, ... })`,
      run: async () =>
        fail(
          (await supabase.from("orders").insert({ trader_id: me.id, symbol: "SLICE", side: "sell", kind: "limit", qty: 100, limit_cents: 1 }))
            .error,
        ),
    },
    {
      id: "peek",
      label: "See what everyone owns",
      how: `supabase.from("positions").select("*")`,
      run: async () => {
        const { data, error } = await supabase.from("positions").select("trader_id");
        if (error) return { code: error.code, message: error.message };
        const others = (data ?? []).filter((p) => p.trader_id !== me.id).length;
        return { code: "filtered", message: `200 OK with ${data?.length ?? 0} rows, ${others} of them someone else's.` };
      },
    },
    {
      id: "short",
      label: "Sell 1,000 shares I don't have",
      how: `supabase.rpc("place_order", { p_side: "sell", p_qty: 1000, ... })`,
      run: async () =>
        refused(
          (await supabase.rpc("place_order", { p_symbol: "SLICE", p_side: "sell", p_kind: "market", p_qty: 1000 })).data,
        ),
    },
    {
      id: "cancel-others",
      label: "Cancel someone else's order",
      how: `supabase.rpc("cancel_order", { p_order: 1 })`,
      run: async () => refused((await supabase.rpc("cancel_order", { p_order: 1 })).data),
    },
  ];

  async function attempt(a: (typeof attacks)[number]) {
    const outcome = await a.run();
    setResults((r) => ({ ...r, [a.id]: outcome }));
    // Tell the floor. Allowed, but only for kind = 'blocked' and your own id.
    await supabase.from("events").insert({
      kind: "blocked",
      trader_id: me.id,
      detail: { attack: a.id, code: outcome.code, message: outcome.message },
    });
  }

  return (
    <section className="cheats">
      <p className="small muted">
        Real requests from your browser with your real session, the same thing anyone could type into devtools. Watch
        the big screen when you try them.
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
