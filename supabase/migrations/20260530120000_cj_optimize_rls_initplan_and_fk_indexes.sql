-- Optimize RLS policies on all cj_* tables: wrap `auth.uid()`, `auth.role()`,
-- and the `can_*_for_app('cockpit-journey')` helpers in `(SELECT ...)` so the
-- value is computed once per query plan instead of re-evaluated per row.
-- Sémantiquement équivalent ; cible le lint Supabase `auth_rls_initplan`.
--
-- Aussi : ajoute les index manquants sur les FK signalées par le lint
-- `unindexed_foreign_keys` (cj_budget_lines.owner_id, cj_comments.author_id,
-- cj_dependencies.related_task_id, cj_expenses.task_id, cj_forms.project_id,
-- cj_profiles.auth_user_id).
--
-- Appliqué via mcp__supabase__apply_migration le 2026-05-30 ; copie locale ici
-- pour traçabilité.

DO $$
DECLARE
  t text;
BEGIN
  -- Owner policies (uniform names across 20 cj_* tables).
  FOR t IN SELECT unnest(ARRAY[
    'cj_activity','cj_attachments','cj_automations','cj_budget_lines','cj_comments',
    'cj_dependencies','cj_expenses','cj_folders','cj_forms','cj_goals',
    'cj_insights','cj_notes','cj_notifications','cj_profiles','cj_projects',
    'cj_reports','cj_sections','cj_settings','cj_subtasks','cj_tasks'
  ]) LOOP
    EXECUTE format(
      'ALTER POLICY cj_owner_select ON public.%I USING (auth_user_id = (SELECT auth.uid()))', t);
    EXECUTE format(
      'ALTER POLICY cj_owner_insert ON public.%I WITH CHECK (auth_user_id = (SELECT auth.uid()))', t);
    EXECUTE format(
      'ALTER POLICY cj_owner_update ON public.%I USING (auth_user_id = (SELECT auth.uid())) WITH CHECK (auth_user_id = (SELECT auth.uid()))', t);
    EXECUTE format(
      'ALTER POLICY cj_owner_delete ON public.%I USING (auth_user_id = (SELECT auth.uid()))', t);
  END LOOP;

  -- Role policies (name pattern: cj_<table>_role_{write,update,delete}).
  FOR t IN SELECT unnest(ARRAY[
    'cj_activity','cj_attachments','cj_automations','cj_budget_lines','cj_comments',
    'cj_dependencies','cj_expenses','cj_folders','cj_forms','cj_goals',
    'cj_insights','cj_notes','cj_notifications','cj_profiles','cj_projects',
    'cj_reports','cj_sections','cj_settings','cj_subtasks','cj_tasks'
  ]) LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I WITH CHECK ((SELECT can_write_for_app(''cockpit-journey''::text)) OR ((SELECT auth.role()) = ''service_role''::text))',
      t || '_role_write', t);
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING ((SELECT can_write_for_app(''cockpit-journey''::text)) OR ((SELECT auth.role()) = ''service_role''::text))',
      t || '_role_update', t);
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING ((SELECT can_admin_for_app(''cockpit-journey''::text)) OR ((SELECT auth.role()) = ''service_role''::text))',
      t || '_role_delete', t);
  END LOOP;
END $$;

-- cj_personal_access_tokens: different policy names, keyed by user_id.
ALTER POLICY service_role_bypass_pats ON public.cj_personal_access_tokens
  USING ((SELECT auth.role()) = 'service_role'::text)
  WITH CHECK ((SELECT auth.role()) = 'service_role'::text);
ALTER POLICY users_create_own_pats ON public.cj_personal_access_tokens
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY users_view_own_pats ON public.cj_personal_access_tokens
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY users_update_own_pats ON public.cj_personal_access_tokens
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY users_delete_own_pats ON public.cj_personal_access_tokens
  USING ((SELECT auth.uid()) = user_id);

-- Covering indexes for foreign keys flagged by the `unindexed_foreign_keys` lint.
CREATE INDEX IF NOT EXISTS idx_cj_budget_lines_owner_id
  ON public.cj_budget_lines (owner_id);
CREATE INDEX IF NOT EXISTS idx_cj_comments_author_id
  ON public.cj_comments (author_id);
CREATE INDEX IF NOT EXISTS idx_cj_dependencies_related_task_id
  ON public.cj_dependencies (related_task_id);
CREATE INDEX IF NOT EXISTS idx_cj_expenses_task_id
  ON public.cj_expenses (task_id);
CREATE INDEX IF NOT EXISTS idx_cj_forms_project_id
  ON public.cj_forms (project_id);
CREATE INDEX IF NOT EXISTS idx_cj_profiles_auth_user_id
  ON public.cj_profiles (auth_user_id);
