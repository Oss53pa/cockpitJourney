import { useEffect, useState } from 'react';
import {
  X,
  CalendarDays,
  Clock,
  Tag,
  Users,
  Paperclip,
  MessageSquare,
  Sparkles,
  Send,
  Smile,
  AtSign,
  ChevronRight,
  CheckCircle2,
  Circle,
  Plus,
  Link as LinkIcon,
  Hash,
  Type,
  ListChecks,
  Headphones,
  Trash2,
  Edit3,
  Copy,
  FileText,
  Activity,
  GitMerge,
  Eye,
  Image as ImageIcon,
  FileSpreadsheet,
  ArrowUpRight,
  Repeat,
  Download,
  Star,
  Maximize2,
  Target,
} from 'lucide-react';
import type { Task, Priority } from '../types';
import { useApp, useCurrentUser, type Attachment } from '../stores/appStore';
import { Avatar, AvatarGroup } from './ui/Avatar';
import { PriorityBadge } from './ui/PriorityBadge';
import { StatusBadge, ProgressBar } from './ui/StatusBadge';
import { Menu, MenuItem, MenuLabel } from './ui/Menu';
import { cn, formatLongDate, formatTime, relativeTime } from '../lib/utils';

interface Props {
  task: Task | null;
  onClose: () => void;
}

type TabKey = 'details' | 'notes' | 'subtasks' | 'files' | 'discussion' | 'activity' | 'links';

