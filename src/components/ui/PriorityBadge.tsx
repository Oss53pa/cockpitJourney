import type { Priority } from '../../types';
import { Flag } from 'lucide-react';
import { cn } from '../../lib/utils';

const map: Record<Priority, { label: string; cls: string; bg: string }> = {
  4: { label: 'Critique', cls: 'text-signal-red', bg: 'bg-signal-red/15 border-signal-red/30' },
  3: { label: 'Haute', cls: 'text-signal-yellow', bg: 'bg-signal-yellow/15 border-signal-yellow/30' },
  2: { label: 'Normale', cls: 'text-signal-blue', bg: 'bg-signal-blue/15 border-signal-blue/30' },
  1: { label: 'Faible', cls: 'text-atlas-fg-3', bg: 'bg-black/[0.04] border-black/[0.06]' },
};

export function PriorityBadge({ priority, compact = false }: { priority: Priority; compact?: boolean }) {
  const m = map[priority];
  if (compact) {
    return <Flag className={cn('w-3.5 h-3.5', m.cls)} fill="currentColor" strokeWidth={1.4} />;
  }
  return (
    <span className={cn('chip border', m.cls, m.bg)}>
      <Flag className="w-3 h-3" fill="currentColor" />
      {m.label}
    </span>
  );
}
