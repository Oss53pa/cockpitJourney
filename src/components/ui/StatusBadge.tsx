import type { TaskStatus } from '../../types';
import { cn } from '../../lib/utils';
import { CheckCircle2, Circle, Eye, Loader2, Ban } from 'lucide-react';

const cfg: Record<TaskStatus, { label: string; cls: string; icon: any }> = {
  todo: { label: 'À faire', cls: 'bg-black/[0.04] text-atlas-fg-2 border-atlas-line', icon: Circle },
  in_progress: {
    label: 'En cours',
    cls: 'bg-atlas-amber/15 text-atlas-amber-deep border-atlas-amber/30',
    icon: Loader2,
  },
  in_review: {
    label: 'En revue',
    cls: 'bg-signal-blue/15 text-signal-blue border-signal-blue/30',
    icon: Eye,
  },
  done: {
    label: 'Terminé',
    cls: 'bg-signal-green/15 text-signal-green border-signal-green/30',
    icon: CheckCircle2,
  },
  blocked: { label: 'Bloquée', cls: 'bg-signal-red/15 text-signal-red border-signal-red/30', icon: Ban },
};

export function StatusBadge({ status, size = 'sm' }: { status: TaskStatus; size?: 'xs' | 'sm' }) {
  const c = cfg[status] || cfg.todo;
  const Icon = c.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 border rounded-md font-medium uppercase tracking-wider',
        c.cls,
        size === 'xs' ? 'text-[9px] px-1.5 py-0.5' : 'text-2xs px-2 py-0.5'
      )}
    >
      <Icon
        className={cn(size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3', status === 'in_progress' && 'animate-spin')}
        strokeWidth={2.4}
      />
      {c.label}
    </span>
  );
}

export function ProgressBar({
  value,
  height = 'h-1',
  showLabel = false,
}: {
  value: number;
  height?: string;
  showLabel?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const color =
    pct >= 100
      ? 'bg-signal-green'
      : pct >= 60
        ? 'bg-amber-gradient'
        : pct >= 30
          ? 'bg-signal-yellow'
          : 'bg-signal-red';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={cn('flex-1 rounded-full bg-black/[0.05] overflow-hidden', height)}>
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && (
        <span className="text-2xs font-mono tabular-nums text-atlas-fg-3 shrink-0">{Math.round(pct)}%</span>
      )}
    </div>
  );
}
