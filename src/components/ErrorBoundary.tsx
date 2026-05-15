import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { captureException } from '../lib/monitoring';

function isChunkLoadError(error: Error): boolean {
  return (
    error.message.includes('dynamically imported module') ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('Loading chunk') ||
    error.name === 'ChunkLoadError'
  );
}

interface Props {
  children: ReactNode;
  fallback?: (err: Error, reset: () => void) => ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
    if (isChunkLoadError(error)) {
      const key = 'chunk-reload-' + location.pathname;
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        location.reload();
        return;
      }
    }
    // Forward to Sentry with the React component stack so we can locate
    // the failing component in the dashboard. Chunk-load errors are
    // already filtered out by the noise patterns in monitoring.ts.
    captureException(error, {
      componentStack: info.componentStack,
      pathname: location.pathname,
    });
  }

  reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return <DefaultFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6 bg-atlas-black">
      <div className="max-w-md w-full panel p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-signal-red/15 text-signal-red border border-signal-red/30 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h1 className="font-display text-xl font-medium text-atlas-fg-1 mb-2">Une erreur est survenue</h1>
        <p className="text-sm text-atlas-fg-3 mb-4">
          L'application a rencontré un problème inattendu. Vos données locales sont préservées.
        </p>
        <details className="text-left bg-black/[0.04] border border-atlas-line rounded-lg p-3 mb-4">
          <summary className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium cursor-pointer">
            Détails techniques
          </summary>
          <pre className="mt-2 text-2xs text-atlas-fg-2 font-mono overflow-x-auto whitespace-pre-wrap break-all">
            {error.name}: {error.message}
            {error.stack ? '\n\n' + error.stack.split('\n').slice(0, 4).join('\n') : ''}
          </pre>
        </details>
        <div className="flex items-center justify-center gap-2">
          <button onClick={reset} className="btn-secondary text-sm px-3 py-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Réessayer
          </button>
          <button onClick={() => location.reload()} className="btn-primary text-sm px-3 py-1.5">
            Recharger l'app
          </button>
        </div>
      </div>
    </div>
  );
}
