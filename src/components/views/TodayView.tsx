import { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Trophy,
  Mic,
  MessageCircle,
  Mail,
  Hand,
  Headphones,
  Sunrise,
  Coffee,
  Moon,
  Users,
  RefreshCw,
  BookOpen,
  Plus,
  ListChecks,
  Clock4,
  Flame,
  Zap,
  Target as TargetIcon,
  X,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { AvatarGroup } from '../ui/Avatar';
import { PriorityBadge } from '../ui/PriorityBadge';
import { cn, formatTime } from '../../lib/utils';
import type { PropheticInsight, Task, ViewKey } from '../../types';

const sourceIcons: Record<string, LucideIcon> = {
  voice: Mic,
  whatsapp: MessageCircle,
  email: Mail,
  manual: Hand,
};

const insightStyle: Record<
  PropheticInsight['kind'],
  { icon: LucideIcon; cls: string; bg: string; ring: string; label: string }
> = {
  win: {
    icon: Trophy,
    cls: 'text-signal-green',
    bg: 'from-signal-green/15 to-signal-green/[0.02]',
    ring: 'border-signal-green/30',
    label: 'Victoire',
  },
  risk: {
    icon: AlertTriangle,
    cls: 'text-signal-red',
    bg: 'from-signal-red/15 to-signal-red/[0.02]',
    ring: 'border-signal-red/30',
    label: 'Risque',
  },
  pattern: {
    icon: TrendingUp,
    cls: 'text-signal-violet',
    bg: 'from-signal-violet/15 to-signal-violet/[0.02]',
    ring: 'border-signal-violet/30',
    label: 'Pattern',
  },
  tip: {
    icon: Lightbulb,
    cls: 'text-signal-yellow',
    bg: 'from-signal-yellow/15 to-signal-yellow/[0.02]',
    ring: 'border-signal-yellow/30',
    label: 'Astuce',
  },
  forecast: {
    icon: Sparkles,
    cls: 'text-signal-blue',
    bg: 'from-signal-blue/15 to-signal-blue/[0.02]',
    ring: 'border-signal-blue/30',
    label: 'Prévision',
  },
};

interface Props {
  onOpenTask: (task: Task) => void;
  onNavigate?: (v: ViewKey, projectId?: string) => void;
}

export function TodayView({ onOpenTask, onNavigate }: Props) {
  const tasks = useApp((s) => s.tasks);
  const projects = useApp((s) => s.projects);
  const insights = useApp((s) => s.insights);
  const goals = useApp((s) => s.goals);
  const users = useApp((s) => s.users);
  const currentProfileId = useApp((s) => s.currentProfileId);
  const dismissInsight = useApp((s) => s.dismissInsight);
  const regenerateBrief = useApp((s) => s.regenerateBrief);
  const regenerateTimeBlocks = useApp((s) => s.regenerateTimeBlocks);
  const cachedTimeBlocks = useApp((s) => s.settings.timeBlocks);
  const startFocus = useApp((s) => s.startFocusSession);
  const openModal = useApp((s) => s.openModal);
  const createTask = useApp((s) => s.createTask);
  const pushToast = useApp((s) => s.pushToast);
  const [regeneratingPlan, setRegeneratingPlan] = useState(false);

  // Real user's first name (no more "Pamela" hardcoded for everyone).
  const me = currentProfileId ? users.find((u) => u.id === currentProfileId) : undefined;
  const firstName = (me?.name ?? '').split(/\s+/)[0] || 'Vous';
  // Latest risk insight (replaces the hardcoded "Cosmos · Budget 2027" mention).
  const topRisk = insights.find((i) => i.kind === 'risk');

  const [capture, setCapture] = useState('');
  const [captureSource, setCaptureSource] = useState<'manual' | 'voice' | 'whatsapp' | 'email'>('manual');

  const todayStr = new Date().toDateString();
  const dueToday = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).toDateString() === todayStr && t.status !== 'done'
  );

  // Build the day's agenda. Prefer PROPH3T's persisted plan when available
  // AND generated today; otherwise fall back to "Daily Brief anchor + real
  // tasks by due time" so the panel is never empty.
  const todayLocalKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const briefHour = useApp.getState().settings.dailyBriefHour ?? 7;

  const blockIconByKind: Record<string, LucideIcon> = {
    brief: Sunrise,
    focus: Headphones,
    task: Sparkles,
    meeting: Users,
    break: Coffee,
    review: Moon,
    admin: BookOpen,
  };

  const fromPlan =
    cachedTimeBlocks && cachedTimeBlocks.date === todayLocalKey ? cachedTimeBlocks.blocks : null;

  const focusBlocks = fromPlan
    ? fromPlan.map((b) => ({
        time: b.startTime,
        label: b.label,
        icon: blockIconByKind[b.kind] ?? Sparkles,
        kind: (['brief', 'focus', 'break', 'meeting', 'review'].includes(b.kind) ? b.kind : 'task') as
          | 'brief'
          | 'focus'
          | 'break'
          | 'meeting'
          | 'task'
          | 'review',
        taskId: b.taskId,
        rationale: b.rationale,
        durationMinutes: b.durationMinutes,
      }))
    : [
        {
          time: `${String(briefHour).padStart(2, '0')}:00`,
          label: 'Daily Brief PROPH3T',
          icon: Sunrise,
          kind: 'brief' as const,
          taskId: undefined as string | undefined,
          rationale: undefined as string | undefined,
          durationMinutes: 15,
        },
        ...dueToday
          .slice()
          .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
          .map((t) => ({
            time: t.dueDate
              ? new Date(t.dueDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
              : '—',
            label: t.title,
            icon: Sparkles,
            kind: 'task' as const,
            taskId: t.id as string | undefined,
            rationale: undefined as string | undefined,
            durationMinutes: t.estimatedMinutes ?? 60,
          })),
      ];

  const onRegeneratePlan = async () => {
    setRegeneratingPlan(true);
    try {
      await regenerateTimeBlocks();
    } finally {
      setRegeneratingPlan(false);
    }
  };

  // Compute real deep work minutes from tasks completed today
  const todayDoneTasks = tasks.filter(
    (t) => t.status === 'done' && t.completionDate && new Date(t.completionDate).toDateString() === todayStr
  );
  const deepWorkMinutes = todayDoneTasks.reduce((sum, t) => sum + (t.actualMinutes || 0), 0);

  // Compute real streak: consecutive days with at least one task completed
  const completionDays = new Set(
    tasks
      .filter((t) => t.status === 'done' && t.completionDate)
      .map((t) => new Date(t.completionDate!).toDateString())
  );
  let streak = 0;
  for (let d = new Date(); ; d.setDate(d.getDate() - 1)) {
    if (completionDays.has(d.toDateString())) streak++;
    else if (d.toDateString() !== todayStr) break;
  }

  // Daily Deep Work target = weekly capacity / 5 working days. Rounded to
  // the nearest 30 min for a clean display. Replaces the previous hardcoded
  // "objectif 4h00" sub-label that was identical for every user.
  const weeklyCapacityHours = useApp.getState().settings.weeklyCapacityHours ?? 40;
  const dailyTargetMinutes = Math.round((weeklyCapacityHours * 60) / 5 / 30) * 30;

  const totals = {
    planned: dueToday.length,
    completed: tasks.filter((t) => t.status === 'done').length,
    deepWork: deepWorkMinutes,
    streak,
    dailyTargetMinutes,
  };

  const submitCapture = async () => {
    const text = capture.trim();
    if (!text) return;
    setCapture('');
    const cfg = useApp.getState().settings.proph3t;
    if (cfg.apiKey || cfg.provider === 'ollama-cloud') {
      pushToast({ kind: 'info', title: 'PROPH3T parse votre demande…', duration: 1500 });
      try {
        const { ProphClient, parseTaskFromText } = await import('../../lib/proph3t');
        const client = new ProphClient(cfg);
        const parsed = await parseTaskFromText(client, text, {
          projects: projects.map((p) => ({ id: p.id, name: p.name })),
          today: new Date().toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        });
        const target = parsed.projectHint
          ? projects.find((p) => p.name.toLowerCase().includes(parsed.projectHint!.toLowerCase())) ||
            projects[0]
          : projects[0];
        const section = useApp.getState().sections.find((s) => s.projectId === target.id);
        if (!section) return;
        createTask({
          title: parsed.title,
          projectId: target.id,
          sectionId: section.id,
          source: captureSource,
          priority: parsed.priority || 2,
          dueDate: parsed.dueDate,
          tags: parsed.tags,
        });
        return;
      } catch (err: any) {
        pushToast({
          kind: 'warning',
          title: 'Parsing IA échoué',
          body: 'Création en mode brut · ' + (err?.message || ''),
        });
      }
    }
    // Fallback mock
    const project = projects[0];
    const section = useApp.getState().sections.find((s) => s.projectId === project.id);
    if (!section) return;
    createTask({
      title: text,
      projectId: project.id,
      sectionId: section.id,
      source: captureSource,
      priority: 2,
      dueDate: text.toLowerCase().includes('aujourd') ? new Date().toISOString() : undefined,
    });
  };

  const insightAction = (ins: PropheticInsight) => {
    if (ins.cta?.action.startsWith('open-project:')) {
      const id = ins.cta.action.split(':')[1];
      onNavigate?.('project', id);
    } else if (ins.cta?.action === 'block-slot') {
      pushToast({
        kind: 'success',
        title: 'Créneau Mardi 09h-11h bloqué',
        body: 'Deep Work récurrent activé',
      });
    } else {
      pushToast({ kind: 'info', title: 'Action déclenchée', body: ins.cta?.label });
    }
  };

  return (
    <div className="relative">
      <div className="relative overflow-hidden border-b border-black/[0.05]">
        <div className="absolute inset-0 bg-aurora opacity-80 pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-[420px] h-[420px] rounded-full bg-atlas-amber/10 blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-40 -left-20 w-[380px] h-[380px] rounded-full bg-signal-blue/10 blur-[120px] pointer-events-none" />
        <div className="relative px-8 pt-10 pb-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-atlas-amber-deep text-2xs font-medium uppercase tracking-[0.18em]">
                <Sparkles className="w-3.5 h-3.5" /> Daily Brief ·{' '}
                {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <h1 className="mt-3 font-display text-4xl md:text-5xl font-medium tracking-tightest text-balance">
                Bonjour <span className="text-gradient-amber">{firstName}</span>.
              </h1>
              <p className="mt-3 max-w-2xl text-atlas-fg-2 text-pretty leading-relaxed">
                Vous avez{' '}
                <strong className="text-atlas-fg-1">
                  {dueToday.length} priorité{dueToday.length > 1 ? 's' : ''}
                </strong>{' '}
                aujourd'hui
                {dueToday.filter((t) => t.priority === 4).length > 0 && (
                  <>
                    {' '}
                    dont{' '}
                    <strong className="text-atlas-fg-1">
                      {dueToday.filter((t) => t.priority === 4).length} critique
                      {dueToday.filter((t) => t.priority === 4).length > 1 ? 's' : ''}
                    </strong>
                  </>
                )}
                .{' '}
                {topRisk ? (
                  <>
                    PROPH3T a détecté un <strong className="text-signal-yellow">risque</strong>
                    {topRisk.scope ? (
                      <>
                        {' '}
                        sur <strong className="text-atlas-fg-1">{topRisk.scope}</strong>
                      </>
                    ) : null}
                    .
                  </>
                ) : insights.length > 0 ? (
                  <>
                    PROPH3T a généré{' '}
                    <strong className="text-atlas-fg-1">
                      {insights.length} signal{insights.length > 1 ? 'aux' : ''}
                    </strong>{' '}
                    pour vous aujourd'hui.
                  </>
                ) : (
                  <>Aucun risque détecté — bonne journée.</>
                )}
              </p>
              <div className="mt-5 flex items-center gap-3 flex-wrap">
                <button onClick={() => openModal('proph3t-brief')} className="btn-primary px-4 py-2 text-sm">
                  <Zap className="w-4 h-4" /> Démarrer la journée
                </button>
                <button onClick={() => startFocus('deep')} className="btn-secondary px-4 py-2 text-sm">
                  <Headphones className="w-4 h-4" /> Mode Focus 90 min
                </button>
                <button onClick={() => regenerateBrief()} className="btn-ghost px-3 py-2 text-sm">
                  Régénérer le brief <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="hidden md:grid grid-cols-2 gap-3 min-w-[320px]">
              <Stat
                icon={ListChecks}
                label="Tâches planifiées"
                value={String(totals.planned)}
                sub={`${totals.completed} déjà clôturées`}
                accent="amber"
              />
              <Stat
                icon={Clock4}
                label="Deep Work"
                value={`${Math.floor(totals.deepWork / 60)}h${String(totals.deepWork % 60).padStart(2, '0')}`}
                sub={`objectif ${Math.floor(totals.dailyTargetMinutes / 60)}h${String(
                  totals.dailyTargetMinutes % 60
                ).padStart(2, '0')}`}
                accent="blue"
              />
              <Stat
                icon={Flame}
                label="Série"
                value={totals.streak > 0 ? `${totals.streak} jour${totals.streak > 1 ? 's' : ''}` : '—'}
                sub={totals.streak > 0 ? 'jours consécutifs' : 'aucune série en cours'}
                accent="red"
              />
              <Stat
                icon={TargetIcon}
                label="Goals en cours"
                value={`${goals.length}`}
                sub={`${goals.filter((g) => g.health !== 'green').length} en zone jaune`}
                accent="green"
              />
            </div>
          </div>
        </div>
      </div>

      <section className="px-8 py-7 border-b border-black/[0.04]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-medium tracking-tight">Insights PROPH3T</h2>
            <p className="text-sm text-atlas-fg-3">
              {insights.length} signaux détectés depuis hier · LLaMA 3.1 70B local
            </p>
          </div>
          <button onClick={() => regenerateBrief()} className="btn-ghost text-sm">
            <Sparkles className="w-3.5 h-3.5" /> Régénérer
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {insights.map((ins, idx) => {
            const cfg = insightStyle[ins.kind];
            const Icon = cfg.icon;
            return (
              <article
                key={ins.id}
                className={cn(
                  'group relative rounded-2xl border p-4 bg-gradient-to-br shadow-panel overflow-hidden hover:-translate-y-0.5 transition-transform',
                  cfg.bg,
                  cfg.ring
                )}
                style={{ animation: `fade-in-up 360ms ${idx * 60}ms cubic-bezier(0.22,1,0.36,1) backwards` }}
              >
                <button
                  onClick={() => dismissInsight(ins.id)}
                  className="absolute top-2 right-2 w-5 h-5 rounded-md hover:bg-black/[0.05] text-atlas-fg-3 opacity-0 group-hover:opacity-100 flex items-center justify-center"
                  title="Ignorer"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-lg bg-white border border-atlas-line flex items-center justify-center',
                      cfg.cls
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className={cn('text-2xs uppercase tracking-wider font-medium', cfg.cls)}>
                    {cfg.label}
                  </span>
                  <span className="ml-auto text-2xs font-mono text-atlas-fg-3">
                    {Math.round(ins.confidence * 100)}%
                  </span>
                </div>
                <h3 className="text-sm font-medium text-atlas-fg-1 leading-snug">{ins.title}</h3>
                <p className="mt-2 text-xs text-atlas-fg-2 leading-relaxed line-clamp-3">{ins.body}</p>
                {ins.cta && (
                  <button
                    onClick={() => insightAction(ins)}
                    className="mt-4 text-2xs uppercase tracking-wider font-medium text-atlas-fg-1 inline-flex items-center gap-1.5 hover:text-atlas-amber-deep transition-colors"
                  >
                    {ins.cta.label} <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </article>
            );
          })}
          {insights.length === 0 && (
            <div className="col-span-full text-center py-10 text-sm text-atlas-fg-3">
              Aucun insight pour le moment.{' '}
              <button onClick={() => regenerateBrief()} className="text-atlas-amber-deep hover:underline">
                Régénérer
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="px-8 py-7 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 panel p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-xl font-medium tracking-tight">Votre journée</h2>
              <p className="text-sm text-atlas-fg-3">
                {fromPlan
                  ? `Plan PROPH3T · ${fromPlan.length} bloc${fromPlan.length > 1 ? 's' : ''} · ${new Date(
                      cachedTimeBlocks!.generatedAt
                    ).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                  : dueToday.length > 0
                    ? `${dueToday.length} tâche${dueToday.length > 1 ? 's' : ''} due${
                        dueToday.length > 1 ? 's' : ''
                      } aujourd'hui · cliquez Régénérer pour un plan IA`
                    : 'Aucune tâche due aujourd’hui — ajoutez-en pour structurer votre journée'}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => void onRegeneratePlan()}
                disabled={regeneratingPlan}
                className="btn-secondary text-sm px-3 py-1.5 disabled:opacity-60"
                title="Régénérer le planning de la journée"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', regeneratingPlan && 'animate-spin')} />
                {regeneratingPlan ? 'Génération…' : fromPlan ? 'Régénérer' : 'Plan PROPH3T'}
              </button>
              <button
                onClick={() => pushToast({ kind: 'info', title: 'Bloc personnalisé à venir' })}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Bloc
              </button>
            </div>
          </div>
          <div className="relative pl-3">
            <div className="absolute left-[44px] top-2 bottom-2 w-px bg-gradient-to-b from-atlas-line via-atlas-line to-transparent" />
            <div className="space-y-1.5">
              {focusBlocks.map((b, i) => {
                const Icon = b.icon as LucideIcon;
                const linkedTask = b.taskId ? tasks.find((t) => t.id === b.taskId) : undefined;
                const isActive = i === 1;
                const onBlockClick = () => {
                  if (linkedTask) onOpenTask(linkedTask);
                  else if (b.kind === 'focus' || b.kind === 'task') startFocus('pomodoro-long');
                  else if (b.kind === 'brief') openModal('proph3t-brief');
                  else if (b.kind === 'review')
                    pushToast({ kind: 'info', title: 'Revue de journée à venir' });
                  else pushToast({ kind: 'info', title: b.label });
                };
                return (
                  <div
                    key={i}
                    onClick={onBlockClick}
                    className={cn(
                      'group relative flex items-start gap-4 rounded-xl py-2.5 pl-2 pr-3 transition-colors cursor-pointer',
                      isActive ? 'bg-atlas-amber/[0.08]' : 'hover:bg-black/[0.03]'
                    )}
                  >
                    <div className="w-12 shrink-0 text-right pr-1">
                      <div
                        className={cn(
                          'text-sm font-mono font-medium',
                          isActive ? 'text-atlas-amber-deep' : 'text-atlas-fg-1'
                        )}
                      >
                        {b.time}
                      </div>
                    </div>
                    <div
                      className={cn(
                        'relative w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border',
                        isActive
                          ? 'bg-amber-gradient text-white border-atlas-amber shadow-amber-deep'
                          : 'bg-white text-atlas-fg-2 border-atlas-line'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {isActive && (
                        <span className="absolute inset-0 rounded-xl ring-2 ring-atlas-amber/40 animate-pulse-soft" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-medium text-atlas-fg-1">{b.label}</div>
                        {b.durationMinutes && (
                          <span className="text-2xs text-atlas-fg-3 font-mono">{b.durationMinutes}min</span>
                        )}
                        {isActive && (
                          <span className="chip bg-atlas-amber/15 text-atlas-amber-deep border border-atlas-amber/30">
                            En cours
                          </span>
                        )}
                      </div>
                      {b.rationale && (
                        <div className="mt-0.5 text-2xs text-atlas-fg-3 italic line-clamp-1">
                          {b.rationale}
                        </div>
                      )}
                      {linkedTask && (
                        <div className="mt-1 inline-flex items-center gap-1.5 text-2xs text-atlas-fg-3">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: projects.find((p) => p.id === linkedTask.projectId)?.color }}
                          />{' '}
                          {projects.find((p) => p.id === linkedTask.projectId)?.name} · ouvrir tâche →
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-display text-xl font-medium tracking-tight">Priorités du jour</h2>
              <p className="text-sm text-atlas-fg-3">Auto-priorisé Eisenhower</p>
            </div>
            <button onClick={() => onNavigate?.('inbox')} className="btn-ghost text-sm">
              Inbox
            </button>
          </div>
          <div className="space-y-2">
            {dueToday.slice(0, 5).map((t) => (
              <PriorityRow key={t.id} task={t} onClick={() => onOpenTask(t)} />
            ))}
            {dueToday.length === 0 && (
              <div className="text-sm text-atlas-fg-3 italic py-4 text-center">
                Aucune priorité aujourd'hui — bonne journée 👋
              </div>
            )}
          </div>

          <div className="mt-auto pt-5 border-t border-black/[0.05]">
            <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-3">
              Capture rapide
            </div>
            <div className="surface px-3 py-2.5 flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-atlas-amber shrink-0" />
              <input
                value={capture}
                onChange={(e) => setCapture(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCapture()}
                placeholder='ex : "rappeler client vendredi 15h #projet"'
                className="flex-1 bg-transparent text-sm placeholder:text-atlas-fg-3 outline-none"
              />
              <button
                onClick={submitCapture}
                disabled={!capture.trim()}
                className="btn-primary px-2.5 py-1 text-2xs"
              >
                <Check className="w-3 h-3" /> Créer
              </button>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              {(
                [
                  ['voice', Mic, 'Voice-to-task'],
                  ['whatsapp', MessageCircle, 'WhatsApp'],
                  ['email', Mail, 'E-mail'],
                ] as const
              ).map(([k, I, label]) => (
                <button
                  key={k}
                  onClick={() => setCaptureSource(k)}
                  title={label}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs hover:bg-black/[0.05]',
                    captureSource === k
                      ? 'text-atlas-amber-deep bg-atlas-amber/10'
                      : 'text-atlas-fg-3 hover:text-atlas-fg-1'
                  )}
                >
                  <I className="w-3 h-3" />
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  accent: 'amber' | 'blue' | 'red' | 'green';
}) {
  const ringMap: Record<string, string> = {
    amber: 'border-atlas-amber/30 bg-atlas-amber/[0.08]',
    blue: 'border-signal-blue/30 bg-signal-blue/[0.08]',
    red: 'border-signal-red/30 bg-signal-red/[0.08]',
    green: 'border-signal-green/30 bg-signal-green/[0.08]',
  };
  const textMap: Record<string, string> = {
    amber: 'text-atlas-amber-deep',
    blue: 'text-signal-blue',
    red: 'text-signal-red',
    green: 'text-signal-green',
  };
  return (
    <div className={cn('rounded-xl px-4 py-3 border backdrop-blur-md', ringMap[accent])}>
      <div className="flex items-center gap-2">
        <Icon className={cn('w-3.5 h-3.5', textMap[accent])} />
        <span className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3">{label}</span>
      </div>
      <div className={cn('mt-1.5 font-display text-2xl font-medium tracking-tight', textMap[accent])}>
        {value}
      </div>
      <div className="text-2xs text-atlas-fg-3">{sub}</div>
    </div>
  );
}

function PriorityRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const projects = useApp((s) => s.projects);
  const users = useApp((s) => s.users);
  const toggleDone = useApp((s) => s.toggleTaskDone);
  const project = projects.find((p) => p.id === task.projectId);
  const assignees = task.assignees.map((id) => users.find((u) => u.id === id) || users[0]);
  const SourceIcon = task.source ? sourceIcons[task.source] : null;
  return (
    <div className="group flex items-start gap-3 px-3 py-2.5 rounded-xl bg-white border border-atlas-line hover:border-atlas-amber/40 transition-colors">
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleDone(task.id);
        }}
        className={cn(
          'checkbox-task mt-0.5 shrink-0',
          task.status === 'done' && 'bg-amber-gradient border-atlas-amber'
        )}
        title="Marquer comme terminée"
      />
      <button onClick={onClick} className="flex-1 min-w-0 text-left">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'text-sm font-medium leading-snug',
              task.status === 'done' ? 'line-through text-atlas-fg-3' : 'text-atlas-fg-1'
            )}
          >
            {task.title}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          {project && (
            <span className="inline-flex items-center gap-1.5 text-2xs text-atlas-fg-3">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: project.color }} />
              {project.name}
            </span>
          )}
          {task.dueDate && (
            <span className="inline-flex items-center gap-1 text-2xs text-atlas-fg-3">
              <Clock4 className="w-3 h-3" />
              {formatTime(task.dueDate)}
            </span>
          )}
          {SourceIcon && (
            <span className="inline-flex items-center gap-1 text-2xs text-atlas-fg-3">
              <SourceIcon className="w-3 h-3" />
              {task.source}
            </span>
          )}
        </div>
      </button>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <PriorityBadge priority={task.priority} compact />
        <AvatarGroup users={assignees} size="xs" />
      </div>
    </div>
  );
}
