import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Inbox,
  Sun,
  Target,
  LayoutDashboard,
  Timer,
  Workflow,
  FileBarChart,
  FolderTree,
  ClipboardList,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Sparkles,
  Settings,
  HelpCircle,
  Search,
  Home,
  Building2,
  Globe2,
  Heart,
  Briefcase,
  Folder as FolderIc,
  Rocket,
  GraduationCap,
  FolderPlus,
  Compass,
  FileText,
  Wallet,
  TrendingUp,
  Sunrise,
  BookOpen,
  LogOut,
  X,
  Edit3,
  Trash2,
  Pause,
  Play,
  MoreHorizontal,
  GripVertical,
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { Avatar } from '../ui/Avatar';
import { HealthDot } from '../ui/HealthDot';
import { useApp, useCurrentUser } from '../../stores/appStore';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { cn } from '../../lib/utils';
import type { ViewKey } from '../../types';

// Folder icon registry — keys match the slugs persisted by the seed
// and the FolderFormModal. PascalCase legacy keys are kept for
// backward compat with folders created before the slug migration.
const folderIcons: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  'building-2': Building2,
  home: Home,
  folder: FolderIc,
  rocket: Rocket,
  compass: Compass,
  'graduation-cap': GraduationCap,
  heart: Heart,
  // Legacy PascalCase mappings (pre-2026-05 folders).
  Briefcase,
  Building2,
  Globe2,
  Heart,
  Home,
  Folder: FolderIc,
};
const projectIcons: Record<string, LucideIcon> = {
  Compass,
  FileText,
  Wallet,
  Sparkles,
  TrendingUp,
  Sunrise,
  BookOpen,
};

interface Props {
  view: ViewKey;
  activeProjectId?: string;
  onNavigate: (view: ViewKey, projectId?: string) => void;
  onOpenCommand: () => void;
  onExitToHome: () => void;
  onCloseMobile?: () => void;
}

