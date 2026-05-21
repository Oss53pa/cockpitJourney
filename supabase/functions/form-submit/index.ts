// Public intake-form submission handler. Creates a task for the form owner
// from an anonymous submission. Deploy with verify_jwt disabled:
//   supabase functions deploy form-submit --no-verify-jwt
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase).
//
// Row shape mirrors src/lib/repo.ts: every cj_* row is
//   { id, auth_user_id, data: <entity>, ...indexed columns }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  let body: { formId?: string; values?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const { formId, values } = body ?? {};
  if (!formId) return json({ error: 'missing formId' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: formRow } = await supabase
    .from('cj_forms')
    .select('data, auth_user_id')
    .eq('id', formId)
    .maybeSingle();
  if (!formRow) return json({ error: 'not found' }, 404);

  const form = (formRow as { data: Record<string, unknown> }).data;
  const owner = (formRow as { auth_user_id: string }).auth_user_id;
  if (!form || form.enabled === false) return json({ error: 'inactive' }, 403);

  const projectId = form.projectId as string;

  // First section of the project (lowest position).
  const { data: sectionRows } = await supabase
    .from('cj_sections')
    .select('data')
    .eq('project_id', projectId)
    .limit(100);
  const section = (sectionRows ?? [])
    .map((r) => (r as { data: Record<string, unknown> }).data)
    .sort((a, b) => ((a.position as number) ?? 0) - ((b.position as number) ?? 0))[0];
  if (!section) return json({ error: 'no section for project' }, 400);

  // Assign to the project owner so it lands in their queue.
  const { data: projRow } = await supabase
    .from('cj_projects')
    .select('data')
    .eq('id', projectId)
    .maybeSingle();
  const ownerProfileId = (projRow as { data?: Record<string, unknown> } | null)?.data?.ownerId as
    | string
    | undefined;

  const fields = Array.isArray(form.fields) ? (form.fields as Record<string, unknown>[]) : [];
  const lines = Object.entries(values ?? {}).map(([k, v]) => {
    const field = fields.find((f) => f.id === k);
    const label = (field?.label as string) ?? k;
    const val = Array.isArray(v) ? v.join(', ') : String(v);
    return `${label}: ${val}`;
  });

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
  if (insErr) return json({ error: insErr.message }, 500);

  // Bump the submissions counter on the form.
  const updatedForm = { ...form, submissions: ((form.submissions as number) ?? 0) + 1 };
  await supabase.from('cj_forms').update({ data: updatedForm }).eq('id', formId);

  return json({ ok: true });
});
