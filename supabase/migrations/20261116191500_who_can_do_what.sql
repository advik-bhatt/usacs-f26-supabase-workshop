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
-- The cheat panel in the app is built to hit each of these on purpose.

alter table public.toppings     enable row level security;
alter table public.cooks        enable row level security;
alter table public.shift        enable row level security;
alter table public.tickets      enable row level security;
alter table public.serves       enable row level security;
alter table public.tips         enable row level security;
alter table public.events       enable row level security;
alter table public.queue_samples enable row level security;

-- Gate 1. Start from nothing so nothing is open by accident, then grant only
-- what the app actually uses. anon (logged out) gets nothing at all.
revoke all on public.toppings, public.cooks, public.shift, public.tickets,
              public.serves, public.tips, public.events, public.queue_samples
  from anon, authenticated;

grant select on public.toppings, public.cooks, public.shift, public.tickets,
                public.serves, public.tips, public.events, public.queue_samples
  to authenticated;

grant insert on public.cooks to authenticated;
grant update (name) on public.cooks to authenticated;   -- you can rename yourself, nothing else
grant insert on public.events to authenticated;

-- This one is deliberate. Signed-in users are *allowed* to try inserting a
-- serve, so the attempt gets past gate 1 and is stopped by gate 2 instead.
-- Real serves are written by the `serve` Edge Function with the secret key.
grant insert on public.serves to authenticated;

-- Gate 2.
create policy "cooks can read the menu"
  on public.toppings for select to authenticated using (true);

create policy "cooks can read the shift board"
  on public.shift for select to authenticated using (true);

create policy "cooks can see who else is here"
  on public.cooks for select to authenticated using (true);

create policy "you can only join as yourself"
  on public.cooks for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "you can only rename yourself"
  on public.cooks for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "the rail is public"
  on public.tickets for select to authenticated using (true);

create policy "the leaderboard is public"
  on public.serves for select to authenticated using (true);
-- no insert policy on serves, on purpose (see the grant above)

create policy "your tips are yours"
  on public.tips for select to authenticated
  using ((select auth.uid()) = cook_id);

create policy "everyone can watch the event log"
  on public.events for select to authenticated using (true);

create policy "you can report your own blocked attempts, nothing else"
  on public.events for insert to authenticated
  with check (kind = 'blocked' and cook_id = (select auth.uid()));

create policy "everyone can see how busy it is"
  on public.queue_samples for select to authenticated using (true);
