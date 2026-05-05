import type { HealthScore } from '../../types';
import { cn } from '../../lib/utils';

export function HealthDot({ health, label = false }: { health: HealthScore; label?: boolean }) {
  const color =
    health === 'green' ? 'bg-signal-green' : health === 'yellow' ? 'bg-signal-yellow' : 'bg-signal-red';
  const text =
    health === 'green' ? 'text-signal-green' : health === 'yellow' ? 'text-signal-yellow' : 'text-signal-red';
  const word = health === 'green' ? 'Vert' : health === 'yellow' ? 'Jaune' : 'Rouge';
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className={cn('relative inline-block w-2 h-2 rounded-full', color)}>
        <span className={cn('absolute inset-0 rounded-full animate-ping opacity-50', color)} />
      </span>
      {label && <span className={cn('text-2xs uppercase tracking-wider font-medium', text)}>{word}</span>}
    </div>
  );
}
