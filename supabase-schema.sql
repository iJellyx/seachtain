-- Seachtain Supabase schema
-- Run this once in the Supabase SQL editor for your project.
-- It is idempotent — re-running is safe.

-- 1) Profiles: one row per user, JSON blob of teacher settings.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);


-- 2) Plans: one row per weekly plan. `id` matches the client-side plan id
-- so existing local plans can be upserted without collision.
create table if not exists public.plans (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  archived boolean not null default false,
  week_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plans_user_id_idx on public.plans(user_id);
create index if not exists plans_user_week_idx on public.plans(user_id, week_date);

alter table public.plans enable row level security;

drop policy if exists "plans_select_own" on public.plans;
create policy "plans_select_own" on public.plans
  for select using (auth.uid() = user_id);

drop policy if exists "plans_insert_own" on public.plans;
create policy "plans_insert_own" on public.plans
  for insert with check (auth.uid() = user_id);

drop policy if exists "plans_update_own" on public.plans;
create policy "plans_update_own" on public.plans
  for update using (auth.uid() = user_id);

drop policy if exists "plans_delete_own" on public.plans;
create policy "plans_delete_own" on public.plans
  for delete using (auth.uid() = user_id);


-- 3) Learning events: append-only feedback + edit log.
create table if not exists public.learning_events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text,          -- client-generated id so we can dedupe on re-sync
  type text not null,
  at timestamptz not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists learning_events_user_event_uq
  on public.learning_events(user_id, event_id) where event_id is not null;
create index if not exists learning_events_user_at_idx
  on public.learning_events(user_id, at desc);

alter table public.learning_events enable row level security;

drop policy if exists "learning_events_select_own" on public.learning_events;
create policy "learning_events_select_own" on public.learning_events
  for select using (auth.uid() = user_id);

drop policy if exists "learning_events_insert_own" on public.learning_events;
create policy "learning_events_insert_own" on public.learning_events
  for insert with check (auth.uid() = user_id);

drop policy if exists "learning_events_delete_own" on public.learning_events;
create policy "learning_events_delete_own" on public.learning_events
  for delete using (auth.uid() = user_id);


-- 4) Touch-updated-at trigger on plans so we can sort by recency cheaply.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plans_touch_updated_at on public.plans;
create trigger plans_touch_updated_at
  before update on public.plans
  for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();
