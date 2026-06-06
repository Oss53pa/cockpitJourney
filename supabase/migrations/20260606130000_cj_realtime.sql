-- Temps réel sur les entités collaboratives.
-- ===================================================================
-- Active Supabase Realtime (postgres_changes) sur les tables que les
-- participants externes (edge function cj-share) peuvent modifier, afin
-- que le propriétaire voie les contributions SANS recharger. Les events
-- respectent la RLS SELECT (auth_user_id = auth.uid()) : chaque session
-- ne reçoit que les changements de son propre namespace.
--
-- REPLICA IDENTITY FULL : nécessaire pour que les events UPDATE/DELETE
-- transportent `auth_user_id` (sinon le filtre côté client raterait les
-- suppressions, dont l'OLD ne contiendrait que la PK).

alter table public.cj_tasks         replica identity full;
alter table public.cj_comments      replica identity full;
alter table public.cj_subtasks      replica identity full;
alter table public.cj_activity      replica identity full;
alter table public.cj_notifications replica identity full;

alter publication supabase_realtime add table
  public.cj_tasks,
  public.cj_comments,
  public.cj_subtasks,
  public.cj_activity,
  public.cj_notifications;
