import { Modal } from '../ui/Modal';
import { Sparkles, Send, RefreshCw } from 'lucide-react';
import { useApp } from '../../stores/appStore';

export function BriefModal({ onClose }: { onClose: () => void }) {
  const tasks = useApp((s) => s.tasks);
  const insights = useApp((s) => s.insights);
  const regenerate = useApp((s) => s.regenerateBrief);

  const todayStr = new Date().toDateString();
  const dueToday = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate).toDateString() === todayStr && t.status !== 'done'
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Daily Brief PROPH3T"
      description={new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
      size="lg"
      footer={
        <>
          <button onClick={() => regenerate()} className="btn-secondary text-sm px-3 py-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Régénérer
          </button>
          <button className="btn-secondary text-sm px-3 py-1.5">
            <Send className="w-3.5 h-3.5" /> Envoyer par WhatsApp
          </button>
          <button onClick={onClose} className="btn-primary text-sm px-3.5 py-1.5">
            Compris
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-atlas-amber/25 bg-gradient-to-br from-atlas-amber/[0.10] to-transparent p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-atlas-amber" />
            <span className="text-2xs uppercase tracking-wider font-medium text-atlas-amber">Synthèse</span>
          </div>
          <p className="text-sm text-atlas-fg-1 leading-relaxed">
            Vous avez{' '}
            <strong>
              {dueToday.length} priorité{dueToday.length > 1 ? 's' : ''}
            </strong>{' '}
            aujourd'hui
            {dueToday.filter((t) => t.priority === 4).length > 0 && (
              <>
                {' '}
                dont
                <strong>
                  {' '}
                  {dueToday.filter((t) => t.priority === 4).length} critique
                  {dueToday.filter((t) => t.priority === 4).length > 1 ? 's' : ''}
                </strong>
              </>
            )}
            .{' '}
            {(() => {
              const risk = insights.find((i) => i.kind === 'risk');
              if (!risk) return null;
              return (
                <>
                  Un <strong className="text-signal-red">risque</strong> détecté
                  {risk.scope ? (
                    <>
                      {' '}
                      sur <strong>{risk.scope}</strong>
                    </>
                  ) : null}
                  .
                </>
              );
            })()}
          </p>
        </div>

        <div>
          <div className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-2">
            Top priorités
          </div>
          <ul className="space-y-1.5">
            {dueToday.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm text-atlas-fg-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${t.priority === 4 ? 'bg-signal-red' : 'bg-atlas-amber'}`}
                />
                {t.title}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-2">Insights</div>
          <ul className="space-y-2">
            {insights.slice(0, 3).map((i) => (
              <li key={i.id} className="text-sm text-atlas-fg-2">
                <span className="font-medium text-atlas-fg-1">· {i.title}</span> — {i.body}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}
