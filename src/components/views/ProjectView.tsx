import { useMemo, useState } from 'react';
import {
  List,
  Columns3,
  Calendar,
  GanttChartSquare,
  Table2,
  Activity,
  Users,
  MoreHorizontal,
  Plus,
  Filter,
  ArrowUpDown,
  Settings2,
  Sparkles,
  Star,
  CheckCircle2,
  Circle,
  MessageSquare,
  Paperclip,
  Clock,
  ChevronRight,
  Compass,
  FileText,
  Wallet,
  TrendingUp,
  Sunrise,
  BookOpen,
  Edit3,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Flag,
  GripVertical,
  Download,
  Image as ImageIcon,
  FileSpreadsheet,
  LayoutDashboard,
  Target,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import type { Project, Section, Task, Priority } from '../../types';
import { useApp } from '../../stores/appStore';
import { AvatarGroup } from '../ui/Avatar';
import { PriorityBadge } from '../ui/PriorityBadge';
import { StatusBadge, ProgressBar } from '../ui/StatusBadge';
import { HealthDot } from '../ui/HealthDot';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { cn, formatDate } from '../../lib/utils';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  DragOverlay,
} from '@dnd-kit/core';

const projectIcons: Record<string, LucideIcon> = {
  Compass,
  FileText,
  Wallet,
  Sparkles,
  TrendingUp,
  Sunrise,
  BookOpen,
};

type MainTab = 'tasks' | 'notes' | 'files' | 'brief' | 'dashboard' | 'goals' | 'activity';
type TaskView = 'list' | 'kanban' | 'calendar' | 'gantt' | 'table';

const mainTabs: { key: MainTab; label: string; icon: LucideIcon }[] = [
  { key: 'tasks', label: 'Tâches', icon: ListChecks },
  { key: 'notes', label: 'Notes', icon: FileText },
  { key: 'files', label: 'Fichiers', icon: Paperclip },
  { key: 'brief', label: 'Brief', icon: Sparkles },
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'goals', label: 'Goals', icon: Target },
  { key: 'activity', label: 'Activité', icon: Activity },
];

const taskViews: { key: TaskView; label: string; icon: LucideIcon }[] = [
  { key: 'kanban', label: 'Kanban', icon: Columns3 },
  { key: 'list', label: 'Liste', icon: List },
  { key: 'calendar', label: 'Calendrier', icon: Calendar },
  { key: 'gantt', label: 'Timeline', icon: GanttChartSquare },
  { key: 'table', label: 'Tableau', icon: Table2 },
];

interface Props {
  project: Project;
  onOpenTask: (t: Task) => void;
}

