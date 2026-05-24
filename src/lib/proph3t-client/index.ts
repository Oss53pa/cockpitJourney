/**
 * @atlas-studio/proph3t-client (vendored)
 *
 * Federation client letting satellite apps (Cockpit FnA, TableSmart, AtlasBanx,
 * Liass'Pilot, Advist, …) reuse the Atlas Studio Proph3t shared memory,
 * knowledge base, tools registry and audit log — without giving up their
 * local LLM agent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY VENDORED: the upstream package `@atlas-studio/proph3t-client` is not yet
 * published to the public npm registry (404). Rather than block the build on a
 * missing dependency, we vendor the source from
 *   oss53pa/atlas-studio-website · proph3t-client/src/*
 * When the package ships to npm (or a private registry), replace this folder
 * with `npm i @atlas-studio/proph3t-client` and update the import in
 * `src/lib/proph3tCore.ts` — the public API is identical.
 * ─────────────────────────────────────────────────────────────────────────
 */

export { Proph3tClient } from './client';
export { Proph3tError } from './types';
export type {
  Proph3tAppId,
  Proph3tClientOptions,
  RecallParams,
  MemoryHit,
  SearchKnowledgeParams,
  KnowledgeHit,
  RunToolParams,
  ToolResult,
  LogAuditParams,
  AuditEntry,
} from './types';
