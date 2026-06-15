import { useMemo, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronRight,
  FolderTree,
  Plus,
  FolderPlus,
  ClipboardList,
  Folder as FolderIcon,
  Compass,
  FileText,
  Wallet,
  Sparkles,
  TrendingUp,
  Sunrise,
  BookOpen,
  MoreHorizontal,
  Edit3,
  Trash2,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  type LucideIcon,
} from 'lucide-react';
import type { ViewKey, Project, User, Folder } from '../../types';
import { useApp } from '../../stores/appStore';
import { AvatarGroup } from '../ui/Avatar';
import { ProgressBar } from '../ui/StatusBadge';
import { HealthDot } from '../ui/HealthDot';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import { cn, formatDate } from '../../lib/utils';

const projectIcons: Record<string, LucideIcon> = {
  Compass,
  FileText,
  Wallet,
  Sparkles,
  TrendingUp,
  Sunrise,
  BookOpen,
};

const STATUS: Record<Project['status'], { label: string; cls: string }> = {
  active: { label: 'Actif', cls: 'text-signal-green bg-signal-green/10' },
  paused: { label: 'En pause', cls: 'text-atlas-amber-deep bg-atlas-amber/10' },
  archived: { label: 'Archivé', cls: 'text-atlas-fg-3 bg-black/[0.05]' },
  completed: { label: 'Terminé', cls: 'text-signal-blue bg-signal-blue/10' },
};

// Shared 7-column grid template so folder rows, project rows and the
// header all align: Nom · Statut · Santé · Avancement · Tâches · Échéance · Équipe.
const COLS = 'grid grid-cols-[minmax(200px,1fr)_104px_60px_150px_72px_104px_104px] gap-3 items-center';

interface Props {
  onNavigate: (view: ViewKey, projectId?: string) => void;
}

