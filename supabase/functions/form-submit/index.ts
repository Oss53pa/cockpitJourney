// Public intake-form submission handler. Creates a task for the form owner
// from an anonymous submission. Hardened:
//   - Origin allowlist (prod domain + Vercel previews + localhost)
//   - Content-Length cap (32 KB) + per-field length cap (2 KB) + array cap (50)
//   - Per-IP rate limit (10 req/min, in-memory per isolate)
//   - Field-id whitelist against the form definition (unknown ids dropped)
// Deploy:
//   supabase functions deploy form-submit --no-verify-jwt
// Row shape mirrors src/lib/repo.ts: { id, auth_user_id, data, indexed cols }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
  'https://cockpit-journey.atlas-studio.org',
  'http://localhost:5173',
  'http://localhost:4173',
];
function isAllowedOrigin(o: string | null): boolean {
  if (!o) return false;
  if (ALLOWED_ORIGINS.includes(o)) return true;
  try {
    const u = new URL(o);
    // Vercel preview deploys keep working — same project, just a different host.
    return u.protocol === 'https:' && u.hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = isAllowedOrigin(origin) ? origin! : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// Per-IP leaky bucket (module-level → scoped to a single worker isolate).
// Not bulletproof on its own — for production-grade DoS protection layer
// Turnstile or Upstash Redis on top.
const _rl = new Map<string, number[]>();
const RL_LIMIT = 10;
const RL_WINDOW_MS = 60_000;
function rateLimit(ip: string): boolean {
  const now = Date.now();
  const arr = (_rl.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS);
  if (arr.length >= RL_LIMIT) {
    _rl.set(ip, arr);
    return false;
  }
  arr.push(now);
  _rl.set(ip, arr);
  return true;
}

const MAX_BODY_BYTES = 32 * 1024;
const MAX_FIELD_CHARS = 2000;
const MAX_ARRAY_LEN = 50;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);
  if (!isAllowedOrigin(origin)) return json({ error: 'origin not allowed' }, 403, origin);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(ip)) return json({ error: 'rate limited' }, 429, origin);

  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413, origin);

  let body: { formId?: string; values?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400, origin);
  }
  const { formId, values } = body ?? {};
  if (!formId || typeof formId !== 'string') return json({ error: 'missing formId' }, 400, origin);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: formRow } = await supabase
    .from('cj_forms')
    .select('data, auth_user_id')
    .eq('id', formId)
    .maybeSingle();
  if (!formRow) return json({ error: 'not found' }, 404, origin);

  const form = (formRow as { data: Record<string, unknown> }).data;
  const owner = (formRow as { auth_user_id: string }).auth_user_id;
  if (!form || form.enabled === false) return json({ error: 'inactive' }, 403, origin);

  const projectId = form.projectId as string;

  const { data: sectionRows } = await supabase
    .from('cj_sections')
    .select('data')
    .eq('project_id', projectId)
    .limit(100);
  const section = (sectionRows ?? [])
    .map((r) => (r as { data: Record<string, unknown> }).data)
    .sort((a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0))[0];
  if (!section) return json({ error: 'no section for project' }, 400, origin);

  const { data: projRow } = await supabase
    .from('cj_projects')
    .select('data')
    .eq('id', projectId)
    .maybeSingle();
  const ownerProfileId = (projRow as { data?: Record<string, unknown> } | null)?.data?.ownerId as
    | string
    | undefined;

  // Whitelist field ids + cap value sizes — unknown fields silently dropped.
  const fields = Array.isArray(form.fields) ? (form.fields as Record<string, unknown>[]) : [];
  const knownIds = new Set(fields.map((f) => f.id as string));
  const lines: string[] = [];
  for (const [k, v] of Object.entries(values ?? {})) {
    if (!knownIds.has(k)) continue;
    const field = fields.find((f) => f.id === k);
    const label = (field?.label as string) ?? k;
    let val: string;
    if (Array.isArray(v)) {
      val = v
        .slice(0, MAX_ARRAY_LEN)
        .map((x) => String(x).slice(0, MAX_FIELD_CHARS))
        .join(', ');
    } else {
      val = String(v).slice(0, MAX_FIELD_CHARS);
    }
    lines.push(`${label}: ${val}`);
  }

  const now = new Date().toISOString();
  const taskId = 't_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const task = {
    id: taskId,
    projectId,
    sectionId: section.id,
    title: `[${form.name}] Soumission externe`,
    description: lines.join('\n') || 'Soumission via formulaire public.',
    status: 'todo',
    priority: 2,
    assignees: ownerProfileId ? [ownerProfileId] : [],
    watchers: [],
    tags: ['form', 'externe'],
    source: 'form',
    createdAt: now,
  };

  const { error: insErr } = await supabase.from('cj_tasks').insert({
    id: taskId,
    auth_user_id: owner,
    data: task,
    project_id: projectId,
    section_id: section.id,
  });
  if (insErr) return json({ error: insErr.message }, 500, origin);

  const updatedForm = { ...form, submissions: ((form.submissions as number) ?? 0) + 1 };
  await supabase.from('cj_forms').update({ data: updatedForm }).eq('id', formId);

  return json({ ok: true }, 200, origin);
});