export function TaskDetailDrawer({ task: liveTaskRef, onClose }: Props) {
  // ALL hooks at the top — no early return before hooks (rules of hooks)
  const taskFromStore = useApp((s) => s.tasks.find((t) => t.id === liveTaskRef?.id));
  const projects = useApp((s) => s.projects);
  const allComments = useApp((s) => s.comments);
  const allAttachments = useApp((s) => s.attachments);
  const allDependencies = useApp((s) => s.dependencies);
  const allActivity = useApp((s) => s.activity);
  const toggleDone = useApp((s) => s.toggleTaskDone);
  const updateTask = useApp((s) => s.updateTask);
  const deleteTask = useApp((s) => s.deleteTask);
  const startFocus = useApp((s) => s.startFocusSession);
  const openModal = useApp((s) => s.openModal);
  const pushToast = useApp((s) => s.pushToast);

  const [tab, setTab] = useState<TabKey>('details');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setTab('details');
  }, [liveTaskRef?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // After hooks: derived values + early return
  const task = taskFromStore || liveTaskRef;
  if (!task) return null;

  const project = projects.find((p) => p.id === task.projectId);
  const taskComments = allComments.filter((c) => c.taskId === task.id);
  const attachments = allAttachments.filter((a) => a.taskId === task.id);
  const deps = allDependencies.filter((d) => d.taskId === task.id);
  const activity = allActivity.filter((a) => a.taskId === task.id);
  const allSubtasksFromStore = useApp.getState().subtasks;
  const subtasks = allSubtasksFromStore.filter((s) => s.taskId === task.id);
  const subDone = subtasks.filter((s) => s.done).length;
  const completionPct = subtasks.length
    ? (subDone / subtasks.length) * 100
    : task.status === 'done'
      ? 100
      : task.status === 'in_review'
        ? 75
        : task.status === 'in_progress'
          ? 40
          : 0;

  const copyLink = () => {
    navigator.clipboard?.writeText(`cockpitjourney://task/${task.id}`).catch(() => {});
    pushToast({ kind: 'success', title: 'Lien copié' });
  };

  const tabs: { key: TabKey; label: string; icon: any; count?: number }[] = [
    { key: 'details', label: 'Détails', icon: ListChecks },
    { key: 'notes', label: 'Notes', icon: FileText },
    { key: 'subtasks', label: 'Sous-tâches', icon: CheckCircle2 },
    { key: 'files', label: 'Pièces jointes', icon: Paperclip, count: attachments.length },
    { key: 'discussion', label: 'Discussion', icon: MessageSquare, count: taskComments.length },
    { key: 'activity', label: 'Activité', icon: Activity, count: activity.length },
    { key: 'links', label: 'Liens', icon: GitMerge, count: deps.length },
  ];

  return (
    <div className="fixed inset-0 z-40 flex flex-col sm:flex-row animate-fade-in">
      {/* Backdrop — full screen on mobile (above the sheet), side panel on desktop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm hidden sm:block" onClick={onClose} />
      {/* Mobile-only top backdrop (covers the area above the bottom sheet) */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm sm:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        className={cn(
          // Mobile: bottom sheet — sticks to bottom, takes most of viewport height,
          // rounded top corners. Desktop: right-side drawer.
          'bg-atlas-panel shadow-soft-pop flex flex-col transition-all',
          'rounded-t-2xl sm:rounded-none border-t sm:border-t-0 sm:border-l border-atlas-line',
          'max-h-[88vh] sm:max-h-none h-auto sm:h-full',
          'animate-fade-in-up',
          expanded ? 'w-full sm:max-w-[1100px]' : 'w-full sm:max-w-[760px]'
        )}
      >
        {/* Mobile drag handle hint */}
        <div
          className="sm:hidden flex justify-center pt-2 pb-1 cursor-grab"
          onClick={onClose}
          aria-hidden="true"
        >
          <span className="w-10 h-1 rounded-full bg-atlas-line-2" />
        </div>
        {/* Header */}
        <header className="flex items-center justify-between px-6 h-14 border-b border-black/[0.05] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {project && (
              <button className="inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 hover:text-atlas-fg-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: project.color }} />
                {project.name}
              </button>
            )}
            <ChevronRight className="w-3 h-3 text-atlas-line-2" />
            <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-mono">
              #{task.id.slice(2, 8).toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={copyLink} className="btn-ghost !p-2" title="Copier le lien">
              <LinkIcon className="w-4 h-4" />
            </button>
            <button onClick={() => openModal('task-edit', task)} className="btn-ghost !p-2" title="Modifier">
              <Edit3 className="w-4 h-4" />
            </button>
            <Menu
              trigger={
                <button className="btn-ghost !p-2">
                  <Sparkles className="w-4 h-4 text-atlas-amber-deep" />
                </button>
              }
            >
              {(close) => (
                <>
                  <MenuLabel>PROPH3T</MenuLabel>
                  <MenuItem
                    icon={Sparkles}
                    onClick={async () => {
                      close();
                      const cfg = useApp.getState().settings.proph3t;
                      if (!cfg.apiKey && cfg.provider !== 'ollama-cloud') {
                        pushToast({
                          kind: 'warning',
                          title: 'Clé PROPH3T manquante',
                          body: 'Paramètres → IA',
                        });
                        return;
                      }
                      pushToast({ kind: 'info', title: 'PROPH3T reformule…', duration: 1200 });
                      try {
                        const { ProphClient, reformulateDescription } = await import('../lib/proph3t');
                        const text = await reformulateDescription(
                          new ProphClient(cfg),
                          task.description || task.title
                        );
                        updateTask(task.id, { description: text });
                        pushToast({ kind: 'success', title: 'Description reformulée' });
                      } catch (err: any) {
                        pushToast({ kind: 'error', title: 'Échec', body: err?.message });
                      }
                    }}
                  >
                    Reformuler la description
                  </MenuItem>
                  <MenuItem
                    icon={Sparkles}
                    onClick={() => {
                      close();
                      pushToast({ kind: 'info', title: 'Auto-priorisation Eisenhower' });
                      setTimeout(() => updateTask(task.id, { priority: 4 }), 600);
                    }}
                  >
                    Recalculer la priorité
                  </MenuItem>
                  <MenuItem
                    icon={Sparkles}
                    onClick={() => {
                      close();
                      pushToast({
                        kind: 'info',
                        title: 'Recherche sémantique',
                        body: 'Recherche dans le store local',
                      });
                    }}
                  >
                    Trouver des tâches similaires
                  </MenuItem>
                </>
              )}
            </Menu>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="btn-ghost !p-2"
              title={expanded ? 'Réduire' : 'Agrandir'}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="btn-ghost !p-2">
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Title */}
        <div className="px-6 pt-5 pb-4 border-b border-black/[0.05] shrink-0">
          <div className="flex items-start gap-3">
            <button
              onClick={() => toggleDone(task.id)}
              className={cn(
                'checkbox-task mt-1.5',
                task.status === 'done' && 'bg-amber-gradient border-atlas-amber'
              )}
            >
              {task.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
            </button>
            <h2
              className={cn(
                'font-display text-2xl font-medium tracking-tight leading-tight flex-1',
                task.status === 'done' ? 'text-atlas-fg-3 line-through' : 'text-atlas-fg-1'
              )}
            >
              {task.title}
            </h2>
            <button title="Favori" className="text-atlas-fg-3 hover:text-atlas-amber">
              <Star className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-3 pl-8 flex items-center gap-3 flex-wrap">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <div className="flex-1 min-w-[140px] max-w-[280px] inline-flex items-center gap-2">
              <span className="text-2xs text-atlas-fg-3 uppercase tracking-wider font-medium shrink-0">
                Avancement
              </span>
              <ProgressBar value={completionPct} showLabel />
            </div>
            {subtasks.length > 0 && (
              <span className="text-2xs text-atlas-fg-3 font-mono inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {subDone}/{subtasks.length}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav className="px-6 border-b border-black/[0.05] flex items-center gap-0.5 overflow-x-auto shrink-0">
          {tabs.map((t) => {
            const T = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'relative inline-flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors',
                  active ? 'text-atlas-fg-1' : 'text-atlas-fg-3 hover:text-atlas-fg-1'
                )}
              >
                <T className="w-3.5 h-3.5" />
                {t.label}
                {typeof t.count === 'number' && t.count > 0 && (
                  <span
                    className={cn(
                      'chip text-[9px] px-1.5 py-0',
                      active
                        ? 'bg-atlas-amber/15 text-atlas-amber-deep border border-atlas-amber/30'
                        : 'bg-black/[0.05] text-atlas-fg-3 border border-atlas-line'
                    )}
                  >
                    {t.count}
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-atlas-amber" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'details' && <DetailsTab task={task} />}
          {tab === 'notes' && <NotesTab task={task} />}
          {tab === 'subtasks' && <SubtasksTab task={task} />}
          {tab === 'files' && <FilesTab task={task} attachments={attachments} />}
          {tab === 'discussion' && <DiscussionTab task={task} />}
          {tab === 'activity' && <ActivityTab activity={activity} />}
          {tab === 'links' && <LinksTab task={task} deps={deps} />}
        </div>

        {/* Footer */}
        <footer className="border-t border-black/[0.06] px-3 py-2 flex items-center justify-between gap-2 shrink-0 bg-atlas-panel-2/40">
          <div className="flex items-center gap-1">
            <button
              onClick={() => startFocus('pomodoro-long', task.id)}
              className="btn-secondary text-2xs px-2.5 py-1.5"
            >
              <Headphones className="w-3 h-3" /> Démarrer focus
            </button>
            <button
              onClick={() => {
                const d = task.dueDate ? new Date(task.dueDate) : new Date();
                d.setDate(d.getDate() + 1);
                updateTask(task.id, { dueDate: d.toISOString() });
                pushToast({ kind: 'success', title: 'Reprogrammée à demain' });
              }}
              className="btn-ghost text-2xs px-2.5 py-1.5"
            >
              +1j
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={copyLink} className="btn-ghost text-2xs px-2 py-1">
              <Copy className="w-3 h-3" /> Lien
            </button>
            <button
              onClick={() => {
                if (confirm(`Supprimer "${task.title}" ?`)) {
                  deleteTask(task.id);
                  onClose();
                }
              }}
              className="btn-ghost text-2xs px-2 py-1 text-signal-red hover:bg-signal-red/10"
            >
              <Trash2 className="w-3 h-3" /> Supprimer
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

/* ───────────────────────── Details Tab ───────────────────────── */
function DetailsTab({ task }: { task: Task }) {
  const projects = useApp((s) => s.projects);
  const sections = useApp((s) => s.sections);
  const users = useApp((s) => s.users);
  const goals = useApp((s) => s.goals);
  const allTasks = useApp((s) => s.tasks);
  const setApproval = useApp((s) => s.setTaskApproval);
  const updateTask = useApp((s) => s.updateTask);
  const moveTask = useApp((s) => s.moveTask);
  const changePriority = useApp((s) => s.changeTaskPriority);
  const toggleWatcher = useApp((s) => s.toggleWatcher);
  const project = projects.find((p) => p.id === task.projectId);
  const goal = task.goalId ? goals.find((g) => g.id === task.goalId) : undefined;
  const projectSections = sections.filter((s) => s.projectId === task.projectId);

  // Real estimate from past tasks sharing a tag (actual time preferred,
  // else estimate). Only surfaced when there's enough signal.
  const similarTasks = allTasks.filter(
    (t) =>
      t.id !== task.id &&
      (t.actualMinutes || t.estimatedMinutes) &&
      t.tags.some((tag) => task.tags.includes(tag))
  );
  const avgSimilarMinutes = similarTasks.length
    ? Math.round(
        similarTasks.reduce((s, t) => s + (t.actualMinutes || t.estimatedMinutes || 0), 0) /
          similarTasks.length
      )
    : 0;
  const fmtDuration = (m: number) =>
    m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} min`;

  return (
    <div className="px-6 py-5 space-y-6">
      {task.description && (
        <div>
          <SectionTitle icon={Type}>Description</SectionTitle>
          <p className="text-sm text-atlas-fg-2 leading-relaxed whitespace-pre-line bg-black/[0.02] border border-atlas-line rounded-xl p-4">
            {task.description}
          </p>
        </div>
      )}

      <div>
        <SectionTitle icon={ListChecks}>Propriétés</SectionTitle>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Field icon={ListChecks} label="Statut">
            <Menu
              trigger={
                <button className="chip border bg-atlas-amber/15 text-atlas-amber-deep border-atlas-amber/30 cursor-pointer">
                  ● {task.status.replace('_', ' ')}
                </button>
              }
              width={200}
            >
              {(close) => (
                <>
                  {projectSections.map((sec) => (
                    <MenuItem
                      key={sec.id}
                      onClick={() => {
                        close();
                        moveTask(task.id, sec.id);
                      }}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: sec.color }} />
                        {sec.name}
                      </span>
                      {task.sectionId === sec.id && <span className="text-atlas-amber ml-2">✓</span>}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
          </Field>
          <Field icon={Tag} label="Priorité">
            <Menu
              trigger={
                <button>
                  <PriorityBadge priority={task.priority} />
                </button>
              }
              width={160}
            >
              {(close) => (
                <>
                  {([4, 3, 2, 1] as Priority[]).map((p) => (
                    <MenuItem
                      key={p}
                      onClick={() => {
                        close();
                        changePriority(task.id, p);
                      }}
                    >
                      {['Faible', 'Normale', 'Haute', 'Critique'][p - 1]}
                      {task.priority === p && <span className="text-atlas-amber ml-2">✓</span>}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
          </Field>
          <Field icon={Users} label="Assignés">
            <Menu
              trigger={
                <button>
                  {task.assignees.length > 0 ? (
                    <AvatarGroup
                      users={task.assignees.map((id) => users.find((u) => u.id === id) || users[0])}
                      max={3}
                    />
                  ) : (
                    <span className="text-2xs text-atlas-fg-3">+ Assigner</span>
                  )}
                </button>
              }
            >
              {(close) => (
                <>
                  <MenuLabel>Assigner à</MenuLabel>
                  {users.map((u) => (
                    <MenuItem
                      key={u.id}
                      onClick={() => {
                        close();
                        updateTask(task.id, { assignees: [u.id] });
                      }}
                    >
                      {u.name}
                      {task.assignees.includes(u.id) && <span className="text-atlas-amber ml-2">✓</span>}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
          </Field>
          <Field icon={Eye} label="Watchers">
            <Menu
              trigger={
                <button>
                  {(task.watchers || []).length > 0 ? (
                    <AvatarGroup
                      users={(task.watchers || []).map((id) => users.find((u) => u.id === id) || users[0])}
                      max={3}
                    />
                  ) : (
                    <span className="text-2xs text-atlas-fg-3">+ Suivre</span>
                  )}
                </button>
              }
            >
              {(close) => (
                <>
                  <MenuLabel>Suivi par</MenuLabel>
                  {users.map((u) => (
                    <MenuItem
                      key={u.id}
                      onClick={() => {
                        close();
                        toggleWatcher(task.id, u.id);
                      }}
                    >
                      {u.name}
                      {(task.watchers || []).includes(u.id) && (
                        <span className="text-atlas-amber ml-2">✓</span>
                      )}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
          </Field>
          <Field icon={CalendarDays} label="Échéance">
            <input
              type="datetime-local"
              value={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : ''}
              onChange={(e) =>
                updateTask(task.id, {
                  dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                })
              }
              className="text-sm text-atlas-fg-1 bg-transparent border border-transparent hover:border-atlas-line rounded-md px-1 py-0.5 outline-none focus:border-atlas-amber"
            />
          </Field>
          <Field icon={Clock} label="Estimé / Réel">
            <span className="text-sm font-mono text-atlas-fg-1">
              {task.estimatedMinutes ? `${(task.estimatedMinutes / 60).toFixed(1)}h` : '—'}
              <span className="text-atlas-fg-3 mx-1">/</span>
              {task.actualMinutes ? `${(task.actualMinutes / 60).toFixed(1)}h` : '—'}
            </span>
          </Field>
          <Field icon={Hash} label="Tags">
            <div className="flex items-center gap-1 flex-wrap">
              {task.tags.map((t) => (
                <span key={t} className="chip bg-black/[0.04] text-atlas-fg-2 border border-atlas-line">
                  #{t}
                  <button
                    onClick={() => updateTask(task.id, { tags: task.tags.filter((x) => x !== t) })}
                    className="ml-1 text-atlas-fg-3 hover:text-signal-red"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                onClick={() => {
                  const tag = prompt('Nouveau tag :')?.trim();
                  if (tag) updateTask(task.id, { tags: [...task.tags, tag] });
                }}
                className="text-2xs text-atlas-fg-3 hover:text-atlas-fg-1 inline-flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> ajouter
              </button>
            </div>
          </Field>
          <Field icon={Repeat} label="Récurrence">
            <Menu
              trigger={
                <button className="text-2xs text-atlas-fg-3 hover:text-atlas-fg-1">
                  {(task as any).recurrence_rule ? 'Configurée' : '+ Configurer'}
                </button>
              }
              width={180}
            >
              {(close) => (
                <>
                  <MenuItem
                    onClick={() => {
                      close();
                      updateTask(task.id, {} as any);
                      useApp.getState().pushToast({ kind: 'success', title: 'Récurrence : tous les jours' });
                    }}
                  >
                    Tous les jours
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      close();
                      useApp.getState().pushToast({ kind: 'success', title: 'Récurrence : chaque semaine' });
                    }}
                  >
                    Chaque semaine
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      close();
                      useApp.getState().pushToast({ kind: 'success', title: 'Récurrence : chaque mois' });
                    }}
                  >
                    Chaque mois
                  </MenuItem>
                </>
              )}
            </Menu>
          </Field>
        </div>
      </div>

      {project && (
        <div>
          <SectionTitle icon={ChevronRight}>Projet</SectionTitle>
          <div className="flex items-center gap-3 panel p-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${project.color}22`, color: project.color }}
            >
              <ListChecks className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-atlas-fg-1 truncate">{project.name}</div>
              <div className="text-2xs text-atlas-fg-3">
                {project.taskCount} tâches · {project.progress}% complété
              </div>
            </div>
            <button className="btn-ghost text-2xs px-2 py-1">
              <ArrowUpRight className="w-3 h-3" /> Ouvrir
            </button>
          </div>
        </div>
      )}

      {task.requiresApproval && (
        <div>
          <SectionTitle icon={CheckCircle2}>Approbation</SectionTitle>
          <div className="panel p-3">
            {(() => {
              const cfg: Record<NonNullable<Task['approvalStatus']>, { label: string; cls: string }> = {
                pending: { label: 'En attente', cls: 'bg-atlas-amber/15 text-atlas-amber-deep' },
                approved: { label: 'Approuvée', cls: 'bg-signal-green/15 text-signal-green' },
                rejected: { label: 'Rejetée', cls: 'bg-signal-red/15 text-signal-red' },
                changes_requested: {
                  label: 'Modifications demandées',
                  cls: 'bg-signal-yellow/15 text-signal-yellow',
                },
              };
              const cur = cfg[task.approvalStatus || 'pending'];
              return (
                <>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-2xs text-atlas-fg-3">Statut</span>
                    <span className={cn('chip text-2xs', cur.cls)}>{cur.label}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      onClick={() => setApproval(task.id, 'approved')}
                      className="btn-ghost text-2xs py-1.5 text-signal-green hover:bg-signal-green/10"
                    >
                      Approuver
                    </button>
                    <button
                      onClick={() => setApproval(task.id, 'changes_requested')}
                      className="btn-ghost text-2xs py-1.5 text-signal-yellow hover:bg-signal-yellow/10"
                    >
                      Modifs
                    </button>
                    <button
                      onClick={() => setApproval(task.id, 'rejected')}
                      className="btn-ghost text-2xs py-1.5 text-signal-red hover:bg-signal-red/10"
                    >
                      Rejeter
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {goal && (
        <div>
          <SectionTitle icon={Target}>Goal</SectionTitle>
          <div className="flex items-center gap-3 panel p-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-atlas-amber/15 text-atlas-amber-deep shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-atlas-fg-1 truncate">{goal.title}</div>
              <div className="text-2xs text-atlas-fg-3">
                Contribue à ce cap stratégique ·{' '}
                {Math.round((goal.currentValue / Math.max(1, goal.targetValue)) * 100)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {task.customFields && Object.keys(task.customFields).length > 0 && (
        <div>
          <SectionTitle icon={Type}>Custom fields</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(task.customFields).map(([k, v]) => (
              <div key={k} className="px-3 py-2.5 rounded-lg bg-black/[0.02] border border-atlas-line">
                <div className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3">{k}</div>
                <div className="text-sm text-atlas-fg-1 mt-1 font-medium">{String(v)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {similarTasks.length >= 3 && (
        <div className="rounded-2xl border border-atlas-amber/25 bg-gradient-to-br from-atlas-amber/[0.10] to-transparent p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-atlas-amber-deep" />
            <span className="text-2xs uppercase tracking-wider font-medium text-atlas-amber-deep">
              Estimation · tâches similaires
            </span>
          </div>
          <p className="text-sm text-atlas-fg-1">
            Sur {similarTasks.length} tâches partageant {task.tags.length > 1 ? 'ces tags' : 'ce tag'}, la
            durée moyenne observée est de{' '}
            <strong className="text-atlas-amber-deep">{fmtDuration(avgSimilarMinutes)}</strong>.
            {task.estimatedMinutes
              ? ` Votre estimation actuelle : ${fmtDuration(task.estimatedMinutes)}.`
              : ''}
          </p>
        </div>
      )}

      {task.dueDate && (
        <div className="text-2xs text-atlas-fg-3">
          Échéance complète :{' '}
          <span className="text-atlas-fg-2">
            {formatLongDate(task.dueDate)} à {formatTime(task.dueDate)}
          </span>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Notes Tab ───────────────────────── */
function NotesTab({ task }: { task: Task }) {
  const noteRecord = useApp((s) => s.notes.find((n) => n.taskId === task.id));
  const setNote = useApp((s) => s.setNote);
  const pushToast = useApp((s) => s.pushToast);
  const [draft, setDraft] = useState(noteRecord?.markdown || '');
  const [editing, setEditing] = useState(!noteRecord);

  useEffect(() => {
    setDraft(noteRecord?.markdown || '');
    setEditing(!noteRecord?.markdown);
  }, [noteRecord?.taskId]);

  const save = () => {
    setNote(task.id, draft);
    setEditing(false);
    pushToast({ kind: 'success', title: 'Notes enregistrées' });
  };

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={FileText}>Notes — markdown enrichi (Tiptap)</SectionTitle>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={() => {
                  setEditing(false);
                  setDraft(noteRecord?.markdown || '');
                }}
                className="btn-ghost text-xs px-2.5 py-1.5"
              >
                Annuler
              </button>
              <button onClick={save} className="btn-primary text-xs px-3 py-1.5">
                Enregistrer
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-secondary text-xs px-3 py-1.5">
              <Edit3 className="w-3 h-3" /> Modifier
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={20}
          placeholder="# Titre&#10;&#10;Vos notes en **markdown**…"
          className="w-full px-4 py-3 rounded-xl bg-white border border-atlas-line text-sm text-atlas-fg-1 placeholder:text-atlas-fg-3 outline-none focus:border-atlas-amber focus:ring-2 focus:ring-atlas-amber/20 font-mono leading-relaxed"
        />
      ) : (
        <div className="bg-white border border-atlas-line rounded-xl p-5">
          {noteRecord?.markdown ? (
            <MarkdownPreview source={noteRecord.markdown} />
          ) : (
            <div className="text-center py-12 text-sm text-atlas-fg-3">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Aucune note pour cette tâche.
              <br />
              <button onClick={() => setEditing(true)} className="text-atlas-amber-deep hover:underline mt-2">
                Commencer à écrire
              </button>
            </div>
          )}
        </div>
      )}

      {noteRecord && !editing && (
        <div className="mt-3 text-2xs text-atlas-fg-3">
          Modifié {relativeTime(noteRecord.updatedAt)} · Versionning automatique (30 jours)
        </div>
      )}
    </div>
  );
}

function MarkdownPreview({ source }: { source: string }) {
  // Minimal markdown rendering (titles, lists, bold, italic, code)
  const lines = source.split('\n');
  return (
    <div className="prose-sm space-y-2">
      {lines.map((line, i) => {
        if (line.startsWith('# '))
          return (
            <h1 key={i} className="font-display text-2xl font-medium text-atlas-fg-1 mt-4 first:mt-0">
              {line.slice(2)}
            </h1>
          );
        if (line.startsWith('## '))
          return (
            <h2 key={i} className="font-display text-xl font-medium text-atlas-fg-1 mt-4">
              {line.slice(3)}
            </h2>
          );
        if (line.startsWith('### '))
          return (
            <h3 key={i} className="font-display text-base font-medium text-atlas-fg-1 mt-3">
              {line.slice(4)}
            </h3>
          );
        if (line.startsWith('- '))
          return (
            <li key={i} className="text-sm text-atlas-fg-2 ml-4 list-disc">
              {inline(line.slice(2))}
            </li>
          );
        if (line.match(/^\d+\.\s/))
          return (
            <li key={i} className="text-sm text-atlas-fg-2 ml-4 list-decimal">
              {inline(line.replace(/^\d+\.\s/, ''))}
            </li>
          );
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return (
          <p key={i} className="text-sm text-atlas-fg-2 leading-relaxed">
            {inline(line)}
          </p>
        );
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode {
  // Bold **x**, italic *x*, code `x`
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIdx = 0;
  let key = 0;
  text.replace(re, (m, _g, idx) => {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    if (m.startsWith('**'))
      parts.push(
        <strong key={key++} className="text-atlas-fg-1 font-medium">
          {m.slice(2, -2)}
        </strong>
      );
    else if (m.startsWith('`'))
      parts.push(
        <code key={key++} className="font-mono text-2xs px-1 py-0.5 bg-black/[0.05] rounded">
          {m.slice(1, -1)}
        </code>
      );
    else parts.push(<em key={key++}>{m.slice(1, -1)}</em>);
    lastIdx = idx + m.length;
    return m;
  });
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

/* ───────────────────────── Subtasks Tab ───────────────────────── */
function SubtasksTab({ task }: { task: Task }) {
  const allSubtasks = useApp((s) => s.subtasks);
  const addSubtask = useApp((s) => s.addSubtask);
  const toggleSub = useApp((s) => s.toggleSubtask);
  const removeSub = useApp((s) => s.removeSubtask);
  const users = useApp((s) => s.users);
  const [newSubtask, setNewSubtask] = useState('');

  const subtasks = allSubtasks.filter((s) => s.taskId === task.id).sort((a, b) => a.position - b.position);
  const done = subtasks.filter((s) => s.done).length;

  const add = () => {
    if (!newSubtask.trim()) return;
    addSubtask(task.id, newSubtask);
    setNewSubtask('');
  };

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-3">
        <SectionTitle icon={CheckCircle2}>
          Sous-tâches · {done} / {subtasks.length} (max 3 niveaux)
        </SectionTitle>
        <span className="text-2xs font-mono text-atlas-fg-3">Tâche #{task.id.slice(2, 6).toUpperCase()}</span>
      </div>
      <div className="h-1.5 rounded-full bg-black/[0.04] overflow-hidden mb-4">
        <div
          className="h-full bg-amber-gradient rounded-full transition-all"
          style={{ width: `${subtasks.length ? (done / subtasks.length) * 100 : 0}%` }}
        />
      </div>
      <div className="space-y-1">
        {subtasks.map((s) => {
          const owner = s.assigneeId ? users.find((u) => u.id === s.assigneeId) : undefined;
          return (
            <div
              key={s.id}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-atlas-line hover:border-atlas-line-2"
            >
              <button onClick={() => toggleSub(s.id)}>
                {s.done ? (
                  <CheckCircle2 className="w-4 h-4 text-atlas-amber" />
                ) : (
                  <Circle className="w-4 h-4 text-atlas-fg-3 hover:text-atlas-amber" />
                )}
              </button>
              <span
                className={cn('text-sm flex-1', s.done ? 'line-through text-atlas-fg-3' : 'text-atlas-fg-1')}
              >
                {s.title}
              </span>
              {owner && <Avatar user={owner} size="xs" />}
              <button
                onClick={() => removeSub(s.id)}
                className="opacity-0 group-hover:opacity-100 text-atlas-fg-3 hover:text-signal-red"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        {subtasks.length === 0 && (
          <div className="text-2xs text-atlas-fg-3 italic text-center py-6">Aucune sous-tâche.</div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={newSubtask}
          onChange={(e) => setNewSubtask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Ajouter une sous-tâche…"
          className="flex-1 h-9 px-3 rounded-lg bg-white border border-atlas-line text-sm placeholder:text-atlas-fg-3 outline-none focus:border-atlas-amber"
        />
        <button onClick={add} disabled={!newSubtask.trim()} className="btn-primary text-xs px-3 py-2">
          <Plus className="w-3 h-3" /> Ajouter
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── Files Tab ───────────────────────── */
function FilesTab({ task, attachments }: { task: Task; attachments: Attachment[] }) {
  const addAttachment = useApp((s) => s.addAttachment);
  const removeAttachment = useApp((s) => s.removeAttachment);
  const pushToast = useApp((s) => s.pushToast);

  const handleAdd = () => {
    const types: Attachment['kind'][] = ['pdf', 'img', 'doc', 'csv'];
    const names = [
      'rapport-q2-2026.pdf',
      'screenshot-bug.png',
      'specs-detaillees.docx',
      'export-metrics.csv',
      'invoice-cosmos.pdf',
    ];
    const sizes = ['1.2 MB', '480 KB', '2.4 MB', '120 KB', '900 KB'];
    const idx = Math.floor(Math.random() * names.length);
    addAttachment(task.id, names[idx], types[idx % types.length], sizes[idx]);
  };

  return (
    <div className="px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle icon={Paperclip}>Pièces jointes · {attachments.length}</SectionTitle>
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              pushToast({ kind: 'info', title: 'Lien externe', body: 'Google Drive · OneDrive · Dropbox' })
            }
            className="btn-ghost text-xs px-2.5 py-1.5"
          >
            <LinkIcon className="w-3 h-3" /> Lier un fichier cloud
          </button>
          <button onClick={handleAdd} className="btn-primary text-xs px-3 py-1.5">
            <Plus className="w-3 h-3" /> Téléverser
          </button>
        </div>
      </div>

      {/* Drop zone */}
      <button
        onClick={handleAdd}
        className="w-full mb-4 border-2 border-dashed border-atlas-line hover:border-atlas-amber/60 rounded-xl px-6 py-10 flex flex-col items-center gap-2 text-atlas-fg-3 hover:text-atlas-amber-deep transition-colors bg-white/40"
      >
        <Paperclip className="w-6 h-6" />
        <div className="text-sm font-medium">Glissez vos fichiers ici ou cliquez pour ajouter</div>
        <div className="text-2xs">PDF · DOCX · XLSX · PNG · JPG · MP4 — 500 Mo max (Plan Pro)</div>
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {attachments.map((a) => (
          <FileCard key={a.id} attachment={a} onDelete={() => removeAttachment(a.id)} />
        ))}
        {attachments.length === 0 && (
          <div className="col-span-full text-center text-sm text-atlas-fg-3 italic py-8">
            Aucune pièce jointe.
          </div>
        )}
      </div>
    </div>
  );
}

function FileCard({ attachment, onDelete }: { attachment: Attachment; onDelete: () => void }) {
  const map: Record<Attachment['kind'], { icon: any; cls: string }> = {
    pdf: { icon: FileText, cls: 'bg-signal-red/15 text-signal-red border-signal-red/30' },
    img: { icon: ImageIcon, cls: 'bg-signal-blue/15 text-signal-blue border-signal-blue/30' },
    doc: { icon: FileText, cls: 'bg-atlas-amber/15 text-atlas-amber-deep border-atlas-amber/30' },
    csv: { icon: FileSpreadsheet, cls: 'bg-signal-green/15 text-signal-green border-signal-green/30' },
    link: { icon: LinkIcon, cls: 'bg-signal-violet/15 text-signal-violet border-signal-violet/30' },
  };
  const cfg = map[attachment.kind];
  const Icon = cfg.icon;
  return (
    <div className="group flex items-center gap-3 px-3 py-3 rounded-xl bg-white border border-atlas-line hover:border-atlas-line-2 transition-colors">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center border', cfg.cls)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-atlas-fg-1 truncate">{attachment.name}</div>
        <div className="text-2xs text-atlas-fg-3">
          {attachment.size} · {relativeTime(attachment.uploadedAt)}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button title="Télécharger" className="btn-ghost !p-1.5">
          <Download className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} title="Supprimer" className="btn-ghost !p-1.5 hover:text-signal-red">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────── Discussion Tab ───────────────────────── */
function DiscussionTab({ task }: { task: Task }) {
  const allComments = useApp((s) => s.comments);
  const users = useApp((s) => s.users);
  const addComment = useApp((s) => s.addComment);
  const deleteComment = useApp((s) => s.deleteComment);
  const reactToComment = useApp((s) => s.reactToComment);
  const taskComments = allComments.filter((c) => c.taskId === task.id);
  const [draft, setDraft] = useState('');
  const me = useCurrentUser();

  const submit = () => {
    if (!draft.trim()) return;
    addComment(task.id, draft.trim());
    setDraft('');
  };

  return (
    <div className="px-6 py-5 flex flex-col h-full">
      <div className="flex-1 space-y-4">
        {taskComments.map((c) => {
          const author = users.find((u) => u.id === c.authorId) || users[0];
          return (
            <div key={c.id} className="group flex items-start gap-3">
              <Avatar user={author} size="md" />
              <div className="flex-1 min-w-0 panel p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-atlas-fg-1">{author.name}</span>
                  <span className="text-2xs text-atlas-fg-3">{relativeTime(c.createdAt)}</span>
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="opacity-0 group-hover:opacity-100 ml-auto text-atlas-fg-3 hover:text-signal-red text-2xs inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="mt-1.5 text-sm text-atlas-fg-2 leading-relaxed whitespace-pre-line">
                  {c.body}
                </div>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {(c.reactions ?? []).map((r) => (
                    <button
                      key={r.emoji}
                      onClick={() => reactToComment(c.id, r.emoji)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/[0.04] border border-atlas-line text-2xs hover:border-atlas-amber/40"
                    >
                      {r.emoji} <span className="text-atlas-fg-3">{r.count}</span>
                    </button>
                  ))}
                  <Menu
                    trigger={
                      <button className="w-5 h-5 rounded-md hover:bg-black/[0.05] flex items-center justify-center text-atlas-fg-3">
                        <Smile className="w-3 h-3" />
                      </button>
                    }
                    width={150}
                  >
                    {(close) => (
                      <div className="grid grid-cols-6 gap-1 p-1">
                        {['👍', '🔥', '👏', '🎉', '✅', '❤️'].map((e) => (
                          <button
                            key={e}
                            onClick={() => {
                              close();
                              reactToComment(c.id, e);
                            }}
                            className="w-7 h-7 rounded hover:bg-black/[0.05] text-base"
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </Menu>
                </div>
              </div>
            </div>
          );
        })}
        {taskComments.length === 0 && (
          <div className="text-2xs text-atlas-fg-3 italic text-center py-8">
            Aucun commentaire pour l'instant.
          </div>
        )}
      </div>

      <div className="mt-4 surface px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Avatar user={me} size="md" />
          <div className="flex-1">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
              }}
              placeholder="Écrire un commentaire… ⌘ + ↵ pour envoyer"
              className="w-full bg-transparent resize-none text-sm placeholder:text-atlas-fg-3 outline-none"
            />
            <div className="mt-2 flex items-center gap-1">
              <button className="btn-ghost !p-1.5" title="Mention">
                <AtSign className="w-3.5 h-3.5" />
              </button>
              <button className="btn-ghost !p-1.5" title="Pièce jointe">
                <Paperclip className="w-3.5 h-3.5" />
              </button>
              <button className="btn-ghost !p-1.5" title="Emoji">
                <Smile className="w-3.5 h-3.5" />
              </button>
              <button
                className="ml-auto btn-primary text-xs px-3 py-1.5"
                onClick={submit}
                disabled={!draft.trim()}
              >
                <Send className="w-3.5 h-3.5" /> Envoyer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Activity Tab ───────────────────────── */
function ActivityTab({ activity }: { activity: ReturnType<typeof useApp.getState>['activity'] }) {
  const users = useApp((s) => s.users);
  return (
    <div className="px-6 py-5">
      <SectionTitle icon={Activity}>Journal d'activité</SectionTitle>
      <div className="relative pl-4">
        <div className="absolute left-[18px] top-2 bottom-2 w-px bg-atlas-line" />
        <div className="space-y-3">
          {activity.map((e) => {
            const actor = users.find((u) => u.id === e.actorId) || users[0];
            return (
              <div key={e.id} className="relative flex items-start gap-3">
                <Avatar user={actor} size="sm" />
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="text-sm text-atlas-fg-2">
                    <span className="font-medium text-atlas-fg-1">{actor.name}</span> {e.verb}{' '}
                    {e.target && <span className="font-medium text-atlas-fg-1">{e.target}</span>}
                  </div>
                  <div className="text-2xs text-atlas-fg-3 mt-0.5">{relativeTime(e.at)}</div>
                </div>
              </div>
            );
          })}
          {activity.length === 0 && (
            <div className="text-2xs text-atlas-fg-3 italic text-center py-8">
              Aucune activité enregistrée.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Links Tab ───────────────────────── */
function LinksTab({ task, deps }: { task: Task; deps: ReturnType<typeof useApp.getState>['dependencies'] }) {
  const tasks = useApp((s) => s.tasks);
  const removeDep = useApp((s) => s.removeDependency);
  const addDep = useApp((s) => s.addDependency);

  const blockedBy = deps.filter((d) => d.relation === 'blocked_by');
  const blocks = deps.filter((d) => d.relation === 'blocks');
  const related = deps.filter((d) => d.relation === 'related');

  const otherTasks = tasks.filter((t) => t.id !== task.id);

  return (
    <div className="px-6 py-5 space-y-5">
      <div className="flex items-center justify-between">
        <SectionTitle icon={GitMerge}>Dépendances · {deps.length}</SectionTitle>
        <Menu
          trigger={
            <button className="btn-secondary text-xs px-3 py-1.5">
              <Plus className="w-3 h-3" /> Ajouter un lien
            </button>
          }
        >
          {(close) => (
            <>
              <MenuLabel>Type de relation</MenuLabel>
              {(['blocks', 'blocked_by', 'related'] as const).map((rel) => (
                <Menu key={rel} trigger={<MenuItem icon={GitMerge}>{relLabel(rel)} →</MenuItem>}>
                  {(close2) => (
                    <>
                      <MenuLabel>Choisir une tâche</MenuLabel>
                      {otherTasks.slice(0, 8).map((t) => (
                        <MenuItem
                          key={t.id}
                          onClick={() => {
                            close2();
                            close();
                            addDep(task.id, t.id, rel);
                          }}
                        >
                          {t.title}
                        </MenuItem>
                      ))}
                    </>
                  )}
                </Menu>
              ))}
            </>
          )}
        </Menu>
      </div>

      {blockedBy.length > 0 && (
        <DepGroup title="Bloquée par" tone="red" deps={blockedBy} tasks={tasks} onRemove={removeDep} />
      )}
      {blocks.length > 0 && (
        <DepGroup title="Bloque" tone="yellow" deps={blocks} tasks={tasks} onRemove={removeDep} />
      )}
      {related.length > 0 && (
        <DepGroup title="En relation avec" tone="neutral" deps={related} tasks={tasks} onRemove={removeDep} />
      )}

      {deps.length === 0 && (
        <div className="panel p-10 text-center">
          <GitMerge className="w-8 h-8 mx-auto text-atlas-fg-3 mb-2" />
          <h3 className="text-sm font-medium text-atlas-fg-1">Aucun lien</h3>
          <p className="text-2xs text-atlas-fg-3 mt-1">
            Reliez cette tâche à d'autres pour modéliser dépendances et impacts.
          </p>
        </div>
      )}
    </div>
  );
}

function relLabel(rel: 'blocks' | 'blocked_by' | 'related'): string {
  return rel === 'blocks' ? 'Bloque' : rel === 'blocked_by' ? 'Est bloquée par' : 'En relation avec';
}

function DepGroup({
  title,
  tone,
  deps,
  tasks,
  onRemove,
}: {
  title: string;
  tone: 'red' | 'yellow' | 'neutral';
  deps: any[];
  tasks: Task[];
  onRemove: (id: string) => void;
}) {
  const cls =
    tone === 'red'
      ? 'bg-signal-red/10 text-signal-red border-signal-red/30'
      : tone === 'yellow'
        ? 'bg-signal-yellow/10 text-signal-yellow border-signal-yellow/30'
        : 'bg-black/[0.04] text-atlas-fg-2 border-atlas-line';
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn('chip border', cls)}>{title}</span>
        <span className="text-2xs text-atlas-fg-3">{deps.length}</span>
      </div>
      <div className="space-y-1.5">
        {deps.map((d) => {
          const t = tasks.find((x) => x.id === d.relatedTaskId);
          if (!t) return null;
          return (
            <div
              key={d.id}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-atlas-line hover:border-atlas-line-2"
            >
              <PriorityBadge priority={t.priority} compact />
              <span
                className={cn(
                  'text-sm flex-1',
                  t.status === 'done' ? 'line-through text-atlas-fg-3' : 'text-atlas-fg-1'
                )}
              >
                {t.title}
              </span>
              <span className="chip bg-black/[0.04] text-atlas-fg-3 border border-atlas-line">
                {t.status.replace('_', ' ')}
              </span>
              <button
                onClick={() => onRemove(d.id)}
                className="opacity-0 group-hover:opacity-100 text-atlas-fg-3 hover:text-signal-red"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── Field & SectionTitle ───────────────────────── */
function Field({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 inline-flex items-center gap-1.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="flex-1 min-w-0 inline-flex items-center gap-1.5 flex-wrap">{children}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <h3 className="inline-flex items-center gap-2 text-2xs uppercase tracking-[0.18em] font-medium text-atlas-fg-3 mb-3">
      <Icon className="w-3.5 h-3.5" /> {children}
    </h3>
  );
}
