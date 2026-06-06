-- Partage participant — liens de partage par projet ou par tâche.
-- ===================================================================
-- Permet d'inviter un participant EXTERNE (sans siège de licence) sur
-- UN projet ou UNE tâche précise, via un lien anonyme révocable. Le
-- participant accède/contribue à travers l'edge function `cj-share`
-- (service-role, déployée --no-verify-jwt), exactement comme les
-- formulaires publics `/f/:id` (form-public / form-submit).
--
-- Le lien reste valide JUSQU'À révocation (revoked_at) ou expiration
-- optionnelle (expires_at). `permission` = 'contribute' (modification
-- limitée : statut, sous-tâches, commentaires) ou 'view' (lecture).
--
-- Patron hybride (colonnes indexées + data jsonb) + RLS identiques aux
-- autres tables cj_* : propriétaire via auth_user_id = auth.uid(),
-- plus accès service_role pour l'edge function participant.

create table if not exists public.cj_shares (
  id               text primary key,
  token            text not null unique,
  auth_user_id     uuid not null references auth.users(id) on delete cascade,
  owner_profile_id text references public.cj_profiles(id) on delete set null,
  resource_type    text not null check (resource_type in ('project','task')),
  resource_id      text not null,
  permission       text not null default 'contribute' check (permission in ('view','contribute')),
  label            text,
  invitee_email    text,
  revoked_at       timestamptz,
  expires_at       timestamptz,
  last_accessed_at timestamptz,
  access_count     integer not null default 0,
  data             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists cj_shares_auth_user_idx on public.cj_shares(auth_user_id);
create index if not exists cj_shares_resource_idx   on public.cj_shares(resource_type, resource_id);

alter table public.cj_shares enable row level security;

-- Propriétaire : CRUD sur ses propres liens uniquement.
create policy cj_shares_owner_select on public.cj_shares
  for select using (auth_user_id = auth.uid());
create policy cj_shares_owner_insert on public.cj_shares
  for insert with check (auth_user_id = auth.uid());
create policy cj_shares_owner_update on public.cj_shares
  for update using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy cj_shares_owner_delete on public.cj_shares
  for delete using (auth_user_id = auth.uid());

-- service_role (edge function participant) : accès complet (validation
-- du token + de la portée faite côté fonction, jamais côté client).
create policy cj_shares_service_all on public.cj_shares
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