export function ProjectsView({ onNavigate }: Props) {
  const folders = useApp((s) => s.folders);
  const projects = useApp((s) => s.projects);
  const tasks = useApp((s) => s.tasks);
  const users = useApp((s) => s.users);
  const openModal = useApp((s) => s.openModal);
  const deleteProject = useApp((s) => s.deleteProject);
  const moveProjectToFolder = useApp((s) => s.moveProjectToFolder);
  const reorderFolders = useApp((s) => s.reorderFolders);

  // 5px threshold so un clic ordinaire (ouvrir un projet, replier un
  // dossier) n'est pas accidentellement interprété comme un drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setDraggingProjectId(null);
    setDraggingFolderId(null);
    if (!overId || activeId === overId) return;

    // Projet → dossier (ou dossier-__none__ pour retirer du dossier)
    if (activeId.startsWith('project-') && overId.startsWith('folder-')) {
      const projectId = activeId.slice('project-'.length);
      const target = overId.slice('folder-'.length);
      moveProjectToFolder(projectId, target === '__none__' ? '' : target);
      return;
    }
    // Réordonner les dossiers
    if (activeId.startsWith('folder-') && overId.startsWith('folder-')) {
      const from = activeId.slice('folder-'.length);
      const to = overId.slice('folder-'.length);
      const ids = folders.map((f) => f.id);
      const fromIdx = ids.indexOf(from);
      const toIdx = ids.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [...ids];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      reorderFolders(next);
      return;
    }
  };

  const sortedFolders = useMemo(
    () =>
      [...folders].sort(
        (a, b) => ((a as { order?: number }).order ?? 0) - ((b as { order?: number }).order ?? 0)
      ),
    [folders]
  );

  const bySphere = useMemo(() => {
    const personnel: typeof sortedFolders = [];
    const professionnel: typeof sortedFolders = [];
    for (const f of sortedFolders) {
      ((f.sphere ?? 'personnel') === 'professionnel' ? professionnel : personnel).push(f);
    }
    return { personnel, professionnel };
  }, [sortedFolders]);

  // Projects whose folderId is missing or points at a deleted folder.
  const ungrouped = useMemo(
    () => projects.filter((p) => !p.folderId || !folders.some((f) => f.id === p.folderId)),
    [projects, folders]
  );

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const projectsOf = (folderId: string) => projects.filter((p) => p.folderId === folderId);
  const statsFor = (projectId: string) => {
    const list = tasks.filter((t) => t.projectId === projectId);
    const total = list.length;
    const done = list.filter((t) => t.status === 'done').length;
    // Avancement calculé en direct depuis les statuts réels (jamais p.progress,
    // qui est figé à la création et se désynchronise).
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  };

  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] !== false;
  const anyOpen = folders.some((f) => open[f.id] !== false);
  const toggleAll = () =>
    setOpen(() => {
      const next: Record<string, boolean> = {};
      for (const f of folders) next[f.id] = !anyOpen;
      return next;
    });

  const renderProject = (p: Project) => {
    const { total, done, pct } = statsFor(p.id);
    const Icon = projectIcons[p.icon] || Compass;
    const members = p.membersIds.map((id) => usersById.get(id)).filter((u): u is User => Boolean(u));
    return (
      <DraggableProjectRow key={p.id} project={p}>
        <button
          onClick={() => onNavigate('project', p.id)}
          className="flex items-center gap-2 min-w-0 pl-1 text-left"
        >
          <span
            className="w-5 h-5 rounded-md grid place-items-center shrink-0"
            style={{ background: `${p.color}22`, color: p.color }}
          >
            <Icon className="w-3 h-3" strokeWidth={2.2} />
          </span>
          <span className="text-sm truncate text-atlas-fg-1 group-hover:text-atlas-amber-deep">{p.name}</span>
        </button>
        <span>
          <span className={cn('chip text-2xs', (STATUS[p.status] ?? STATUS.active).cls)}>
            {(STATUS[p.status] ?? STATUS.active).label}
          </span>
        </span>
        <span className="flex justify-center">
          <HealthDot health={p.health} />
        </span>
        <span className="flex items-center gap-2">
          <span className="flex-1">
            <ProgressBar value={pct} />
          </span>
          <span className="text-2xs text-atlas-fg-3 font-mono w-8 text-right">{pct}%</span>
        </span>
        <span className="text-2xs text-atlas-fg-2 font-mono text-right">
          {done}/{total}
        </span>
        <span className="text-2xs text-atlas-fg-3">{p.endDate ? formatDate(p.endDate) : '—'}</span>
        <span className="flex items-center justify-between gap-1">
          {members.length ? (
            <AvatarGroup users={members} max={3} size="xs" />
          ) : (
            <span className="text-2xs text-atlas-fg-3">—</span>
          )}
          <Menu
            align="right"
            trigger={
              <button
                title="Options du projet"
                className="w-6 h-6 rounded-md grid place-items-center text-atlas-fg-3 opacity-0 group-hover:opacity-100 hover:bg-black/[0.06] hover:text-atlas-fg-1 shrink-0"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            }
          >
            {(close) => (
              <>
                <MenuItem
                  icon={ClipboardList}
                  onClick={() => {
                    close();
                    onNavigate('project', p.id);
                  }}
                >
                  Ouvrir
                </MenuItem>
                <MenuItem
                  icon={Edit3}
                  onClick={() => {
                    close();
                    openModal('project-edit', p);
                  }}
                >
                  Modifier
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  danger
                  icon={Trash2}
                  onClick={() => {
                    close();
                    openModal('project-delete', {
                      title: p.name,
                      onConfirm: () => deleteProject(p.id),
                    });
                  }}
                >
                  Supprimer
                </MenuItem>
              </>
            )}
          </Menu>
        </span>
      </DraggableProjectRow>
    );
  };

  const renderFolder = (folder: Folder) => {
    const fProjects = projectsOf(folder.id);
    const opened = isOpen(folder.id);
    return (
      <DroppableFolderRow
        key={folder.id}
        folder={folder}
        opened={opened}
        projectCount={fProjects.length}
        onToggle={() => setOpen((s) => ({ ...s, [folder.id]: !isOpen(folder.id) }))}
      >
        {opened &&
          (fProjects.length ? (
            <div className="space-y-0.5">{fProjects.map(renderProject)}</div>
          ) : (
            <div className="pl-12 pr-3 py-2 text-2xs text-atlas-fg-3 italic">
              Glissez un projet ici, ou créez-en un.
            </div>
          ))}
      </DroppableFolderRow>
    );
  };

  const isEmpty = folders.length === 0 && projects.length === 0;

  return (
    <div>
      <div className="px-8 pt-7 pb-4 border-b border-black/[0.05] flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-atlas-amber/10 text-atlas-amber-deep grid place-items-center">
            <FolderTree className="w-5 h-5" strokeWidth={1.7} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-medium tracking-tight">Projets</h1>
            <p className="text-2xs text-atlas-fg-3">
              {projects.length} projet{projects.length > 1 ? 's' : ''} · {folders.length} dossier
              {folders.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {folders.length > 0 && (
            <button onClick={toggleAll} className="btn-ghost text-sm px-3 py-1.5">
              {anyOpen ? (
                <ChevronsDownUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronsUpDown className="w-3.5 h-3.5" />
              )}
              {anyOpen ? 'Tout replier' : 'Tout déplier'}
            </button>
          )}
          <button onClick={() => openModal('folder-create')} className="btn-secondary text-sm px-3 py-1.5">
            <FolderPlus className="w-3.5 h-3.5" /> Dossier
          </button>
          <button onClick={() => openModal('project-create')} className="btn-primary text-sm px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Projet
          </button>
        </div>
      </div>

      <div className="px-8 py-5">
        {isEmpty ? (
          <div className="surface p-8 text-center">
            <FolderTree className="w-8 h-8 mx-auto text-atlas-fg-3 mb-3" strokeWidth={1.4} />
            <p className="text-sm text-atlas-fg-2">Aucun projet pour l'instant.</p>
            <button
              onClick={() => openModal('project-create')}
              className="btn-primary text-sm px-3.5 py-1.5 mt-4 mx-auto"
            >
              <Plus className="w-3.5 h-3.5" /> Créer un projet
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={(e) => {
              const id = String(e.active.id);
              if (id.startsWith('project-')) setDraggingProjectId(id.slice('project-'.length));
              else if (id.startsWith('folder-')) setDraggingFolderId(id.slice('folder-'.length));
            }}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setDraggingProjectId(null);
              setDraggingFolderId(null);
            }}
          >
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div
                  className={cn(
                    COLS,
                    'px-3 py-2 text-2xs uppercase tracking-wider text-atlas-fg-3 border-b border-atlas-line'
                  )}
                >
                  <span>Nom</span>
                  <span>Statut</span>
                  <span className="text-center">Santé</span>
                  <span>Avancement</span>
                  <span className="text-right">Tâches</span>
                  <span>Échéance</span>
                  <span>Équipe</span>
                </div>

                {(['personnel', 'professionnel'] as const).map((sphere) => {
                  const fs = bySphere[sphere];
                  if (fs.length === 0) return null;
                  return (
                    <div key={sphere} className="mt-4">
                      <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.2em] font-semibold text-atlas-amber-deep">
                        {sphere === 'personnel' ? 'Personnel' : 'Professionnel'}
                      </div>
                      <div className="space-y-0.5">{fs.map(renderFolder)}</div>
                    </div>
                  );
                })}

                <UnassignedDropZone projects={ungrouped} render={renderProject} />
              </div>
            </div>
            <DragOverlay>
              {draggingProjectId && (
                <div className="px-3 py-1.5 rounded-lg bg-white border border-atlas-line shadow-soft-pop text-sm text-atlas-fg-1">
                  {projects.find((p) => p.id === draggingProjectId)?.name}
                </div>
              )}
              {draggingFolderId && (
                <div className="px-3 py-1.5 rounded-lg bg-white border border-atlas-line shadow-soft-pop text-sm font-semibold text-atlas-fg-1">
                  {folders.find((f) => f.id === draggingFolderId)?.name}
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}

/* ────────────────── Drag-and-drop sub-components ────────────────── */

function DraggableProjectRow({ project, children }: { project: Project; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'project-' + project.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        COLS,
        'group px-3 py-2 rounded-lg hover:bg-black/[0.03] transition-opacity',
        isDragging && 'opacity-30'
      )}
    >
      {/* Drag handle — grip-vertical icon to the left of every project row.
          Listeners scoped here so a click anywhere ELSE on the row (open / menu)
          isn't accidentally swallowed by dnd-kit. */}
      <span ref={undefined} className="flex items-center gap-1.5 min-w-0" {...attributes}>
        <button
          {...listeners}
          className="w-5 h-5 grid place-items-center text-atlas-fg-3 opacity-0 group-hover:opacity-100 hover:bg-black/[0.06] hover:text-atlas-fg-1 rounded cursor-grab active:cursor-grabbing shrink-0"
          title="Glisser pour déplacer ce projet"
          aria-label="Poignée de déplacement"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        {children}
      </span>
    </div>
  );
}

