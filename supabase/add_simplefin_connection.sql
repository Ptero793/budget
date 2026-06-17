-- SimpleFIN integration: store the long-lived access URL (with embedded creds)
-- and the timestamp of the last successful sync.
create table if not exists public.simplefin_connection (
  id             int primary key default 1,
  access_url     text not null,
  last_synced_at timestamptz,
  created_at     timestamptz not null default now(),
  constraint single_row check (id = 1)
);

alter table public.simplefin_connection enable row level security;

create policy "auth_all" on public.simplefin_connection
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Allow 'simplefin' as a transaction source for institutions that aren't Chase or Amex.
alter table public.transactions
  drop constraint if exists transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check
  check (source in ('chase', 'amex', 'manual', 'simplefin'));
