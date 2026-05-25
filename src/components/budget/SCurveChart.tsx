import { formatFCFA } from '../../lib/utils';
import type { SCurve } from './forecast';

const ACTUAL = '#6E8B58'; // atlas sage-deep
const CEILING = '#B85B4D'; // signal-red

/**
 * Courbe en S : réalisé cumulé (aire + trait plein, jusqu'à la date d'analyse)
 * comparé à la trajectoire idéale linéaire (trait pointillé) et au plafond du
 * budget alloué (ligne rouge). SVG maison, sans dépendance de charting, dans
 * l'idiome des graphes existants (DashboardView).
 */
export function SCurveChart({ curve }: { curve: SCurve }) {
  const { points, allocated, asOfIndex } = curve;
  if (points.length === 0) return null;

  const W = 100;
  const H = 44;
  const maxVal = Math.max(allocated, ...points.flatMap((p) => [p.actualCumulative, p.plannedCumulative]), 1);
  const n = points.length;
  const X = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const Y = (v: number) => H - (v / maxVal) * H;

  const plannedPts = points.map((p, i) => `${X(i)},${Y(p.plannedCumulative)}`).join(' ');
  const actualSlice = points.slice(0, Math.max(0, asOfIndex) + 1);
  const actualPts = actualSlice.map((p, i) => `${X(i)},${Y(p.actualCumulative)}`).join(' ');
  const ceilingY = Y(allocated);

  const labelIdx = n <= 1 ? [0] : [...new Set([0, Math.floor((n - 1) / 2), n - 1])];

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xs uppercase tracking-wider text-atlas-fg-3 font-medium">
          Courbe en S — réalisé cumulé
        </span>
        {allocated > 0 && (
          <span className="text-2xs font-mono text-atlas-fg-3">Plafond {formatFCFA(allocated)}</span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44" preserveAspectRatio="none">
        <defs>
          <linearGradient id="scurve-actual" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={ACTUAL} stopOpacity="0.35" />
            <stop offset="100%" stopColor={ACTUAL} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Plafond du budget alloué */}
        {allocated > 0 && (
          <line
            x1="0"
            y1={ceilingY}
            x2={W}
            y2={ceilingY}
            stroke={CEILING}
            strokeWidth="0.5"
            strokeDasharray="2 1.5"
            opacity="0.75"
          />
        )}

        {/* Trajectoire idéale (linéaire) */}
        <polyline
          fill="none"
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="0.7"
          strokeDasharray="2 1.5"
          points={plannedPts}
        />

        {/* Réalisé cumulé : aire + trait */}
        {actualSlice.length > 1 && (
          <>
            <polygon
              fill="url(#scurve-actual)"
              points={`0,${H} ${actualPts} ${X(actualSlice.length - 1)},${H}`}
            />
            <polyline fill="none" stroke={ACTUAL} strokeWidth="1.4" points={actualPts} />
          </>
        )}
      </svg>

      <div className="mt-2 flex justify-between text-2xs text-atlas-fg-3 font-mono">
        {labelIdx.map((i) => (
          <span key={i}>{points[i].month}</span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-atlas-fg-3">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-[3px] rounded-full"
            style={{ background: ACTUAL }}
            aria-hidden
          />
          Réalisé cumulé
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 border-t border-dashed border-atlas-fg-3" aria-hidden />
          Trajectoire idéale
        </span>
        {allocated > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3 border-t border-dashed"
              style={{ borderColor: CEILING }}
              aria-hidden
            />
            Plafond budget
          </span>
        )}
      </div>
    </div>
  );
}
