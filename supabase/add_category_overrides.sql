-- Per-month budget overrides: support per-month category type changes and
-- per-month hidden flag. A null amount means "no amount override" — used
-- when the row exists only to carry a type override or hidden flag.

alter table public.budget_overrides
  add column if not exists type   text check (type in ('fixed', 'variable')),
  add column if not exists hidden boolean not null default false;

alter table public.budget_overrides
  alter column amount drop not null;

-- Income sources: rely on the existing sort_order column for DnD ordering.
-- No schema change needed there.