function DroppableFolderRow({
  folder,
  opened,
  projectCount,
  onToggle,
  children,
}: {
  folder: Folder;
  opened: boolean;
  projectCount: number;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: 'folder-' + folder.id });
  const dragId = 'folder-' + folder.id;
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id: dragId });

  // Style transform when reordering this folder via drag.
  const dragStyle = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setDropRef}
      className={cn(
        'rounded-lg transition-colors',
        isOver && 'bg-atlas-sage/10 ring-1 ring-atlas-sage-deep/40',
        isDragging && 'opacity-30'
      )}
    >
      <div ref={setDragRef} style={dragStyle}>
        <button
          onClick={onToggle}
          className={cn(COLS, 'w-full text-left px-3 py-2 rounded-lg hover:bg-black/[0.025] group')}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span
              {...attributes}
              {...listeners}
              className="w-5 h-5 grid place-items-center text-atlas-fg-3 opacity-0 group-hover:opacity-100 hover:text-atlas-fg-1 rounded cursor-grab active:cursor-grabbing shrink-0"
              title="Glisser pour réordonner ce dossier"
              role="button"
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
            <ChevronRight
              className={cn(
                'w-3.5 h-3.5 text-atlas-fg-3 transition-transform shrink-0',
                opened && 'rotate-90'
              )}
            />
            <span
              className="w-5 h-5 rounded-md grid place-items-center shrink-0"
              style={{ background: `${folder.color}1f`, color: folder.color }}
            >
              <FolderIcon className="w-3.5 h-3.5" strokeWidth={2.2} />
            </span>
            <span className="text-sm font-semibold truncate text-atlas-fg-1">{folder.name}</span>
            <span className="text-2xs text-atlas-fg-3 font-mono">{projectCount}</span>
          </span>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </button>
      </div>
      {children}
    </div>
  );
}

function UnassignedDropZone({
  projects,
  render,
}: {
  projects: Project[];
  render: (p: Project) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'folder-__none__' });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mt-4 rounded-lg transition-colors',
        isOver && 'bg-atlas-sage/10 ring-1 ring-atlas-sage-deep/40 p-1'
      )}
    >
      <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.2em] font-semibold text-atlas-fg-3">
        Sans dossier
        {projects.length === 0 && (
          <span className="ml-2 normal-case font-normal text-atlas-fg-3 tracking-normal">
            (glissez un projet ici pour le retirer de son dossier)
          </span>
        )}
      </div>
      {projects.length > 0 && <div className="space-y-0.5">{projects.map(render)}</div>}
    </div>
  );
}
