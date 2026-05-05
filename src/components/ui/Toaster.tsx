import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useApp } from '../../stores/appStore';
import { cn } from '../../lib/utils';

const styles: Record<string, { cls: string; icon: any }> = {
  success: { cls: 'border-signal-green/30 bg-signal-green/10 text-signal-green', icon: CheckCircle2 },
  info: { cls: 'border-atlas-amber/30 bg-atlas-amber/10 text-atlas-amber', icon: Info },
  warning: { cls: 'border-signal-yellow/30 bg-signal-yellow/10 text-signal-yellow', icon: AlertTriangle },
  error: { cls: 'border-signal-red/30 bg-signal-red/10 text-signal-red', icon: XCircle },
};

export function Toaster() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="fixed bottom-5 right-5 z-[80] flex flex-col gap-2 w-[360px] pointer-events-none">
      {toasts.map((t) => {
        const cfg = styles[t.kind];
        const Icon = cfg.icon;
        return (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto relative panel p-3 pr-9 flex gap-3 items-start animate-fade-in-up',
              'border'
            )}
          >
            <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center border', cfg.cls)}>
              <Icon className="w-3.5 h-3.5" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-atlas-fg-1">{t.title}</div>
              {t.body && <div className="text-2xs text-atlas-fg-3 mt-0.5">{t.body}</div>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="absolute top-2 right-2 w-6 h-6 rounded-md hover:bg-black/[0.05] flex items-center justify-center text-atlas-fg-3"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
