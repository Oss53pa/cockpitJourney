import {
  Bell,
  Search,
  ChevronRight,
  Sparkles,
  Cloud,
  Wifi,
  Settings,
  Keyboard,
  LifeBuoy,
  X,
  CheckCheck,
  Users,
  Menu as MenuIcon,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../stores/appStore';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { relativeTime, cn } from '../../lib/utils';

interface Props {
  breadcrumb: { label: string; sub?: string }[];
  onOpenCommand: () => void;
  onToggleSidebar?: () => void;
}

export function TopBar({ breadcrumb, onOpenCommand, onToggleSidebar }: Props) {
  const [openNotifs, setOpenNotifs] = useState(false);
  const notifications = useApp((s) => s.notifications);
  const users = useApp((s) => s.users);
  const markRead = useApp((s) => s.markNotificationRead);
  const markAllRead = useApp((s) => s.markAllNotificationsRead);
  const clearNotifications = useApp((s) => s.clearNotifications);
  const openModal = useApp((s) => s.openModal);
  const pushToast = useApp((s) => s.pushToast);
  const regenerateBrief = useApp((s) => s.regenerateBrief);
  const refreshSnapshot = useApp((s) => s.refreshSnapshot);
  const revalidating = useApp((s) => s.revalidating);

  const unread = notifications.filter((n) => !n.read).length;
  const now = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 h-14 px-3 md:px-5 border-b border-black/[0.05] bg-atlas-ink/70 backdrop-blur-2xl">
      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          className="md:hidden w-9 h-9 rounded-lg bg-white border border-atlas-line flex items-center justify-center text-atlas-fg-2"
          aria-label="Menu"
        >
          <MenuIcon className="w-4 h-4" />
        </button>
      )}
      <nav className="flex items-center gap-1.5 min-w-0">
        {breadcrumb.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            <div
              className={cn(
                'flex flex-col leading-tight min-w-0',
                i === breadcrumb.length - 1 ? 'text-atlas-fg-1' : 'text-atlas-fg-3'
              )}
            >
              <span className="text-sm font-medium truncate">{b.label}</span>
              {b.sub && (
                <span className="text-[10px] uppercase tracking-wider text-atlas-fg-3 truncate">{b.sub}</span>
              )}
            </div>
            {i < breadcrumb.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-atlas-line-2 mx-1" />}
          </div>
        ))}
      </nav>

      <div className="ml-2 sm:ml-4 flex-1 max-w-xl min-w-0">
        <button
          onClick={onOpenCommand}
          className="group w-full flex items-center gap-2.5 h-9 px-3 rounded-xl bg-black/[0.03] hover:bg-black/[0.06] border border-atlas-line hover:border-atlas-line-2 text-atlas-fg-3 hover:text-atlas-fg-2 transition-colors"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="text-sm flex-1 text-left truncate">
            <span className="hidden sm:inline">Rechercher tâches, projets, personnes…</span>
            <span className="sm:hidden">Rechercher…</span>
          </span>
          <span className="kbd hidden sm:inline-flex">⌘K</span>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/[0.03] border border-atlas-line">
          <Cloud className="w-3.5 h-3.5 text-signal-blue" />
          <span className="text-2xs text-atlas-fg-3 capitalize">{now}</span>
        </div>

        <Menu
          trigger={
            <button className="relative h-9 sm:px-3 px-2 rounded-xl bg-gradient-to-br from-atlas-amber/20 to-atlas-amber/5 border border-atlas-amber/30 text-atlas-amber-deep flex items-center gap-1.5 hover:from-atlas-amber/30 hover:to-atlas-amber/10 transition-all">
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-xs font-medium tracking-tight hidden sm:inline">PROPH3T</span>
              <span className="ml-0.5 sm:ml-1 w-1.5 h-1.5 rounded-full bg-atlas-amber animate-pulse-soft" />
            </button>
          }
          width={260}
        >
          {(close) => (
            <>
              <MenuLabel>PROPH3T · LLaMA 3.1 70B local</MenuLabel>
              <MenuItem
                icon={Sparkles}
                onClick={() => {
                  close();
                  openModal('proph3t-brief');
                }}
              >
                Ouvrir le Daily Brief
              </MenuItem>
              <MenuItem
                icon={Sparkles}
                onClick={() => {
                  close();
                  regenerateBrief();
                }}
              >
                Régénérer maintenant
              </MenuItem>
              <MenuItem
                icon={Sparkles}
                onClick={() => {
                  close();
                  pushToast({
                    kind: 'info',
                    title: 'Recherche sémantique activée',
                    body: 'Tapez Cmd+K et écrivez votre question',
                  });
                  onOpenCommand();
                }}
              >
                Recherche sémantique
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                onClick={() => {
                  close();
                  pushToast({
                    kind: 'success',
                    title: 'PROPH3T en pause',
                    body: 'Aucune génération automatique',
                  });
                }}
              >
                Mettre en pause 1h
              </MenuItem>
            </>
          )}
        </Menu>

        <div className="relative">
          <button
            onClick={() => setOpenNotifs((v) => !v)}
            className="relative w-9 h-9 rounded-xl bg-white border border-atlas-line hover:border-atlas-line-2 flex items-center justify-center text-atlas-fg-2 hover:text-atlas-fg-1 transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-atlas-amber text-white text-[10px] font-medium flex items-center justify-center ring-2 ring-atlas-panel">
                {unread}
              </span>
            )}
          </button>
          {openNotifs && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpenNotifs(false)} />
              <div className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-12 left-2 sm:left-auto sm:w-[400px] panel p-2 animate-fade-in-scale origin-top-right z-50">
                <div className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-atlas-fg-1">Notifications</div>
                    <div className="text-2xs text-atlas-fg-3">
                      {unread} non lues · {notifications.length} au total
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={markAllRead}
                      className="btn-ghost text-2xs px-2 py-1"
                      title="Tout marquer lu"
                    >
                      <CheckCheck className="w-3 h-3" />
                    </button>
                    <button
                      onClick={clearNotifications}
                      className="btn-ghost text-2xs px-2 py-1 hover:text-signal-red"
                      title="Tout supprimer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="max-h-[420px] overflow-y-auto pr-1">
                  {notifications.map((n) => {
                    const actor = n.actorId ? users.find((u) => u.id === n.actorId) : null;
                    return (
                      <button
                        key={n.id}
                        onClick={() => {
                          markRead(n.id);
                          pushToast({ kind: 'info', title: 'Marqué comme lu' });
                        }}
                        className={cn(
                          'w-full text-left px-3 py-2.5 rounded-lg flex gap-3 items-start hover:bg-black/[0.04] cursor-pointer relative',
                          !n.read && 'bg-atlas-amber/[0.06]'
                        )}
                      >
                        {!n.read && (
                          <span className="absolute left-1 top-3 w-1.5 h-1.5 rounded-full bg-atlas-amber" />
                        )}
                        {actor ? (
                          <div
                            className="w-8 h-8 rounded-full font-medium text-xs flex items-center justify-center text-white shrink-0"
                            style={{
                              background: `linear-gradient(135deg, ${actor.color}, ${actor.color}88)`,
                            }}
                          >
                            {actor.initials}
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-amber-gradient text-white shrink-0 flex items-center justify-center">
                            <Sparkles className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-atlas-fg-1">{n.title}</div>
                          {n.body && <div className="text-xs text-atlas-fg-3 mt-0.5 truncate">{n.body}</div>}
                          <div className="text-2xs text-atlas-fg-3 mt-1">{relativeTime(n.createdAt)}</div>
                        </div>
                      </button>
                    );
                  })}
                  {notifications.length === 0 && (
                    <div className="py-8 text-center text-2xs text-atlas-fg-3">
                      Tout est calme — pas de notifications
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Bouton refresh direct — Realtime devrait suffire mais sert de
            filet de sécurité quand le websocket est passé en arrière-plan
            (PWA mise en veille, onglet inactif >5min, réseau coupé). */}
        <button
          onClick={() => void refreshSnapshot()}
          className="w-9 h-9 rounded-xl bg-white border border-atlas-line hover:border-atlas-line-2 flex items-center justify-center text-atlas-fg-2"
          title="Rafraîchir mes données depuis le serveur"
          aria-label="Rafraîchir"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <Menu
          trigger={
            <button className="w-9 h-9 rounded-xl bg-white border border-atlas-line hover:border-atlas-line-2 flex items-center justify-center text-atlas-fg-2">
              <Settings className="w-4 h-4" />
            </button>
          }
          width={220}
        >
          {(close) => (
            <>
              <MenuLabel>Préférences</MenuLabel>
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
                icon={Users}
                onClick={() => {
                  close();
                  openModal('members');
                }}
              >
                Inviter quelqu'un
              </MenuItem>
              <MenuItem
                icon={RefreshCw}
                onClick={() => {
                  close();
                  void refreshSnapshot();
                }}
              >
                Rafraîchir mes données
              </MenuItem>
              <MenuItem
                icon={Keyboard}
                onClick={() => {
                  close();
                  openModal('shortcuts');
                }}
              >
                Raccourcis clavier
              </MenuItem>
              <MenuItem
                icon={LifeBuoy}
                onClick={() => {
                  close();
                  pushToast({ kind: 'info', title: "Centre d'aide", body: 'help.cockpitjourney.app' });
                }}
              >
                Centre d'aide
              </MenuItem>
            </>
          )}
        </Menu>

        {revalidating ? (
          <div className="hidden md:flex ml-1 items-center gap-2 px-3 py-1.5 rounded-lg bg-signal-blue-soft border border-signal-blue/30">
            <Cloud className="w-3.5 h-3.5 text-signal-blue animate-pulse-soft" />
            <span className="text-2xs font-medium uppercase tracking-wider text-signal-blue">
              Mise à jour…
            </span>
          </div>
        ) : (
          <div className="hidden md:flex ml-1 items-center gap-2 px-3 py-1.5 rounded-lg bg-signal-green-soft border border-signal-green/30">
            <Wifi className="w-3.5 h-3.5 text-signal-green" />
            <span className="text-2xs font-medium uppercase tracking-wider text-signal-green">
              Synchronisé
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
