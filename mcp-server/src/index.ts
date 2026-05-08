#!/usr/bin/env node
/**
 * @atlas-studio/cockpit-journey-mcp
 * ─────────────────────────────────
 * MCP server that exposes CockpitJourney as 18 tools to any MCP client
 * (Claude Cowork, Claude Desktop, Claude Code, custom MCP runtimes).
 *
 * Auth flow:
 *   1. The user generates a Personal Access Token in CockpitJourney
 *      → Settings → Integrations.
 *   2. They configure their MCP client with `env: { CJ_PAT: "cj_..." }`.
 *   3. On startup we exchange the PAT for a temporary Supabase JWT
 *      via the `cj-auth-pat` Edge Function, then refresh it before
 *      expiry. RLS is enforced normally on every query.
 *
 * Transport: stdio (the de-facto MCP standard for npx-launched servers).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { getSession } from './auth.js';
import type { ToolDefinition } from './tools/common.js';

// Tool modules
import { listProjects, getProject, createProject, updateProject } from './tools/projects.js';
import { listTasks, createTask, updateTask, completeTask, addSubtasks } from './tools/tasks.js';
import { listGoals, createGoal, updateGoalProgress } from './tools/goals.js';
import { addComment, addNote } from './tools/comments.js';
import { listTeamMembers, inviteMember } from './tools/team.js';
import { getDashboard, search } from './tools/dashboard.js';

// ─── Env validation ───────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://vgtmljfayiysuvrcmunt.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
const CJ_PAT = process.env.CJ_PAT ?? '';

if (!CJ_PAT) {
  console.error(
    '[cockpit-journey-mcp] Missing CJ_PAT. Generate one in CockpitJourney → Settings → Integrations, then add it to your MCP client config:\n' +
      '  { "env": { "CJ_PAT": "cj_xxxxxxxx" } }\n' +
      'Optionally override SUPABASE_URL and SUPABASE_ANON_KEY for self-hosted Atlas Studio deployments.'
  );
  process.exit(1);
}
if (!SUPABASE_ANON_KEY) {
  console.error(
    '[cockpit-journey-mcp] Missing SUPABASE_ANON_KEY. The default Atlas Studio public anon key should be set in your MCP client config:\n' +
      '  { "env": { "SUPABASE_ANON_KEY": "eyJhbG..." } }'
  );
  process.exit(1);
}

// ─── Tool registry ────────────────────────────────────────────────────────
// 18 tools, grouped by domain so callers can read the manifest easily.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOLS: ToolDefinition<any>[] = [
  // Projects (4)
  listProjects,
  getProject,
  createProject,
  updateProject,
  // Tasks (5)
  listTasks,
  createTask,
  updateTask,
  completeTask,
  addSubtasks,
  // Goals (3)
  listGoals,
  createGoal,
  updateGoalProgress,
  // Communication (2)
  addComment,
  addNote,
  // Team (2)
  listTeamMembers,
  inviteMember,
  // Dashboard (2)
  getDashboard,
  search,
];

// ─── MCP server ───────────────────────────────────────────────────────────
const server = new Server(
  { name: 'cockpit-journey', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return errorContent(`Outil inconnu: ${name}`);
  }
  try {
    const session = await getSession({
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      pat: CJ_PAT,
    });
    const result = await tool.handler(args as never, session);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cj-mcp] ${name} failed:`, msg);
    return errorContent(msg);
  }
});

function errorContent(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `Erreur CockpitJourney : ${message}` }],
  };
}

// ─── Bootstrap ────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Don't log on stdout — that's reserved for the MCP protocol. Use stderr.
  console.error(
    `[cockpit-journey-mcp] ready · ${TOOLS.length} tools · ${SUPABASE_URL.replace('https://', '')}`
  );
}

main().catch((err) => {
  console.error('[cockpit-journey-mcp] fatal:', err);
  process.exit(1);
});
