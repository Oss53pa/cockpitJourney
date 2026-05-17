-- Backfill 2 default folders ("Entreprise", "Famille") for every user
-- who currently has only 1 folder ("Personnel") — the clean-starter
-- seed used to create only that single folder before today's commit.
-- New users get all 3 folders straight from the updated seed; this
-- migration is for existing users only.
--
-- Idempotent via NOT EXISTS predicate + ON CONFLICT DO NOTHING. Safe
-- to re-run.
--
-- Applied to: vgtmljfayiysuvrcmunt
-- Applied on: 2026-05-17 via MCP apply_migration

INSERT INTO cj_folders (id, auth_user_id, data)
SELECT
  substring(p.auth_user_id::text, 1, 8) || '_f_entreprise',
  p.auth_user_id,
  jsonb_build_object(
    'id', substring(p.auth_user_id::text, 1, 8) || '_f_entreprise',
    'name', 'Entreprise',
    'color', '#8AA6C4',
    'icon', 'building-2',
    'order', 1,
    'projectIds', '[]'::jsonb,
    'createdAt', now()::text
  )
FROM (SELECT DISTINCT auth_user_id FROM cj_folders) p
WHERE NOT EXISTS (
  SELECT 1 FROM cj_folders f
  WHERE f.auth_user_id = p.auth_user_id
    AND lower(f.data->>'name') = 'entreprise'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO cj_folders (id, auth_user_id, data)
SELECT
  substring(p.auth_user_id::text, 1, 8) || '_f_famille',
  p.auth_user_id,
  jsonb_build_object(
    'id', substring(p.auth_user_id::text, 1, 8) || '_f_famille',
    'name', 'Famille',
    'color', '#D58FA7',
    'icon', 'home',
    'order', 2,
    'projectIds', '[]'::jsonb,
    'createdAt', now()::text
  )
FROM (SELECT DISTINCT auth_user_id FROM cj_folders) p
WHERE NOT EXISTS (
  SELECT 1 FROM cj_folders f
  WHERE f.auth_user_id = p.auth_user_id
    AND lower(f.data->>'name') = 'famille'
)
ON CONFLICT (id) DO NOTHING;
