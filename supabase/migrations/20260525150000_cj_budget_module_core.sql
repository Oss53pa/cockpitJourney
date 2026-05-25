-- Module Budget par projet — tables coeur (lignes budgetaires + depenses).
-- Pattern hybride (colonnes indexees + data jsonb) + RLS identiques aux
-- autres tables cj_* : owner via auth_user_id = auth.uid(), plus roles
-- can_write_for_app / can_admin_for_app pour l'acces equipe.
--
-- Note : notes & pieces jointes par ligne/depense sont stockees dans le
-- `data` jsonb (data.notes[], data.attachments[]) + bucket Storage dedie,
-- pour ne pas toucher aux tables partagees cj_notes / cj_attachments
-- (dont task_id est NOT NULL).

create table if not exists public.cj_budget_lines (
  id            text primary key,
  project_id    text not null references public.cj_projects(id) on delete cascade,
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  owner_id      text references public.cj_profiles(id) on delete set null,
  name          text not null,
  allocated_amount numeric(16,2) not null default 0,
  currency      text not null default 'XOF',
  sort_order    integer not null default 0,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists cj_budget_lines_project_idx  on public.cj_budget_lines(project_id);
create index if not exists cj_budget_lines_auth_user_idx on public.cj_budget_lines(auth_user_id);

create table if not exists public.cj_expenses (
  id            text primary key,
  project_id    text not null references public.cj_projects(id) on delete cascade,
  line_id       text references public.cj_budget_lines(id) on delete set null,
  task_id       text references public.cj_tasks(id) on delete set null,
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  label         text not null,
  amount        numeric(16,2) not null default 0,
  currency      text not null default 'XOF',
  status        text not null default 'paid' check (status in ('planned','committed','paid')),
  expense_date  date not null default current_date,
  vendor        text,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists cj_expenses_project_idx   on public.cj_expenses(project_id);
create index if not exists cj_expenses_line_idx      on public.cj_expenses(line_id);
create index if not exists cj_expenses_auth_user_idx on public.cj_expenses(auth_user_id);

alter table public.cj_budget_lines enable row level security;
alter table public.cj_expenses     enable row level security;

-- cj_budget_lines
create policy cj_owner_select on public.cj_budget_lines for select using (auth_user_id = auth.uid());
create policy cj_owner_insert on public.cj_budget_lines for insert with check (auth_user_id = auth.uid());
create policy cj_owner_update on public.cj_budget_lines for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy cj_owner_delete on public.cj_budget_lines for delete using (auth_user_id = auth.uid());
create policy cj_budget_lines_role_write  on public.cj_budget_lines for insert with check (can_write_for_app('cockpit-journey') or auth.role() = 'service_role');
create policy cj_budget_lines_role_update on public.cj_budget_lines for update using (can_write_for_app('cockpit-journey') or auth.role() = 'service_role');
create policy cj_budget_lines_role_delete on public.cj_budget_lines for delete using (can_admin_for_app('cockpit-journey') or auth.role() = 'service_role');

-- cj_expenses
create policy cj_owner_select on public.cj_expenses for select using (auth_user_id = auth.uid());
create policy cj_owner_insert on public.cj_expenses for insert with check (auth_user_id = auth.uid());
create policy cj_owner_update on public.cj_expenses for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy cj_owner_delete on public.cj_expenses for delete using (auth_user_id = auth.uid());
create policy cj_expenses_role_write  on public.cj_expenses for insert with check (can_write_for_app('cockpit-journey') or auth.role() = 'service_role');
create policy cj_expenses_role_update on public.cj_expenses for update using (can_write_for_app('cockpit-journey') or auth.role() = 'service_role');
create policy cj_expenses_role_delete on public.cj_expenses for delete using (can_admin_for_app('cockpit-journey') or auth.role() = 'service_role');
