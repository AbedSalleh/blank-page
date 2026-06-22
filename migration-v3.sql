-- Blank Page — migration v2 → v3
-- Adds pinning, tags, soft-delete (trash), and enables realtime sync.
-- Run once in your Supabase project: SQL Editor → New query → paste → Run.
-- Safe to run more than once.

alter table public.notes add column if not exists pinned     boolean    not null default false;
alter table public.notes add column if not exists tags       text[]     not null default '{}';
alter table public.notes add column if not exists deleted_at timestamptz;

-- Helps list active notes and trash quickly.
create index if not exists notes_deleted_at_idx on public.notes (deleted_at);

-- Enable realtime (live cross-device sync) for the notes table.
-- Wrapped so re-running doesn't error if it's already in the publication.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
