-- Espace partagé multi-utilisateurs.
-- ===================================================================
-- Permet à un collaborateur (avec SON compte) d'accéder et d'éditer
-- TOUT le cockpit d'un propriétaire. Un « espace » = le namespace du
-- propriétaire (son auth_user_id). Les données existantes ne bougent pas.
--
-- Appartenance : cj_workspace_members (membre -> propriétaire + rôle).
-- Helpers SECURITY DEFINER (lisent la table sans déclencher sa RLS, donc
-- pas de récursion) :
--   cj_my_workspaces()           -> {soi} ∪ {propriétaires dont je suis membre actif}
--   cj_can_write_workspace(owner)-> owner=moi OU membre actif role admin/editor
--   cj_can_admin_workspace(owner)-> owner=moi OU membre actif role admin
--
-- Sécurité : ces policies sont AJOUTÉES aux policies owner existantes
-- (OR-combinées). Un tiers hors-membre ne voit toujours rien.

/* ─────────── 1) Table d'appartenance ─────────── */
create table if not exists public.cj_workspace_members (
  id                  uuid primary key default gen_random_uuid(),
  owner_auth_user_id  uuid not null references auth.users(id) on delete cascade,
  member_auth_user_id uuid references auth.users(id) on delete cascade,
  invitee_email       text not null,
  member_profile_id   text,   -- profil du membre créé dans le namespace du propriétaire (à l'acceptation)
  role                text not null default 'editor' check (role in ('admin','editor','viewer')),
  status              text not null default 'pending' check (status in ('pending','active','revoked')),
  token               text unique,
  invited_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  accepted_at         timestamptz
);
create unique index if not exists cj_wm_owner_email_idx
  on public.cj_workspace_members(owner_auth_user_id, lower(invitee_email));
create index if not exists cj_wm_member_idx on public.cj_workspace_members(member_auth_user_id);
create index if not exists cj_wm_token_idx  on public.cj_workspace_members(token);

alter table public.cj_workspace_members enable row level security;
drop policy if exists cj_wm_owner_all on public.cj_workspace_members;
create policy cj_wm_owner_all on public.cj_workspace_members for all
  using (owner_auth_user_id = auth.uid()) with check (owner_auth_user_id = auth.uid());
drop policy if exists cj_wm_member_select on public.cj_workspace_members;
create policy cj_wm_member_select on public.cj_workspace_members for select
  using (member_auth_user_id = auth.uid());
drop policy if exists cj_wm_service_all on public.cj_workspace_members;
create policy cj_wm_service_all on public.cj_workspace_members for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

/* ─────────── 2) Helpers ─────────── */
create or replace function public.cj_my_workspaces()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select auth.uid()
  where auth.uid() is not null
  union
  select owner_auth_user_id from public.cj_workspace_members
   where member_auth_user_id = auth.uid() and status = 'active';
$$;

create or replace function public.cj_can_write_workspace(p_owner uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_owner = auth.uid()
      or exists (
        select 1 from public.cj_workspace_members
         where owner_auth_user_id = p_owner and member_auth_user_id = auth.uid()
           and status = 'active' and role in ('admin','editor')
      );
$$;

create or replace function public.cj_can_admin_workspace(p_owner uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_owner = auth.uid()
      or exists (
        select 1 from public.cj_workspace_members
         where owner_auth_user_id = p_owner and member_auth_user_id = auth.uid()
           and status = 'active' and role = 'admin'
      );
$$;

/* ─────────── 3) Policies « membre-aware » sur toutes les cj_* ─────────── */
do $$
declare t text;
  tbls text[] := array[
    'cj_activity','cj_attachments','cj_automations','cj_budget_lines','cj_comments',
    'cj_dependencies','cj_expenses','cj_folders','cj_forms','cj_goals','cj_insights',
    'cj_notes','cj_notifications','cj_profiles','cj_projects','cj_reports','cj_sections',
    'cj_settings','cj_subtasks','cj_tasks'
  ];
begin
  foreach t in array tbls loop
    execute format('drop policy if exists cj_ws_select on public.%I', t);
    execute format(
      'create policy cj_ws_select on public.%I for select using (auth_user_id in (select public.cj_my_workspaces()))', t);
    execute format('drop policy if exists cj_ws_update on public.%I', t);
    execute format(
      'create policy cj_ws_update on public.%I for update using (public.cj_can_write_workspace(auth_user_id)) with check (public.cj_can_write_workspace(auth_user_id))', t);
    execute format('drop policy if exists cj_ws_insert on public.%I', t);
    execute format(
      'create policy cj_ws_insert on public.%I for insert with check (public.cj_can_write_workspace(auth_user_id))', t);
    execute format('drop policy if exists cj_ws_delete on public.%I', t);
    execute format(
      'create policy cj_ws_delete on public.%I for delete using (public.cj_can_admin_workspace(auth_user_id))', t);
  end loop;
end $$;

/* ─────────── 4) Stockage (cj-attachments, cj-budget) ─────────── */
-- Membre d'un espace -> accès aux objets dont le 1er segment de chemin
-- (= owner auth_user_id) appartient à ses espaces.
drop policy if exists cj_attach_ws_read on storage.objects;
create policy cj_attach_ws_read on storage.objects for select using (
  bucket_id = 'cj-attachments'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x));
drop policy if exists cj_attach_ws_ins on storage.objects;
create policy cj_attach_ws_ins on storage.objects for insert with check (
  bucket_id = 'cj-attachments'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x));
drop policy if exists cj_attach_ws_upd on storage.objects;
create policy cj_attach_ws_upd on storage.objects for update using (
  bucket_id = 'cj-attachments'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x))
with check (
  bucket_id = 'cj-attachments'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x));
drop policy if exists cj_attach_ws_del on storage.objects;
create policy cj_attach_ws_del on storage.objects for delete using (
  bucket_id = 'cj-attachments'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x));

drop policy if exists cj_budget_ws_read on storage.objects;
create policy cj_budget_ws_read on storage.objects for select using (
  bucket_id = 'cj-budget'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x));
drop policy if exists cj_budget_ws_ins on storage.objects;
create policy cj_budget_ws_ins on storage.objects for insert with check (
  bucket_id = 'cj-budget'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x));
drop policy if exists cj_budget_ws_upd on storage.objects;
create policy cj_budget_ws_upd on storage.objects for update using (
  bucket_id = 'cj-budget'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x))
with check (
  bucket_id = 'cj-budget'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x));
drop policy if exists cj_budget_ws_del on storage.objects;
create policy cj_budget_ws_del on storage.objects for delete using (
  bucket_id = 'cj-budget'
  and (storage.foldername(name))[1] in (select x::text from public.cj_my_workspaces() x));
