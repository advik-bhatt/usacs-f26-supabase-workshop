// POST /functions/v1/serve  { ticket_id, size, toppings }
//
// Called by the browser (and by the bots) when a pizza is ready.
// withSupabase checks the caller's JWT before our code runs, so by the time
// we're inside the handler we know exactly who is serving.
//
// Grading and writing the result happen here, with the admin client, because
// players are not allowed to write to serves, tips or wallets themselves.
// The money moves inside finish_ticket, in the same transaction.

import { withSupabase } from "npm:@supabase/server@1";
import { grade } from "./grade.ts";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const cookId = ctx.userClaims?.id;
    if (!cookId) return Response.json({ error: "who are you?" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const ticketId = Number(body?.ticket_id);
    if (!ticketId || typeof body?.size !== "string" || !Array.isArray(body?.toppings)) {
      return Response.json(
        { error: "send { ticket_id, size, toppings: [] }" },
        { status: 400 },
      );
    }

    const { data: ticket, error: readError } = await ctx.supabaseAdmin
      .from("tickets")
      .select("id, size, toppings, claimed_at")
      .eq("id", ticketId)
      .maybeSingle();

    if (readError) return Response.json({ error: readError.message }, { status: 500 });
    if (!ticket) return Response.json({ error: `no ticket #${ticketId}` }, { status: 404 });

    const seconds = ticket.claimed_at
      ? (Date.now() - new Date(ticket.claimed_at).getTime()) / 1000
      : 0;

    const result = grade(ticket, { size: body.size, toppings: body.toppings }, seconds);

    // finish_ticket checks that the ticket is still yours, you weren't too
    // slow and you can afford the ingredients, then charges you, pays you,
    // bumps topping prices and archives the queue message, all in one
    // transaction.
    const { data, error } = await ctx.supabaseAdmin.rpc("finish_ticket", {
      p_cook: cookId,
      p_ticket: ticketId,
      p_correct: result.correct,
      p_score: result.score,
      p_tip_cents: result.tipCents,
      p_plate_size: body.size,
      p_plate: body.toppings,
      p_detail: { missing: result.missing, extra: result.extra, by: body.by ?? "hand" },
    });

    if (error) {
      return Response.json({ error: error.message, hint: error.hint }, { status: 409 });
    }
    if (data?.error) {
      // refused but recorded (too late, or can't afford it)
      return Response.json(data, { status: 409 });
    }

    console.log(JSON.stringify({ event: "served", ticket: ticketId, cook: cookId, ...data }));
    return Response.json({ ...data, missing: result.missing, extra: result.extra });
  }),
};
