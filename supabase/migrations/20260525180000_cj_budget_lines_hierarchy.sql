-- Lignes budgetaires hierarchiques : une ligne peut avoir une ligne parente
-- (sous-lignes illimitees), et des depenses peuvent etre rattachees a une
-- ligne a n'importe quel niveau. Suppression d'une ligne -> cascade sur ses
-- sous-lignes. Le data jsonb porte aussi parentLineId (camelCase) cote app.
alter table public.cj_budget_lines
  add column if not exists parent_line_id text
  references public.cj_budget_lines(id) on delete cascade;

create index if not exists cj_budget_lines_parent_idx
  on public.cj_budget_lines(parent_line_id);
