// cj-share — Accès participant à un projet ou une tâche partagé(e).
// =====================================================================
// Edge function PUBLIQUE (déployée --no-verify-jwt), service-role, qui
// donne à un participant externe (sans siège de licence) un accès scopé
// à UNE ressource partagée via un token. Même patron que form-public /
// form-submit : toute la validation (token, révocation, portée) est faite
// ICI côté serveur — le client n'est jamais cru sur la portée.
//
//   GET  ?token=…            → mini-snapshot scopé (projet+tâches OU tâche)
//   POST { token, op, ... }  → mutation sur liste blanche (permission
//                              'contribute' requise), toujours dans la portée.
//
// Les écritures se font dans le NAMESPACE DU PROPRIÉTAIRE (auth_user_id =
// celui du share) → elles réapparaissent dans le snapshot du propriétaire.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

interface ShareRow {
  id: string;
  token: string;
  auth_user_id: string;
  resource_type: 'project' | 'task';
  resource_id: string;
  permission: 'view' | 'contribute';
  label: string | null;
  invitee_email: string | null;
  revoked_at: string | null;
  expires_at: string | null;
}

/** Load + validate a share by token. Returns the row or an error response. */
async function resolveShare(
  sb: SupabaseClient,
  token: string
): Promise<{ share?: ShareRow; error?: Response }> {
  if (!token) return { error: json(400, { error: 'missing token' }) };
  const { data, error } = await sb
    .from('cj_shares')
    .select(
      'id, token, auth_user_id, resource_type, resource_id, permission, label, invitee_email, revoked_at, expires_at'
    )
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return { error: json(404, { error: 'not found' }) };
  const share = data as ShareRow;
  if (share.revoked_at) return { error: json(403, { error: 'revoked' }) };
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    return { error: json(403, { error: 'expired' }) };
  }
  return { share };
}

/** Minimal public profile shape (never leak emails). */
function publicProfile(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name ?? 'Membre',
    initials: p.initials ?? '?',
    color: p.color ?? '#94A3B8',
    avatarUrl: p.avatarUrl ?? undefined,
  };
}

/** Section name → canonical task status (mirrors appStore.moveTask). */
function statusForSection(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.includes('terminé') || n.includes('termine') || n.includes('livré') || n.includes('livre'))
    return 'done';
  if (n.includes('revue')) return 'in_review';
  if (n.includes('cours')) return 'in_progress';
  return 'todo';
}

async function fetchDataRows<T = Record<string, unknown>>(
  sb: SupabaseClient,
  table: string,
  col: string,
  val: string | string[],
  ownerId: string
): Promise<T[]> {
  let q = sb.from(table).select('data').eq('auth_user_id', ownerId);
  q = Array.isArray(val) ? q.in(col, val) : q.eq(col, val);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => (r as { data: T }).data);
}

/** Charge les pièces jointes des tâches + génère des URLs signées (1h). */
async function loadAttachments(
  sb: SupabaseClient,
  owner: string,
  taskIds: string[]
): Promise<Record<string, unknown>[]> {
  if (!taskIds.length) return [];
  const rows = await fetchDataRows(sb, 'cj_attachments', 'task_id', taskIds, owner).catch(
    () => [] as Record<string, unknown>[]
  );
  const out: Record<string, unknown>[] = [];
  for (const a of rows) {
    let url: string | null = null;
    if (a.path) {
      const { data } = await sb.storage
        .from('cj-attachments')
        .createSignedUrl(String(a.path), 3600);
      url = data?.signedUrl ?? null;
    }
    out.push({
      id: a.id,
      taskId: a.taskId,
      name: a.name,
      kind: a.kind,
      size: a.size,
      uploadedAt: a.uploadedAt,
      url,
    });
  }
  return out;
}

/* ───────────── GET — scoped snapshot ───────────── */

