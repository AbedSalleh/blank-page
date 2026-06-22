-- Blank Page — Supabase schema (v3, multiple notes per user).
-- Fresh installs: run this in your Supabase project's SQL Editor.
-- Already on v1? Run migration.sql, then migration-v3.sql.
-- Already on v2? Run migration-v3.sql to add pinning, tags, trash & realtime.

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Untitled',
  content    text not null default '',
  is_public  boolean not null default false,
  pinned     boolean not null default false,
  tags       text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_id_idx on public.notes (user_id);
create index if not exists notes_deleted_at_idx on public.notes (deleted_at);

alter table public.notes enable row level security;

-- Owners can read their own notes.
drop policy if exists "own notes - select" on public.notes;
create policy "own notes - select"
  on public.notes for select
  using (auth.uid() = user_id);

-- Owners can create notes for themselves.
drop policy if exists "own notes - insert" on public.notes;
create policy "own notes - insert"
  on public.notes for insert
  with check (auth.uid() = user_id);

-- Owners can update their own notes.
drop policy if exists "own notes - update" on public.notes;
create policy "own notes - update"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Owners can delete their own notes.
drop policy if exists "own notes - delete" on public.notes;
create policy "own notes - delete"
  on public.notes for delete
  using (auth.uid() = user_id);

-- Anyone can read notes explicitly marked public (powers share links).
drop policy if exists "public notes - read" on public.notes;
create policy "public notes - read"
  on public.notes for select
  using (is_public = true);

-- Enable realtime (live cross-device sync) for the notes table.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
