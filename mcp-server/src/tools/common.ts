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
