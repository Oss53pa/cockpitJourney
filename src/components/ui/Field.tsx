import {
  type ReactNode,
  type SelectHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/utils';

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium mb-1.5">
        {children}
        {hint && <span className="ml-1.5 text-atlas-fg-3 normal-case font-normal">· {hint}</span>}
      </span>
    </label>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        'w-full h-10 px-3 rounded-lg bg-white border border-atlas-line text-sm text-atlas-fg-1 placeholder:text-atlas-fg-3 outline-none focus:border-atlas-amber focus:ring-2 focus:ring-atlas-amber/20 transition-colors',
        className
      )}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cn(
        'w-full px-3 py-2 rounded-lg bg-white border border-atlas-line text-sm text-atlas-fg-1 placeholder:text-atlas-fg-3 outline-none focus:border-atlas-amber focus:ring-2 focus:ring-atlas-amber/20 transition-colors',
        className
      )}
    />
  );
}

export function NativeSelect({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...rest}
      className={cn(
        'w-full h-10 px-3 rounded-lg bg-white border border-atlas-line text-sm text-atlas-fg-1 outline-none focus:border-atlas-amber focus:ring-2 focus:ring-atlas-amber/20 transition-colors appearance-none pr-9 bg-no-repeat',
        className
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237A8071' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='m6 9 6 6 6-6'/%3e%3c/svg%3e")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.6rem center',
        backgroundSize: '1rem',
      }}
    >
      {children}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  /** Override for the accessible name when there's no visible label. */
  ariaLabel?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel ?? label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex w-9 h-5 rounded-full border transition-colors',
          checked ? 'bg-atlas-amber border-atlas-amber' : 'bg-black/[0.18] border-black/[0.12]'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-md ring-1 ring-black/[0.06] transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </button>
      {label && <span className="text-sm text-atlas-fg-2">{label}</span>}
    </label>
  );
}
