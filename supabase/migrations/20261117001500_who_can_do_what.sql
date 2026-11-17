-- Who can do what.
--
-- A request from the browser has to get through two gates:
--
--   1. Grants. Does the role (anon or authenticated) have the privilege at all?
--      No grant -> 42501 "permission denied for table ..."
--   2. Row Level Security. Which rows does a policy let through?
--      Reads that no policy allows come back as [] (no error, just nothing).
--      Writes that no policy allows -> "new row violates row-level security policy"
--
-- On an exchange the rule is simple: prices, the book and the tape are
-- public; your cash, your shares, your orders and your fills are yours.
-- And nobody writes to any of it directly. Every change goes through
-- place_order() and cancel_order(), which check everything.

alter table public.traders       enable row level security;
alter table public.market        enable row level security;
alter table public.stocks        enable row level security;
alter table public.accounts      enable row level security;
alter table public.positions     enable row level security;
alter table public.orders        enable row level security;
alter table public.trades        enable row level security;
alter table public.fills         enable row level security;
alter table public.news          enable row level security;
alter table public.price_samples enable row level security;
alter table public.events        enable row level security;

-- Gate 1: start from nothing, grant back only what's used.
revoke all on public.traders, public.market, public.stocks, public.accounts, public.positions,
              public.orders, public.trades, public.fills, public.news, public.price_samples, public.events
  from anon, authenticated;

grant select on public.traders, public.market, public.stocks, public.accounts, public.positions,
                public.orders, public.trades, public.fills, public.news, public.price_samples, public.events
  to authenticated;

grant insert on public.traders to authenticated;
grant update (name) on public.traders to authenticated;
grant insert on public.events to authenticated;

-- Deliberate, like the serves table in the pizza game: you're allowed to
-- *try* to insert an order directly, so the attempt reaches gate 2 and
-- bounces off RLS instead of the grant.
grant insert on public.orders to authenticated;

-- Gate 2.
create policy "traders can see each other" on public.traders for select to authenticated using (true);
create policy "you can only join as yourself" on public.traders for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "you can only rename yourself" on public.traders for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "market settings are public" on public.market for select to authenticated using (true);
create policy "prices are public" on public.stocks for select to authenticated using (true);
create policy "the tape is public" on public.trades for select to authenticated using (true);
create policy "news is public" on public.news for select to authenticated using (true);
create policy "price history is public" on public.price_samples for select to authenticated using (true);
create policy "the event log is public" on public.events for select to authenticated using (true);

create policy "your cash is yours" on public.accounts for select to authenticated
  using ((select auth.uid()) = trader_id);
create policy "your shares are yours" on public.positions for select to authenticated
  using ((select auth.uid()) = trader_id);
create policy "your orders are yours" on public.orders for select to authenticated
  using ((select auth.uid()) = trader_id);
-- no insert policy on orders, on purpose (see the grant above)
create policy "your fills are yours" on public.fills for select to authenticated
  using ((select auth.uid()) = trader_id);

create policy "you can report your own blocked attempts, nothing else" on public.events
  for insert to authenticated
  with check (kind = 'blocked' and trader_id = (select auth.uid()));
