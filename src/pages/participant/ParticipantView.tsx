import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Loader2,
  CheckCircle2,
  Circle,
  MessageSquare,
  Send,
  Plus,
  ChevronLeft,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import {
  loadShare,
  mutateShare,
  type ParticipantSnapshot,
  type ParticipantProfile,
} from '../../lib/participantClient';

/**
 * Vue PARTICIPANT — route publique /p/:token.
 *
 * Charge un mini-snapshot scopé (projet+tâches OU une tâche) via l'edge
 * function cj-share et rend une coquille « Mode participant » : board
 * simplifié ou panneau de tâche, avec contributions limitées (statut,
 * sous-tâches, commentaires) si la permission est `contribute`. Aucun
 * accès au reste du cockpit, à la sidebar, au budget, etc.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function ParticipantView() {
  const { token } = useParams<{ token: string }>();
  const [snap, setSnap] = useState<ParticipantSnapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorKind, setErrorKind] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorKind('missing');
      return;
    }
    loadShare(token)
      .then((s) => {
        setSnap(s);
        setStatus('ready');
        if (s.meta.resourceType === 'task') setSelectedTaskId(s.meta.resourceId);
      })
      .catch((e: Error) => {
        setErrorKind(e.message);
        setStatus('error');
      });
  }, [token]);

  const canContribute = snap?.meta.permission === 'contribute';

  // Apply a mutation server-side, then patch local state from the response.
  const apply = useCallback(
    async (op: any) => {
      if (!token) return;
      try {
        const res = await mutateShare(token, op);
        setSnap((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          if (res.task) next.tasks = prev.tasks.map((t) => (t.id === res.task.id ? res.task : t));
          if (res.subtask) {
            const exists = prev.subtasks.some((s) => s.id === res.subtask.id);
            next.subtasks = exists
              ? prev.subtasks.map((s) => (s.id === res.subtask.id ? res.subtask : s))
              : [...prev.subtasks, res.subtask];
          }
          if (res.comment) next.comments = [...prev.comments, res.comment];
          return next;
        });
      } catch (e) {
        alert(`Action impossible : ${(e as Error).message}`);
      }
    },
    [token]
  );

  if (status === 'loading') {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24 text-atlas-fg-3">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-sm mt-3">Chargement…</p>
        </div>
      </Shell>
    );
  }

  if (status === 'error' || !snap) {
    const msg =
      errorKind === 'revoked'
        ? 'Ce lien a été révoqué par le propriétaire.'
        : errorKind === 'expired'
          ? 'Ce lien a expiré.'
          : 'Ce lien est invalide ou n’existe plus.';
    return (
      <Shell>
        <div className="max-w-md mx-auto text-center py-24">
          <h1 className="font-display text-xl font-medium text-atlas-fg-1">Accès indisponible</h1>
          <p className="text-sm text-atlas-fg-3 mt-2">{msg}</p>
        </div>
      </Shell>
    );
  }

  const profilesById = new Map(snap.profiles.map((p) => [p.id, p]));
  const selectedTask = selectedTaskId ? snap.tasks.find((t) => t.id === selectedTaskId) : null;

  return (
    <Shell>
      {/* Bandeau mode participant */}
      <div className="sticky top-0 z-20 bg-atlas-panel/95 backdrop-blur border-b border-atlas-line">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="font-logo text-2xl text-atlas-fg-1 leading-none">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </div>
          <span
            className={`chip text-2xs px-2 py-0.5 border inline-flex items-center gap-1 ${
              canContribute
                ? 'bg-atlas-amber/15 text-atlas-amber-deep border-atlas-amber/30'
                : 'bg-black/[0.04] text-atlas-fg-3 border-atlas-line'
            }`}
          >
            {canContribute ? <ShieldCheck className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {canContribute ? 'Mode participant · contribution' : 'Mode participant · lecture'}
          </span>
          <div className="ml-auto text-2xs text-atlas-fg-3 truncate max-w-[40%] text-right">
            {snap.meta.label ? `${snap.meta.label} · ` : ''}
            {snap.project?.name ?? snap.meta.projectName ?? ''}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {snap.meta.resourceType === 'project' && !selectedTask && (
          <ProjectBoard snap={snap} onOpenTask={setSelectedTaskId} />
        )}

        {selectedTask && (
          <TaskPanel
            task={selectedTask}
            snap={snap}
            canContribute={canContribute}
            profilesById={profilesById}
            onBack={snap.meta.resourceType === 'project' ? () => setSelectedTaskId(null) : undefined}
            onApply={apply}
          />
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-atlas-cream text-atlas-fg-1">{children}</div>;
}

/* ───────────── Board (project share) ───────────── */

function ProjectBoard({ snap, onOpenTask }: { snap: ParticipantSnapshot; onOpenTask: (id: string) => void }) {
  const sections = [...snap.sections].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-atlas-fg-1 mb-1">{snap.project?.name}</h1>
      {snap.project?.description && (
        <p className="text-sm text-atlas-fg-3 mb-5 max-w-2xl">{snap.project.description}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map((sec) => {
          const tasks = snap.tasks.filter((t) => t.sectionId === sec.id);
          return (
            <div key={sec.id} className="min-w-0">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: sec.color || '#94A3B8' }} />
                <span className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3">
                  {sec.name}
                </span>
                <span className="text-2xs text-atlas-fg-3 ml-auto">{tasks.length}</span>
              </div>
              <div className="space-y-2">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpenTask(t.id)}
                    className="w-full text-left panel p-3 hover:border-atlas-line-2 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      {t.status === 'done' ? (
                        <CheckCircle2 className="w-4 h-4 text-atlas-amber shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-atlas-fg-3 shrink-0 mt-0.5" />
                      )}
                      <span
                        className={`text-sm flex-1 ${
                          t.status === 'done' ? 'line-through text-atlas-fg-3' : 'text-atlas-fg-1'
                        }`}
                      >
                        {t.title}
                      </span>
                    </div>
                  </button>
                ))}
                {tasks.length === 0 && (
                  <div className="text-2xs text-atlas-fg-3 italic px-1 py-3">Aucune tâche.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────── Task panel ───────────── */

function TaskPanel({
  task,
  snap,
  canContribute,
  profilesById,
  onBack,
  onApply,
}: {
  task: any;
  snap: ParticipantSnapshot;
  canContribute: boolean;
  profilesById: Map<string, ParticipantProfile>;
  onBack?: () => void;
  onApply: (op: any) => Promise<void>;
}) {
  const sections = useMemo(
    () => [...snap.sections].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [snap.sections]
  );
  const subtasks = snap.subtasks
    .filter((s) => s.taskId === task.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const comments = snap.comments
    .filter((c) => c.taskId === task.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const doneCount = subtasks.filter((s) => s.done).length;

  const [newSub, setNewSub] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const wrap = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {onBack && (
        <button onClick={onBack} className="btn-ghost text-xs px-2 py-1 mb-3 -ml-1">
          <ChevronLeft className="w-3.5 h-3.5" /> Retour au tableau
        </button>
      )}

      <div className="panel p-5">
        <h1 className="font-display text-xl font-medium text-atlas-fg-1">{task.title}</h1>
        {task.description && (
          <p className="text-sm text-atlas-fg-2 mt-2 whitespace-pre-line leading-relaxed">
            {task.description}
          </p>
        )}

        {/* Statut / colonne */}
        <div className="mt-4">
          <SectionLabel>Statut</SectionLabel>
          {canContribute ? (
            <select
              value={task.sectionId ?? ''}
              disabled={busy}
              onChange={(e) => void onApply({ op: 'task.move', taskId: task.id, sectionId: e.target.value })}
              className="w-full h-10 px-3 rounded-lg bg-white border border-atlas-line text-sm text-atlas-fg-1 outline-none focus:border-atlas-amber disabled:opacity-50"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="chip bg-black/[0.04] text-atlas-fg-2 border border-atlas-line">
              {sections.find((s) => s.id === task.sectionId)?.name ?? task.status}
            </span>
          )}
        </div>

        {/* Sous-tâches */}
        <div className="mt-5">
          <SectionLabel>
            Sous-tâches · {doneCount}/{subtasks.length}
          </SectionLabel>
          <div className="space-y-1.5">
            {subtasks.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white border border-atlas-line"
              >
                <button
                  disabled={!canContribute || busy}
                  onClick={wrap(() => onApply({ op: 'subtask.toggle', subtaskId: s.id }))}
                  className="disabled:cursor-not-allowed"
                >
                  {s.done ? (
                    <CheckCircle2 className="w-4 h-4 text-atlas-amber" />
                  ) : (
                    <Circle className="w-4 h-4 text-atlas-fg-3" />
                  )}
                </button>
                <span
                  className={`text-sm flex-1 ${s.done ? 'line-through text-atlas-fg-3' : 'text-atlas-fg-1'}`}
                >
                  {s.title}
                </span>
              </div>
            ))}
            {subtasks.length === 0 && (
              <div className="text-2xs text-atlas-fg-3 italic py-2">Aucune sous-tâche.</div>
            )}
          </div>
          {canContribute && (
            <div className="mt-2 flex items-center gap-2">
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSub.trim()) {
                    void wrap(async () => {
                      await onApply({ op: 'subtask.add', taskId: task.id, title: newSub.trim() });
                      setNewSub('');
                    })();
                  }
                }}
                placeholder="Ajouter une sous-tâche…"
                className="flex-1 h-9 px-3 rounded-lg bg-white border border-atlas-line text-sm outline-none focus:border-atlas-amber"
              />
              <button
                disabled={!newSub.trim() || busy}
                onClick={wrap(async () => {
                  await onApply({ op: 'subtask.add', taskId: task.id, title: newSub.trim() });
                  setNewSub('');
                })}
                className="btn-primary text-xs px-3 py-2 disabled:opacity-50"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
          )}
        </div>

        {/* Discussion */}
        <div className="mt-5">
          <SectionLabel>
            <MessageSquare className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
            Discussion · {comments.length}
          </SectionLabel>
          <div className="space-y-3">
            {comments.map((c) => {
              const author = c.authorId ? profilesById.get(c.authorId) : undefined;
              const name = author?.name || c.authorName || 'Participant';
              return (
                <div key={c.id} className="panel p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-atlas-fg-1">{name}</span>
                    <span className="text-2xs text-atlas-fg-3">{fmtDate(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-atlas-fg-2 mt-1 whitespace-pre-line">{c.body}</p>
                </div>
              );
            })}
            {comments.length === 0 && (
              <div className="text-2xs text-atlas-fg-3 italic py-2">Aucun commentaire.</div>
            )}
          </div>
          {canContribute && (
            <div className="mt-3 flex items-start gap-2">
              <textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Écrire un commentaire…"
                className="flex-1 px-3 py-2 rounded-lg bg-white border border-atlas-line text-sm outline-none focus:border-atlas-amber resize-none"
              />
              <button
                disabled={!draft.trim() || busy}
                onClick={wrap(async () => {
                  await onApply({ op: 'comment.add', taskId: task.id, body: draft.trim() });
                  setDraft('');
                })}
                className="btn-primary text-xs px-3 py-2 disabled:opacity-50 shrink-0"
              >
                <Send className="w-3.5 h-3.5" /> Envoyer
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-2xs text-atlas-fg-3 text-center mt-4">Propulsé par CockpitJourney · Atlas Studio</p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-2xs uppercase tracking-[0.16em] font-medium text-atlas-fg-3 mb-2">{children}</div>
  );
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