export function Sidebar({
  view,
  activeProjectId,
  onNavigate,
  onOpenCommand,
  onExitToHome,
  onCloseMobile,
}: Props) {
  const folders = useApp((s) => s.folders);
  const projects = useApp((s) => s.projects);
  const tasks = useApp((s) => s.tasks);
  const notifications = useApp((s) => s.notifications);
  const me = useCurrentUser();
  // Canonical e-mail from the auth session (NOT from the cj_profiles
  // row, which can contain a seeded mock e-mail for legacy users).
  const authEmail = useApp((s) => s.authEmail);
  const openModal = useApp((s) => s.openModal);
  const updateProject = useApp((s) => s.updateProject);
  const deleteProject = useApp((s) => s.deleteProject);
  const reorderFolders = useApp((s) => s.reorderFolders);
  const moveProjectToFolder = useApp((s) => s.moveProjectToFolder);

  // Sort folders by their `order` so reorder is consistent across reloads.
  const sortedFolders = useMemo(
    () =>
      [...folders].sort(
        (a, b) => ((a as { order?: number }).order ?? 0) - ((b as { order?: number }).order ?? 0)
      ),
    [folders]
  );

  // Group folders by sphere (personnel / professionnel). Defaults to
  // 'personnel' for any legacy folder that hasn't been classified yet.
  const foldersBySphere = useMemo(() => {
    const perso: typeof sortedFolders = [];
    const pro: typeof sortedFolders = [];
    for (const f of sortedFolders) {
      if ((f.sphere ?? 'personnel') === 'professionnel') pro.push(f);
      else perso.push(f);
    }
    return { personnel: perso, professionnel: pro };
  }, [sortedFolders]);

  // dnd-kit setup — 5px activation threshold so a normal click (open
  // folder, navigate to project) isn't accidentally interpreted as a
  // drag start.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setDraggingFolderId(null);
    setDraggingProjectId(null);
    if (!overId) return;

    // Folder reorder: both ids are folder-X
    if (activeId.startsWith('folder-') && overId.startsWith('folder-')) {
      const draggedId = activeId.slice('folder-'.length);
      const targetId = overId.slice('folder-'.length);
      if (draggedId === targetId) return;
      const ids = sortedFolders.map((f) => f.id);
      const from = ids.indexOf(draggedId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      const next = [...ids];
      next.splice(from, 1);
      next.splice(to, 0, draggedId);
      reorderFolders(next);
      return;
    }

    // Project moved onto a folder header
    if (activeId.startsWith('project-') && overId.startsWith('folder-')) {
      const projectId = activeId.slice('project-'.length);
      const targetFolderId = overId.slice('folder-'.length);
      moveProjectToFolder(projectId, targetFolderId);
      return;
    }
  };
  const signOut = useApp((s) => s.signOut);

  // Folder expand/collapse state is keyed by folder id (unknown key →
  // expanded by default) and persisted to localStorage so the layout the
  // user arranged survives a reload — important once they have many folders.
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('cj.sidebar.openFolders');
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('cj.sidebar.openFolders', JSON.stringify(openFolders));
    } catch {
      /* private mode / quota — collapse state just won't persist */
    }
  }, [openFolders]);
  const isFolderOpen = (id: string) => openFolders[id] !== false;

  // Collapse-all / expand-all: a single affordance that flips every folder
  // at once. If any folder is currently open we collapse them all, otherwise
  // we expand them all — so the button is always "do the opposite of now".
  const anyFolderOpen = useMemo(
    () => folders.some((f) => openFolders[f.id] !== false),
    [folders, openFolders]
  );
  const toggleAllFolders = () =>
    setOpenFolders(() => {
      const next: Record<string, boolean> = {};
      for (const f of folders) next[f.id] = !anyFolderOpen;
      return next;
    });

  const todayCount = tasks.filter(
    (t) =>
      t.dueDate && new Date(t.dueDate).toDateString() === new Date().toDateString() && t.status !== 'done'
  ).length;
  const inboxCount = notifications.filter((n) => !n.read).length;

  const items: { key: ViewKey; label: string; icon: LucideIcon; badge?: string }[] = [
    { key: 'today', label: 'Aujourd’hui', icon: Sun, badge: todayCount ? String(todayCount) : undefined },
    {
      key: 'inbox',
      label: 'Boîte d’entrée',
      icon: Inbox,
      badge: inboxCount ? String(inboxCount) : undefined,
    },
    { key: 'projects', label: 'Tous les projets', icon: FolderTree },
    { key: 'budget', label: 'Budget', icon: Wallet },
    { key: 'goals', label: 'Goals & OKRs', icon: Target },
    { key: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
    { key: 'focus', label: 'Mode Focus', icon: Timer },
    { key: 'automations', label: 'Automatisations', icon: Workflow },
    { key: 'forms', label: 'Forms d’intake', icon: ClipboardList },
    { key: 'reports', label: 'Rapports', icon: FileBarChart },
  ];

  return (
    <aside className="w-[280px] sm:w-[260px] shrink-0 h-full flex flex-col bg-atlas-ink/80 backdrop-blur-2xl border-r border-black/[0.05]">
      {/* Mobile-only close button at top-right */}
      {onCloseMobile && (
        <button
          onClick={onCloseMobile}
          aria-label="Fermer le menu"
          className="md:hidden absolute top-3 right-3 z-10 w-9 h-9 rounded-lg bg-white border border-atlas-line flex items-center justify-center text-atlas-fg-2 hover:text-atlas-fg-1"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <div className="px-4 pt-5 pb-4">
        <button
          onClick={onExitToHome}
          title="Retour à l’accueil"
          className="group w-full flex items-center justify-between rounded-xl px-2 py-2 hover:bg-black/[0.04] transition-colors"
        >
          <Logo size={18} />
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-atlas-fg-3 group-hover:text-atlas-amber-deep group-hover:bg-atlas-amber/10 transition-colors">
            <Home className="w-3.5 h-3.5" strokeWidth={1.8} />
          </span>
        </button>
      </div>

      <div className="px-3 pb-3 space-y-1.5">
        <button
          onClick={onOpenCommand}
          className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-black/[0.04] hover:bg-black/[0.07] text-atlas-fg-2 hover:text-atlas-fg-1 transition-colors"
        >
          <Search className="w-4 h-4" />
          <span className="text-sm flex-1 text-left">Rechercher…</span>
          <span className="kbd">⌘K</span>
        </button>
        <button onClick={() => openModal('task-create')} className="btn-primary w-full px-3 py-2 text-sm">
          <Plus className="w-4 h-4" />
          Nouvelle tâche
          <span className="ml-auto kbd !bg-black/20 !border-black/30 !text-white/80">⌘⇧T</span>
        </button>
      </div>

      <nav className="px-3 mt-2 space-y-0.5">
        {items.map((it) => {
          const active = view === it.key;
          const Icon = it.icon;
          return (
            <button
              key={it.key}
              onClick={() => onNavigate(it.key)}
              className={cn('nav-item group w-full', active && 'nav-item-active')}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-atlas-amber shadow-[0_0_12px_rgba(110,139,88,0.6)]" />
              )}
              <Icon
                className={cn(
                  'w-[18px] h-[18px]',
                  active ? 'text-atlas-amber-deep' : 'text-atlas-fg-3 group-hover:text-atlas-fg-2'
                )}
                strokeWidth={1.7}
              />
              <span className="flex-1 text-left">{it.label}</span>
              {it.badge && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-md text-[10px] font-medium',
                    active ? 'bg-atlas-amber text-white' : 'bg-black/[0.06] text-atlas-fg-2'
                  )}
                >
                  {it.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-6 px-3 flex-1 min-h-0 overflow-y-auto">
        <div className="flex items-center justify-between px-3 py-1.5 mb-1 sticky top-0 z-20 bg-atlas-ink/90 backdrop-blur-md">
          <span className="text-2xs uppercase tracking-[0.18em] font-medium text-atlas-fg-3">Projets</span>
          <div className="flex items-center gap-0.5">
            {folders.length > 0 && (
              <button
                onClick={toggleAllFolders}
                title={anyFolderOpen ? 'Tout replier' : 'Tout déplier'}
                aria-label={anyFolderOpen ? 'Replier tous les dossiers' : 'Déplier tous les dossiers'}
                className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-black/[0.06] text-atlas-fg-3 hover:text-atlas-fg-1"
              >
                {anyFolderOpen ? (
                  <ChevronsDownUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            <Menu
              align="right"
              width={200}
              trigger={
                <button
                  title="Nouveau projet ou dossier"
                  className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-black/[0.06] text-atlas-fg-3 hover:text-atlas-fg-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              }
            >
              {(close) => (
                <>
                  <MenuItem
                    icon={ClipboardList}
                    onClick={() => {
                      close();
                      openModal('project-create');
                    }}
                  >
                    Nouveau projet
                  </MenuItem>
                  <MenuItem
                    icon={FolderPlus}
                    onClick={() => {
                      close();
                      openModal('folder-create');
                    }}
                  >
                    Nouveau dossier
                  </MenuItem>
                </>
              )}
            </Menu>
          </div>
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={(e) => {
            const id = String(e.active.id);
            if (id.startsWith('folder-')) setDraggingFolderId(id.slice('folder-'.length));
            else if (id.startsWith('project-')) setDraggingProjectId(id.slice('project-'.length));
          }}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setDraggingFolderId(null);
            setDraggingProjectId(null);
          }}
        >
          <SortableContext
            items={sortedFolders.map((f) => 'folder-' + f.id)}
            strategy={verticalListSortingStrategy}
          >
            {(['personnel', 'professionnel'] as const).map((sphereKey) => {
              const sphereFolders = foldersBySphere[sphereKey];
              return (
                <div key={sphereKey} className="mb-3">
                  {/* Sphere header — 2 grandes familles : Personnel / Professionnel */}
                  <div className="flex items-center justify-between px-3 mb-1.5">
                    <span className="text-[10px] uppercase tracking-[0.22em] font-semibold text-atlas-amber-deep">
                      {sphereKey === 'personnel' ? 'Personnel' : 'Professionnel'}
                    </span>
                    <button
                      onClick={() => openModal('folder-create', { sphere: sphereKey })}
                      title={`Nouveau dossier ${sphereKey === 'personnel' ? 'personnel' : 'professionnel'}`}
                      className="w-4 h-4 rounded text-atlas-fg-3 hover:text-atlas-fg-1 flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  {sphereFolders.length === 0 ? (
                    <div className="text-2xs text-atlas-fg-3 italic px-3 py-1.5">
                      Aucun dossier — cliquez sur + pour en ajouter
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {sphereFolders.map((folder) => {
                        const FolderIcon = folderIcons[folder.icon] || Building2;
                        const isOpen = isFolderOpen(folder.id);
                        // `project.folderId` is the authoritative membership signal —
                        // it's set by the seed, createProject, the edit modal, and
                        // drag-and-drop. Reading it directly means a project always
                        // shows under its folder even if a folder's `projectIds`
                        // mirror drifted out of sync.
                        const folderProjects = projects.filter((p) => p.folderId === folder.id);
                        return (
                          <SortableFolderRow key={folder.id} folderId={folder.id}>
                            {({ dragHandle }) => (
                              <>
                                <div className="group/folder">
                                  <div className="flex items-center gap-0.5 pr-1 rounded-lg bg-black/[0.025] border border-transparent hover:border-atlas-line/60 transition-colors">
                                    {dragHandle}
                                    <button
                                      onClick={() =>
                                        setOpenFolders((s) => ({ ...s, [folder.id]: !s[folder.id] }))
                                      }
                                      className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-atlas-fg-1 hover:text-atlas-fg-1"
                                    >
                                      <ChevronRight
                                        className={cn(
                                          'w-3.5 h-3.5 text-atlas-fg-3 transition-transform',
                                          isOpen && 'rotate-90'
                                        )}
                                      />
                                      <span
                                        className="w-5 h-5 rounded-md grid place-items-center shrink-0"
                                        style={{
                                          background: `${folder.color}1f`,
                                          color: folder.color,
                                        }}
                                      >
                                        <FolderIcon className="w-3.5 h-3.5" strokeWidth={2.2} />
                                      </span>
                                      <span className="text-2xs uppercase tracking-[0.12em] font-semibold flex-1 text-left">
                                        {folder.name}
                                      </span>
                                      <span className="text-2xs text-atlas-fg-3 font-mono">
                                        {folderProjects.length}
                                      </span>
                                    </button>
                                    <Menu
                                      align="right"
                                      width={180}
                                      trigger={
                                        <button
                                          title="Options du dossier"
                                          className="w-6 h-6 rounded-md flex items-center justify-center text-atlas-fg-3 hover:text-atlas-fg-1 hover:bg-black/[0.06] opacity-0 group-hover/folder:opacity-100 transition"
                                        >
                                          <MoreHorizontal className="w-3.5 h-3.5" />
                                        </button>
                                      }
                                    >
                                      {(close) => (
                                        <>
                                          <MenuItem
                                            icon={Edit3}
                                            onClick={() => {
                                              close();
                                              openModal('folder-edit', folder);
                                            }}
                                          >
                                            Renommer
                                          </MenuItem>
                                          <MenuSeparator />
                                          <MenuItem
                                            icon={Trash2}
                                            danger
                                            onClick={() => {
                                              close();
                                              openModal('folder-edit', folder);
                                            }}
                                          >
                                            Supprimer…
                                          </MenuItem>
                                        </>
                                      )}
                                    </Menu>
                                  </div>
                                  {isOpen && (
                                    <div className="pl-2 space-y-0.5 mt-0.5 mb-1">
                                      {folderProjects.map((p) => {
                                        const Icon = projectIcons[p.icon] || Compass;
                                        const active = view === 'project' && activeProjectId === p.id;
                                        return (
                                          <div
                                            key={p.id}
                                            className={cn(
                                              'group flex items-center rounded-lg text-sm transition-colors',
                                              active
                                                ? 'bg-black/[0.06] text-atlas-fg-1'
                                                : 'text-atlas-fg-2 hover:text-atlas-fg-1 hover:bg-black/[0.03]'
                                            )}
                                          >
                                            <button
                                              onClick={() => onNavigate('project', p.id)}
                                              className="flex-1 flex items-center gap-2.5 px-3 py-1.5 min-w-0"
                                            >
                                              <span
                                                className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                                                style={{ background: `${p.color}22`, color: p.color }}
                                              >
                                                <Icon className="w-3 h-3" strokeWidth={2.2} />
                                              </span>
                                              <span className="flex-1 text-left truncate">{p.name}</span>
                                              <HealthDot health={p.health} />
                                            </button>
                                            <Menu
                                              trigger={
                                                <button className="w-6 h-6 rounded-md flex items-center justify-center text-atlas-fg-3 opacity-0 group-hover:opacity-100 hover:bg-black/[0.06] hover:text-atlas-fg-1 shrink-0 mr-1">
                                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                                </button>
                                              }
                                            >
                                              {(close) => (
                                                <>
                                                  <MenuItem
                                                    icon={Edit3}
                                                    onClick={() => {
                                                      close();
                                                      openModal('project-edit', p);
                                                    }}
                                                  >
                                                    Modifier
                                                  </MenuItem>
                                                  <MenuItem
                                                    icon={p.status === 'active' ? Pause : Play}
                                                    onClick={() => {
                                                      close();
                                                      updateProject(p.id, {
                                                        status: p.status === 'active' ? 'paused' : 'active',
                                                      });
                                                    }}
                                                  >
                                                    {p.status === 'active' ? 'Mettre en pause' : 'Réactiver'}
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
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </SortableFolderRow>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </SortableContext>
          <DragOverlay>
            {draggingFolderId && (
              <div className="px-3 py-1.5 rounded-lg bg-white border border-atlas-line shadow-soft-pop text-2xs uppercase tracking-[0.12em] font-semibold text-atlas-fg-1">
                {folders.find((f) => f.id === draggingFolderId)?.name}
              </div>
            )}
            {draggingProjectId && (
              <div className="px-3 py-1.5 rounded-lg bg-white border border-atlas-line shadow-soft-pop text-sm font-medium text-atlas-fg-1">
                {projects.find((p) => p.id === draggingProjectId)?.name}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <div className="border-t border-black/[0.05] p-3">
        <Menu
          trigger={
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-black/[0.04] cursor-pointer group">
              <Avatar user={me} size="md" />
              <div className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium text-atlas-fg-1 truncate">{me.name}</div>
                {/* Prefer the auth session e-mail (canonical truth from
                    auth.users) over the cj_profiles row, which may
                    still contain a seeded mock e-mail for users who
                    signed up before the clean seed (Pamela's
                    pame@atlasstudio.io leak). */}
                <div className="text-2xs text-atlas-fg-3 truncate" title={authEmail || me.email}>
                  {authEmail || me.email || me.role || '—'}
                </div>
              </div>
              <Settings className="w-4 h-4 text-atlas-fg-3 group-hover:text-atlas-fg-1 transition-colors" />
            </div>
          }
          align="left"
          width={260}
          direction="up"
        >
          {(close) => (
            <>
              {/* Email shown in full inside the menu — break-all so a
                  long address wraps cleanly. */}
              <MenuLabel>
                <span className="break-all normal-case tracking-normal">
                  {authEmail || me.email || me.name}
                </span>
              </MenuLabel>
              <MenuItem
                icon={Settings}
                onClick={() => {
                  close();
                  openModal('settings');
                }}
              >
                Paramètres
              </MenuItem>
              <MenuItem
                icon={Plus}
                onClick={() => {
                  close();
                  openModal('project-create');
                }}
              >
                Nouveau projet
              </MenuItem>
              <MenuItem
                icon={Plus}
                onClick={() => {
                  close();
                  openModal('goal-create');
                }}
              >
                Nouveau Goal
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={Home}
                onClick={() => {
                  close();
                  onExitToHome();
                }}
              >
                Retour à l'accueil
              </MenuItem>
              <MenuItem
                danger
                icon={LogOut}
                onClick={() => {
                  close();
                  void signOut();
                }}
              >
                Se déconnecter
              </MenuItem>
            </>
          )}
        </Menu>
        <div className="mt-2 flex items-center gap-2 px-2">
          <button
            onClick={() => openModal('shortcuts')}
            className="flex items-center gap-1.5 text-2xs text-atlas-fg-3 hover:text-atlas-fg-1"
          >
            <HelpCircle className="w-3 h-3" /> Aide
          </button>
          <span className="text-atlas-line">·</span>
          <span className="inline-flex items-center gap-1.5 text-2xs text-signal-green">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green animate-pulse-soft" /> En ligne
          </span>
        </div>
      </div>
    </aside>
  );
}

/* ───────────── Draggable wrappers for folders & projects ───────────── */

/**
 * Wraps a folder row with both:
 *   - useSortable → allows the folder to be reordered within the list
 *     (drag handle = GripVertical inside the `dragHandle` render prop)
 *   - useDroppable → the folder header is a drop target for projects
 *     dragged from elsewhere
 *
 * The drag handle is intentionally NOT the whole folder row — that
 * would conflict with the expand/collapse click and the "Renommer /
 * Supprimer" menu. Only the GripVertical icon initiates a drag.
 */
function SortableFolderRow({
  folderId,
  children,
}: {
  folderId: string;
  children: (ctx: { dragHandle: React.ReactNode }) => React.ReactNode;
}) {
  const sortable = useSortable({ id: 'folder-' + folderId });
  const droppable = useDroppable({ id: 'folder-' + folderId });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const setRefs = (node: HTMLDivElement | null) => {
    sortable.setNodeRef(node);
    droppable.setNodeRef(node);
  };
  const dragHandle = (
    <button
      ref={sortable.setActivatorNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      title="Glisser pour réorganiser"
      aria-label="Glisser pour réorganiser"
      className="w-5 h-7 flex items-center justify-center text-atlas-fg-3 hover:text-atlas-fg-1 opacity-0 group-hover/folder:opacity-100 cursor-grab active:cursor-grabbing shrink-0"
    >
      <GripVertical className="w-3.5 h-3.5" />
    </button>
  );
  return (
    <div
      ref={setRefs}
      style={style}
      className={cn(
        'transition-opacity',
        sortable.isDragging && 'opacity-40',
        droppable.isOver && !sortable.isDragging && 'rounded-lg ring-2 ring-atlas-sage-deep/40 ring-offset-1'
      )}
    >
      {children({ dragHandle })}
    </div>
  );
}
