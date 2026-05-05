import { Sparkles, MessageSquare, Mail, Mic, FileSignature, Inbox, Check, X, Hand } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../stores/appStore';
import type { Task } from '../../types';
import { PriorityBadge } from '../ui/PriorityBadge';
import { cn, formatDate } from '../../lib/utils';

export function InboxView({ onOpenTask }: { onOpenTask: (t: Task) => void }) {
  const tasks = useApp((s) => s.tasks);
  const projects = useApp((s) => s.projects);
  const updateTask = useApp((s) => s.updateTask);
  const deleteTask = useApp((s) => s.deleteTask);
  const pushToast = useApp((s) => s.pushToast);
  const [filterSource, setFilterSource] = useState<
    'all' | 'voice' | 'whatsapp' | 'email' | 'manual' | 'form'
  >('all');

  const items = tasks
    .filter((t) => t.status === 'todo' && (filterSource === 'all' || t.source === filterSource))
    .slice(0, 12);

  const triage = (t: Task) => {
    updateTask(t.id, { status: 'in_progress', priority: t.priority < 3 ? 3 : t.priority });
    pushToast({ kind: 'success', title: 'Tâche triée', body: t.title });
  };

  const autoSort = () => {
    pushToast({ kind: 'info', title: 'PROPH3T trie automatiquement…', duration: 1200 });
    setTimeout(() => {
      items.forEach((t) => updateTask(t.id, { status: 'in_progress' }));
      pushToast({
        kind: 'success',
        title: `${items.length} captures triées`,
        body: 'Catégories détectées par PROPH3T',
      });
    }, 1300);
  };

  const sources: { key: typeof filterSource; label: string }[] = [
    { key: 'all', label: 'Tout' },
    { key: 'manual', label: 'Manuel' },
    { key: 'voice', label: 'Voice' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'email', label: 'Email' },
    { key: 'form', label: 'Forms' },
  ];

  return (
    <div className="px-8 py-7 max-w-5xl">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium mb-1">
            Boîte d'entrée
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Capture brute</h1>
          <p className="text-sm text-atlas-fg-3 mt-1">
            {items.length} tâches non triées · PROPH3T propose une catégorisation
          </p>
        </div>
        <button onClick={autoSort} disabled={!items.length} className="btn-primary text-sm px-3 py-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Auto-trier ({items.length})
        </button>
      </div>

      <div className="mb-4 flex items-center gap-1.5 flex-wrap">
        {sources.map((s) => (
          <button
            key={s.key}
            onClick={() => setFilterSource(s.key)}
            className={cn(
              'px-3 py-1 rounded-full text-2xs uppercase tracking-wider font-medium border',
              filterSource === s.key
                ? 'bg-atlas-amber/15 border-atlas-amber/30 text-atlas-amber-deep'
                : 'border-atlas-line text-atlas-fg-3 hover:bg-black/[0.04]'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {items.map((t, i) => {
          const project = projects.find((p) => p.id === t.projectId);
          return (
            <div
              key={t.id}
              className="group flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white border border-atlas-line hover:border-atlas-line-2 transition-colors"
              style={{ animation: `fade-in-up 320ms ${i * 50}ms cubic-bezier(0.22,1,0.36,1) backwards` }}
            >
              <SourceIcon source={t.source} />
              <button onClick={() => onOpenTask(t)} className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium text-atlas-fg-1 truncate">{t.title}</div>
                <div className="text-2xs text-atlas-fg-3 mt-0.5 flex items-center gap-2">
                  {project && (
                    <>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: project.color }} />{' '}
                        {project.name}
                      </span>
                      <span>·</span>
                    </>
                  )}
                  {t.dueDate && <span>échéance {formatDate(t.dueDate)}</span>}
                </div>
              </button>
              <PriorityBadge priority={t.priority} />
              <button
                onClick={() => triage(t)}
                className="btn-secondary text-2xs px-2 py-1.5 inline-flex items-center gap-1.5"
                title="Trier"
              >
                <Check className="w-3 h-3" /> Trier
              </button>
              <button
                onClick={() => deleteTask(t.id)}
                className="opacity-0 group-hover:opacity-100 btn-ghost !p-1.5"
                title="Rejeter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        {items.length === 0 && (
          <div className="panel p-10 text-center">
            <Inbox className="w-8 h-8 mx-auto text-atlas-fg-3 mb-2" />
            <h3 className="text-sm font-medium text-atlas-fg-1">Boîte d'entrée vide</h3>
            <p className="text-2xs text-atlas-fg-3 mt-1">Tout est trié — bravo !</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SourceIcon({ source }: { source?: string }) {
  const map: Record<string, any> = {
    voice: Mic,
    whatsapp: MessageSquare,
    email: Mail,
    form: FileSignature,
    manual: Hand,
  };
  const Icon = (source && map[source]) || Inbox;
  const cls =
    source === 'whatsapp'
      ? 'text-signal-green bg-signal-green/15 border-signal-green/30'
      : source === 'voice'
        ? 'text-signal-violet bg-signal-violet/15 border-signal-violet/30'
        : source === 'email'
          ? 'text-signal-blue bg-signal-blue/15 border-signal-blue/30'
          : 'text-atlas-fg-3 bg-black/[0.04] border-atlas-line';
  return (
    <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center border', cls)}>
      <Icon className="w-4 h-4" />
    </span>
  );
}
