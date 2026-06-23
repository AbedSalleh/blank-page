-- Blank Page — migration v3 → v4
-- Adds opt-in public editing: anyone with the note's link can edit it while
-- the owner leaves it on. Run once in the Supabase SQL Editor. Idempotent.

alter table public.notes add column if not exists editable boolean not null default false;

-- Anyone may READ a note that is currently marked editable (to load it).
drop policy if exists "editable notes - read" on public.notes;
create policy "editable notes - read"
  on public.notes for select
  using (editable = true);

-- Anyone may UPDATE a note while it is editable. The WITH CHECK keeps it
-- editable, so an anonymous editor can't flip the flag off (only the owner,
-- via the owner policy, can disable editing again).
drop policy if exists "editable notes - update" on public.notes;
create policy "editable notes - update"
  on public.notes for update
  using (editable = true)
  with check (editable = true);
