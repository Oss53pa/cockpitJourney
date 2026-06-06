import { useMemo, useState } from 'react';
import { CalendarClock, Plus, Trash2, CheckCircle2, Circle, Wand2, Flag, AlertTriangle } from 'lucide-react';
import type { RetroPlan, RetroStep } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  plan?: RetroPlan;
  onChange: (plan: RetroPlan) => void;
  /** Échéance par défaut (dueDate de la tâche / endDate du projet). */
  defaultTarget?: string;
}

const rid = () => `rs_${Math.random().toString(36).slice(2, 9)}`;

/** YYYY-MM-DD (local) for <input type=date> binding. */
function toDateInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function fmt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function RetroPlanPanel({ plan, onChange, defaultTarget }: Props) {
  const steps = useMemo(
    () =>
      [...(plan?.steps ?? [])].sort((a, b) => {
        if (!a.date && !b.date) return a.sortOrder - b.sortOrder;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }),
    [plan?.steps]
  );
  const target = plan?.targetDate || defaultTarget || '';

  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [genCount, setGenCount] = useState(4);

  const commit = (patch: Partial<RetroPlan>) =>
    onChange({ targetDate: target || undefined, steps: plan?.steps ?? [], ...patch });

  const setTarget = (v: string) => commit({ targetDate: v ? new Date(v).toISOString() : undefined });

  const addStep = (title: string, date?: string) => {
    const t = title.trim();
    if (!t) return;
    const step: RetroStep = {
      id: rid(),
      title: t,
      date: date ? new Date(date).toISOString() : undefined,
      done: false,
      sortOrder: plan?.steps?.length ?? 0,
    };
    commit({ steps: [...(plan?.steps ?? []), step] });
    setNewTitle('');
    setNewDate('');
  };

  const updateStep = (id: string, patch: Partial<RetroStep>) =>
    commit({ steps: (plan?.steps ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const removeStep = (id: string) => commit({ steps: (plan?.steps ?? []).filter((s) => s.id !== id) });

  /** Génère N jalons espacés régulièrement entre aujourd'hui et l'échéance. */
  const generateBackward = () => {
    if (!target) return;
    const end = new Date(target);
    if (Number.isNaN(end.getTime())) return;
    const start = new Date();
    const n = Math.max(1, Math.min(20, genCount));
    const span = daysBetween(start, end);
    const generated: RetroStep[] = Array.from({ length: n }, (_, i) => {
      // i+1 sur n : le dernier jalon tombe sur l'échéance.
      const frac = (i + 1) / n;
      const d = new Date(start.getTime() + Math.round(span * frac) * 86_400_000);
      return {
        id: rid(),
        title: i === n - 1 ? 'Livraison finale' : `Jalon ${i + 1}`,
        date: d.toISOString(),
        done: false,
        sortOrder: i,
      };
    });
    commit({ steps: generated });
  };

  const doneCount = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const now = new Date();
  const daysToTarget = target ? daysBetween(now, new Date(target)) : null;

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Échéance + progression */}
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div>
            <div className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-1 inline-flex items-center gap-1.5">
              <Flag className="w-3 h-3" /> Échéance cible
            </div>
            <input
              type="date"
              value={toDateInput(target)}
              onChange={(e) => setTarget(e.target.value)}
              className="text-sm text-atlas-fg-1 bg-white border border-atlas-line rounded-lg px-2.5 py-1.5 outline-none focus:border-atlas-amber"
            />
          </div>
          {daysToTarget !== null && (
            <div>
              <div className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-1">Reste</div>
              <div
                className={cn(
                  'text-sm font-mono font-medium',
                  daysToTarget < 0
                    ? 'text-signal-red'
                    : daysToTarget < 7
                      ? 'text-signal-yellow'
                      : 'text-atlas-fg-1'
                )}
              >
                {daysToTarget < 0 ? `${Math.abs(daysToTarget)} j de retard` : `${daysToTarget} j`}
              </div>
            </div>
          )}
          <div className="flex-1 min-w-[160px]">
            <div className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-1.5">
              Avancement · {doneCount}/{steps.length}
            </div>
            <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
              <div
                className="h-full bg-amber-gradient rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Générateur à rebours */}
        <div className="mt-4 pt-3 border-t border-black/[0.05] flex items-center gap-2 flex-wrap">
          <span className="text-2xs text-atlas-fg-3 inline-flex items-center gap-1.5">
            <Wand2 className="w-3.5 h-3.5 text-atlas-amber-deep" /> Générer à rebours
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={genCount}
            onChange={(e) => setGenCount(Number(e.target.value) || 1)}
            className="w-16 text-sm bg-white border border-atlas-line rounded-lg px-2 py-1 outline-none focus:border-atlas-amber"
          />
          <span className="text-2xs text-atlas-fg-3">jalons jusqu'à l'échéance</span>
          <button
            onClick={generateBackward}
            disabled={!target}
            className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
            title={target ? 'Générer' : "Renseignez d'abord l'échéance"}
          >
            Générer
          </button>
          {steps.length > 0 && (
            <span className="text-2xs text-atlas-fg-3 italic ml-auto">Remplace les jalons existants</span>
          )}
        </div>
      </div>

      {/* Timeline des jalons */}
      <div className="relative pl-1">
        {steps.length > 0 && <div className="absolute left-[10px] top-3 bottom-3 w-px bg-atlas-line" />}
        <div className="space-y-2.5">
          {steps.map((s) => {
            const overdue = !s.done && s.date && new Date(s.date) < now;
            return (
              <div key={s.id} className="relative flex items-start gap-3 group">
                <button onClick={() => updateStep(s.id, { done: !s.done })} className="mt-2 shrink-0 z-10">
                  {s.done ? (
                    <CheckCircle2 className="w-5 h-5 text-atlas-amber" />
                  ) : overdue ? (
                    <AlertTriangle className="w-5 h-5 text-signal-red" />
                  ) : (
                    <Circle className="w-5 h-5 text-atlas-fg-3 hover:text-atlas-amber" />
                  )}
                </button>
                <div className="flex-1 min-w-0 panel p-3 flex items-center gap-3">
                  <input
                    value={s.title}
                    onChange={(e) => updateStep(s.id, { title: e.target.value })}
                    className={cn(
                      'flex-1 min-w-0 text-sm bg-transparent outline-none border-b border-transparent focus:border-atlas-amber',
                      s.done ? 'line-through text-atlas-fg-3' : 'text-atlas-fg-1'
                    )}
                  />
                  <input
                    type="date"
                    value={toDateInput(s.date)}
                    onChange={(e) =>
                      updateStep(s.id, {
                        date: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                      })
                    }
                    className={cn(
                      'text-2xs font-mono bg-transparent border border-transparent hover:border-atlas-line rounded px-1 py-0.5 outline-none focus:border-atlas-amber shrink-0',
                      overdue ? 'text-signal-red' : 'text-atlas-fg-3'
                    )}
                  />
                  <button
                    onClick={() => removeStep(s.id)}
                    className="opacity-0 group-hover:opacity-100 text-atlas-fg-3 hover:text-signal-red shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {steps.length === 0 && (
          <div className="panel p-10 text-center">
            <CalendarClock className="w-8 h-8 mx-auto text-atlas-fg-3 mb-2" />
            <h3 className="text-sm font-medium text-atlas-fg-1">Aucun jalon</h3>
            <p className="text-2xs text-atlas-fg-3 mt-1">
              Ajoutez vos étapes ou générez-les à rebours depuis l'échéance.
            </p>
          </div>
        )}
      </div>

      {/* Ajout manuel */}
      <div className="flex items-center gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addStep(newTitle, newDate)}
          placeholder="Ajouter un jalon…"
          className="flex-1 h-9 px-3 rounded-lg bg-white border border-atlas-line text-sm outline-none focus:border-atlas-amber"
        />
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="h-9 px-2 rounded-lg bg-white border border-atlas-line text-sm text-atlas-fg-2 outline-none focus:border-atlas-amber"
        />
        <button
          onClick={() => addStep(newTitle, newDate)}
          disabled={!newTitle.trim()}
          className="btn-primary text-xs px-3 py-2 disabled:opacity-50"
        >
          <Plus className="w-3 h-3" /> Ajouter
        </button>
      </div>

      <p className="text-2xs text-atlas-fg-3">
        {fmt(target) !== '—' ? `Cible : ${fmt(target)}.` : ''} Les jalons sont triés par date.
      </p>
    </div>
  );
}
