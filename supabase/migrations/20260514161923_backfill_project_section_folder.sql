-- Backfill missing required fields on cj_projects, cj_sections, cj_folders
-- that the broken clean-starter seed (pre-c275de8) failed to populate.
--
-- The seed was creating rows without:
--   cj_projects:  health, progress, taskCount, membersIds
--   cj_sections:  color, position  (was using legacy `order` key)
--   cj_folders:   projectIds
--
-- ProjectView crashed on `project.membersIds.map(...)` for any user whose
-- account had been seeded before the fix. We patched the type/seed/read
-- layers in commit c275de8 (normalize at load + correct seed for new
-- users + cache version bump), and this migration cleans up the data
-- already in production.
--
-- Idempotent: every UPDATE is gated on `IS NULL` so re-running is a no-op.
-- Safe: wrapped in a single transaction; failures roll back.
--
-- Applied to: vgtmljfayiysuvrcmunt (Atlas Studio shared Supabase project)
-- Applied on: 2026-05-14 via MCP execute_sql

BEGIN;

-- ─── cj_projects ────────────────────────────────────────────────────
-- Default health=green, progress=0, taskCount=0, membersIds=[ownerId].
UPDATE cj_projects
SET data = data
  || (CASE WHEN data->>'health'    IS NULL THEN '{"health":"green"}'::jsonb ELSE '{}'::jsonb END)
  || (CASE WHEN data->>'progress'  IS NULL THEN '{"progress":0}'::jsonb     ELSE '{}'::jsonb END)
  || (CASE WHEN data->>'taskCount' IS NULL THEN '{"taskCount":0}'::jsonb    ELSE '{}'::jsonb END)
  || (CASE WHEN data->'membersIds' IS NULL
        THEN jsonb_build_object('membersIds', jsonb_build_array(data->>'ownerId'))
        ELSE '{}'::jsonb END)
WHERE data->>'health'    IS NULL
   OR data->>'progress'  IS NULL
   OR data->>'taskCount' IS NULL
   OR data->'membersIds' IS NULL;

-- ─── cj_sections ────────────────────────────────────────────────────
-- Backfill color (by section name) + position (from legacy `order`,
-- else 0). The legacy `order` key is then dropped to keep the shape clean.
UPDATE cj_sections
SET data = data
  || (CASE WHEN data->>'color' IS NULL THEN
        CASE
          WHEN data->>'name' ILIKE 'terminé%' OR data->>'name' ILIKE 'done%'
            THEN '{"color":"#22C55E"}'::jsonb  -- signal-green
          WHEN data->>'name' ILIKE 'en cours%' OR data->>'name' ILIKE 'in progress%'
            THEN '{"color":"#6E8B58"}'::jsonb  -- atlas-sage-deep
          ELSE '{"color":"#94A3B8"}'::jsonb    -- slate-400 (neutral)
        END
      ELSE '{}'::jsonb END)
  || (CASE
      WHEN data->>'position' IS NULL AND data->>'order' IS NOT NULL
        THEN jsonb_build_object('position', (data->>'order')::int)
      WHEN data->>'position' IS NULL
        THEN '{"position":0}'::jsonb
      ELSE '{}'::jsonb END)
WHERE data->>'color' IS NULL
   OR data->>'position' IS NULL
   OR data->>'order' IS NOT NULL;

-- Drop the legacy `order` key now that `position` is canonical.
UPDATE cj_sections
SET data = data - 'order'
WHERE data ? 'order';

-- ─── cj_folders ─────────────────────────────────────────────────────
-- Backfill projectIds by aggregating cj_projects.folder_id pointers.
UPDATE cj_folders f
SET data = data || jsonb_build_object(
  'projectIds',
  COALESCE(
    (SELECT jsonb_agg(p.id ORDER BY p.id) FROM cj_projects p WHERE p.folder_id = f.id),
    '[]'::jsonb
  )
)
WHERE data->'projectIds' IS NULL;

COMMIT;

-- Post-migration sanity check (run separately to verify):
--   SELECT 'cj_projects' AS t,
--          COUNT(*) FILTER (WHERE data->>'health' IS NULL) AS missing_health,
--          COUNT(*) FILTER (WHERE data->'membersIds' IS NULL) AS missing_members
--     FROM cj_projects
--   UNION ALL
--   SELECT 'cj_sections',
--          COUNT(*) FILTER (WHERE data->>'color' IS NULL),
--          COUNT(*) FILTER (WHERE data->>'position' IS NULL)
--     FROM cj_sections
--   UNION ALL
--   SELECT 'cj_folders',
--          COUNT(*) FILTER (WHERE data->'projectIds' IS NULL), 0
--     FROM cj_folders;
-- All counts should be 0.
