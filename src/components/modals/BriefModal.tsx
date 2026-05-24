import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Sparkles, Send, RefreshCw, Lock, Loader2 } from 'lucide-react';
import { useApp } from '../../stores/appStore';
import type { AskResult } from '../../lib/proph3tCore';

export function BriefModal({ onClose }: { onClose: () => void }) {
  const tasks = useApp((s) => s.tasks);
  const insights = useApp((s) => s.insights);
  const regenerate = useApp((s) => s.regenerateBrief);
  const askProph3tCore = useApp((s) => s.askProph3tCore);

  // MODE B — « pose une question » au cœur Atlas Studio hébergé.
  const [question, setQuestion] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskResult | null>(null);

  const ask = async () => {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await askProph3tCore({
        message: question,
        sensitivity: confidential ? 'confidential' : 'internal',
      });
      setAnswer(res);
    } finally {
      setAsking(false);
    }
  };

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

        {/* MODE B — déléguer une question au cœur Atlas Studio hébergé */}
        <div className="rounded-2xl border border-atlas-line bg-atlas-surface/40 p-4">
          <div className="text-2xs uppercase tracking-wider font-medium text-atlas-fg-3 mb-2">
            Demander à PROPH3T (cœur Atlas Studio)
          </div>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask();
            }}
            rows={2}
            placeholder="Ex : quelles priorités risquent de glisser cette semaine ?"
            className="w-full resize-none rounded-xl border border-atlas-line bg-atlas-panel px-3 py-2 text-sm text-atlas-fg-1 placeholder:text-atlas-fg-3 focus:outline-none focus:ring-1 focus:ring-atlas-amber/50"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-2xs text-atlas-fg-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confidential}
                onChange={(e) => setConfidential(e.target.checked)}
                className="accent-atlas-amber"
              />
              <Lock className="w-3 h-3" />
              Données confidentielles (Ollama/Claude uniquement)
            </label>
            <button
              onClick={ask}
              disabled={asking || !question.trim()}
              className="btn-primary text-sm px-3 py-1.5 disabled:opacity-50"
            >
              {asking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Demander
            </button>
          </div>
          {answer && (
            <div className="mt-3 rounded-xl border border-atlas-line bg-atlas-panel p-3">
              <p className="text-sm text-atlas-fg-1 whitespace-pre-wrap leading-relaxed">{answer.answer}</p>
              <div className="mt-2 flex items-center gap-2 text-2xs text-atlas-fg-3">
                <span>Confiance {Math.round((answer.confidence ?? 0) * 100)}%</span>
                {answer.disclaimer && <span>· {answer.disclaimer}</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
