/**
 * SectionErrorBoundary — wraps a sub-section (a tab, a panel, a side
 * widget) so a crash inside it doesn't take down the whole project view
 * / today view / report view. Renders a compact inline fallback instead
 * of the full-screen recovery card used by the root ErrorBoundary.
 *
 * Use this when:
 *   - The section depends on user-generated data that might be malformed
 *     (custom fields, free-form notes, imported third-party blobs).
 *   - The section uses a heavy lib (Gantt, html2canvas, jsPDF) that
 *     could crash on edge cases.
 *   - You want the user to still navigate the rest of the cockpit even
 *     if this part is broken.
 *
 * The error is still reported to Sentry — defensive UX, not silent.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { captureException } from '../lib/monitoring';

interface Props {
  /** Human label used in the fallback ("le Kanban", "le rapport hebdo", …). */
  section: string;
  /** Optional context tag forwarded to Sentry to slice crashes per area. */
  scope?: string;
  children: ReactNode;
  /** Override the inline fallback with a custom node. */
  fallback?: (err: Error, reset: () => void) => ReactNode;
}
interface State {
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[SectionErrorBoundary:${this.props.scope ?? this.props.section}]`, error);
    captureException(error, {
      section: this.props.section,
      scope: this.props.scope,
      componentStack: info.componentStack,
      pathname: location.pathname,
    });
  }

  reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return <InlineFallback section={this.props.section} error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function InlineFallback({ section, error, reset }: { section: string; error: Error; reset: () => void }) {
  return (
    <div className="panel p-5 text-center border-signal-red/30 bg-signal-red/[0.04]">
      <div className="w-10 h-10 rounded-xl bg-signal-red/15 text-signal-red border border-signal-red/30 grid place-items-center mx-auto mb-3">
        <AlertTriangle className="w-4 h-4" />
      </div>
      <h3 className="text-sm font-medium text-atlas-fg-1 mb-1.5">{section} indisponible</h3>
      <p className="text-xs text-atlas-fg-3 mb-3 leading-relaxed max-w-md mx-auto">
        Cette section a rencontré un problème, mais le reste du cockpit fonctionne normalement. L'incident a
        été remonté automatiquement.
      </p>
      <details className="text-left text-2xs text-atlas-fg-3 font-mono bg-black/[0.04] border border-atlas-line rounded-lg p-2 mb-3 max-w-md mx-auto">
        <summary className="cursor-pointer">Détails techniques</summary>
        <div className="mt-1.5 break-all">
          {error.name}: {error.message}
        </div>
      </details>
      <button onClick={reset} className="btn-secondary text-xs px-2.5 py-1.5 mx-auto">
        <RefreshCw className="w-3 h-3" /> Réessayer
      </button>
    </div>
  );
}
