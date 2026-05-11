import { useState } from 'react';
import {
  Inbox,
  Sun,
  Target,
  LayoutDashboard,
  Timer,
  Workflow,
  FileBarChart,
  ClipboardList,
  ChevronRight,
  Plus,
  Sparkles,
  Settings,
  HelpCircle,
  Search,
  Home,
  Building2,
  Globe2,
  Heart,
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
  type LucideIcon,
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { Avatar } from '../ui/Avatar';
import { HealthDot } from '../ui/HealthDot';
import { useApp, useCurrentUser } from '../../stores/appStore';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { cn } from '../../lib/utils';
import type { ViewKey } from '../../types';

const folderIcons: Record<string, LucideIcon> = { Building2, Globe2, Heart };
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
  const pushToast = useApp((s) => s.pushToast);

  // Folder expand/collapse state is keyed by folder id and lazy-initialized:
  // an unknown key → expanded by default (better than hardcoding ids that
  // don't exist in this user's namespace).
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const isFolderOpen = (id: string) => openFolders[id] !== false;

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

      <div className="mt-6 px-3 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-3 mb-2">
          <span className="text-2xs uppercase tracking-[0.18em] font-medium text-atlas-fg-3">Projets</span>
          <button
            onClick={() => openModal('project-create')}
            title="Nouveau projet"
            className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-black/[0.06] text-atlas-fg-3 hover:text-atlas-fg-1"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-0.5">
          {folders.map((folder) => {
            const FolderIcon = folderIcons[folder.icon] || Building2;
            const isOpen = isFolderOpen(folder.id);
            const folderProjects = projects.filter((p) => folder.projectIds.includes(p.id));
            return (
              <div key={folder.id}>
                <button
                  onClick={() => setOpenFolders((s) => ({ ...s, [folder.id]: !s[folder.id] }))}
                  className="group w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-black/[0.04] text-atlas-fg-2 hover:text-atlas-fg-1"
                >
                  <ChevronRight
                    className={cn('w-3.5 h-3.5 text-atlas-fg-3 transition-transform', isOpen && 'rotate-90')}
                  />
                  <FolderIcon className="w-[14px] h-[14px]" style={{ color: folder.color }} strokeWidth={2} />
                  <span className="text-sm font-medium flex-1 text-left">{folder.name}</span>
                  <span className="text-2xs text-atlas-fg-3">{folderProjects.length}</span>
                </button>
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
            );
          })}
        </div>
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
                  pushToast({ kind: 'info', title: 'Déconnexion à venir' });
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
