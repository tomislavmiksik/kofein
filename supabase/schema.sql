-- Run this once in your Supabase SQL editor

create table if not exists entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  drink_label  text not null,
  mg           integer not null,
  consumed_at  timestamptz not null,
  created_at   timestamptz not null default now()
);

-- Row-level security: users can only see/edit their own entries
alter table entries enable row level security;

create policy "Users can manage their own entries"
  on entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for fast per-user date queries
create index if not exists entries_user_consumed_at
  on entries (user_id, consumed_at desc);
