import { cn } from '../../lib/utils';

export function Logo({
  size = 18,
  withWordmark = true,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  if (!withWordmark) return null;
  return (
    <div className={cn('inline-flex items-center', className)} style={{ minHeight: size }}>
      <span className="font-logo text-atlas-fg-1 leading-none" style={{ fontSize: size + 8 }}>
        Cockpit<span className="text-atlas-amber">Journey</span>
      </span>
    </div>
  );
}
