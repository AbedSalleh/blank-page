-- Blank Page — migration from v1 (single note per user) to v2 (multiple notes).
--
-- Run this ONCE in your Supabase project if you already ran the original
-- schema.sql: Dashboard → SQL Editor → New query → paste → Run.
-- It is safe to run more than once (idempotent) and preserves your existing note.

-- 1. New columns for multi-note support.
alter table public.notes add column if not exists id uuid not null default gen_random_uuid();
alter table public.notes add column if not exists title text not null default 'Untitled';
alter table public.notes add column if not exists is_public boolean not null default false;
alter table public.notes add column if not exists created_at timestamptz not null default now();

-- 2. Make `id` the primary key so one user can have many notes.
alter table public.notes drop constraint if exists notes_pkey;
alter table public.notes add constraint notes_pkey primary key (id);

-- 3. Fast lookups by owner.
create index if not exists notes_user_id_idx on public.notes (user_id);

-- 4. Let owners delete their own notes.
drop policy if exists "own notes - delete" on public.notes;
create policy "own notes - delete"
  on public.notes for delete
  using (auth.uid() = user_id);

-- 5. Let ANYONE read notes explicitly marked public (powers share links).
drop policy if exists "public notes - read" on public.notes;
create policy "public notes - read"
  on public.notes for select
  using (is_public = true);
