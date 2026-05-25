import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

interface MenuProps {
  trigger: ReactNode;
  align?: 'left' | 'right';
  /**
   * Where the dropdown should open relative to the trigger:
   *   - `down` (default) — opens below
   *   - `up`             — opens above
   *   - `auto`           — pick the side with room
   *
   * The dropdown is rendered in a PORTAL on document.body with
   * `position: fixed`, positioned from the trigger's bounding rect and
   * clamped to the viewport. This guarantees it is NEVER clipped by an
   * ancestor `overflow: hidden`/`auto` (drawers, scroll panels, cards…).
   */
  direction?: 'down' | 'up' | 'auto';
  children: (close: () => void) => ReactNode;
  width?: number;
}

export function Menu({ trigger, align = 'right', direction = 'down', children, width = 220 }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside (the menu lives in a portal, so check both).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Position the portal from the trigger rect, clamped to the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const m = 8;
      const menuH = menuRef.current?.offsetHeight ?? 0;
      const openUp =
        direction === 'up' ||
        (direction === 'auto' && r.bottom + menuH + m > window.innerHeight && r.top - menuH - m > 0);
      let top = openUp ? r.top - menuH - m : r.bottom + m;
      let left = align === 'right' ? r.right - width : r.left;
      left = Math.max(m, Math.min(left, window.innerWidth - width - m));
      top = Math.max(m, Math.min(top, window.innerHeight - menuH - m));
      setPos({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, direction, align, width]);

  return (
    <div className="relative" ref={wrapRef}>
      <div ref={triggerRef} onClick={() => setOpen((v) => !v)}>
        {trigger}
      </div>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[100] panel p-1.5 animate-fade-in-scale shadow-soft-pop"
            style={{
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              width,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