async function handleGet(sb: SupabaseClient, share: ShareRow) {
  const owner = share.auth_user_id;

  // Owner roster (minimal) — used to render assignees / comment authors.
  const profilesRaw = await fetchDataRows(sb, 'cj_profiles', 'auth_user_id', owner, owner).catch(
    () => [] as Record<string, unknown>[]
  );
  const profiles = profilesRaw.map(publicProfile);

  const meta = {
    permission: share.permission,
    resourceType: share.resource_type,
    resourceId: share.resource_id,
    label: share.label ?? null,
  };

  if (share.resource_type === 'project') {
    const { data: projRow } = await sb
      .from('cj_projects')
      .select('data')
      .eq('id', share.resource_id)
      .eq('auth_user_id', owner)
      .maybeSingle();
    if (!projRow) return json(404, { error: 'not found' });
    const project = (projRow as { data: Record<string, unknown> }).data;

    const sections = await fetchDataRows(sb, 'cj_sections', 'project_id', share.resource_id, owner);
    const tasks = await fetchDataRows(sb, 'cj_tasks', 'project_id', share.resource_id, owner);
    const taskIds = tasks.map((t) => String((t as Record<string, unknown>).id));
    const subtasks = taskIds.length
      ? await fetchDataRows(sb, 'cj_subtasks', 'task_id', taskIds, owner)
      : [];
    const comments = taskIds.length
      ? await fetchDataRows(sb, 'cj_comments', 'task_id', taskIds, owner)
      : [];
    const attachments = await loadAttachments(sb, owner, taskIds);

    return json(200, {
      meta: { ...meta, projectName: project.name ?? 'Projet' },
      project: publicProject(project),
      sections,
      tasks,
      subtasks,
      comments,
      attachments,
      profiles,
    });
  }

  // resource_type === 'task'
  const { data: taskRow } = await sb
    .from('cj_tasks')
    .select('data')
    .eq('id', share.resource_id)
    .eq('auth_user_id', owner)
    .maybeSingle();
  if (!taskRow) return json(404, { error: 'not found' });
  const task = (taskRow as { data: Record<string, unknown> }).data;
  const projectId = String(task.projectId ?? '');

  const { data: projRow } = projectId
    ? await sb.from('cj_projects').select('data').eq('id', projectId).eq('auth_user_id', owner).maybeSingle()
    : { data: null };
  const project = projRow ? (projRow as { data: Record<string, unknown> }).data : null;
  const sections = projectId
    ? await fetchDataRows(sb, 'cj_sections', 'project_id', projectId, owner)
    : [];
  const subtasks = await fetchDataRows(sb, 'cj_subtasks', 'task_id', share.resource_id, owner);
  const comments = await fetchDataRows(sb, 'cj_comments', 'task_id', share.resource_id, owner);
  const attachments = await loadAttachments(sb, owner, [share.resource_id]);

  return json(200, {
    meta: { ...meta, projectName: project?.name ?? null },
    project: project ? publicProject(project) : null,
    sections,
    tasks: [task],
    subtasks,
    comments,
    attachments,
    profiles,
  });
}

function publicProject(p: Record<string, unknown>) {
  return {
    id: p.id,
    name: p.name ?? 'Projet',
    description: p.description ?? null,
    color: p.color ?? '#95B07D',
    icon: p.icon ?? 'Compass',
    progress: p.progress ?? 0,
    status: p.status ?? 'active',
  };
}

/* ───────────── POST — whitelisted mutations ───────────── */

async function allowedTaskIds(sb: SupabaseClient, share: ShareRow): Promise<Set<string>> {
  if (share.resource_type === 'task') return new Set([share.resource_id]);
  const tasks = await fetchDataRows(sb, 'cj_tasks', 'project_id', share.resource_id, share.auth_user_id);
  return new Set(tasks.map((t) => String((t as Record<string, unknown>).id)));
}

async function getTaskEntity(
  sb: SupabaseClient,
  owner: string,
  taskId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await sb
    .from('cj_tasks')
    .select('data')
    .eq('id', taskId)
    .eq('auth_user_id', owner)
    .maybeSingle();
  return data ? (data as { data: Record<string, unknown> }).data : null;
}

