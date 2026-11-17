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

alter table public.asteroids     enable row level security;
alter table public.crew          enable row level security;
alter table public.mission       enable row level security;
alter table public.targets       enable row level security;
alter table public.deflections   enable row level security;
alter table public.credits       enable row level security;
alter table public.events        enable row level security;
alter table public.queue_samples enable row level security;

-- Gate 1. Start from nothing so nothing is open by accident, then grant only
-- what the app actually uses. anon (logged out) gets nothing at all.
revoke all on public.asteroids, public.crew, public.mission, public.targets,
              public.deflections, public.credits, public.events, public.queue_samples
  from anon, authenticated;

grant select on public.asteroids, public.crew, public.mission, public.targets,
                public.deflections, public.credits, public.events, public.queue_samples
  to authenticated;

grant insert on public.crew to authenticated;
grant update (name) on public.crew to authenticated;   -- you can rename yourself, nothing else
grant insert on public.events to authenticated;

-- This one is deliberate. Signed-in users are *allowed* to try inserting a
-- deflection, so the attempt gets past gate 1 and is stopped by gate 2.
-- Real results are written by the `deflect` Edge Function with the secret key.
grant insert on public.deflections to authenticated;

-- Gate 2.
create policy "the catalog is public to the team"
  on public.asteroids for select to authenticated using (true);

create policy "the team can read the mission settings"
  on public.mission for select to authenticated using (true);

create policy "the team can see who else is here"
  on public.crew for select to authenticated using (true);

create policy "you can only join as yourself"
  on public.crew for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "you can only rename yourself"
  on public.crew for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "the board is public"
  on public.targets for select to authenticated using (true);

create policy "the leaderboard is public"
  on public.deflections for select to authenticated using (true);
-- no insert policy on deflections, on purpose (see the grant above)

create policy "your credits are yours"
  on public.credits for select to authenticated
  using ((select auth.uid()) = crew_id);

create policy "everyone can watch the event log"
  on public.events for select to authenticated using (true);

create policy "you can report your own blocked attempts, nothing else"
  on public.events for insert to authenticated
  with check (kind = 'blocked' and crew_id = (select auth.uid()));

create policy "everyone can see how busy it is"
  on public.queue_samples for select to authenticated using (true);
