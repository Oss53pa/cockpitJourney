// Accès participant — côté navigateur du participant (vue /p/:token).
// ===================================================================
// Appelle l'edge function publique `cj-share` (service-role, scopée par
// token), exactement comme PublicFormPage appelle form-public/form-submit.
// Aucune dépendance au store Zustand : la vue participant est autonome.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface ParticipantProfile {
  id: string;
  name: string;
  initials: string;
  color: string;
  avatarUrl?: string;
}

export interface ParticipantSnapshot {
  meta: {
    permission: 'view' | 'contribute';
    resourceType: 'project' | 'task';
    resourceId: string;
    label: string | null;
    projectName?: string | null;
  };
  // `project` is the shared project (project share) or the parent project
  // (task share). Minimal public fields only.
  project: {
    id: string;
    name: string;
    description?: string | null;
    color: string;
    icon: string;
    progress: number;
    status: string;
  } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasks: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subtasks: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  comments: any[];
  /** Pièces jointes des tâches, avec URL signée (1h) générée côté serveur. */
  attachments: ParticipantAttachment[];
  profiles: ParticipantProfile[];
}

export interface ParticipantAttachment {
  id: string;
  taskId: string;
  name: string;
  kind: 'pdf' | 'img' | 'doc' | 'csv' | 'link';
  size?: string;
  uploadedAt?: string;
  url: string | null;
}

export type ParticipantOp =
  | { op: 'task.move'; taskId: string; sectionId: string }
  | { op: 'task.toggleDone'; taskId: string }
  | { op: 'subtask.toggle'; subtaskId: string }
  | { op: 'subtask.add'; taskId: string; title: string }
  | { op: 'comment.add'; taskId: string; body: string };

function fnUrl(path = ''): string {
  return `${SUPABASE_URL}/functions/v1/cj-share${path}`;
}

const headers = () => ({
  apikey: ANON_KEY ?? '',
  Authorization: `Bearer ${ANON_KEY ?? ''}`,
  'Content-Type': 'application/json',
});

/** Load the scoped snapshot for a share token. Throws on revoked/expired/404. */
export async function loadShare(token: string): Promise<ParticipantSnapshot> {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error('config');
  const res = await fetch(fnUrl(`?token=${encodeURIComponent(token)}`), { headers: headers() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || String(res.status));
  }
  return res.json();
}

/** Apply one whitelisted mutation. Returns the updated entity payload. */
export async function mutateShare(
  token: string,
  op: ParticipantOp
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (!SUPABASE_URL || !ANON_KEY) throw new Error('config');
  const res = await fetch(fnUrl(), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ token, ...op }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || String(res.status));
  return body;
}
