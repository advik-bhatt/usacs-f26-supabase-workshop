// POST /functions/v1/delete-account
//
// Deletes the signed-in user: their profile picture, then the auth user itself.
// Everything the game stored about them goes with it, because every player
// table references auth.users with "on delete cascade".
//
// This has to be an Edge Function. Deleting a user is an admin operation
// (auth.admin.deleteUser) that needs the secret key, and the secret key never
// goes to the browser. withSupabase checks the caller's JWT first, so the only
// account anyone can delete is their own.

import { withSupabase } from "npm:@supabase/server@1";

export default {
  fetch: withSupabase({ auth: "user" }, async (_req, ctx) => {
    const id = ctx.userClaims?.id;
    if (!id) return Response.json({ error: "who are you?" }, { status: 401 });

    // files in Storage don't cascade, so clear out their folder first
    const avatars = ctx.supabaseAdmin.storage.from("avatars");
    const { data: files } = await avatars.list(id);
    if (files?.length) await avatars.remove(files.map((f) => `${id}/${f.name}`));

    const { error } = await ctx.supabaseAdmin.auth.admin.deleteUser(id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    console.log(JSON.stringify({ event: "account_deleted", user: id, files: files?.length ?? 0 }));
    return Response.json({ deleted: true });
  }),
};
