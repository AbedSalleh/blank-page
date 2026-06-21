-- Blank Page — Supabase schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query → Run.

-- One note per user. The user_id references the built-in auth.users table.
create table if not exists public.notes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  content    text not null default '',
  updated_at timestamptz not null default now()
);

-- Row Level Security: each user can only read/write their own row.
alter table public.notes enable row level security;

drop policy if exists "own notes - select" on public.notes;
create policy "own notes - select"
  on public.notes for select
  using (auth.uid() = user_id);

drop policy if exists "own notes - insert" on public.notes;
create policy "own notes - insert"
  on public.notes for insert
  with check (auth.uid() = user_id);

drop policy if exists "own notes - update" on public.notes;
create policy "own notes - update"
  on public.notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
