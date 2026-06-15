// Rail vertical d'accès direct aux vues — toujours visible, 1 clic.
// Complète la Sidebar : la sidebar garde l'arbre projets/dossiers et les
// labels, le rail donne un accès ultra-rapide aux vues principales pour
// les utilisateurs avancés (raccourci d'1 click depuis n'importe où).
//
// Pourquoi pas un *remplacement* de la sidebar par un rail+panneau ?
// Parce que la sidebar actuelle porte aussi le drag-and-drop des projets
// et l'arborescence collapse — l'extraire est risqué. Le rail additif
// est un net-gain immédiat sans régression.

import {
  Sun,
  Inbox,
  Timer,
  FolderTree,
  Wallet,
  Target,
  LayoutDashboard,
  FileBarChart,
  Workflow,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import type { ViewKey } from '../../types';
import { useApp } from '../../stores/appStore';
import { cn } from '../../lib/utils';

interface RailItem {
  key: ViewKey;
  label: string;
  icon: LucideIcon;
  badge?: () => number;
}

export function NavRail({ view, onNavigate }: { view: ViewKey; onNavigate: (v: ViewKey) => void }) {
  const tasks = useApp((s) => s.tasks);
  const notifications = useApp((s) => s.notifications);

  const todayCount = tasks.filter((t) => {
    if (!t.dueDate || t.status === 'done') return false;
    const due = new Date(t.dueDate);
    const now = new Date();
    return due.toDateString() === now.toDateString() || due.getTime() < now.getTime();
  }).length;
  const inboxCount = notifications.filter((n) => !n.read).length;

  const items: RailItem[] = [
    { key: 'today', label: 'Aujourd’hui', icon: Sun, badge: () => todayCount },
    { key: 'inbox', label: 'Boîte d’entrée', icon: Inbox, badge: () => inboxCount },
    { key: 'focus', label: 'Mode Focus', icon: Timer },
    { key: 'projects', label: 'Projets', icon: FolderTree },
    { key: 'budget', label: 'Budget', icon: Wallet },
    { key: 'goals', label: 'Goals & OKRs', icon: Target },
    { key: 'dashboards', label: 'Dashboards', icon: LayoutDashboard },
    { key: 'reports', label: 'Rapports', icon: FileBarChart },
    { key: 'automations', label: 'Automatisations', icon: Workflow },
    { key: 'forms', label: 'Formulaires', icon: ClipboardList },
  ];

  return (
    <nav
      aria-label="Navigation principale"
      className="hidden md:flex shrink-0 w-14 flex-col items-center gap-1 py-3 bg-atlas-cream border-r border-atlas-line/60"
    >
      {items.map((it) => {
        const Icon = it.icon;
        const active = view === it.key;
        const count = it.badge?.() ?? 0;
        return (
          <button
            key={it.key}
            onClick={() => onNavigate(it.key)}
            title={it.label + (count > 0 ? ` (${count})` : '')}
            aria-label={it.label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
              active
                ? 'bg-atlas-sage-deep text-white shadow-soft-pop'
                : 'text-atlas-fg-3 hover:bg-black/[0.04] hover:text-atlas-fg-1'
            )}
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
            {count > 0 && (
              <span
                className={cn(
                  'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-semibold flex items-center justify-center tabular-nums',
                  active ? 'bg-white text-atlas-sage-deep' : 'bg-signal-red text-white'
                )}
              >
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
