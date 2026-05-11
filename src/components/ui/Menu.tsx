import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface MenuProps {
  trigger: ReactNode;
  align?: 'left' | 'right';
  /**
   * Where the dropdown should open relative to the trigger:
   *   - `down` (default) — opens below, useful in headers / toolbars
   *   - `up`             — opens above, useful in sidebar footers and
   *                        any trigger that sits near the bottom of a
   *                        scroll container with `overflow: hidden`
   *   - `auto`           — measure free space and pick the side that fits
   */
  direction?: 'down' | 'up' | 'auto';
  children: (close: () => void) => ReactNode;
  width?: number;
}

export function Menu({ trigger, align = 'right', direction = 'down', children, width = 220 }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [resolvedDir, setResolvedDir] = useState<'up' | 'down'>(direction === 'auto' ? 'down' : direction);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // For `direction: 'auto'`, decide on open: if the trigger is in the
  // lower half of the viewport, flip upward so the dropdown stays on
  // screen and isn't clipped by any ancestor `overflow: hidden`.
  useEffect(() => {
    if (!open || direction !== 'auto') return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setResolvedDir(rect.top > window.innerHeight / 2 ? 'up' : 'down');
  }, [open, direction]);

  const dir = direction === 'auto' ? resolvedDir : direction;

  return (
    <div className="relative" ref={ref}>
      <div ref={triggerRef} onClick={() => setOpen((v) => !v)}>
        {trigger}
      </div>
      {open && (
        <div
          className={cn(
            'absolute z-50 panel p-1.5 animate-fade-in-scale shadow-soft-pop',
            dir === 'up' ? 'bottom-full mb-2 origin-bottom-right' : 'top-full mt-2 origin-top-right',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          style={{ width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  icon: Icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  icon?: any;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors',
        danger
          ? 'text-signal-red hover:bg-signal-red/10'
          : 'text-atlas-fg-2 hover:bg-black/[0.04] hover:text-atlas-fg-1'
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span className="flex-1">{children}</span>
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-black/[0.06]" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 py-1 text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
      {children}
    </div>
  );
}
