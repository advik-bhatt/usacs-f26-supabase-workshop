import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const LOCAL = ["127.0.0.1", "localhost"];

// On the local stack the API lives at 127.0.0.1:54321. That's fine on the
// laptop running it, but on a phone 127.0.0.1 means the phone. If this page
// was opened from another device on the network, talk to the machine the page
// came from instead.
function apiUrl() {
  const url = new URL(import.meta.env.VITE_SUPABASE_URL);
  if (LOCAL.includes(url.hostname) && !LOCAL.includes(location.hostname)) {
    url.hostname = location.hostname;
  }
  return url.origin;
}

export const supabase = createClient<Database>(
  apiUrl(),
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

// Sign in as a guest if we aren't signed in yet. Anonymous users are real
// users with a real id; they just haven't told us who they are.
export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return anon.session!;
}
