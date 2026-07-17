/**
 * Détection et nettoyage des actions en double.
 *
 * La suppression est TOUJOURS déclenchée par l'utilisateur (jamais automatique)
 * et confirmée : elle est irréversible. On propose la copie la plus riche à
 * conserver, mais le choix reste modifiable — « Garder celle-ci » sur n'importe
 * quelle ligne réattribue le rôle.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, Copy, AlertTriangle, Trash2, Star } from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { findDuplicateTasks } from '../../lib/duplicates';
import { cn } from '../../lib/utils';
import type { Task } from '../../types';

const STATUS_FR: Record<string, string> = {
  done: 'Terminé',
  in_review: 'En revue',
  in_progress: 'En cours',
  blocked: 'Bloquée',
  todo: 'À faire',
};

export function DuplicateActionsPanel() {
  const tasks = useApp((s) => s.tasks);
  const subtasks = useApp((s) => s.subtasks);
  const projects = useApp((s) => s.projects);
  const deleteTask = useApp((s) => s.deleteTask);
  const pushToast = useApp((s) => s.pushToast);
  // Choix manuels : clé du groupe → id de la copie à conserver.
  const [keepOverride, setKeepOverride] = useState<Record<string, string>>({});

  const groups = useMemo(() => findDuplicateTasks(tasks, subtasks), [tasks, subtasks]);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? 'Inbox';

  const resolved = groups.map((g) => {
    const keepId = keepOverride[g.key] ?? g.keep.id;
    const all = [g.keep, ...g.remove];
    return {
      ...g,
      keep: all.find((t) => t.id === keepId) ?? g.keep,
      remove: all.filter((t) => t.id !== keepId),
    };
  });

  const excess = resolved.reduce((s, g) => s + g.remove.length, 0);
  const conflicts = resolved.filter((g) => g.conflicting).length;

  if (groups.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-signal-green/25 bg-signal-green/[0.06] px-4 py-3">
        <CheckCircle2 className="w-4 h-4 text-signal-green shrink-0" />
        <span className="text-2xs text-atlas-fg-2">
          Aucune action en double — chaque action est unique dans son projet.
        </span>
      </div>
    );
  }

  const removeGroup = (g: (typeof resolved)[number]) => {
    const n = g.remove.length;
    if (!confirm(`Supprimer définitivement ${n} copie${n > 1 ? 's' : ''} de « ${g.title} » ?`)) return;
    g.remove.forEach((t) => deleteTask(t.id));
    pushToast({
      kind: 'success',
      title: `${n} doublon${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}`,
      body: g.title,
    });
  };

  const removeAllSafe = () => {
    const safe = resolved.filter((g) => !g.conflicting);
    const n = safe.reduce((s, g) => s + g.remove.length, 0);
    if (!n) return;
    if (
      !confirm(
        `Supprimer définitivement ${n} copie${n > 1 ? 's' : ''} excédentaire${n > 1 ? 's' : ''} ?\n\n` +
          `Seuls les ${safe.length} groupes SANS conflit sont concernés. Les ${conflicts} groupes en conflit ` +
          `sont laissés de côté : leurs copies ont des statuts différents et méritent votre arbitrage.`
      )
    )
      return;
    safe.forEach((g) => g.remove.forEach((t) => deleteTask(t.id)));
    pushToast({ kind: 'success', title: `${n} doublons supprimés`, body: `${safe.length} groupes nettoyés` });
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="inline-flex items-center gap-2 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
            <Copy className="w-3.5 h-3.5 text-signal-yellow" /> Actions en double
          </div>
          <p className="text-2xs text-atlas-fg-3 mt-1 max-w-2xl">
            Même titre dans le même projet — résultat d'imports superposés. Chaque copie compte comme une
            action de plus et <strong>fausse la progression des objectifs</strong>. La copie la plus complète
            est proposée à la conservation&nbsp;; la suppression est définitive.
          </p>
        </div>
        {excess > 0 && (
          <button
            onClick={removeAllSafe}
            className="btn-secondary text-xs px-3 py-2 whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" /> Nettoyer les{' '}
            {excess - resolved.filter((g) => g.conflicting).reduce((s, g) => s + g.remove.length, 0)} doublons
            sûrs
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat value={String(resolved.length)} label="Groupes" />
        <Stat value={String(excess)} label="Copies à supprimer" tone="red" />
        <Stat value={String(conflicts)} label="Conflits à arbitrer" tone={conflicts ? 'yellow' : undefined} />
      </div>

      {conflicts > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-signal-yellow/30 bg-signal-yellow/[0.06] px-3 py-2 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-signal-yellow shrink-0 mt-0.5" />
          <span className="text-2xs text-atlas-fg-2">
            {conflicts} groupe{conflicts > 1 ? 's' : ''} dont les copies{' '}
            <strong>ne disent pas la même chose</strong> (statuts divergents). Vérifiez laquelle fait foi
            avant de supprimer — le nettoyage groupé les ignore volontairement.
          </span>
        </div>
      )}

      <div className="space-y-2">
        {resolved.map((g) => (
          <div key={g.key} className="rounded-xl border border-atlas-line overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2.5 bg-black/[0.02]">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-atlas-fg-1 truncate font-medium">{g.title}</div>
                <div className="text-2xs text-atlas-fg-3">
                  {projectName(g.projectId)} · {g.remove.length + 1} exemplaires
                </div>
              </div>
              {g.conflicting && (
                <span className="chip text-[9px] px-1.5 py-0 bg-signal-yellow/20 text-signal-yellow shrink-0">
                  conflit
                </span>
              )}
              <button
                onClick={() => removeGroup(g)}
                className="btn-ghost text-2xs py-1.5 px-2.5 text-signal-red hover:bg-signal-red/10 shrink-0"
              >
                <Trash2 className="w-3 h-3" /> Supprimer {g.remove.length}
              </button>
            </div>
            <ul className="divide-y divide-atlas-line/60">
              {[g.keep, ...g.remove].map((t) => (
                <CopyRow
                  key={t.id}
                  task={t}
                  isKeep={t.id === g.keep.id}
                  onKeep={() => setKeepOverride((m) => ({ ...m, [g.key]: t.id }))}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function CopyRow({ task, isKeep, onKeep }: { task: Task; isKeep: boolean; onKeep: () => void }) {
  return (
    <li className={cn('flex items-center gap-2.5 px-3 py-2', isKeep ? 'bg-signal-green/[0.05]' : 'bg-white')}>
      {isKeep ? (
        <Star className="w-3.5 h-3.5 text-signal-green shrink-0" />
      ) : (
        <Trash2 className="w-3.5 h-3.5 text-atlas-fg-3 shrink-0" />
      )}
      <span className="font-mono text-[10px] text-atlas-fg-3 w-32 truncate shrink-0">{task.id}</span>
      <span className="text-2xs text-atlas-fg-2 w-20 shrink-0">{STATUS_FR[task.status] ?? task.status}</span>
      <span className="text-2xs text-atlas-fg-3 flex-1 min-w-0 truncate">
        {task.goalId ? 'objectif lié' : 'sans objectif'}
        {task.dueDate ? ` · ${new Date(task.dueDate).toISOString().slice(0, 10)}` : ''}
      </span>
      {isKeep ? (
        <span className="chip text-[9px] px-1.5 py-0 bg-signal-green/15 text-signal-green shrink-0">
          conservée
        </span>
      ) : (
        <button onClick={onKeep} className="btn-ghost text-[10px] py-1 px-2 shrink-0">
          Garder celle-ci
        </button>
      )}
    </li>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'red' | 'yellow' }) {
  return (
    <div className="panel p-3">
      <div
        className={cn(
          'font-display text-2xl font-medium',
          tone === 'red' ? 'text-signal-red' : tone === 'yellow' ? 'text-signal-yellow' : 'text-atlas-fg-1'
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-atlas-fg-3 mt-0.5">{label}</div>
    </div>
  );
}
