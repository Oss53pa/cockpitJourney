import {
  Workflow,
  Plus,
  Sparkles,
  ArrowRight,
  MoreHorizontal,
  ChevronRight,
  Bell,
  MessageSquare,
  Mail,
  RefreshCw,
  GitBranch,
  Tag,
  Calendar,
  Trash2,
  Edit3,
  Play,
  Pause,
} from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { Switch } from '../ui/Field';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu';
import { cn } from '../../lib/utils';

const triggerIcons: Record<string, any> = {
  status_changed: GitBranch,
  task_created: Plus,
  due_overdue: Calendar,
  recurrence: RefreshCw,
};
const triggerLabels: Record<string, string> = {
  status_changed: 'Statut changé',
  task_created: 'Tâche créée',
  due_overdue: 'Échéance dépassée',
  recurrence: 'Récurrence',
};
const actionIcons: Record<string, any> = {
  whatsapp: MessageSquare,
  push: Bell,
  email: Mail,
  tag: Tag,
  subtasks: Workflow,
  report: Sparkles,
};

export function AutomationsView() {
  const automations = useApp((s) => s.automations);
  const toggle = useApp((s) => s.toggleAutomation);
  const remove = useApp((s) => s.deleteAutomation);
  const dryRun = useApp((s) => s.dryRunAutomation);
  const openModal = useApp((s) => s.openModal);
  const pushToast = useApp((s) => s.pushToast);

  const totalRuns = automations.reduce((s, a) => s + a.runs, 0);
  const avgSuccess = automations.length
    ? (automations.reduce((s, a) => s + a.success, 0) / automations.length).toFixed(1)
    : '0';

  return (
    <div className="px-8 py-7">
      <div className="flex items-end justify-between mb-7">
        <div>
          <div className="text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium mb-1">
            Moteur d'automatisations
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Vos règles déterministes</h1>
          <p className="text-sm text-atlas-fg-3 mt-1">
            {automations.length} automatisations · {totalRuns} exécutions ce mois · {avgSuccess}% succès
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              pushToast({
                kind: 'info',
                title: 'Bibliothèque pré-configurée',
                body: '15 templates disponibles',
              })
            }
            className="btn-secondary text-sm px-3 py-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Bibliothèque (15)
          </button>
          <button onClick={() => openModal('automation-create')} className="btn-primary text-sm px-3 py-1.5">
            <Plus className="w-3.5 h-3.5" /> Nouvelle règle
          </button>
        </div>
      </div>

      <section className="panel p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-atlas-amber/10 blur-3xl" />
        <div className="relative flex items-center gap-3 flex-wrap">
          <Block label="QUAND" tone="trigger" icon={GitBranch}>
            statut passe à <strong className="text-atlas-fg-1">En revue</strong>
          </Block>
          <Connector />
          <Block label="ET" tone="condition">
            assigné = <strong className="text-atlas-fg-1">moi</strong>
          </Block>
          <Connector />
          <Block label="ALORS" tone="action" icon={MessageSquare}>
            envoyer <strong className="text-atlas-fg-1">WhatsApp</strong>
          </Block>
          <Connector />
          <Block label="ET" tone="action" icon={Bell}>
            notification push
          </Block>
        </div>
        <div className="mt-5 flex items-center gap-3 text-2xs text-atlas-fg-3">
          <Sparkles className="w-3 h-3 text-atlas-amber-deep" /> Constructeur visuel · Aucun code
        </div>
      </section>

      <div className="space-y-2">
        {automations.map((a, i) => {
          const TriggerIcon = triggerIcons[a.triggerKey] || GitBranch;
          return (
            <article
              key={a.id}
              className={cn(
                'group relative rounded-2xl border p-4 transition-colors',
                a.enabled
                  ? 'bg-atlas-panel border-atlas-line hover:border-atlas-line-2'
                  : 'bg-atlas-panel-2 border-atlas-line opacity-80 hover:opacity-100'
              )}
              style={{ animation: `fade-in-up 320ms ${i * 60}ms cubic-bezier(0.22,1,0.36,1) backwards` }}
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'w-11 h-11 rounded-xl flex items-center justify-center',
                    a.enabled
                      ? 'bg-atlas-amber/15 text-atlas-amber-deep border border-atlas-amber/30'
                      : 'bg-black/[0.04] text-atlas-fg-3 border border-atlas-line'
                  )}
                >
                  <Workflow className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-atlas-fg-1">{a.name}</h3>
                    {a.enabled ? (
                      <span className="chip bg-signal-green/15 text-signal-green border border-signal-green/25">
                        ● Actif
                      </span>
                    ) : (
                      <span className="chip bg-black/[0.04] text-atlas-fg-3 border border-atlas-line">
                        ○ Désactivé
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-atlas-fg-3 mt-1">{a.desc}</p>
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                    <TriggerIcon className="w-3 h-3 text-signal-blue" />
                    <span className="text-2xs text-atlas-fg-2 font-medium">
                      {triggerLabels[a.triggerKey]}
                    </span>
                    {a.conditions > 0 && (
                      <span className="text-2xs text-atlas-fg-3">+ {a.conditions} conditions</span>
                    )}
                    <ChevronRight className="w-3 h-3 text-atlas-fg-3" />
                    {a.actions.map((act, j) => {
                      const Icon = actionIcons[act.kind] || Bell;
                      return (
                        <span
                          key={j}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/[0.04] border border-atlas-line text-2xs text-atlas-fg-2"
                        >
                          <Icon className="w-3 h-3" /> {act.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono text-atlas-fg-2">{a.runs} exécutions</div>
                  <div className="text-2xs text-signal-green mt-0.5">{a.success}% succès</div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={a.enabled} onChange={() => toggle(a.id)} />
                  <Menu
                    trigger={
                      <button className="btn-ghost !p-2">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    }
                  >
                    {(close) => (
                      <>
                        <MenuLabel>Automation</MenuLabel>
                        <MenuItem
                          icon={a.enabled ? Pause : Play}
                          onClick={() => {
                            close();
                            toggle(a.id);
                          }}
                        >
                          {a.enabled ? 'Désactiver' : 'Activer'}
                        </MenuItem>
                        <MenuItem
                          icon={Edit3}
                          onClick={() => {
                            close();
                            openModal('automation-edit', a);
                          }}
                        >
                          Modifier
                        </MenuItem>
                        <MenuItem
                          icon={Play}
                          onClick={() => {
                            close();
                            const matches = dryRun(a.id);
                            pushToast({
                              kind: 'success',
                              title: 'Test à blanc',
                              body: `${matches} tâche(s) correspondent à ce déclencheur — aucune action exécutée.`,
                            });
                          }}
                        >
                          Tester (à blanc)
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          danger
                          icon={Trash2}
                          onClick={() => {
                            close();
                            if (confirm('Supprimer cette règle ?')) remove(a.id);
                          }}
                        >
                          Supprimer
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </div>
              </div>
            </article>
          );
        })}
        {automations.length === 0 && (
          <div className="panel p-10 text-center">
            <Workflow className="w-8 h-8 mx-auto text-atlas-fg-3 mb-2" />
            <h3 className="text-sm font-medium text-atlas-fg-1">Aucune automation</h3>
            <p className="text-2xs text-atlas-fg-3 mt-1 mb-4">
              Créez votre première règle "Quand → Si → Alors".
            </p>
            <button
              onClick={() => openModal('automation-create')}
              className="btn-primary text-sm px-3.5 py-1.5 inline-flex"
            >
              <Plus className="w-3.5 h-3.5" /> Nouvelle règle
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Block({
  children,
  label,
  tone,
  icon: Icon,
}: {
  children: React.ReactNode;
  label: string;
  tone: 'trigger' | 'condition' | 'action';
  icon?: any;
}) {
  const cls =
    tone === 'trigger'
      ? 'border-signal-blue/30 bg-signal-blue/10 text-signal-blue'
      : tone === 'condition'
        ? 'border-signal-violet/30 bg-signal-violet/10 text-signal-violet'
        : 'border-atlas-amber/30 bg-atlas-amber/10 text-atlas-amber-deep';
  return (
    <div className={cn('inline-flex items-center gap-2 rounded-xl border px-3 py-2.5', cls)}>
      <span className="text-2xs uppercase tracking-wider font-medium opacity-80">{label}</span>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span className="text-xs text-atlas-fg-2">{children}</span>
    </div>
  );
}

function Connector() {
  return <ArrowRight className="w-4 h-4 text-atlas-fg-3 shrink-0" />;
}
