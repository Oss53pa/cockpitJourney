-- Libellé du propriétaire sur l'appartenance (pour le sélecteur d'espace).
-- Renseigné par cj-workspace-invite (l'appelant = le propriétaire).
alter table public.cj_workspace_members add column if not exists owner_name  text;
alter table public.cj_workspace_members add column if not exists owner_email text;
