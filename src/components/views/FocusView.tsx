import {
  Pause,
  Play,
  SkipForward,
  Coffee,
  Headphones,
  Volume2,
  Sparkles,
  X,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { useApp, focusPresetMap } from '../../stores/appStore';
import { cn } from '../../lib/utils';

const sounds = ['Silence', 'Pluie tropicale', "Café d'Abidjan", 'Lo-fi', 'Bruit blanc'];
const presets: { key: keyof typeof focusPresetMap; label: string; minutes: number }[] = [
  { key: 'pomodoro', label: 'Pomodoro 25/5', minutes: 25 },
  { key: 'pomodoro-long', label: 'Pomodoro 50/10', minutes: 50 },
  { key: 'deep', label: 'Deep Work 90/15', minutes: 90 },
  { key: 'sprint', label: 'Sprint 45 min', minutes: 45 },
  { key: 'time-block', label: 'Time-block 2h', minutes: 120 },
];

export function FocusView({ onExit }: { onExit?: () => void }) {
  const focus = useApp((s) => s.focus);
  const tasks = useApp((s) => s.tasks);
  const startFocus = useApp((s) => s.startFocusSession);
  const pauseFocus = useApp((s) => s.pauseFocus);
  const resumeFocus = useApp((s) => s.resumeFocus);
  const stopFocus = useApp((s) => s.stopFocus);
  const setSound = useApp((s) => s.setFocusSound);

  const seconds = focus.remainingSeconds;
  const total = focus.totalSeconds;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const pct = ((total - seconds) / total) * 100;
  const r = 130;
  const c = 2 * Math.PI * r;
  const d = (pct / 100) * c;

  const focusTask = focus.taskId
    ? tasks.find((t) => t.id === focus.taskId)
    : tasks.find((t) => t.id === 't_today_focus_1');

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-aurora opacity-50" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-atlas-amber/[0.05] blur-[140px] animate-aurora-spin" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-signal-blue/[0.06] blur-[140px]" />
      </div>

      <button
        onClick={onExit}
        className="absolute top-6 right-6 w-10 h-10 rounded-xl bg-white border border-atlas-line hover:border-atlas-line-2 text-atlas-fg-2 flex items-center justify-center"
        title="Quitter"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="relative z-10 text-center max-w-xl px-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-atlas-amber/30 bg-atlas-amber/10 mb-7">
          <span
            className={cn('w-1.5 h-1.5 rounded-full bg-atlas-amber', focus.running && 'animate-pulse-soft')}
          />
          <span className="text-2xs uppercase tracking-[0.18em] font-medium text-atlas-amber-deep">
            {focusPresetMap[focus.preset].label}
          </span>
        </div>

        <div className="relative mx-auto" style={{ width: 320, height: 320 }}>
          <svg viewBox="0 0 320 320" className="-rotate-90">
            <defs>
              <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#C8DBAE" />
                <stop offset="50%" stopColor="#6E8B58" />
                <stop offset="100%" stopColor="#52693F" />
              </linearGradient>
            </defs>
            <circle cx="160" cy="160" r={r} stroke="rgba(0,0,0,0.06)" strokeWidth="10" fill="none" />
            <circle
              cx="160"
              cy="160"
              r={r}
              stroke="url(#ring-grad)"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${d} ${c - d}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="font-mono text-7xl font-extralight tracking-[-0.04em] tabular-nums text-atlas-fg-1">
              {mm}
              <span className={cn('text-atlas-amber-deep', focus.running && 'animate-pulse-soft')}>:</span>
              {ss}
            </div>
            <div className="mt-3 text-2xs uppercase tracking-[0.18em] text-atlas-fg-3 font-medium">
              {Math.round(pct)}% complété
            </div>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            onClick={() => stopFocus()}
            className="w-12 h-12 rounded-full bg-white border border-atlas-line hover:border-atlas-line-2 text-atlas-fg-2 flex items-center justify-center"
            title="Réinitialiser"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => (focus.running ? pauseFocus() : resumeFocus())}
            className="w-16 h-16 rounded-full bg-amber-gradient text-white shadow-amber-deep flex items-center justify-center hover:brightness-110 active:translate-y-px transition-all"
          >
            {focus.running ? (
              <Pause className="w-6 h-6" fill="currentColor" />
            ) : (
              <Play className="w-6 h-6" fill="currentColor" />
            )}
          </button>
          <button
            onClick={() => stopFocus()}
            className="w-12 h-12 rounded-full bg-white border border-atlas-line hover:border-atlas-line-2 text-atlas-fg-2 flex items-center justify-center"
            title="Pause urgente"
          >
            <Coffee className="w-4 h-4" />
          </button>
          <button
            onClick={() => stopFocus()}
            className="w-12 h-12 rounded-full bg-white border border-atlas-line hover:border-atlas-line-2 text-atlas-fg-2 flex items-center justify-center"
            title="Sauter"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => startFocus(p.key, focus.taskId)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-2xs uppercase tracking-wider font-medium border',
                focus.preset === p.key
                  ? 'bg-atlas-amber/15 border-atlas-amber/30 text-atlas-amber-deep'
                  : 'bg-white border-atlas-line text-atlas-fg-3 hover:border-atlas-line-2'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {focusTask && (
          <div className="mt-9 mx-auto max-w-md">
            <div className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-2">
              Focus actuel
            </div>
            <div className="panel p-4 group">
              <div className="flex items-start gap-3">
                <Headphones className="w-4 h-4 text-atlas-amber-deep mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-atlas-fg-1">{focusTask.title}</div>
                  <div className="text-2xs text-atlas-fg-3 mt-0.5">
                    CockpitJourney · {focusTask.dueDate ? 'échéance imminente' : 'sans échéance'}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-atlas-fg-3" />
              </div>
            </div>
          </div>
        )}

        <div className="mt-7 flex items-center justify-center gap-2 flex-wrap">
          <Volume2 className="w-3.5 h-3.5 text-atlas-fg-3" />
          {sounds.map((s) => (
            <button
              key={s}
              onClick={() => setSound(s)}
              className={cn(
                'px-3 py-1 rounded-full text-2xs uppercase tracking-wider font-medium border',
                focus.sound === s
                  ? 'bg-atlas-amber/15 border-atlas-amber/30 text-atlas-amber-deep'
                  : 'border-atlas-line text-atlas-fg-3 hover:bg-black/[0.04]'
              )}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-9 inline-flex items-center gap-2 text-2xs text-atlas-fg-3">
          <Sparkles className="w-3 h-3 text-atlas-amber-deep" /> PROPH3T détecte que vous êtes 23% plus
          efficace sur ce créneau.
        </div>
      </div>
    </div>
  );
}
