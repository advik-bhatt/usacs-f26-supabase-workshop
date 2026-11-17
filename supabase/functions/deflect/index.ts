// POST /functions/v1/deflect  { target_id, lead_days, mass_kg, direction }
//
// Flies a kinetic impactor mission against the target you claimed. The
// browser already previewed it, but the preview doesn't count: this function
// loads the asteroid's orbit from the database and runs the same physics
// itself (../_shared/orbit.ts), so a result can't be faked. Anything else in
// the request body, like a made-up miss distance, is ignored.

import { withSupabase } from "npm:@supabase/server@1";
import { simulate, jdNow, type Direction } from "../_shared/orbit.ts";

const DIRECTIONS: Direction[] = ["prograde", "retrograde", "radial", "normal"];
export const MIN_MASS_KG = 100;
export const MAX_MASS_KG = 1_000_000; // about ten heavy-lift launches
export const MAX_LEAD_DAYS = 3650;

function score(saved: boolean, massKg: number, seconds: number) {
  if (!saved) return 0;
  // lighter spacecraft = more points: 100 kg earns the full 50, a million earns 0
  const light = Math.round(50 * Math.min(1, Math.max(0, (6 - Math.log10(massKg)) / 4)));
  // and a little for not taking forever
  const quick = Math.round(Math.max(0, 20 - seconds / 6));
  return 100 + light + quick;
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const crewId = ctx.userClaims?.id;
    if (!crewId) return Response.json({ error: "who are you?" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const targetId = Number(body?.target_id);
    const leadDays = Number(body?.lead_days);
    const massKg = Number(body?.mass_kg);
    const direction = body?.direction as Direction;

    if (!targetId || !DIRECTIONS.includes(direction) || !(leadDays > 0) || !(massKg > 0)) {
      return Response.json(
        { error: "send { target_id, lead_days, mass_kg, direction: prograde|retrograde|radial|normal }" },
        { status: 400 },
      );
    }
    if (massKg < MIN_MASS_KG || massKg > MAX_MASS_KG) {
      return Response.json({ error: `spacecraft mass must be ${MIN_MASS_KG} to ${MAX_MASS_KG} kg` }, { status: 400 });
    }

    const { data: target, error: readError } = await ctx.supabaseAdmin
      .from("targets")
      .select("id, claimed_at, asteroids (*)")
      .eq("id", targetId)
      .maybeSingle();

    if (readError) return Response.json({ error: readError.message }, { status: 500 });
    if (!target?.asteroids) return Response.json({ error: `no target #${targetId}` }, { status: 404 });

    const ast = target.asteroids as unknown as Parameters<typeof simulate>[0];

    // You can't launch in the past: the impactor has to hit between now and arrival.
    const maxLead = Math.min(MAX_LEAD_DAYS, ast.ca_jd - jdNow());
    if (leadDays > maxLead) {
      return Response.json(
        { error: `too late for that: it arrives in ${maxLead.toFixed(1)} days` },
        { status: 400 },
      );
    }

    const started = performance.now();
    const outcome = simulate(ast, { leadDays, massKg, direction });
    const simMs = Math.round(performance.now() - started);

    const seconds = target.claimed_at ? (Date.now() - new Date(target.claimed_at).getTime()) / 1000 : 0;
    const points = score(outcome.saved, massKg, seconds);

    // finish_target checks the target is still yours and you weren't too slow,
    // then archives the queue message and records the result, in one transaction.
    const { data, error } = await ctx.supabaseAdmin.rpc("finish_target", {
      p_crew: crewId,
      p_target: targetId,
      p_lead_days: leadDays,
      p_mass_kg: massKg,
      p_direction: direction,
      p_dv_ms: outcome.dvMs,
      p_miss_km: outcome.missKm,
      p_capture_km: outcome.captureKm,
      p_saved: outcome.saved,
      p_score: points,
    });

    if (error) {
      return Response.json({ error: error.message, hint: error.hint }, { status: 409 });
    }

    console.log(JSON.stringify({ event: "flown", target: targetId, crew: crewId, simMs, ...data, missKm: Math.round(outcome.missKm) }));
    return Response.json({ ...data, ...outcome, simMs });
  }),
};
