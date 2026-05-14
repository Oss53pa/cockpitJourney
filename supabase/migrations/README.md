# Supabase migrations

Versioned SQL migrations for the `cj_*` schema on the shared Atlas Studio
Supabase project (`vgtmljfayiysuvrcmunt`).

## Convention

File names follow the **Supabase CLI standard**:

```
YYYYMMDDHHMMSS_snake_case_description.sql
```

Example: `20260514161923_backfill_project_section_folder.sql`

The 14-digit UTC timestamp prefix gives a deterministic apply order; the
description is human-readable.

## Apply manually (current workflow)

Until we wire up `supabase db push`, migrations are applied via the
Supabase MCP `execute_sql` tool in a Claude session. Always:

1. Wrap the migration body in `BEGIN; … COMMIT;`.
2. Make every `UPDATE` / `INSERT` **idempotent** (gated on `WHERE … IS NULL`
   or `ON CONFLICT DO NOTHING`) so re-running is a no-op.
3. Note the `Applied to:` project and `Applied on:` date at the top of the
   file once it's been run against prod.

## Rules

- **No destructive operations** without an explicit backup step in the
  same file (`CREATE TABLE …_backup AS SELECT * FROM …`).
- **Never `DROP COLUMN data`** on a `cj_*` table — the entire app reads
  the entity out of that jsonb column.
- **RLS policies** belong in their own migration file, separate from data
  backfills, so they can be rolled forward independently.
