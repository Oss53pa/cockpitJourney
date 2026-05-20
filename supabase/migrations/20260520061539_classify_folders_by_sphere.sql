-- Classify every existing folder into 'personnel' or 'professionnel'
-- based on its name. Heuristics:
--   - Names that smell personal (Personnel, Famille, Santé, Sport,
--     Loisirs, Voyage, Maison, Perso) → 'personnel'
--   - Everything else (clients, entreprise, missions, etc.) → 'professionnel'
--
-- New folders created via the seed already carry an explicit `sphere`
-- field. This migration is for legacy rows.
--
-- Idempotent: only updates rows where data->>'sphere' IS NULL, so manual
-- re-classifications via the UI are preserved across re-runs.
--
-- Applied to: vgtmljfayiysuvrcmunt
-- Applied on: 2026-05-20 via MCP apply_migration

UPDATE cj_folders
SET data = data || jsonb_build_object(
  'sphere',
  CASE
    WHEN lower(data->>'name') IN (
      'personnel', 'perso', 'famille', 'santé', 'sante', 'sport',
      'loisirs', 'voyage', 'maison', 'home', 'famille & maison'
    ) THEN 'personnel'
    ELSE 'professionnel'
  END
)
WHERE data->>'sphere' IS NULL;
