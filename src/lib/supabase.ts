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

type Tables = Database["public"]["Tables"];
export type Trader = Tables["traders"]["Row"];
export type Stock = Tables["stocks"]["Row"];
export type Order = Tables["orders"]["Row"];
export type Trade = Tables["trades"]["Row"];
export type Market = Tables["market"]["Row"];
export type News = Tables["news"]["Row"];
export type FloorEvent = Tables["events"]["Row"];

export type Level = { price_cents: number; qty: number; orders: number };
export type Book = { bids: Level[]; asks: Level[] };

// What place_order() and cancel_order() send back.
export type OrderResult = {
  error?: string;
  order?: Order;
  filled?: number;
  avg_cents?: number | null;
  spent_cents?: number;
};

// Sign in as a guest if we aren't signed in yet. Anonymous users are real
// users with a real id; they just haven't told us who they are.
export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return anon.session!;
}

export const usd = (cents: number | null | undefined) =>
  cents == null
    ? "-"
    : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const pct = (now: number, then: number) => {
  const p = ((now - then) / then) * 100;
  if (Math.abs(p) < 0.05) return "0.0%";
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
};

export const isHalted = (s: Pick<Stock, "halted_until">) =>
  s.halted_until != null && new Date(s.halted_until).getTime() > Date.now();
