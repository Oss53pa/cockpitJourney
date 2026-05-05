import { useEffect, useState } from 'react';
import {
  Search,
  Sun,
  Target,
  LayoutDashboard,
  Timer,
  Sparkles,
  ArrowRight,
  Plus,
  Compass,
  FileText,
  Wallet,
  TrendingUp,
  Sunrise,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import type { ViewKey } from '../../types';

const icons: Record<string, LucideIcon> = {
  Compass,
  FileText,
  Wallet,
  Sparkles,
  TrendingUp,
  Sunrise,
  BookOpen,
};

interface Props {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: ViewKey, projectId?: string) => void;
}

export function CommandMenu({ open, onClose, onNavigate }: Props) {
  const projects = useApp((s) => s.projects);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open) setQ('');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  const navs: { key: ViewKey; label: string; icon: LucideIcon; sub: string }[] = [
    { key: 'today', label: 'Aujourd’hui', icon: Sun, sub: 'Daily Brief PROPH3T' },
    { key: 'goals', label: 'Goals & OKRs', icon: Target, sub: 'Vision stratégique' },
    { key: 'dashboards', label: 'Dashboards', icon: LayoutDashboard, sub: 'Widgets configurables' },
    { key: 'focus', label: 'Mode Focus', icon: Timer, sub: 'Pomodoro · Deep Work' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl panel overflow-hidden animate-fade-in-scale shadow-soft-pop">
        <div className="flex items-center gap-3 px-4 h-14 border-b border-black/[0.06]">
          <Search className="w-4 h-4 text-atlas-fg-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Allez à… ou exécuter une action…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-atlas-fg-3"
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="max-h-[480px] overflow-y-auto p-2 space-y-3">
          <div>
            <div className="px-2 py-1 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
              Aller à
            </div>
            {navs
              .filter((n) => n.label.toLowerCase().includes(q.toLowerCase()))
              .map((n) => {
                const Icon = n.icon;
                return (
                  <button
                    key={n.key}
                    onClick={() => {
                      onNavigate(n.key);
                      onClose();
                    }}
                    className="group w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-black/[0.05] transition-colors"
                  >
                    <span className="w-8 h-8 rounded-lg bg-black/[0.04] border border-black/[0.05] flex items-center justify-center">
                      <Icon className="w-4 h-4 text-atlas-fg-2" />
                    </span>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-atlas-fg-1">{n.label}</div>
                      <div className="text-2xs text-atlas-fg-3">{n.sub}</div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-atlas-fg-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
          </div>

          <div>
            <div className="px-2 py-1 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
              Projets
            </div>
            {filteredProjects.map((p) => {
              const Icon = icons[p.icon] || Compass;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    onNavigate('project', p.id);
                    onClose();
                  }}
                  className="group w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-black/[0.05] transition-colors"
                >
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: `${p.color}22`, color: p.color }}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-atlas-fg-1">{p.name}</div>
                    <div className="text-2xs text-atlas-fg-3">
                      {p.taskCount} tâches · {p.progress}% complété
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-atlas-fg-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>

          <div>
            <div className="px-2 py-1 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
              Actions
            </div>
            <button className="group w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-black/[0.05]">
              <span className="w-8 h-8 rounded-lg bg-amber-gradient text-white flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-atlas-fg-1">Créer une tâche en langage naturel</div>
                <div className="text-2xs text-atlas-fg-3">
                  Ex : « rappelle-moi vendredi à 15h de relancer Pame »
                </div>
              </div>
              <span className="kbd">⌘⇧T</span>
            </button>
            <button className="group w-full flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-black/[0.05]">
              <span className="w-8 h-8 rounded-lg bg-black/[0.04] border border-black/[0.05] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-atlas-amber" />
              </span>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium text-atlas-fg-1">Générer mon Daily Brief</div>
                <div className="text-2xs text-atlas-fg-3">PROPH3T · LLaMA 70B local</div>
              </div>
            </button>
          </div>
        </div>
        <div className="border-t border-black/[0.05] px-4 py-2 flex items-center justify-between text-2xs text-atlas-fg-3">
          <span className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-atlas-amber" /> Propulsé par PROPH3T
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="kbd">↑↓</span> naviguer
            </span>
            <span className="flex items-center gap-1">
              <span className="kbd">↵</span> ouvrir
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
