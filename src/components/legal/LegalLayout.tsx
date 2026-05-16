/**
 * Wraps every legal page (CGU, Privacy, Cookies, Mentions légales) with
 * a consistent header, breadcrumb, and footer link back to the landing.
 *
 * Designed to be SEO-friendly (static HTML, no auth required) — Google
 * needs to be able to crawl these to satisfy RGPD/OHADA disclosure
 * requirements.
 */
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

export function LegalLayout({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  /** ISO date the document was last revised — shown at the top. */
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-atlas-cream">
      <header className="border-b border-atlas-line bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-atlas-fg-2 hover:text-atlas-sage-deep transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour à l'accueil
          </Link>
          <span className="font-logo text-xl text-atlas-fg-1">
            Cockpit<span className="text-atlas-sage-deep">Journey</span>
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <span className="text-2xs uppercase tracking-[0.22em] text-atlas-sage-deep font-light">
            Mentions légales
          </span>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl text-atlas-fg-1 font-light leading-tight">
            {title}
          </h1>
          <p className="mt-3 text-xs text-atlas-fg-3 font-light">
            Dernière mise à jour :{' '}
            {new Date(lastUpdated).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>

        <article className="prose prose-sm max-w-none text-atlas-fg-1 leading-relaxed">{children}</article>

        <footer className="mt-12 pt-6 border-t border-atlas-line text-xs text-atlas-fg-3 font-light">
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
            <Link to="/legal/cgu" className="hover:text-atlas-sage-deep">
              CGU
            </Link>
            <Link to="/legal/confidentialite" className="hover:text-atlas-sage-deep">
              Politique de confidentialité
            </Link>
            <Link to="/legal/cookies" className="hover:text-atlas-sage-deep">
              Cookies
            </Link>
            <Link to="/legal/mentions" className="hover:text-atlas-sage-deep">
              Mentions légales
            </Link>
          </div>
          <p>
            © {new Date().getFullYear()} CockpitJourney · une marque{' '}
            <a href="https://atlas-studio.org" className="text-atlas-sage-deep hover:underline">
              Atlas Studio
            </a>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}

/* ───────────── Typography helpers ───────────── */

export function LegalH2({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-display text-xl font-medium tracking-tight text-atlas-fg-1 mt-10 mb-4">{children}</h2>
  );
}

export function LegalH3({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-base font-medium tracking-tight text-atlas-fg-1 mt-6 mb-2">
      {children}
    </h3>
  );
}

export function LegalP({ children }: { children: ReactNode }) {
  return <p className="text-sm font-light text-atlas-fg-1 mb-3 leading-relaxed">{children}</p>;
}

export function LegalUL({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 text-sm font-light text-atlas-fg-1 mb-3 leading-relaxed">
      {children}
    </ul>
  );
}

/** Placeholder yellow box — wraps a "TODO: à remplir par Pamela" zone. */
export function LegalTODO({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 px-4 py-3 rounded-lg bg-signal-yellow/10 border border-signal-yellow/30 text-xs font-light text-atlas-fg-2">
      <strong className="text-signal-yellow">À COMPLÉTER : </strong>
      {children}
    </div>
  );
}
