import { useEffect, type ReactNode } from 'react';
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
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative w-full panel overflow-hidden animate-fade-in-scale shadow-soft-pop flex flex-col max-h-[85vh]',
          sizes[size]
        )}
      >
        {title && (
          <header className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-black/[0.05]">
            <div>
              {title && (
                <h2 className="font-display text-lg font-medium tracking-tight text-atlas-fg-1">{title}</h2>
              )}
              {description && <p className="text-sm text-atlas-fg-3 mt-0.5">{description}</p>}
            </div>
            <button onClick={onClose} className="btn-ghost !p-1.5 -mr-1 -mt-1">
              <X className="w-4 h-4" />
            </button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <footer className="border-t border-black/[0.05] px-6 py-3 flex items-center justify-end gap-2 bg-atlas-panel-2/50">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
