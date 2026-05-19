-- Migration: add per-month budget overrides
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query)

create table if not exists public.budget_overrides (
  category  text not null,
  month     text not null,   -- format: 'YYYY-MM'
  amount    numeric(12,2) not null,
  primary key (category, month)
);

alter table public.budget_overrides enable row level security;

create policy "auth_all" on public.budget_overrides
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table public.budget_overrides;
