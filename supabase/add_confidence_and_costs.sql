-- Add confidence score to individual transactions
alter table public.transactions
  add column if not exists categorization_confidence numeric(4,3);

-- Track token usage and cost for each AI categorization batch
create table if not exists public.categorization_costs (
  id                bigserial primary key,
  created_at        timestamptz not null default now(),
  model             text not null,
  input_tokens      int not null,
  output_tokens     int not null,
  transaction_count int not null,
  cost_usd          numeric(10,6) not null
);

alter table public.categorization_costs enable row level security;

create policy "auth_all" on public.categorization_costs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
