/**
 * Shared types + helpers for tool handlers.
 *
 * Every tool gets a `Ctx` (CjSession + arg parsing). Each tool exports
 * its MCP definition (name, description, JSON Schema for inputs) plus
 * a handler that returns plain JSON. The MCP server in src/index.ts
 * wraps that JSON into the `{ content: [{ type: 'text', text: ... }] }`
 * MCP envelope so models can read it.
 */
import type { CjSession } from '../auth.js';

export interface ToolDefinition<Args> {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  handler: (args: Args, session: CjSession) => Promise<unknown>;
}

/**
 * Wrap a CockpitJourney entity (jsonb `data` + indexed columns) into a
 * stable shape for the MCP response. The `data` column holds the full
 * entity (matches the in-app shape) while the indexed columns are
 * authoritative for filtering and sorting.
 */
export interface CjEntity {
  id: string;
  [key: string]: unknown;
}

export function pickRow<T extends Record<string, unknown> = Record<string, unknown>>(
  row: { id?: string; data: unknown } & Record<string, unknown>
): T {
  // Spread the full data jsonb but always honor the id from the index col.
  const data = (row.data ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...data };
  if (row.id !== undefined) out.id = row.id;
  return out as unknown as T;
}

/**
 * Map the cj-Postgres error to a friendly message. Most errors are RLS
 * violations (the PAT-derived JWT can only see/mutate the owner's rows)
 * or validation errors from a missing column.
 */
export function isoErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Resolve the user's cj_profiles.id (text). Several indexed FK columns
 * (cj_projects.owner_id, cj_goals.owner_id, cj_comments.author_id) reference
 * cj_profiles(id) — NOT auth.users(id) — so the in-app entity's ownerId /
 * authorId MUST be the profile id, not the auth uid. Cached per user.
 * Returns null if no profile row exists.
 */
const profileCache = new Map<string, string | null>();
export async function getProfileId(session: CjSession): Promise<string | null> {
  if (profileCache.has(session.userId)) return profileCache.get(session.userId) ?? null;
  const { data } = await session.client
    .from('cj_profiles')
    .select('id')
    .eq('auth_user_id', session.userId)
    .maybeSingle();
  const pid = (data?.id as string | undefined) ?? null;
  profileCache.set(session.userId, pid);
  return pid;
}

/**
 * The app reads `data` and expects camelCase keys. Update patches may use
 * snake_case for convenience — convert the known indexed/foreign keys so the
 * merged `data` stays camelCase.
 */
const SNAKE_TO_CAMEL: Record<string, string> = {
  due_date: 'dueDate',
  start_date: 'startDate',
  end_date: 'endDate',
  project_id: 'projectId',
  section_id: 'sectionId',
  parent_task_id: 'parentTaskId',
  folder_id: 'folderId',
  owner_id: 'ownerId',
  author_id: 'authorId',
  target_value: 'targetValue',
  current_value: 'currentValue',
  start_value: 'startValue',
  metric_type: 'metricType',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  completion_date: 'completionDate',
  estimated_minutes: 'estimatedMinutes',
  actual_minutes: 'actualMinutes',
  goal_id: 'goalId',
  task_id: 'taskId',
};
export function camelizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    out[SNAKE_TO_CAMEL[k] ?? k] = v;
  }
  return out;
}
