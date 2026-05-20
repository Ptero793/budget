-- Store per-transaction categorization cost (batch cost ÷ batch size)
alter table public.transactions
  add column if not exists categorization_cost_usd numeric(10,8);
