-- Étend la publication Realtime aux tables structurelles : goals, folders,
-- projects, sections. Sans ça, les changements faits via cj-mcp (Claude
-- Cowork), un autre onglet, ou directement en base ne se propagaient pas
-- dans l'onglet ouvert — l'utilisateur devait recharger la page pour les
-- voir, et signalait des « données qui ne se mettent pas à jour ».
--
-- Appliqué via mcp__supabase__apply_migration le 2026-06-15 ; copie locale
-- ici pour traçabilité.

ALTER PUBLICATION supabase_realtime ADD TABLE public.cj_goals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cj_folders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cj_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cj_sections;
