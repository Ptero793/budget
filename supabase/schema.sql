-- Budget Tracker — Supabase Schema
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query)

-- Transactions imported from Chase / AmEx / manual entry
create table if not exists public.transactions (
  id                    text primary key,
  date                  text not null,
  description           text not null,
  amount                numeric(12,2) not null,
  category              text,
  source                text not null check (source in ('chase', 'amex', 'manual')),
  categorization_source text,
  created_at            timestamptz not null default now()
);

-- Monthly budget targets per category
create table if not exists public.budget_targets (
  category  text primary key,
  amount    numeric(12,2) not null default 0,
  type      text not null default 'variable' check (type in ('fixed', 'variable'))
);

-- Ordered list of all categories
create table if not exists public.categories (
  name       text primary key,
  sort_order int not null default 0
);

-- Income sources (Prentis, Flow NYC, etc.)
create table if not exists public.income_sources (
  id         text primary key,
  name       text not null,
  target     numeric(12,2) not null default 0,
  sort_order int not null default 0
);

-- Actual income entered per source per month
create table if not exists public.income_actuals (
  source_id text not null references public.income_sources(id) on delete cascade,
  month     text not null,
  amount    numeric(12,2) not null default 0,
  primary key (source_id, month)
);

-- Learned merchant → category rules from manual overrides
create table if not exists public.merchant_overrides (
  merchant_key text primary key,
  category     text not null
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Any authenticated user (Colin or wife) can read/write all household data.

alter table public.transactions      enable row level security;
alter table public.budget_targets    enable row level security;
alter table public.categories        enable row level security;
alter table public.income_sources    enable row level security;
alter table public.income_actuals    enable row level security;
alter table public.merchant_overrides enable row level security;

create policy "auth_all" on public.transactions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on public.budget_targets
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on public.categories
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on public.income_sources
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on public.income_actuals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "auth_all" on public.merchant_overrides
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ── Real-time ─────────────────────────────────────────────────────────────────
-- Enables live sync so changes on one device appear on the other instantly.

alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.budget_targets;
alter publication supabase_realtime add table public.categories;
alter publication supabase_realtime add table public.income_sources;
alter publication supabase_realtime add table public.income_actuals;
alter publication supabase_realtime add table public.merchant_overrides;
