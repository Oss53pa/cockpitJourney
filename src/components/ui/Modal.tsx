import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** When true, suppresses the header close-X and ignores backdrop clicks /
   *  Escape — used by required flows like first-boot onboarding. */
  hideCloseButton?: boolean;
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideCloseButton = false,
}: Props) {
  useEffect(() => {
    if (!open || hideCloseButton) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, hideCloseButton]);

  if (!open) return null;

  // Render via React Portal directly into document.body so we escape any
  // ancestor that defines a `transform`, `filter`, or `backdrop-filter`
  // — those CSS properties create a new "containing block" for fixed-
  // positioned descendants (CSS spec), which would otherwise pin this
  // modal to the size of the ancestor instead of the viewport. The
  // LandingPage nav uses `backdrop-blur-md`, so without this portal the
  // PWA install modal renders ~60px tall stuck to the top of the screen.
  const modalNode = (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in">
      {/* Backdrop — clicks dismiss UNLESS hideCloseButton (required flow) */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={hideCloseButton ? undefined : onClose}
        aria-hidden="true"
      />
      {/* Modal — sticks header on top, scrolls inner content, footer always visible */}
      <div
        className={cn(
          'relative w-full panel overflow-hidden animate-fade-in-scale shadow-soft-pop flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[92vh] my-auto',
          sizes[size]
        )}
      >
        {title && (
          <header className="shrink-0 flex items-start justify-between px-6 pt-5 pb-4 border-b border-black/[0.05] bg-white">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-medium tracking-tight text-atlas-fg-1 truncate">
                {title}
              </h2>
              {description && <p className="text-sm text-atlas-fg-3 mt-0.5 truncate">{description}</p>}
            </div>
            {!hideCloseButton && (
              <button onClick={onClose} className="btn-ghost !p-1.5 -mr-1 -mt-1 shrink-0" aria-label="Fermer">
                <X className="w-4 h-4" />
              </button>
            )}
          </header>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="shrink-0 border-t border-black/[0.05] px-6 py-3 flex items-center justify-end gap-2 bg-atlas-panel-2/80 backdrop-blur-sm">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );

  // SSR-safe: `document` only exists client-side. Vite/Vercel build is
  // browser-only anyway, but the guard keeps the type narrow for any
  // future SSR/SSG migration.
  if (typeof document === 'undefined') return modalNode;
  return createPortal(modalNode, document.body);
}
