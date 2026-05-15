-- Mark `onboardingDone=true` for every existing profile so the new
-- first-boot onboarding wizard (introduced in this same release) does
-- NOT pop up for users who have already been using the app for weeks.
--
-- Idempotent: ON CONFLICT DO NOTHING + the NOT EXISTS guard. Re-running
-- is a no-op.
--
-- Applied to: vgtmljfayiysuvrcmunt
-- Applied on: 2026-05-15 via MCP execute_sql

INSERT INTO cj_settings (profile_id, auth_user_id, key, value)
SELECT
  p.id,
  p.auth_user_id,
  'onboardingDone',
  'true'::jsonb
FROM cj_profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM cj_settings s
  WHERE s.profile_id = p.id AND s.key = 'onboardingDone'
)
ON CONFLICT (profile_id, key) DO NOTHING;