async function upsertTask(sb: SupabaseClient, owner: string, task: Record<string, unknown>) {
  await sb.from('cj_tasks').upsert(
    {
      id: task.id,
      auth_user_id: owner,
      project_id: task.projectId ?? null,
      section_id: task.sectionId ?? null,
      parent_task_id: task.parentTaskId ?? null,
      status: task.status ?? null,
      priority: task.priority ?? null,
      due_date: task.dueDate ?? null,
      data: task,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
}

async function logActivity(
  sb: SupabaseClient,
  owner: string,
  share: ShareRow,
  e: { taskId?: string; projectId?: string; verb: string; target?: string }
) {
  const actorName = share.label || share.invitee_email || 'Participant';
  const id = `act_${crypto.randomUUID().slice(0, 12)}`;
  const at = new Date().toISOString();
  const entity = {
    id,
    taskId: e.taskId,
    projectId: e.projectId,
    actorId: `share:${share.id}`,
    actorName,
    verb: e.verb,
    target: e.target,
    at,
  };
  await sb
    .from('cj_activity')
    .insert({
      id,
      auth_user_id: owner,
      task_id: e.taskId ?? null,
      project_id: e.projectId ?? null,
      actor_id: null,
      data: entity,
    })
    .then(() => undefined, () => undefined);
}

async function handlePost(sb: SupabaseClient, share: ShareRow, body: Record<string, unknown>) {
  if (share.permission !== 'contribute') {
    return json(403, { error: 'read-only share' });
  }
  const owner = share.auth_user_id;
  const op = String(body.op ?? '');
  const allowed = await allowedTaskIds(sb, share);
  const inScope = (taskId: string) => allowed.has(taskId);

  switch (op) {
    case 'task.move': {
      const taskId = String(body.taskId ?? '');
      const sectionId = String(body.sectionId ?? '');
      if (!inScope(taskId)) return json(404, { error: 'out of scope' });
      const task = await getTaskEntity(sb, owner, taskId);
      if (!task) return json(404, { error: 'not found' });
      const { data: secRow } = await sb
        .from('cj_sections')
        .select('data')
        .eq('id', sectionId)
        .eq('auth_user_id', owner)
        .maybeSingle();
      if (!secRow) return json(404, { error: 'section not found' });
      const section = (secRow as { data: Record<string, unknown> }).data;
      if (String(section.projectId) !== String(task.projectId))
        return json(400, { error: 'section/project mismatch' });
      const status = statusForSection(String(section.name ?? ''));
      task.sectionId = sectionId;
      task.status = status;
      if (status === 'done' && !task.completionDate) task.completionDate = new Date().toISOString();
      if (status !== 'done') task.completionDate = undefined;
      await upsertTask(sb, owner, task);
      await logActivity(sb, owner, share, {
        taskId,
        projectId: String(task.projectId ?? ''),
        verb: 'a déplacé vers',
        target: String(section.name ?? ''),
      });
      return json(200, { ok: true, task });
    }

    case 'task.toggleDone': {
      const taskId = String(body.taskId ?? '');
      if (!inScope(taskId)) return json(404, { error: 'out of scope' });
      const task = await getTaskEntity(sb, owner, taskId);
      if (!task) return json(404, { error: 'not found' });
      const isDone = task.status === 'done';
      task.status = isDone ? 'todo' : 'done';
      task.completionDate = isDone ? undefined : new Date().toISOString();
      await upsertTask(sb, owner, task);
      await logActivity(sb, owner, share, {
        taskId,
        projectId: String(task.projectId ?? ''),
        verb: isDone ? 'a rouvert' : 'a terminé',
        target: String(task.title ?? ''),
      });
      return json(200, { ok: true, task });
    }

    case 'subtask.toggle': {
      const subtaskId = String(body.subtaskId ?? '');
      const { data: subRow } = await sb
        .from('cj_subtasks')
        .select('data')
        .eq('id', subtaskId)
        .eq('auth_user_id', owner)
        .maybeSingle();
      if (!subRow) return json(404, { error: 'not found' });
      const sub = (subRow as { data: Record<string, unknown> }).data;
      if (!inScope(String(sub.taskId))) return json(404, { error: 'out of scope' });
      sub.done = !sub.done;
      await sb.from('cj_subtasks').upsert(
        { id: sub.id, auth_user_id: owner, task_id: sub.taskId, data: sub, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
      return json(200, { ok: true, subtask: sub });
    }

    case 'subtask.add': {
      const taskId = String(body.taskId ?? '');
      const title = String(body.title ?? '').trim();
      if (!inScope(taskId)) return json(404, { error: 'out of scope' });
      if (!title) return json(400, { error: 'empty title' });
      const existing = await fetchDataRows(sb, 'cj_subtasks', 'task_id', taskId, owner);
      const sub = {
        id: `st_${crypto.randomUUID().slice(0, 12)}`,
        taskId,
        title,
        done: false,
        position: existing.length,
      };
      await sb.from('cj_subtasks').insert({
        id: sub.id,
        auth_user_id: owner,
        task_id: taskId,
        data: sub,
      });
      return json(200, { ok: true, subtask: sub });
    }

    case 'comment.add': {
      const taskId = String(body.taskId ?? '');
      const text = String(body.body ?? '').trim();
      if (!inScope(taskId)) return json(404, { error: 'out of scope' });
      if (!text) return json(400, { error: 'empty body' });
      const authorName = share.label || share.invitee_email || 'Participant';
      const comment = {
        id: `c_${crypto.randomUUID().slice(0, 12)}`,
        taskId,
        authorId: null,
        authorName,
        body: text,
        createdAt: new Date().toISOString(),
        reactions: [] as { emoji: string; count: number }[],
      };
      await sb.from('cj_comments').insert({
        id: comment.id,
        auth_user_id: owner,
        task_id: taskId,
        author_id: null,
        data: comment,
      });
      // Bump task.commentCount for the owner's badges (best-effort).
      const task = await getTaskEntity(sb, owner, taskId);
      if (task) {
        task.commentCount = (Number(task.commentCount) || 0) + 1;
        await upsertTask(sb, owner, task);
      }
      await logActivity(sb, owner, share, {
        taskId,
        projectId: task ? String(task.projectId ?? '') : undefined,
        verb: 'a commenté',
        target: String(task?.title ?? ''),
      });
      return json(200, { ok: true, comment });
    }

    default:
      return json(400, { error: `unknown op: ${op}` });
  }
}

/* ───────────── Entry ───────────── */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: 'server misconfigured' });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    const { share, error } = await resolveShare(sb, token);
    if (error) return error;
    // Best-effort access-counter increment (separate read-modify-write).
    await sb
      .from('cj_shares')
      .select('access_count')
      .eq('id', share!.id)
      .maybeSingle()
      .then(async ({ data }) => {
        const next = (Number((data as { access_count?: number })?.access_count) || 0) + 1;
        await sb
          .from('cj_shares')
          .update({ access_count: next, last_accessed_at: new Date().toISOString() })
          .eq('id', share!.id);
      }, () => undefined);
    return handleGet(sb, share!);
  }

  if (req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid json' });
    }
    const { share, error } = await resolveShare(sb, String(body.token ?? ''));
    if (error) return error;
    return handlePost(sb, share!, body);
  }

  return json(405, { error: 'method not allowed' });
});
