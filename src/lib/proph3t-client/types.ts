/**
 * Shared types for @atlas-studio/proph3t-client
 *
 * Vendored from oss53pa/atlas-studio-website · proph3t-client/src/types.ts.
 * The package is not yet published to npm — see ./index.ts for context.
 */

/**
 * App identifier registered in the Atlas Studio catalogue (table `apps`,
 * visible in Admin → Applications).
 *
 * Only the 7 currently-published apps are listed as named literals. The
 * `string & {}` escape hatch lets you pass a new `app_id` without bumping
 * this SDK — but make sure it exists in `L3_TOOLS_BY_APP` on the core,
 * otherwise routing falls back to L1+L2 tools only.
 */
export type Proph3tAppId =
  | 'atlas-fa' // Atlas F&A (Module ERP)
  | 'liasspilot' // Liass'Pilot
  | 'advist' // Advist
  | 'cockpit-fa' // Cockpit F&A
  | 'atlasbanx' // AtlasBanx
  | 'cockpit-journey' // CockpitJourney
  | 'tablesmart' // TableSmart
  | (string & {}); // escape hatch for apps published later

export interface Proph3tClientOptions {
  /** App identifier — drives tool routing on the core (L3_TOOLS_BY_APP). Required. */
  product: Proph3tAppId;
  /** Supabase project URL hosting the central Proph3t edge functions. */
  supabaseUrl: string;
  /** Supabase anon or publishable key — used as fallback when no userToken. */
  apiKey: string;
  /**
   * Supabase user JWT (recommended). When provided, all calls are scoped to this user
   * and RLS applies. When absent, calls fall back to apiKey and only public endpoints work.
   */
  userToken?: string;
  /** Optional society_id for multi-tenant scoping. */
  societyId?: string;
  /** Optional override for fetch (test, polyfill). */
  fetchImpl?: typeof fetch;
  /** Default timeout per request (ms). Default: 15000. */
  timeoutMs?: number;
}

export interface RecallParams {
  /** What you want to remember. */
  query: string;
  /** Episodic = events, semantic = facts. Default: both. */
  scope?: 'episodic' | 'semantic' | 'both';
  /** Limit results. Default: 5. */
  limit?: number;
}

export interface MemoryHit {
  id: string;
  kind: 'episodic' | 'semantic';
  app_id: string | null;
  /** Episodic: event_type. Semantic: fact subject. */
  subject: string | null;
  /** Free-form content. */
  content: string;
  /** Optional confidence 0-1 (semantic only). */
  confidence?: number;
  occurred_at?: string;
}

export interface SearchKnowledgeParams {
  query: string;
  /** "global" or an app_id. Default: client.product. */
  scope?: 'global' | Proph3tAppId;
  /** Filter by source type (e.g. 'syscohada', 'audcif', 'cgi-ci'). */
  sourceType?: string;
  /** Number of hits. Default: 5. */
  topK?: number;
}

export interface KnowledgeHit {
  id: string;
  source_type: string;
  title: string;
  excerpt: string;
  citation: string;
  score: number;
}

export interface RunToolParams<TArgs = Record<string, unknown>> {
  /** Tool name from the central registry. See https://vgtmljfayiysuvrcmunt.supabase.co/rest/v1/proph3t_tools */
  name: string;
  args: TArgs;
}

export interface ToolResult<TData = unknown> {
  ok: boolean;
  tool: string;
  duration_ms: number;
  result: TData;
}

export interface LogAuditParams {
  /** Action verb — e.g. "generate_liasse_fiscale", "user_login", "ai_response". */
  action: string;
  /** Optional: type of the subject (e.g. "society", "invoice"). */
  subjectType?: string;
  /** Optional: id of the subject. */
  subjectId?: string;
  /** Free-form JSON payload to hash into the audit chain. */
  content: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  /** SHA-256 hash of this entry, chained from the previous one. */
  hash: string;
}

export class Proph3tError extends Error {
  status: number;
  endpoint: string;
  body?: unknown;
  constructor(message: string, status: number, endpoint: string, body?: unknown) {
    super(message);
    this.name = 'Proph3tError';
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}
