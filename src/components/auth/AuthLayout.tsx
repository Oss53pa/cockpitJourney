/**
 * AuthLayout — wrapper visuel partagé par les 4 pages d'auth.
 *
 *   /login            → LoginView         (mot de passe + Google)
 *   /signup           → SignupView        (création compte)
 *   /forgot-password  → ForgotPasswordView (envoi recovery)
 *   /reset-password   → ResetPasswordView  (nouveau mot de passe)
 *
 * Centré, fond crème + aurora subtile, logo Grand Hotel en tête,
 * carte blanche avec ombre douce, footer "Une application Atlas Studio".
 * Aucun style inline — tout passe par les tokens Tailwind atlas-*.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  /** Card content (heading + form). */
  children: ReactNode;
  /** Optional override for the back-to-landing link target. */
  homeHref?: string;
}

export function AuthLayout({ children, homeHref = '/' }: Props) {
  return (
    <div className="min-h-screen w-full bg-atlas-cream bg-aurora flex items-center justify-center px-5 py-10 sm:py-14">
      <div className="w-full max-w-md">
        {/* Logo + tagline */}
        <Link to={homeHref} className="block text-center mb-7">
          <div className="font-logo text-4xl sm:text-5xl text-atlas-fg-1 leading-none">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </div>
          <div className="mt-2.5 text-2xs uppercase tracking-[0.22em] text-atlas-fg-3 font-light">
            Pilotez votre journée
          </div>
        </Link>

        {/* Card */}
        <div className="rounded-2xl bg-atlas-panel border border-atlas-line shadow-soft-pop p-7 sm:p-9 animate-fade-in-up">
          {children}
        </div>

        {/* Footer */}
        <p className="mt-7 text-center text-2xs text-atlas-fg-3 font-light">
          Une application{' '}
          <a
            href="https://atlas-studio.org"
            className="text-atlas-sage-deep hover:text-atlas-sage-deeper transition font-normal"
          >
            Atlas Studio
          </a>
        </p>
      </div>
    </div>
  );
}

/** Shared error banner used in every auth view. */
export function AuthErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-signal-red-soft border border-signal-red/30">
      <svg
        className="w-4 h-4 text-signal-red mt-0.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <div className="flex-1 text-2xs sm:text-xs text-signal-red font-light leading-relaxed">{message}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer l'erreur"
          className="text-signal-red hover:text-signal-red/70 shrink-0 -my-0.5"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Shared success banner. */
export function AuthSuccessBanner({ title, body }: { title: string; body?: ReactNode }) {
  return (
    <div className="mb-2 px-4 py-4 rounded-xl bg-atlas-sage/10 border border-atlas-sage-deep/30">
      <div className="text-sm font-light text-atlas-fg-1 mb-1">{title}</div>
      {body && <div className="text-2xs text-atlas-fg-2 font-light leading-relaxed">{body}</div>}
    </div>
  );
}