export function ProjectView({ project, onOpenTask }: Props) {
  const [tab, setTab] = useState<MainTab>('tasks');
  const [taskView, setTaskView] = useState<TaskView>('kanban');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState<string | 'all'>('all');
  const [sort, setSort] = useState<'due' | 'priority' | 'title' | 'recent'>('due');
  const [showStarred, setShowStarred] = useState(false);

  const allTasks = useApp((s) => s.tasks);
  const allSections = useApp((s) => s.sections);
  const users = useApp((s) => s.users);
  const openModal = useApp((s) => s.openModal);
  const updateProject = useApp((s) => s.updateProject);
  const deleteProject = useApp((s) => s.deleteProject);
  const pushToast = useApp((s) => s.pushToast);

  const sections = useMemo(
    () => allSections.filter((s) => s.projectId === project.id).sort((a, b) => a.position - b.position),
    [allSections, project.id]
  );

  const tasks = useMemo(() => {
    let list = allTasks.filter((t) => t.projectId === project.id);
    if (filterPriority !== 'all') list = list.filter((t) => t.priority === filterPriority);
    if (filterAssignee !== 'all') list = list.filter((t) => t.assignees.includes(filterAssignee));
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'due':
          return (a.dueDate || '').localeCompare(b.dueDate || '');
        case 'priority':
          return b.priority - a.priority;
        case 'title':
          return a.title.localeCompare(b.title);
        case 'recent':
          return b.id.localeCompare(a.id);
      }
    });
    return list;
  }, [allTasks, project.id, filterPriority, filterAssignee, sort]);

  const Icon = projectIcons[project.icon] || Compass;

  return (
    <div>
      {/* Project header */}
      <div className="px-8 pt-7 pb-3 border-b border-black/[0.05]">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-soft-pop"
              style={{
                background: `linear-gradient(135deg, ${project.color}28, ${project.color}10)`,
                color: project.color,
              }}
            >
              <Icon className="w-6 h-6" strokeWidth={1.6} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-medium tracking-tight">{project.name}</h1>
                <button onClick={() => setShowStarred((v) => !v)} title="Favori">
                  <Star
                    className={cn(
                      'w-4 h-4 transition-colors',
                      showStarred
                        ? 'text-atlas-amber fill-atlas-amber'
                        : 'text-atlas-fg-3 hover:text-atlas-amber'
                    )}
                  />
                </button>
              </div>
              {project.description && (
                <p className="text-sm text-atlas-fg-3 mt-1 max-w-2xl">{project.description}</p>
              )}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <Badge>
                  <HealthDot health={project.health} label />
                </Badge>
                <Badge>
                  <span className="text-2xs text-atlas-fg-3 uppercase tracking-wider font-medium">
                    Avancement
                  </span>
                  <span className="text-xs font-medium text-atlas-fg-1">{project.progress}%</span>
                  <div className="w-24 h-1 rounded-full bg-black/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-amber-gradient rounded-full"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </Badge>
                <Badge>
                  <span className="text-2xs text-atlas-fg-3 uppercase tracking-wider font-medium">
                    Tâches
                  </span>
                  <span className="text-xs font-medium text-atlas-fg-1">{tasks.length}</span>
                </Badge>
                {project.endDate && (
                  <Badge>
                    <span className="text-2xs text-atlas-fg-3 uppercase tracking-wider font-medium">
                      Échéance
                    </span>
                    <span className="text-xs font-medium text-atlas-fg-1">{formatDate(project.endDate)}</span>
                  </Badge>
                )}
                <Badge>
                  <Users className="w-3 h-3 text-atlas-fg-3" />
                  <AvatarGroup
                    users={(project.membersIds ?? [project.ownerId])
                      .map((id) => users.find((u) => u.id === id))
                      .filter((u): u is NonNullable<typeof u> => !!u)}
                    size="xs"
                    max={4}
                  />
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openModal('proph3t-brief')} className="btn-secondary text-sm px-3 py-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Brief PROPH3T
            </button>
            <button onClick={() => openModal('invite-team')} className="btn-secondary text-sm px-3 py-1.5">
              <Users className="w-3.5 h-3.5" /> Inviter
            </button>
            <button
              onClick={() => openModal('task-create', { projectId: project.id, sectionId: sections[0]?.id })}
              className="btn-primary text-sm px-3 py-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Tâche
            </button>
            <Menu
              trigger={
                <button className="btn-secondary !p-1.5">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              }
            >
              {(close) => (
                <>
                  <MenuLabel>Projet</MenuLabel>
                  <MenuItem
                    icon={Edit3}
                    onClick={() => {
                      close();
                      openModal('project-edit', project);
                    }}
                  >
                    Modifier
                  </MenuItem>
                  <MenuItem
                    icon={Activity}
                    onClick={() => {
                      close();
                      updateProject(project.id, {
                        status: project.status === 'active' ? 'paused' : 'active',
                      });
                    }}
                  >
                    {project.status === 'active' ? 'Mettre en pause' : 'Réactiver'}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    danger
                    icon={Trash2}
                    onClick={() => {
                      close();
                      openModal('project-delete', {
                        title: project.name,
                        onConfirm: () => deleteProject(project.id),
                      });
                    }}
                  >
                    Supprimer
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>

        <div className="mt-6">
          <nav className="flex items-center gap-0.5 border-b border-atlas-line -mb-px">
            {mainTabs.map((t) => {
              const T = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'relative inline-flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
                    active ? 'text-atlas-fg-1' : 'text-atlas-fg-3 hover:text-atlas-fg-1'
                  )}
                >
                  <T className="w-3.5 h-3.5" />
                  {t.label}
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-atlas-amber" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {tab === 'tasks' && (
          <div className="mt-4 flex items-center justify-between">
            <nav className="flex items-center gap-1 p-1 bg-black/[0.03] border border-atlas-line rounded-xl">
              {taskViews.map((v) => {
                const T = v.icon;
                const active = taskView === v.key;
                return (
                  <button
                    key={v.key}
                    onClick={() => setTaskView(v.key)}
                    className={cn('tab-base', active && 'tab-active')}
                  >
                    <T className="w-3.5 h-3.5" />
                    {v.label}
                  </button>
                );
              })}
            </nav>
            <div className="flex items-center gap-1.5">
              <Menu
                trigger={
                  <button className="btn-ghost text-xs px-2.5 py-1.5">
                    <Filter className="w-3.5 h-3.5" /> Filtres{' '}
                    {(filterPriority !== 'all' || filterAssignee !== 'all') && (
                      <span className="chip bg-atlas-amber/15 text-atlas-amber border border-atlas-amber/30 ml-1">
                        ●
                      </span>
                    )}
                  </button>
                }
              >
                {() => (
                  <>
                    <MenuLabel>Priorité</MenuLabel>
                    {(['all', 4, 3, 2, 1] as const).map((p) => (
                      <MenuItem key={String(p)} icon={Flag} onClick={() => setFilterPriority(p)}>
                        {p === 'all'
                          ? 'Toutes'
                          : ['Faible', 'Normale', 'Haute', 'Critique'][(p as number) - 1]}
                        {filterPriority === p && <span className="text-atlas-amber ml-2">✓</span>}
                      </MenuItem>
                    ))}
                    <MenuSeparator />
                    <MenuLabel>Assigné</MenuLabel>
                    <MenuItem onClick={() => setFilterAssignee('all')}>
                      Tous {filterAssignee === 'all' && <span className="text-atlas-amber ml-2">✓</span>}
                    </MenuItem>
                    {users.slice(0, 5).map((u) => (
                      <MenuItem key={u.id} onClick={() => setFilterAssignee(u.id)}>
                        {u.name}
                        {filterAssignee === u.id && <span className="text-atlas-amber ml-2">✓</span>}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
              <Menu
                trigger={
                  <button className="btn-ghost text-xs px-2.5 py-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5" /> Trier
                  </button>
                }
              >
                {(close) => (
                  <>
                    {(
                      [
                        ['due', 'Échéance'],
                        ['priority', 'Priorité'],
                        ['title', 'Titre A→Z'],
                        ['recent', 'Récent'],
                      ] as const
                    ).map(([k, label]) => (
                      <MenuItem
                        key={k}
                        onClick={() => {
                          setSort(k);
                          close();
                        }}
                      >
                        {label}
                        {sort === k && <span className="text-atlas-amber ml-2">✓</span>}
                      </MenuItem>
                    ))}
                  </>
                )}
              </Menu>
              <button
                onClick={() => pushToast({ kind: 'info', title: 'Personnalisation des vues à venir' })}
                className="btn-ghost text-xs px-2.5 py-1.5"
              >
                <Settings2 className="w-3.5 h-3.5" /> Vue
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="px-8 py-6">
        {/* Each board / tab is wrapped in its own SectionErrorBoundary so a
            crash inside (e.g. Gantt date math on a malformed task) doesn't
            collapse the whole project view — the user can still switch to
            another view and keep working. */}
        {tab === 'tasks' && taskView === 'kanban' && (
          <SectionErrorBoundary section="Le Kanban" scope="project:kanban">
            <KanbanBoard sections={sections} tasks={tasks} onOpenTask={onOpenTask} projectId={project.id} />
          </SectionErrorBoundary>
        )}
        {tab === 'tasks' && taskView === 'list' && (
          <SectionErrorBoundary section="La liste" scope="project:list">
            <ListBoard sections={sections} tasks={tasks} onOpenTask={onOpenTask} projectId={project.id} />
          </SectionErrorBoundary>
        )}
        {tab === 'tasks' && taskView === 'calendar' && (
          <SectionErrorBoundary section="Le calendrier" scope="project:calendar">
            <CalendarBoard tasks={tasks} onOpenTask={onOpenTask} />
          </SectionErrorBoundary>
        )}
        {tab === 'tasks' && taskView === 'gantt' && (
          <SectionErrorBoundary section="La timeline" scope="project:gantt">
            <GanttBoard sections={sections} tasks={tasks} />
          </SectionErrorBoundary>
        )}
        {tab === 'tasks' && taskView === 'table' && (
          <SectionErrorBoundary section="Le tableau" scope="project:table">
            <TableBoard tasks={tasks} onOpenTask={onOpenTask} />
          </SectionErrorBoundary>
        )}
        {tab === 'notes' && (
          <SectionErrorBoundary section="Les notes" scope="project:notes">
            <ProjectNotesTab projectId={project.id} />
          </SectionErrorBoundary>
        )}
        {tab === 'files' && (
          <SectionErrorBoundary section="Les fichiers" scope="project:files">
            <ProjectFilesTab projectId={project.id} />
          </SectionErrorBoundary>
        )}
        {tab === 'brief' && (
          <SectionErrorBoundary section="Le brief PROPH3T" scope="project:brief">
            <ProjectBriefTab project={project} tasks={tasks} />
          </SectionErrorBoundary>
        )}
        {tab === 'dashboard' && (
          <SectionErrorBoundary section="Le dashboard" scope="project:dashboard">
            <ProjectDashboardTab project={project} tasks={tasks} sections={sections} />
          </SectionErrorBoundary>
        )}
        {tab === 'goals' && (
          <SectionErrorBoundary section="Les goals" scope="project:goals">
            <ProjectGoalsTab project={project} />
          </SectionErrorBoundary>
        )}
        {tab === 'activity' && (
          <SectionErrorBoundary section="L'activité" scope="project:activity">
            <ActivityFeed projectId={project.id} />
          </SectionErrorBoundary>
        )}
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white border border-atlas-line">
      {children}
    </span>
  );
}

function KanbanBoard({
  sections,
  tasks,
  onOpenTask,
  projectId,
}: {
  sections: Section[];
  tasks: Task[];
  onOpenTask: (t: Task) => void;
  projectId: string;
}) {
  const openModal = useApp((s) => s.openModal);
  const moveTask = useApp((s) => s.moveTask);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const draggingTask = draggingId ? tasks.find((t) => t.id === draggingId) : null;

  const onDragEnd = (e: DragEndEvent) => {
    setDraggingId(null);
    if (!e.over) return;
    const taskId = String(e.active.id);
    const overId = String(e.over.id);
    const targetSectionId = overId.startsWith('section-')
      ? overId.slice(8)
      : tasks.find((t) => t.id === overId)?.sectionId;
    if (targetSectionId) moveTask(taskId, targetSectionId);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setDraggingId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div
        className="grid grid-flow-col auto-cols-[280px] sm:auto-cols-[320px] gap-3 sm:gap-4 overflow-x-auto pb-4 -mx-1 px-1 snap-x snap-mandatory scroll-smooth"
        style={{ scrollPaddingLeft: '0.25rem' }}
      >
        {sections.map((section) => {
          const colTasks = tasks.filter((t) => t.sectionId === section.id);
          return (
            <KanbanColumn
              key={section.id}
              section={section}
              colTasks={colTasks}
              projectId={projectId}
              onOpenTask={onOpenTask}
              openModal={openModal}
              draggingId={draggingId}
            />
          );
        })}
      </div>
      <DragOverlay>
        {draggingTask ? <KanbanCard task={draggingTask} onOpenTask={() => {}} index={0} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  section,
  colTasks,
  projectId,
  onOpenTask,
  openModal,
  draggingId,
}: {
  section: Section;
  colTasks: Task[];
  projectId: string;
  onOpenTask: (t: Task) => void;
  openModal: any;
  draggingId: string | null;
}) {
  const isWipBreached = section.wipLimit && colTasks.length > section.wipLimit;
  const { setNodeRef, isOver } = useDroppable({ id: `section-${section.id}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col bg-atlas-panel/80 backdrop-blur-md border rounded-2xl overflow-hidden transition-colors snap-start',
        isOver ? 'border-atlas-amber/60 ring-2 ring-atlas-amber/20' : 'border-atlas-line'
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.04]">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full" style={{ background: section.color }} />
          <span className="text-sm font-medium text-atlas-fg-1">{section.name}</span>
          <span className="text-2xs font-mono text-atlas-fg-3">{colTasks.length}</span>
          {section.wipLimit && (
            <span
              className={cn(
                'chip border',
                isWipBreached
                  ? 'border-signal-red/40 text-signal-red bg-signal-red/10'
                  : 'border-atlas-line text-atlas-fg-3 bg-black/[0.03]'
              )}
            >
              WIP {section.wipLimit}
            </span>
          )}
        </div>
        <button
          onClick={() => openModal('task-create', { projectId, sectionId: section.id })}
          className="text-atlas-fg-3 hover:text-atlas-amber w-6 h-6 rounded-md hover:bg-black/[0.04] flex items-center justify-center"
          title="Ajouter une tâche"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 p-2 space-y-2 max-h-[640px] overflow-y-auto min-h-[120px]">
        {colTasks.map((t, i) => (
          <DraggableKanbanCard
            key={t.id}
            task={t}
            onOpenTask={onOpenTask}
            index={i}
            hidden={t.id === draggingId}
          />
        ))}
        <button
          onClick={() => openModal('task-create', { projectId, sectionId: section.id })}
          className="w-full px-3 py-2 rounded-lg text-xs text-atlas-fg-3 hover:text-atlas-fg-1 hover:bg-black/[0.03] flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Ajouter une tâche
        </button>
      </div>
    </div>
  );
}

function DraggableKanbanCard({
  task,
  onOpenTask,
  index,
  hidden,
}: {
  task: Task;
  onOpenTask: (t: Task) => void;
  index: number;
  hidden?: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} className={cn(hidden && 'opacity-30')} {...attributes}>
      <KanbanCard task={task} onOpenTask={onOpenTask} index={index} dragHandle={listeners} />
    </div>
  );
}

function KanbanCard({
  task,
  onOpenTask,
  index,
  dragHandle,
  dragging,
}: {
  task: Task;
  onOpenTask: (t: Task) => void;
  index: number;
  dragHandle?: any;
  dragging?: boolean;
}) {
  const users = useApp((s) => s.users);
  // IMPORTANT: select the raw array, derive at render time. A selector
  // that returns `arr.filter(...)` produces a new array each call which
  // Zustand interprets as a state change → infinite re-render loop.
  const allSubtasks = useApp((s) => s.subtasks);
  const subtasks = allSubtasks.filter((st) => st.taskId === task.id);
  const toggleDone = useApp((s) => s.toggleTaskDone);
  const openModal = useApp((s) => s.openModal);
  const deleteTask = useApp((s) => s.deleteTask);
  const assignees = task.assignees.map((id) => users.find((u) => u.id === id) || users[0]);
  const subtasksDone = subtasks.filter((s) => s.done).length;
  const subtaskPct = subtasks.length ? (subtasksDone / subtasks.length) * 100 : 0;

  return (
    <article
      className={cn(
        'group relative rounded-xl bg-white border border-atlas-line p-3 hover:border-atlas-amber/40 hover:shadow-panel transition-all',
        dragging && 'rotate-2 shadow-soft-pop ring-2 ring-atlas-amber/40'
      )}
      style={{
        animation: dragging
          ? undefined
          : `fade-in-up 320ms ${index * 30}ms cubic-bezier(0.22,1,0.36,1) backwards`,
      }}
    >
      <div onClick={() => onOpenTask(task)} className="cursor-pointer">
        <div className="flex items-start gap-2">
          {dragHandle && (
            <button
              {...dragHandle}
              className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-atlas-fg-3 hover:text-atlas-fg-1 -ml-1 mt-0.5"
              title="Glisser-déposer"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleDone(task.id);
            }}
            className={cn(
              'checkbox-task mt-0.5 shrink-0',
              task.status === 'done' && 'bg-amber-gradient border-atlas-amber'
            )}
          >
            {task.status === 'done' && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
          </button>
          <PriorityBadge priority={task.priority} compact />
          <h4
            className={cn(
              'flex-1 text-[13.5px] font-medium leading-snug transition-colors',
              task.status === 'done'
                ? 'text-atlas-fg-3 line-through'
                : 'text-atlas-fg-1 group-hover:text-atlas-amber-deep'
            )}
          >
            {task.title}
          </h4>
        </div>
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={task.status} size="xs" />
          {task.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="chip bg-black/[0.04] text-atlas-fg-2 border border-atlas-line text-[9px]"
            >
              #{tag}
            </span>
          ))}
        </div>
        {subtasks.length > 0 && (
          <div className="mt-2.5">
            <ProgressBar value={subtaskPct} />
            <div className="mt-1 flex items-center justify-between text-2xs text-atlas-fg-3">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                {subtasksDone}/{subtasks.length} sous-tâches
              </span>
              <span className="font-mono">{Math.round(subtaskPct)}%</span>
            </div>
          </div>
        )}
        {task.estimatedMinutes && task.actualMinutes && (
          <div className="mt-2">
            <div className="h-1 rounded-full bg-black/[0.05] overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full',
                  task.actualMinutes > task.estimatedMinutes ? 'bg-signal-red' : 'bg-amber-gradient'
                )}
                style={{ width: `${Math.min(100, (task.actualMinutes / task.estimatedMinutes) * 100)}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-2xs text-atlas-fg-3">
              <span>
                {Math.round((task.actualMinutes / 60) * 10) / 10}h /{' '}
                {Math.round((task.estimatedMinutes / 60) * 10) / 10}h
              </span>
              <span>{Math.round((task.actualMinutes / task.estimatedMinutes) * 100)}% temps</span>
            </div>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-2xs text-atlas-fg-3">
            {task.dueDate && (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(task.dueDate)}
              </span>
            )}
            {task.commentCount ? (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {task.commentCount}
              </span>
            ) : null}
            {task.attachmentCount ? (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="w-3 h-3" />
                {task.attachmentCount}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <AvatarGroup users={assignees} size="xs" max={3} />
            <Menu
              trigger={
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-md hover:bg-black/[0.05] flex items-center justify-center"
                >
                  <MoreHorizontal className="w-3.5 h-3.5 text-atlas-fg-3" />
                </button>
              }
              width={180}
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={Edit3}
                    onClick={() => {
                      close();
                      openModal('task-edit', task);
                    }}
                  >
                    Modifier
                  </MenuItem>
                  <MenuItem
                    icon={CheckCircle2}
                    onClick={() => {
                      close();
                      toggleDone(task.id);
                    }}
                  >
                    {task.status === 'done' ? 'Rouvrir' : 'Terminer'}
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem
                    danger
                    icon={Trash2}
                    onClick={() => {
                      close();
                      deleteTask(task.id);
                    }}
                  >
                    Supprimer
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>
      </div>
    </article>
  );
}

function ListBoard({
  sections,
  tasks,
  onOpenTask,
  projectId,
}: {
  sections: Section[];
  tasks: Task[];
  onOpenTask: (t: Task) => void;
  projectId: string;
}) {
  const users = useApp((s) => s.users);
  const toggleDone = useApp((s) => s.toggleTaskDone);
  const openModal = useApp((s) => s.openModal);

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const colTasks = tasks.filter((t) => t.sectionId === section.id);
        return (
          <div key={section.id}>
            <div className="flex items-center gap-2.5 mb-2 px-1">
              <ChevronRight className="w-4 h-4 text-atlas-fg-3 rotate-90" />
              <span className="w-2 h-2 rounded-full" style={{ background: section.color }} />
              <h3 className="text-sm font-medium text-atlas-fg-1">{section.name}</h3>
              <span className="text-2xs font-mono text-atlas-fg-3">{colTasks.length}</span>
              <button
                onClick={() => openModal('task-create', { projectId, sectionId: section.id })}
                className="ml-auto text-2xs text-atlas-fg-3 hover:text-atlas-fg-1 inline-flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Ajouter
              </button>
            </div>
            <div className="rounded-xl overflow-hidden border border-atlas-line">
              <div className="grid grid-cols-[24px_1fr_110px_140px_180px_110px_120px_140px] px-3 py-2 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium bg-black/[0.02]">
                <span></span>
                <span>Titre</span>
                <span>Statut</span>
                <span>Avancement</span>
                <span>Assigné</span>
                <span>Échéance</span>
                <span>Priorité</span>
                <span>Estimé / Réel</span>
              </div>
              <div className="divide-y divide-atlas-line">
                {colTasks.map((t) => (
                  <ListRow
                    key={t.id}
                    task={t}
                    users={users}
                    onOpenTask={onOpenTask}
                    toggleDone={toggleDone}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListRow({
  task: t,
  users,
  onOpenTask,
  toggleDone,
}: {
  task: Task;
  users: any[];
  onOpenTask: (t: Task) => void;
  toggleDone: (id: string) => void;
}) {
  // Same anti-pattern fix as KanbanCard above — select raw, derive at render.
  const allSubtasks = useApp((s) => s.subtasks);
  const subtasks = allSubtasks.filter((st) => st.taskId === t.id);
  const subPct = subtasks.length
    ? (subtasks.filter((s) => s.done).length / subtasks.length) * 100
    : t.status === 'done'
      ? 100
      : 0;
  const checked = t.status === 'done';
  return (
    <div
      className="group grid grid-cols-[24px_1fr_110px_140px_180px_110px_120px_140px] items-center gap-3 px-3 py-2.5 hover:bg-black/[0.02] cursor-pointer"
      onClick={() => onOpenTask(t)}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleDone(t.id);
        }}
        className="flex items-center justify-center"
        aria-label="Marquer terminée"
      >
        {checked ? (
          <CheckCircle2 className="w-4 h-4 text-atlas-amber" strokeWidth={2} />
        ) : (
          <Circle
            className="w-4 h-4 text-atlas-fg-3 group-hover:text-atlas-amber transition-colors"
            strokeWidth={1.6}
          />
        )}
      </button>
      <span
        className={cn(
          'text-sm font-medium truncate',
          checked ? 'text-atlas-fg-3 line-through' : 'text-atlas-fg-1'
        )}
      >
        {t.title}
      </span>
      <StatusBadge status={t.status} size="xs" />
      <ProgressBar value={subPct} showLabel />
      <AvatarGroup
        users={t.assignees.map((id) => users.find((u) => u.id === id) || users[0])}
        size="xs"
        max={3}
      />
      <span className="text-xs text-atlas-fg-2">{t.dueDate ? formatDate(t.dueDate) : '—'}</span>
      <PriorityBadge priority={t.priority} />
      <span className="text-2xs font-mono text-atlas-fg-3">
        {t.estimatedMinutes ? `${Math.round((t.estimatedMinutes / 60) * 10) / 10}h` : '—'} /{' '}
        {t.actualMinutes ? `${Math.round((t.actualMinutes / 60) * 10) / 10}h` : '—'}
      </span>
    </div>
  );
}

function CalendarBoard({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (t: Task) => void }) {
  const [cursor, setCursor] = useState<Date>(new Date());
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const start = new Date(monthStart);
  start.setDate(monthStart.getDate() - startOffset);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const dayTasks = (d: Date) =>
    tasks.filter((t) => t.dueDate && new Date(t.dueDate).toDateString() === d.toDateString());
  const today = new Date();

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.05]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() - 1);
              setCursor(d);
            }}
            className="btn-ghost !p-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCursor(new Date())} className="btn-secondary text-xs px-3 py-1">
            Aujourd'hui
          </button>
          <button
            onClick={() => {
              const d = new Date(cursor);
              d.setMonth(d.getMonth() + 1);
              setCursor(d);
            }}
            className="btn-ghost !p-1.5"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="text-sm font-medium text-atlas-fg-1 capitalize">
          {cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </div>
        <div />
      </div>
      <div className="grid grid-cols-7 border-b border-black/[0.05]">
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
          <div
            key={d}
            className="px-3 py-2 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium border-r border-black/[0.04] last:border-0"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {days.map((d, i) => {
          const isToday = d.toDateString() === today.toDateString();
          const isCurrentMonth = d.getMonth() === cursor.getMonth();
          const ts = dayTasks(d);
          return (
            <div
              key={i}
              className={cn(
                'min-h-[110px] border-r border-b border-black/[0.04] last-of-type:border-r-0 p-2 transition-colors',
                !isCurrentMonth && 'opacity-40',
                isToday && 'bg-atlas-amber/[0.08]'
              )}
            >
              <div
                className={cn(
                  'text-xs font-mono mb-1',
                  isToday ? 'text-atlas-amber font-medium' : 'text-atlas-fg-3'
                )}
              >
                {d.getDate()}
              </div>
              <div className="space-y-1">
                {ts.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onOpenTask(t)}
                    className="w-full text-left text-2xs truncate px-1.5 py-0.5 rounded-md text-atlas-fg-1 hover:brightness-110"
                    style={{
                      background: `${['#A4A99B', '#8AA6C4', '#D6B868', '#D77564'][t.priority - 1]}33`,
                      borderLeft: `2px solid ${['#A4A99B', '#8AA6C4', '#D6B868', '#D77564'][t.priority - 1]}`,
                    }}
                  >
                    {t.title}
                  </button>
                ))}
                {ts.length > 3 && <div className="text-2xs text-atlas-fg-3 px-1">+{ts.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GanttBoard({ sections, tasks }: { sections: Section[]; tasks: Task[] }) {
  const days = 28;
  const dayWidth = 32;
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const dayDate = (i: number) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  };

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 320 + days * dayWidth }}>
          <div
            className="grid sticky top-0 z-10 bg-atlas-panel/95 backdrop-blur"
            style={{ gridTemplateColumns: `320px ${days * dayWidth}px` }}
          >
            <div className="px-4 py-3 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium border-b border-r border-black/[0.05]">
              Tâche
            </div>
            <div className="border-b border-black/[0.05] flex">
              {Array.from({ length: days }).map((_, i) => {
                const d = dayDate(i);
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={i}
                    style={{ width: dayWidth }}
                    className={cn(
                      'text-2xs text-center py-2 border-r border-black/[0.03]',
                      isToday && 'bg-atlas-amber/10 text-atlas-amber font-medium'
                    )}
                  >
                    <div className="text-atlas-fg-3 uppercase">
                      {['D', 'L', 'M', 'M', 'J', 'V', 'S'][d.getDay()]}
                    </div>
                    <div className={cn('font-mono', isToday ? 'text-atlas-amber' : 'text-atlas-fg-2')}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="divide-y divide-atlas-line">
            {sections.map((s) => {
              const ts = tasks.filter((t) => t.sectionId === s.id && t.dueDate);
              return (
                <div key={s.id}>
                  <div className="px-4 py-2 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </div>
                  {ts.map((t, i) => {
                    const startD = t.startDate ? new Date(t.startDate) : new Date(t.dueDate!);
                    const endD = new Date(t.dueDate!);
                    const startOffset = Math.max(
                      0,
                      Math.floor((startD.getTime() - start.getTime()) / 86400000)
                    );
                    const length = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / 86400000) + 1);
                    return (
                      <div
                        key={t.id}
                        className="grid items-center hover:bg-black/[0.02]"
                        style={{ gridTemplateColumns: `320px ${days * dayWidth}px` }}
                      >
                        <div className="px-4 py-2 border-r border-black/[0.04] flex items-center gap-2">
                          <PriorityBadge priority={t.priority} compact />
                          <span className="text-sm truncate text-atlas-fg-1">{t.title}</span>
                        </div>
                        <div
                          className="relative h-9"
                          style={{
                            animation: `fade-in-up 320ms ${i * 40}ms cubic-bezier(0.22,1,0.36,1) backwards`,
                          }}
                        >
                          <div
                            className="absolute top-1.5 bottom-1.5 rounded-md flex items-center px-2 text-2xs font-medium text-white"
                            style={{
                              left: startOffset * dayWidth + 2,
                              width: length * dayWidth - 4,
                              background: `linear-gradient(90deg, ${['#A4A99B', '#A4A99B', '#8AA6C4', '#D6B868', '#D77564'][t.priority]}cc, ${['#A4A99B', '#A4A99B', '#8AA6C4', '#D6B868', '#D77564'][t.priority]}88)`,
                              boxShadow: `0 6px 16px -8px ${['#A4A99B', '#A4A99B', '#8AA6C4', '#D6B868', '#D77564'][t.priority]}aa`,
                            }}
                          >
                            <span className="truncate">
                              {Math.round(
                                ((t.actualMinutes || 0) / Math.max(1, t.estimatedMinutes || 1)) * 100
                              )}
                              %
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TableBoard({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (t: Task) => void }) {
  const users = useApp((s) => s.users);
  return (
    <div className="panel overflow-hidden">
      <div className="grid grid-cols-[28px_2fr_120px_120px_140px_140px_120px_100px_100px] px-4 py-2.5 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium bg-black/[0.02] border-b border-black/[0.04]">
        <span></span>
        <span>Tâche</span>
        <span>Statut</span>
        <span>Priorité</span>
        <span>Assignés</span>
        <span>Échéance</span>
        <span>Sprint</span>
        <span>Effort</span>
        <span>Surface</span>
      </div>
      <div className="divide-y divide-atlas-line">
        {tasks.map((t) => (
          <button
            key={t.id}
            onClick={() => onOpenTask(t)}
            className="group w-full grid grid-cols-[28px_2fr_120px_120px_140px_140px_120px_100px_100px] items-center px-4 py-2.5 text-left hover:bg-black/[0.02]"
          >
            <span
              className={cn(
                'w-3.5 h-3.5 rounded-full',
                t.status === 'done'
                  ? 'bg-signal-green/30 border border-signal-green'
                  : 'border border-atlas-line-2'
              )}
            />
            <div className="min-w-0">
              <div
                className={cn(
                  'text-sm font-medium truncate',
                  t.status === 'done' ? 'line-through text-atlas-fg-3' : 'text-atlas-fg-1'
                )}
              >
                {t.title}
              </div>
              <div className="text-2xs text-atlas-fg-3 truncate">{t.tags.map((x) => `#${x}`).join('  ')}</div>
            </div>
            <span className="chip bg-black/[0.04] text-atlas-fg-2 border border-atlas-line">
              {t.status.replace('_', ' ')}
            </span>
            <PriorityBadge priority={t.priority} />
            <AvatarGroup
              users={t.assignees.map((id) => users.find((u) => u.id === id) || users[0])}
              size="xs"
              max={3}
            />
            <span className="text-xs text-atlas-fg-2">{t.dueDate ? formatDate(t.dueDate) : '—'}</span>
            <span className="text-2xs font-mono text-atlas-fg-3">
              {(t.customFields?.['Sprint'] as string) || '—'}
            </span>
            <span className="text-2xs font-mono text-atlas-fg-2">
              {(t.customFields?.['Effort'] as number) || '—'}
            </span>
            <span className="text-2xs font-mono text-atlas-fg-3">
              {(t.customFields?.['Surface'] as string) || '—'}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityFeed({ projectId }: { projectId: string }) {
  const allActivity = useApp((s) => s.activity);
  const tasks = useApp((s) => s.tasks);
  const users = useApp((s) => s.users);
  const events = allActivity.filter(
    (e) =>
      e.projectId === projectId || (e.taskId && tasks.find((t) => t.id === e.taskId)?.projectId === projectId)
  );
  return (
    <div className="panel p-6 max-w-3xl">
      <h3 className="font-display text-lg font-medium mb-4">Activité du projet</h3>
      <div className="space-y-1">
        {events.map((e) => {
          const actor = users.find((u) => u.id === e.actorId) || users[0];
          return (
            <div key={e.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-black/[0.03]">
              <span
                className="w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center text-white"
                style={{ background: actor.color }}
              >
                {actor.initials}
              </span>
              <div className="flex-1">
                <div className="text-sm text-atlas-fg-1">
                  <span className="font-medium">{actor.name}</span> {e.verb}{' '}
                  {e.target && <span className="font-medium">{e.target}</span>}
                </div>
                <div className="text-2xs text-atlas-fg-3">{new Date(e.at).toLocaleString('fr-FR')}</div>
              </div>
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="text-2xs text-atlas-fg-3 italic text-center py-8">
            Pas d'activité enregistrée pour ce projet.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── Project Notes Tab ─────────── */
function ProjectNotesTab({ projectId }: { projectId: string }) {
  const noteRecord = useApp((s) => s.notes.find((n) => n.taskId === `project_${projectId}`));
  const setNote = useApp((s) => s.setNote);
  const pushToast = useApp((s) => s.pushToast);
  const [draft, setDraft] = useState(noteRecord?.markdown || '');
  const [editing, setEditing] = useState(!noteRecord);
  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium inline-flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" /> Notes de projet — markdown enrichi
        </h3>
        {editing ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditing(false);
                setDraft(noteRecord?.markdown || '');
              }}
              className="btn-ghost text-xs px-2.5 py-1.5"
            >
              Annuler
            </button>
            <button
              onClick={() => {
                setNote(`project_${projectId}`, draft);
                setEditing(false);
                pushToast({ kind: 'success', title: 'Notes enregistrées' });
              }}
              className="btn-primary text-xs px-3 py-1.5"
            >
              Enregistrer
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="btn-secondary text-xs px-3 py-1.5">
            <Edit3 className="w-3 h-3" /> Modifier
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={20}
          placeholder="# Vision du projet&#10;&#10;Documentez l'objectif, les contraintes, les décisions clés…"
          className="w-full px-4 py-3 rounded-xl bg-white border border-atlas-line text-sm text-atlas-fg-1 placeholder:text-atlas-fg-3 outline-none focus:border-atlas-amber focus:ring-2 focus:ring-atlas-amber/20 font-mono leading-relaxed"
        />
      ) : (
        <div className="bg-white border border-atlas-line rounded-xl p-6">
          {noteRecord?.markdown ? (
            <SimpleMarkdown source={noteRecord.markdown} />
          ) : (
            <div className="text-center py-12 text-sm text-atlas-fg-3">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              Aucune note projet.
              <br />
              <button onClick={() => setEditing(true)} className="text-atlas-amber-deep hover:underline mt-2">
                Commencer à écrire
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SimpleMarkdown({ source }: { source: string }) {
  return (
    <div className="prose-sm space-y-2">
      {source.split('\n').map((line, i) => {
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
        if (line.startsWith('- '))
          return (
            <li key={i} className="text-sm text-atlas-fg-2 ml-4 list-disc">
              {line.slice(2)}
            </li>
          );
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return (
          <p key={i} className="text-sm text-atlas-fg-2 leading-relaxed">
            {line}
          </p>
        );
      })}
    </div>
  );
}

/* ─────────── Project Files Tab ─────────── */
function ProjectFilesTab({ projectId }: { projectId: string }) {
  const allAttachments = useApp((s) => s.attachments);
  const tasks = useApp((s) => s.tasks);
  const projectAttachments = allAttachments.filter(
    (a) => tasks.find((t) => t.id === a.taskId)?.projectId === projectId
  );
  const pushToast = useApp((s) => s.pushToast);

  const map: Record<string, { icon: any; cls: string }> = {
    pdf: { icon: FileText, cls: 'bg-signal-red/15 text-signal-red border-signal-red/30' },
    img: { icon: ImageIcon, cls: 'bg-signal-blue/15 text-signal-blue border-signal-blue/30' },
    doc: { icon: FileText, cls: 'bg-atlas-amber/15 text-atlas-amber-deep border-atlas-amber/30' },
    csv: { icon: FileSpreadsheet, cls: 'bg-signal-green/15 text-signal-green border-signal-green/30' },
    link: { icon: Star, cls: 'bg-signal-violet/15 text-signal-violet border-signal-violet/30' },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium inline-flex items-center gap-2">
          <Paperclip className="w-3.5 h-3.5" /> Pièces jointes du projet · {projectAttachments.length}
        </h3>
        <button
          onClick={() =>
            pushToast({
              kind: 'info',
              title: 'Téléversement',
              body: 'Allez dans une tâche pour ajouter une pièce jointe',
            })
          }
          className="btn-secondary text-xs px-3 py-1.5"
        >
          <Plus className="w-3 h-3" /> Ajouter
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {projectAttachments.map((a) => {
          const cfg = map[a.kind] || map.doc;
          const Icon = cfg.icon;
          const task = tasks.find((t) => t.id === a.taskId);
          return (
            <div key={a.id} className="group panel p-3 flex items-center gap-3 hover:border-atlas-line-2">
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center border', cfg.cls)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-atlas-fg-1 truncate">{a.name}</div>
                <div className="text-2xs text-atlas-fg-3 truncate">
                  {a.size} · sur "{task?.title}"
                </div>
              </div>
              <button className="btn-ghost !p-1.5 opacity-0 group-hover:opacity-100">
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
        {projectAttachments.length === 0 && (
          <div className="col-span-full panel p-10 text-center">
            <Paperclip className="w-8 h-8 mx-auto text-atlas-fg-3 mb-2" />
            <h3 className="text-sm font-medium text-atlas-fg-1">Aucune pièce jointe</h3>
            <p className="text-2xs text-atlas-fg-3 mt-1">
              Les fichiers ajoutés sur les tâches de ce projet apparaîtront ici.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── Project Brief Tab ─────────── */
function ProjectBriefTab({ project, tasks }: { project: Project; tasks: Task[] }) {
  const insights = useApp((s) => s.insights);
  const pushToast = useApp((s) => s.pushToast);
  const completionRate = tasks.length
    ? Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100)
    : 0;
  const overdue = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done'
  ).length;
  const critical = tasks.filter((t) => t.priority === 4 && t.status !== 'done').length;

  return (
    <div className="max-w-4xl space-y-5">
      <div className="rounded-2xl border border-atlas-amber/25 bg-gradient-to-br from-atlas-amber/[0.10] to-transparent p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-atlas-amber-deep" />
          <span className="text-2xs uppercase tracking-wider font-medium text-atlas-amber-deep">
            Synthèse PROPH3T · {project.name}
          </span>
        </div>
        <p className="text-sm text-atlas-fg-1 leading-relaxed">
          Le projet est <strong>{completionRate}%</strong> complété (
          {tasks.filter((t) => t.status === 'done').length}/{tasks.length} tâches). Santé actuelle :{' '}
          <strong
            className={cn(
              project.health === 'green'
                ? 'text-signal-green'
                : project.health === 'yellow'
                  ? 'text-signal-yellow'
                  : 'text-signal-red'
            )}
          >
            {project.health}
          </strong>
          .
          {critical > 0 && (
            <>
              {' '}
              {critical} tâche{critical > 1 ? 's' : ''} critique{critical > 1 ? 's' : ''} en cours.
            </>
          )}
          {overdue > 0 && (
            <>
              {' '}
              <strong className="text-signal-red">{overdue} en retard</strong>.
            </>
          )}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => pushToast({ kind: 'info', title: 'PROPH3T régénère le brief…' })}
            className="btn-secondary text-xs px-2.5 py-1.5"
          >
            <Sparkles className="w-3 h-3" /> Régénérer
          </button>
          <button
            onClick={() => pushToast({ kind: 'success', title: 'Brief envoyé par WhatsApp' })}
            className="btn-secondary text-xs px-2.5 py-1.5"
          >
            Partager
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Tâches" value={String(tasks.length)} />
        <Stat label="Complétées" value={String(tasks.filter((t) => t.status === 'done').length)} />
        <Stat label="Critiques" value={String(critical)} accent={critical > 0 ? 'red' : 'default'} />
        <Stat label="En retard" value={String(overdue)} accent={overdue > 0 ? 'red' : 'default'} />
      </div>

      <div className="panel p-5">
        <h3 className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-3">
          Insights PROPH3T sur ce projet
        </h3>
        <ul className="space-y-2">
          {insights.slice(0, 3).map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-atlas-amber mt-1.5 shrink-0" />
              <div>
                <div className="font-medium text-atlas-fg-1">{i.title}</div>
                <div className="text-xs text-atlas-fg-3">{i.body}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'red' | 'default' }) {
  return (
    <div className={cn('panel p-4', accent === 'red' && 'border-signal-red/30 bg-signal-red/[0.05]')}>
      <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">{label}</div>
      <div
        className={cn(
          'font-display text-2xl font-medium mt-1 tabular-nums',
          accent === 'red' ? 'text-signal-red' : 'text-atlas-fg-1'
        )}
      >
        {value}
      </div>
    </div>
  );
}

/* ─────────── Project Dashboard Tab ─────────── */
function ProjectDashboardTab({
  project,
  tasks,
  sections,
}: {
  project: Project;
  tasks: Task[];
  sections: Section[];
}) {
  const completed = tasks.filter((t) => t.status === 'done').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const inReview = tasks.filter((t) => t.status === 'in_review').length;
  const todo = tasks.filter((t) => t.status === 'todo').length;
  const total = tasks.length || 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Avancement" value={`${project.progress}%`} />
        <Stat label="Tâches" value={String(tasks.length)} />
        <Stat label="Membres" value={String(project.membersIds.length)} />
        <Stat
          label="Santé"
          value={project.health.toUpperCase()}
          accent={project.health !== 'green' ? 'red' : 'default'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel p-5">
          <h3 className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-4">
            Répartition par statut
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Terminé', n: completed, color: '#4D9A6A' },
              { label: 'En cours', n: inProgress, color: '#6E8B58' },
              { label: 'En revue', n: inReview, color: '#5C7BA1' },
              { label: 'À faire', n: todo, color: '#A4A99B' },
            ].map((d) => (
              <div key={d.label} className="grid grid-cols-[100px_1fr_40px] items-center gap-3">
                <span className="text-xs text-atlas-fg-2 inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                  {d.label}
                </span>
                <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(d.n / total) * 100}%`, background: d.color }}
                  />
                </div>
                <span className="text-2xs font-mono text-atlas-fg-3 text-right">{d.n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-5">
          <h3 className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-4">
            Tâches par section
          </h3>
          <div className="space-y-2">
            {sections.map((sec) => {
              const n = tasks.filter((t) => t.sectionId === sec.id).length;
              return (
                <div key={sec.id} className="grid grid-cols-[100px_1fr_40px] items-center gap-3">
                  <span className="text-xs text-atlas-fg-2 inline-flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-sm" style={{ background: sec.color }} />
                    {sec.name}
                  </span>
                  <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(n / total) * 100}%`, background: sec.color }}
                    />
                  </div>
                  <span className="text-2xs font-mono text-atlas-fg-3 text-right">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Project Goals Tab ─────────── */
function ProjectGoalsTab({ project }: { project: Project }) {
  const goals = useApp((s) => s.goals);
  const openModal = useApp((s) => s.openModal);
  // Show all goals (we don't have project_id on goals yet — could be filtered by tags or owner)
  const owned = goals.filter((g) => g.ownerId === project.ownerId);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium inline-flex items-center gap-2">
          <Target className="w-3.5 h-3.5" /> Goals liés · {owned.length}
        </h3>
        <button onClick={() => openModal('goal-create')} className="btn-primary text-xs px-3 py-1.5">
          <Plus className="w-3 h-3" /> Lier un goal
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {owned.map((g) => {
          const pct = (g.currentValue / Math.max(1, g.targetValue)) * 100;
          const ringColor = g.health === 'green' ? '#4D9A6A' : g.health === 'yellow' ? '#B69248' : '#B85B4D';
          return (
            <div key={g.id} className="panel p-4 hover:border-atlas-line-2">
              <div className="flex items-start gap-2 mb-2">
                <span className="chip border border-atlas-line bg-black/[0.04] text-atlas-fg-3">
                  {g.level}
                </span>
                <span className="chip border border-atlas-line bg-black/[0.04] text-atlas-fg-3">
                  {g.period}
                </span>
              </div>
              <div className="text-sm font-medium text-atlas-fg-1">{g.title}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-black/[0.05] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, pct)}%`, background: ringColor }}
                  />
                </div>
                <span className="text-2xs font-mono text-atlas-fg-2">{Math.round(pct)}%</span>
              </div>
            </div>
          );
        })}
        {owned.length === 0 && (
          <div className="col-span-full panel p-10 text-center">
            <Target className="w-8 h-8 mx-auto text-atlas-fg-3 mb-2" />
            <h3 className="text-sm font-medium text-atlas-fg-1">Aucun goal lié</h3>
            <p className="text-2xs text-atlas-fg-3 mt-1">Liez des goals pour suivre l'impact de ce projet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
